import test from 'node:test';
import assert from 'node:assert/strict';
import { toSyncRecords } from '../../src/data';
import { encodeWire } from '../../src/cloud/codec';
import { autoAdoptSubsetReconciliation, isLocalSubsetOfRemote } from '../../src/cloud/sync-actions';
import { MAX_ACCOUNT_SNAPSHOT_BYTES } from '../../src/data/store';
import { createSyncEngine } from '../../src/cloud/sync-engine';
import { initialSyncState, keyOf } from '../../src/cloud/sync-state';
import type { SyncAccountState } from '../../src/cloud/sync-state';
import { createMemoryCloudStore, initialCloudState } from '../../src/cloud/storage';
import type { CloudState } from '../../src/cloud/storage';
import type { SyncStoredRecord, SyncTransport } from '../../src/cloud/sync-types';
import type { AppData } from '../../src/domain/types';
import { DIVERGENT_SMALL_B, LARGE_LOCAL, SMALL_REMOTE, qaSolve, solveIds } from './sync-adoption-fixtures';

const CONTEXT = { projectRef: 'qa', userId: 'u1', generation: 0 };
const clone = <T>(value: T): T => structuredClone(value);
let idCounter = 0;
const nextId = () => `qa-auto-${++idCounter}`;

function qaDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((item, i) => qaDeepEqual(item, (b as unknown[])[i]));
  const keysA = Object.keys(a as object), keysB = Object.keys(b as object);
  return keysA.length === keysB.length && keysA.every(key => qaDeepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
function qaIsStrictSubset(local: AppData, remote: AppData): boolean {
  const byIdEqual = <T extends { id: string }>(items: readonly T[], pool: readonly T[]) =>
    items.every(item => { const found = pool.find(candidate => candidate.id === item.id); return !!found && qaDeepEqual(found, item); });
  return byIdEqual(local.sessions, remote.sessions)
    && byIdEqual(local.solves, remote.solves)
    && byIdEqual(local.studyAttempts, remote.studyAttempts)
    && Object.entries(local.progress).every(([key, value]) => qaDeepEqual(remote.progress[key], value))
    && qaDeepEqual(local.settings, remote.settings);
}
function qaZeroLoss(before: AppData, after: AppData): boolean {
  return [...solveIds(before)].every(id => solveIds(after).has(id))
    && before.sessions.every(session => after.sessions.some(candidate => candidate.id === session.id));
}

function storedBase(data: AppData, revision = '1'): SyncStoredRecord[] {
  return toSyncRecords(clone(data)).map(record => ({ entity: record.entity, id: record.id, revision, tombstone: false, record: encodeWire(record) }));
}
function reconciliationAccount(local: AppData, remote: AppData): { data: AppData; revision: number; sync: SyncAccountState; syncNeedsReconciliation?: boolean } {
  const sync = initialSyncState(true);
  sync.base = storedBase(remote); sync.revision = '1'; sync.hydrated = true; sync.status = 'reconciliation-required';
  return { data: clone(local), revision: 1, sync, syncNeedsReconciliation: true };
}
function expectKept(account: ReturnType<typeof reconciliationAccount>, label: string): void {
  const before = clone(account.data);
  const adopted = autoAdoptSubsetReconciliation(account, nextId);
  assert.equal(adopted, false, `adotou com divergencia: ${label}`);
  assert.equal(account.sync.reconciliation, true, `escolha perdida: ${label}`);
  assert.ok(qaDeepEqual(account.data, before), `dado local alterado: ${label}`);
}

test('subconjunto estrito auto-hidrata sem prompt, com zero perda e arquivamento', () => {
  for (const local of [SMALL_REMOTE, LARGE_LOCAL]) {
    const account = reconciliationAccount(local, LARGE_LOCAL);
    const before = clone(account.data);
    assert.ok(qaIsStrictSubset(before, LARGE_LOCAL), 'oraculo QA discorda do cenario');
    const adopted = autoAdoptSubsetReconciliation(account, nextId);
    assert.equal(adopted, true);
    assert.equal(account.sync.reconciliation, false);
    assert.equal(account.sync.status, 'synced');
    assert.equal(account.syncNeedsReconciliation, false);
    assert.ok(qaZeroLoss(before, account.data), 'perda de dado local');
    assert.ok(qaZeroLoss(LARGE_LOCAL, account.data), 'visao remota incompleta');
    const archived = Object.values(account.sync.reconciliationArchive ?? {});
    assert.equal(archived.length, 1);
    assert.ok(qaDeepEqual(archived[0].sourceSnapshot, before), 'arquivo nao guarda o snapshot pre-adocao');
  }
});

test('idempotencia: segunda chamada nao adota de novo nem altera nada', () => {
  const account = reconciliationAccount(SMALL_REMOTE, LARGE_LOCAL);
  assert.equal(autoAdoptSubsetReconciliation(account, nextId), true);
  const snapshot = clone(account);
  assert.equal(autoAdoptSubsetReconciliation(account, nextId), false);
  assert.ok(qaDeepEqual(account.data, snapshot.data));
  assert.equal(Object.keys(account.sync.reconciliationArchive ?? {}).length, 1);
});

test('qualquer divergencia mantem a escolha e nao perde dado local', () => {
  expectKept(reconciliationAccount(LARGE_LOCAL, SMALL_REMOTE), 'solve e sessao locais extras');
  const extraSolve = clone(SMALL_REMOTE); extraSolve.solves = [...extraSolve.solves, qaSolve(950, 'qa-ses-1')];
  expectKept(reconciliationAccount(extraSolve, LARGE_LOCAL), 'solve local extra');
  const changedValue = clone(SMALL_REMOTE); changedValue.solves = changedValue.solves.map(solve => solve.id === 'qa-slv-001' ? { ...solve, rawMs: solve.rawMs + 1 } : solve);
  expectKept(reconciliationAccount(changedValue, LARGE_LOCAL), 'mesmo id valor diferente');
  const extraSession = clone(SMALL_REMOTE); extraSession.sessions = [...extraSession.sessions, { id: 'qa-ses-77', name: 'Extra', createdAt: '2026-09-09T05:00:00.000Z', mode: null }];
  expectKept(reconciliationAccount(extraSession, LARGE_LOCAL), 'sessao local extra');
  const extraProgress = clone(SMALL_REMOTE); extraProgress.progress = { 'OLL-01': { caseId: 'OLL-01', favorite: true, status: 'learning', note: '' } };
  expectKept(reconciliationAccount(extraProgress, LARGE_LOCAL), 'progress local extra');
  const otherSettings = clone(SMALL_REMOTE); otherSettings.settings = { ...otherSettings.settings, theme: 'dark' };
  expectKept(reconciliationAccount(otherSettings, LARGE_LOCAL), 'settings divergentes');
  expectKept(reconciliationAccount(DIVERGENT_SMALL_B, LARGE_LOCAL), 'conjunto local disjunto');
});

test('registro server-tombstonado presente no local mantem a escolha', () => {
  const account = reconciliationAccount(SMALL_REMOTE, LARGE_LOCAL);
  const index = account.sync.base.findIndex(record => keyOf(record) === 'solve:qa-slv-001');
  assert.ok(index >= 0);
  account.sync.base[index] = { ...account.sync.base[index], revision: '2', tombstone: true, record: null };
  expectKept(account, 'solve local tombstonado no servidor');
});

test('fila pendente, hidratacao incompleta ou pagina parcial nunca auto-adotam', () => {
  const queued = reconciliationAccount(SMALL_REMOTE, LARGE_LOCAL);
  queued.sync.outbox.push({ id: 'op-pending', changes: [] });
  expectKept(queued, 'outbox nao vazia');
  const dry = reconciliationAccount(SMALL_REMOTE, LARGE_LOCAL);
  dry.sync.hydrated = false;
  expectKept(dry, 'sem hidratacao');
  const partial = reconciliationAccount(SMALL_REMOTE, LARGE_LOCAL);
  partial.sync.received = { header: null as never, upperBound: '1', nextOrdinal: 0, records: [] };
  expectKept(partial, 'pagina parcial pendente');
});

test('capacidade: estouro real no merge cai para nao-subconjunto sem lancar', () => {
  const bigNote = 'x'.repeat(10000);
  const session = { id: 'qa-ses-big', name: 'QA Grande', createdAt: '2026-09-09T00:00:00.000Z', mode: null as null };
  const bigSolve = (index: number) => ({ id: `qa-big-${index}`, sessionId: 'qa-ses-big', mode: null as null, rawMs: 10000 + index, penalty: 'none' as const, scramble: "R U R' U'", createdAt: '2026-09-09T01:00:00.000Z', note: bigNote, source: 'manual' as const });
  const shell: AppData = { version: 3, sessions: [session], activeSessionId: 'qa-ses-big', solves: [], progress: {}, studyAttempts: [], settings: clone(SMALL_REMOTE.settings) };
  const perSolve = JSON.stringify(bigSolve(0)).length + 1;
  const fitting = Math.floor((MAX_ACCOUNT_SNAPSHOT_BYTES - JSON.stringify(shell).length - 100_000) / perSolve);
  const remote: AppData = { ...clone(shell), solves: Array.from({ length: fitting }, (_, i) => bigSolve(i)) };
  assert.ok(JSON.stringify(remote).length < MAX_ACCOUNT_SNAPSHOT_BYTES, 'remoto de teste estourou sozinho');
  const subsetLocal: AppData = { ...clone(shell), solves: remote.solves.slice(0, 50).map(clone) };
  assert.equal(isLocalSubsetOfRemote(remote, subsetLocal), true, 'subconjunto em escala real nao reconhecido');
  const overflowLocal: AppData = { ...clone(shell), solves: [...remote.solves.slice(0, 50), ...Array.from({ length: 30 }, (_, i) => bigSolve(1_000_000 + i))].map(clone) };
  assert.ok(JSON.stringify(remote).length + 30 * perSolve > MAX_ACCOUNT_SNAPSHOT_BYTES, 'cenario nao estoura o teto');
  let verdict: boolean | null = null;
  assert.doesNotThrow(() => { verdict = isLocalSubsetOfRemote(remote, overflowLocal); });
  assert.equal(verdict, false, 'estouro de capacidade nao caiu para nao-subconjunto');
});

test('fail-safe do redutor: base indecodificavel mantem a escolha sem lancar', () => {
  const account = reconciliationAccount(SMALL_REMOTE, LARGE_LOCAL);
  account.sync.base[0] = { ...account.sync.base[0], record: ['string', 'zz'] as never };
  const before = clone(account.data);
  let adopted: boolean | null = null;
  assert.doesNotThrow(() => { adopted = autoAdoptSubsetReconciliation(account, nextId); });
  assert.equal(adopted, false);
  assert.equal(account.sync.reconciliation, true);
  assert.ok(qaDeepEqual(account.data, before));
});

test('pelo engine: subconjunto hidrata ate synced sem prompt e divergencia fica em reconciliation', async () => {
  const plainTransport: SyncTransport = {
    status: async () => ({ revision: '1' }),
    pull: async ({ afterRevision }) => ({ epoch: 'e1', upperBound: afterRevision, header: null, records: [], startOrdinal: 0, nextOrdinal: 0, complete: true, hasMore: false }),
    push: async () => { throw new Error('push inesperado'); },
  };
  async function run(local: AppData): Promise<CloudState> {
    const state = initialCloudState();
    const account = reconciliationAccount(local, LARGE_LOCAL);
    account.sync.hydrated = false; account.sync.status = 'reconciliation-required';
    state.accounts.u1 = account;
    const store = createMemoryCloudStore(state);
    const engine = createSyncEngine({
      store,
      context: () => CONTEXT,
      isCurrent: () => true,
      guard() {},
      transport: async () => plainTransport,
      online: () => true,
      intervalMs: 3_600_000,
      autoAdopt: async context => { await store.transact(draft => { const acc = draft.accounts[context.userId!]; if (acc?.sync) autoAdoptSubsetReconciliation(acc, nextId); }); },
    });
    await engine.drain();
    engine.dispose();
    return store.read();
  }
  const adopted = (await run(SMALL_REMOTE)).accounts.u1;
  assert.equal(adopted.sync!.reconciliation, false);
  assert.equal(adopted.sync!.status, 'synced');
  assert.ok(qaZeroLoss(SMALL_REMOTE, adopted.data) && qaZeroLoss(LARGE_LOCAL, adopted.data));
  const kept = (await run(DIVERGENT_SMALL_B)).accounts.u1;
  assert.equal(kept.sync!.reconciliation, true);
  assert.equal(kept.sync!.status, 'reconciliation-required');
  assert.ok(qaDeepEqual(kept.data, DIVERGENT_SMALL_B), 'dado local divergente alterado pelo engine');
});

test('pelo engine: throw engolido no autoAdopt nunca vira status error recorrente', async () => {
  const state = initialCloudState();
  const account = reconciliationAccount(SMALL_REMOTE, LARGE_LOCAL);
  account.sync.hydrated = false;
  account.sync.base[0] = { ...account.sync.base[0], record: ['string', 'zz'] as never };
  state.accounts.u1 = account;
  const store = createMemoryCloudStore(state);
  const transport: SyncTransport = {
    status: async () => ({ revision: '1' }),
    pull: async ({ afterRevision }) => ({ epoch: 'e1', upperBound: afterRevision, header: null, records: [], startOrdinal: 0, nextOrdinal: 0, complete: true, hasMore: false }),
    push: async () => { throw new Error('push inesperado'); },
  };
  const engine = createSyncEngine({
    store, context: () => CONTEXT, isCurrent: () => true, guard() {},
    transport: async () => transport, online: () => true, intervalMs: 3_600_000,
    autoAdopt: async context => { await store.transact(draft => { const acc = draft.accounts[context.userId!]; if (acc?.sync) autoAdoptSubsetReconciliation(acc, nextId); }); },
  });
  await engine.drain();
  await engine.drain();
  engine.dispose();
  const after = (await store.read()).accounts.u1;
  assert.equal(after.sync!.status, 'reconciliation-required');
  assert.equal(after.sync!.reconciliation, true);
  assert.notEqual(after.sync!.status, 'error');
  assert.ok(qaDeepEqual(after.data, SMALL_REMOTE));
});
