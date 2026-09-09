import test from 'node:test';
import assert from 'node:assert/strict';
import { toSyncRecords } from '../../src/data';
import type { SyncRecord } from '../../src/data';
import { digest, encodeWire } from '../../src/cloud/codec';
import { enqueueChange, fold, initialSyncState, keyOf } from '../../src/cloud/sync-state';
import type { OutboxEntry, SyncAccountState } from '../../src/cloud/sync-state';
import { createSyncActions } from '../../src/cloud/sync-actions';
import { createSyncEngine } from '../../src/cloud/sync-engine';
import { createMemoryCloudStore, initialCloudState } from '../../src/cloud/storage';
import type { CloudState } from '../../src/cloud/storage';
import type { SyncOperation, SyncPullPage, SyncStoredRecord, SyncTransport } from '../../src/cloud/sync-types';
import type { AppData } from '../../src/domain/types';
import { DIVERGENT_SMALL_B, LARGE_LOCAL, SMALL_REMOTE, isIdSuperset, qaSolve } from './sync-adoption-fixtures';

const CONTEXT = { projectRef: 'qa', userId: 'u1', generation: 0 };
const clone = <T>(value: T): T => structuredClone(value);

function storedBase(data: AppData, revision = '1'): SyncStoredRecord[] {
  return toSyncRecords(clone(data)).map(record => ({ entity: record.entity, id: record.id, revision, tombstone: false, record: encodeWire(record) }));
}
function syncFor(data: AppData): SyncAccountState {
  const sync = initialSyncState(false);
  sync.base = storedBase(data); sync.revision = '1'; sync.hydrated = true; sync.status = 'synced';
  return sync;
}
function cloudStateFor(data: AppData, sync: SyncAccountState): CloudState {
  const state = initialCloudState();
  state.accounts.u1 = { data: clone(data), revision: 1, sync };
  return state;
}
function noOrphans(data: AppData): boolean {
  const sessions = new Set(data.sessions.map(session => session.id));
  return data.solves.every(solve => sessions.has(solve.sessionId));
}
function withSolve(data: AppData, index: number, sessionId: string): AppData {
  return { ...clone(data), solves: [...clone(data.solves), qaSolve(index, sessionId)] };
}
function mutateBaseSolve(sync: SyncAccountState, solveId: string): void {
  const index = sync.base.findIndex(record => keyOf(record) === `solve:${solveId}`);
  assert.ok(index >= 0);
  const record = toSyncRecords(clone(SMALL_REMOTE)).find(item => keyOf(item) === `solve:${solveId}`) as SyncRecord & { value: { rawMs: number } };
  record.value.rawMs += 7;
  sync.base[index] = { ...sync.base[index], record: encodeWire(record) };
}
const actionPorts = (store: ReturnType<typeof createMemoryCloudStore>, transport: SyncTransport | null = null) => {
  let counter = 0;
  return {
    store, guard() {}, idle() {},
    after: async <T>(_context: typeof CONTEXT, result: T) => result,
    randomId: () => `qa-id-${++counter}`,
    drain: async () => {}, trigger() {},
    transport: async () => transport,
  };
};

test('adocao fixture: estado local maior nunca regride para a projecao menor', () => {
  const sync = syncFor(SMALL_REMOTE);
  const account = { data: clone(SMALL_REMOTE), sync };
  enqueueChange(account, clone(SMALL_REMOTE), clone(LARGE_LOCAL), 'op-grow');
  const projectedView = fold(sync, account.data);
  assert.deepEqual(isIdSuperset(projectedView, LARGE_LOCAL), { ok: true, missing: [] });
  assert.ok(sync.outbox.every(entry => !entry.conflict && !entry.blocked));
  assert.equal(sync.outbox.length, 1);
});

test('before divergente vira conflito na raiz sem esconder entradas seguintes independentes', () => {
  const sync = syncFor(SMALL_REMOTE);
  const account = { data: clone(SMALL_REMOTE), sync };
  const step1 = clone(SMALL_REMOTE); step1.solves = step1.solves.map(solve => solve.id === 'qa-slv-001' ? { ...solve, rawMs: solve.rawMs + 1 } : solve);
  enqueueChange(account, clone(SMALL_REMOTE), step1, 'op-1');
  const step2 = withSolve(step1, 500, 'qa-ses-1');
  enqueueChange(account, step1, step2, 'op-2');
  const step3 = clone(step2); step3.solves = step3.solves.map(solve => solve.id === 'qa-slv-001' ? { ...solve, rawMs: solve.rawMs + 2 } : solve);
  enqueueChange(account, step2, step3, 'op-3');
  mutateBaseSolve(sync, 'qa-slv-001');
  const projectedView = fold(sync, account.data);
  const [first, second, third] = sync.outbox;
  assert.ok(first.conflict && first.blocked === false);
  assert.equal(second.conflict, undefined);
  assert.equal(second.blocked, false);
  assert.equal(third.conflict, undefined);
  assert.equal(third.blocked, true);
  assert.ok(projectedView.solves.some(solve => solve.id === 'qa-slv-500'));
  assert.equal(projectedView.solves.find(solve => solve.id === 'qa-slv-001')!.rawMs, SMALL_REMOTE.solves.find(solve => solve.id === 'qa-slv-001')!.rawMs + 7);
  assert.ok(noOrphans(projectedView));
  assert.equal(sync.outbox.length, 3);
});

test('F1 referencial: filho de criacao conflitada fica blocked silencioso e destrava na resolucao local da raiz', async () => {
  const sync = syncFor(SMALL_REMOTE);
  const account = { data: clone(SMALL_REMOTE), sync };
  const withSession = clone(SMALL_REMOTE);
  withSession.sessions = [...withSession.sessions, { id: 'qa-ses-9', name: 'QA Nova', createdAt: '2026-09-09T09:00:00.000Z', mode: null }];
  enqueueChange(account, clone(SMALL_REMOTE), withSession, 'op-root');
  const withChild = withSolve(withSession, 901, 'qa-ses-9');
  enqueueChange(account, withSession, withChild, 'op-child');
  sync.outbox[0].conflict = 'O servidor recebeu uma revisão diferente. Revise o conflito.';
  const projectedView = fold(sync, account.data);
  assert.ok(noOrphans(projectedView));
  assert.ok(!projectedView.solves.some(solve => solve.id === 'qa-slv-901'));
  assert.ok(!projectedView.sessions.some(session => session.id === 'qa-ses-9'));
  assert.equal(sync.outbox[1].blocked, true);
  assert.equal(sync.outbox[1].conflict, undefined);
  assert.equal(sync.outbox.length, 2);
  const store = createMemoryCloudStore(cloudStateFor(SMALL_REMOTE, sync));
  const actions = createSyncActions(actionPorts(store));
  const resolved = await actions.resolveSyncConflict({ context: CONTEXT, conflictId: 'op-root', choice: 'local', expectedRemoteRevision: '1' });
  assert.equal(resolved.kind, 'queued');
  const state = await store.read();
  const after = state.accounts.u1;
  assert.ok(after.data.sessions.some(session => session.id === 'qa-ses-9'));
  assert.ok(after.data.solves.some(solve => solve.id === 'qa-slv-901'));
  assert.ok(noOrphans(after.data));
  assert.ok(after.sync!.outbox.every(entry => !entry.conflict && entry.blocked === false));
});

test('F1 referencial: raiz descartada com remote mantem o filho blocked sem orfao e sem erro', async () => {
  const sync = syncFor(SMALL_REMOTE);
  const account = { data: clone(SMALL_REMOTE), sync };
  const withSession = clone(SMALL_REMOTE);
  withSession.sessions = [...withSession.sessions, { id: 'qa-ses-9', name: 'QA Nova', createdAt: '2026-09-09T09:00:00.000Z', mode: null }];
  enqueueChange(account, clone(SMALL_REMOTE), withSession, 'op-root');
  const withChild = withSolve(withSession, 901, 'qa-ses-9');
  enqueueChange(account, withSession, withChild, 'op-child');
  sync.outbox[0].conflict = 'O servidor recebeu uma revisão diferente. Revise o conflito.';
  const store = createMemoryCloudStore(cloudStateFor(SMALL_REMOTE, sync));
  const actions = createSyncActions(actionPorts(store));
  const resolved = await actions.resolveSyncConflict({ context: CONTEXT, conflictId: 'op-root', choice: 'remote', expectedRemoteRevision: '1' });
  assert.equal(resolved.kind, 'queued');
  const state = await store.read();
  const after = state.accounts.u1;
  assert.ok(noOrphans(after.data));
  assert.ok(!after.data.solves.some(solve => solve.id === 'qa-slv-901'));
  assert.equal(after.sync!.outbox.length, 1);
  assert.equal(after.sync!.outbox[0].blocked, true);
  assert.equal(after.sync!.outbox[0].conflict, undefined);
  assert.equal(after.sync!.discardedConflicts?.length, 1);
  assert.equal(after.sync!.discardedConflicts?.[0].entry.id, 'op-root');
});

test('F1 referencial: solve filho de sessao server-tombstonada fica blocked silencioso e o fold nao lanca', () => {
  const sync = syncFor(SMALL_REMOTE);
  const account = { data: clone(SMALL_REMOTE), sync };
  enqueueChange(account, clone(SMALL_REMOTE), withSolve(SMALL_REMOTE, 902, 'qa-ses-1'), 'op-child-tomb');
  const index = sync.base.findIndex(record => keyOf(record) === 'session:qa-ses-1');
  assert.ok(index >= 0);
  sync.base[index] = { ...sync.base[index], revision: '2', tombstone: true, record: null };
  for (let position = 0; position < sync.base.length; position++) {
    const record = sync.base[position];
    if (record.entity === 'solve') sync.base[position] = { ...record, revision: '2', tombstone: true, record: null };
  }
  const projectedView = fold(sync, account.data);
  assert.ok(noOrphans(projectedView));
  assert.ok(!projectedView.solves.some(solve => solve.id === 'qa-slv-902'));
  assert.equal(sync.outbox.length, 1);
  assert.equal(sync.outbox[0].blocked, true);
  assert.equal(sync.outbox[0].conflict, undefined);
});

test('escolha remote descarta somente a entrada escolhida e preserva os afters das demais', async () => {
  const sync = syncFor(SMALL_REMOTE);
  const account = { data: clone(SMALL_REMOTE), sync };
  const step1 = clone(SMALL_REMOTE); step1.solves = step1.solves.map(solve => solve.id === 'qa-slv-001' ? { ...solve, rawMs: solve.rawMs + 1 } : solve);
  enqueueChange(account, clone(SMALL_REMOTE), step1, 'op-1');
  const step2 = withSolve(step1, 600, 'qa-ses-1');
  enqueueChange(account, step1, step2, 'op-2');
  mutateBaseSolve(sync, 'qa-slv-001');
  fold(sync, account.data);
  const survivor = clone(sync.outbox[1]);
  const store = createMemoryCloudStore(cloudStateFor(SMALL_REMOTE, sync));
  const actions = createSyncActions(actionPorts(store));
  const resolved = await actions.resolveSyncConflict({ context: CONTEXT, conflictId: 'op-1', choice: 'remote', expectedRemoteRevision: '1' });
  assert.equal(resolved.kind, 'queued');
  const state = await store.read();
  const after = state.accounts.u1;
  assert.equal(after.sync!.outbox.length, 1);
  assert.deepEqual(after.sync!.outbox[0].changes, survivor.changes);
  assert.equal(after.sync!.outbox[0].id, 'op-2');
  assert.ok(after.data.solves.some(solve => solve.id === 'qa-slv-600'));
  assert.equal(after.data.solves.find(solve => solve.id === 'qa-slv-001')!.rawMs, SMALL_REMOTE.solves.find(solve => solve.id === 'qa-slv-001')!.rawMs + 7);
  assert.equal(after.sync!.discardedConflicts?.[0].entry.id, 'op-1');
});

test('adocao de fonte menor preserva a uniao, arquiva o snapshot e trava fila alterada', async () => {
  const lookupTransport: SyncTransport = {
    push: async () => { throw new Error('sem rede no preview'); },
    pull: async () => { throw new Error('sem rede no preview'); },
    status: async () => ({ revision: '1' }),
    lookupSource: async () => ({ operationId: null }),
  };
  const sync = syncFor(LARGE_LOCAL);
  const state = cloudStateFor(LARGE_LOCAL, sync);
  state.guest = { data: clone(DIVERGENT_SMALL_B), revision: 1 };
  const store = createMemoryCloudStore(state);
  const actions = createSyncActions(actionPorts(store, lookupTransport));
  const previewResult = await actions.previewGuestAdoption({ context: CONTEXT });
  assert.equal(previewResult.kind, 'preview');
  const preview = (previewResult as { preview: { previewId: string; sourceDigest: string; local: { solves: number }; remote: { solves: number }; collisions: number } }).preview;
  assert.equal(preview.local.solves, 2);
  assert.equal(preview.remote.solves, 10);
  assert.equal(preview.collisions, 0);
  const confirmed = await actions.confirmGuestAdoption({ context: CONTEXT, previewId: preview.previewId });
  assert.equal(confirmed.kind, 'queued');
  const next = (await store.read()).accounts.u1;
  assert.deepEqual(isIdSuperset(next.data, LARGE_LOCAL), { ok: true, missing: [] });
  assert.deepEqual(isIdSuperset(next.data, DIVERGENT_SMALL_B), { ok: true, missing: [] });
  assert.equal(next.sync!.outbox.length, 1);
  assert.equal(next.sync!.outbox[0].sourceDigest, preview.sourceDigest);
  const archived = Object.values(next.sync!.reconciliationArchive ?? {});
  assert.equal(archived.length, 1);
  assert.deepEqual(archived[0].sourceSnapshot, DIVERGENT_SMALL_B);
  assert.deepEqual(archived[0].replaced, LARGE_LOCAL);
  const preview2 = await actions.previewGuestAdoption({ context: CONTEXT });
  assert.equal(preview2.kind, 'preview');
  const blockedConfirm = await actions.confirmGuestAdoption({ context: CONTEXT, previewId: (preview2 as { preview: { previewId: string } }).preview.previewId });
  assert.equal(blockedConfirm.kind, 'error');
  assert.match((blockedConfirm as { message: string }).message, /Conclua|fila/i);
  const stillQueued = (await store.read()).accounts.u1.sync!;
  assert.equal(stillQueued.outbox.length, 1);
  assert.equal(stillQueued.outbox[0].sourceDigest, preview.sourceDigest);
  const sync2 = syncFor(LARGE_LOCAL);
  const state2 = cloudStateFor(LARGE_LOCAL, sync2);
  state2.guest = { data: clone(DIVERGENT_SMALL_B), revision: 1 };
  const store2 = createMemoryCloudStore(state2);
  const actions2 = createSyncActions(actionPorts(store2, lookupTransport));
  const previewResult2 = await actions2.previewGuestAdoption({ context: CONTEXT });
  assert.equal(previewResult2.kind, 'preview');
  await store2.transact(draft => {
    const accountDraft = draft.accounts.u1;
    enqueueChange({ data: accountDraft.data, sync: accountDraft.sync }, clone(LARGE_LOCAL), withSolve(LARGE_LOCAL, 700, 'qa-ses-1'), 'op-meanwhile');
  });
  const stale = await actions2.confirmGuestAdoption({ context: CONTEXT, previewId: (previewResult2 as { preview: { previewId: string } }).preview.previewId });
  assert.equal(stale.kind, 'error');
  assert.match((stale as { message: string }).message, /fila mudou|Conclua/i);
  const untouched = (await store2.read()).accounts.u1;
  assert.equal(untouched.sync!.outbox.length, 1);
  assert.equal(untouched.sync!.outbox[0].id, 'op-meanwhile');
});

interface FakeServer { revision: string; pending: SyncPullPage | null; pushes: SyncOperation[]; failFirstPush: boolean }
function fakeTransport(server: FakeServer): SyncTransport {
  return {
    status: async () => ({ revision: server.revision }),
    pull: async ({ afterRevision }) => {
      if (server.pending && server.pending.header!.previousRevision === afterRevision) return server.pending;
      return { epoch: 'e1', upperBound: afterRevision, header: null, records: [], startOrdinal: 0, nextOrdinal: 0, complete: true, hasMore: false };
    },
    push: async operation => {
      if (server.failFirstPush) { server.failFirstPush = false; throw new Error('rede indisponivel'); }
      server.pushes.push(operation);
      const revision = String(Number(operation.baseRevision) + 1);
      const records: SyncStoredRecord[] = operation.changes.map(change => ({ entity: change.entity, id: change.id, revision, tombstone: change.record === null, record: change.record }));
      server.pending = {
        epoch: 'e1', upperBound: revision, startOrdinal: 0, nextOrdinal: records.length, complete: true, hasMore: false, records,
        header: { epoch: 'e1', revision, previousRevision: operation.baseRevision, operationId: operation.operationId, requestDigest: operation.requestDigest, transactionDigest: await digest(records), changeCount: records.length },
      };
      server.revision = revision;
      return { kind: 'applied', operationId: operation.operationId, requestDigest: operation.requestDigest, commitRevision: revision, changeCount: records.length };
    },
  };
}
function engineFor(store: ReturnType<typeof createMemoryCloudStore>, transport: SyncTransport) {
  return createSyncEngine({
    store,
    context: () => CONTEXT,
    isCurrent: () => true,
    guard() {},
    transport: async () => transport,
    online: () => true,
    intervalMs: 3_600_000,
  });
}

test('retry apos falha de push mantem operationId e conteudo, sem descarte', async () => {
  const sync = syncFor(SMALL_REMOTE);
  const account = { data: clone(SMALL_REMOTE), sync };
  enqueueChange(account, clone(SMALL_REMOTE), withSolve(SMALL_REMOTE, 700, 'qa-ses-1'), 'op-retry');
  const server: FakeServer = { revision: '1', pending: null, pushes: [], failFirstPush: true };
  const store = createMemoryCloudStore(cloudStateFor(SMALL_REMOTE, sync));
  const engine = engineFor(store, fakeTransport(server));
  await engine.drain();
  const midway = (await store.read()).accounts.u1.sync!;
  assert.equal(midway.status, 'error');
  assert.equal(midway.outbox.length, 1);
  assert.equal(midway.outbox[0].id, 'op-retry');
  await engine.drain();
  engine.dispose();
  const finalState = (await store.read()).accounts.u1;
  assert.equal(finalState.sync!.status, 'synced');
  assert.equal(finalState.sync!.outbox.length, 0);
  assert.equal(finalState.sync!.revision, '2');
  assert.equal(server.pushes.length, 1);
  assert.equal(server.pushes[0].operationId, 'op-retry');
  assert.equal(server.pushes[0].kind, 'mutation');
  assert.ok(finalState.data.solves.some(solve => solve.id === 'qa-slv-700'));
});

test('F5 adversarial: commit alheio filtra somente entradas bootstrap; intencao do usuario sobrevive', async () => {
  const sync = syncFor(SMALL_REMOTE);
  const account = { data: clone(SMALL_REMOTE), sync };
  enqueueChange(account, clone(SMALL_REMOTE), withSolve(SMALL_REMOTE, 800, 'qa-ses-1'), 'op-bootstrap');
  const contaminated = withSolve(SMALL_REMOTE, 800, 'qa-ses-1');
  enqueueChange(account, contaminated, withSolve(contaminated, 801, 'qa-ses-1'), 'op-user');
  const bootstrapEntry = sync.outbox.find(entry => entry.id === 'op-bootstrap') as OutboxEntry;
  bootstrapEntry.bootstrap = true;
  const settingsRecord = storedBase(SMALL_REMOTE, '2').find(record => record.entity === 'settings')!;
  const server: FakeServer = { revision: '2', pending: null, pushes: [], failFirstPush: false };
  server.pending = {
    epoch: 'e1', upperBound: '2', startOrdinal: 0, nextOrdinal: 1, complete: true, hasMore: false, records: [settingsRecord],
    header: { epoch: 'e1', revision: '2', previousRevision: '1', operationId: 'op-outro-dispositivo', requestDigest: 'f'.repeat(64), transactionDigest: await digest([settingsRecord]), changeCount: 1 },
  };
  const store = createMemoryCloudStore(cloudStateFor(SMALL_REMOTE, sync));
  const engine = engineFor(store, fakeTransport(server));
  await engine.drain();
  engine.dispose();
  const finalState = (await store.read()).accounts.u1;
  assert.equal(finalState.sync!.outbox.length, 0);
  assert.equal(server.pushes.length, 1);
  assert.equal(server.pushes[0].operationId, 'op-user');
  assert.ok(finalState.data.solves.some(solve => solve.id === 'qa-slv-801'));
  assert.ok(!finalState.data.solves.some(solve => solve.id === 'qa-slv-800'));
  assert.ok(noOrphans(finalState.data));
});
