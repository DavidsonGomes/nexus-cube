import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine } from '../../src/cloud/sync-engine';
import { autoAdoptSubsetReconciliation } from '../../src/cloud/sync-actions';
import { initialCloudState, createMemoryCloudStore } from '../../src/cloud/storage';
import { createInitialData } from '../../src/data';
import type { SyncAccountState } from '../../src/cloud/sync-state';
import type { ContextHandle } from '../../src/cloud/types';
import type { AppData, Session, Solve } from '../../src/domain/types';
import { fixtureBase, fixturePage, emptyPage } from '../security/sync-oracle';
import { SYNC_OPERATION_IDS } from '../security/sync-fixtures';
import { QA_IDENTITIES } from '../security/fixtures';

// Behavioural proof of the Causa 2 fix through the real engine with the autoAdopt
// port wired: a phone in reconciliation whose local state is a subset of the
// pulled remote hydrates WITHOUT a prompt; a divergent phone keeps the choice.

const ISO = '2026-09-08T00:00:00.000Z';
const session = (id: string): Session => ({ id, name: 'S', createdAt: ISO, mode: 'two-handed' });
const solve = (id: string, sessionId: string): Solve => ({ id, sessionId, mode: 'two-handed', rawMs: 1000, penalty: 'none', scramble: "R U R'", createdAt: ISO, note: '', source: 'timer' });
const app = (sessions: Session[], solves: Solve[]): AppData => ({ ...createInitialData(), sessions, solves });

const context: ContextHandle = { projectRef: 'synthetic', userId: QA_IDENTITIES.a.id, generation: 7 };
// Remote history: one session, two solves. Larger than the phone's local view.
const remoteData = app([session('s1')], [solve('x1', 's1'), solve('x2', 's1')]);
const remoteBaseAt = (rev: string) => fixtureBase(remoteData, rev);
const remotePage = () => fixturePage(remoteBaseAt('10').filter(r => r.entity !== 'settings')
  .map(r => ({ ...r })), { operationId: SYNC_OPERATION_IDS.create, requestDigest: 'synthetic-request-digest' }, '10', '9');

function harness(localData: AppData) {
  const sync: SyncAccountState = { version: 1, revision: '9', epoch: 'synthetic-epoch',
    base: remoteBaseAt('9'), outbox: [], reconciliation: true, status: 'reconciliation-required',
    error: null, received: null, adoptedSources: {}, hydrated: true };
  const seed = initialCloudState(); seed.gate = 'active'; seed.generation = 7; seed.user = { ...QA_IDENTITIES.a };
  seed.accounts[QA_IDENTITIES.a.id] = { data: structuredClone(localData), revision: 1, sync };
  const store = createMemoryCloudStore(seed);
  const transport = async () => ({ status: async () => ({ revision: '10' }), lookupSource: async () => ({ operationId: null }),
    pull: async ({ afterRevision }: { afterRevision: string }) => afterRevision === '9' ? remotePage() : emptyPage('10'),
    push: async () => { throw new Error('no push expected'); } });
  let counter = 0;
  const engine = createSyncEngine({ store, context: () => context,
    isCurrent: c => c.userId === QA_IDENTITIES.a.id && c.generation === 7,
    guard: (root, c) => { if (root.user?.id !== c.userId || root.generation !== c.generation) throw new Error('context'); },
    transport, online: () => true,
    autoAdopt: async ctx => { await store.transact(state => { const account = state.accounts[ctx.userId!]; if (account?.sync) autoAdoptSubsetReconciliation(account, () => `auto-${++counter}`); }); } });
  return { store, engine };
}

test('subset phone auto-adopts through the engine and surfaces the full remote history', async () => {
  // Local is a subset: same session, only the first solve. Nothing to lose.
  const h = harness(app([session('s1')], [solve('x1', 's1')]));
  await h.engine.drain(); h.engine.dispose();
  const account = (await h.store.read()).accounts[QA_IDENTITIES.a.id];
  assert.equal(account.sync?.reconciliation, false, 'reconciliation cleared automatically');
  assert.ok(account.data.solves.some(s => s.id === 'x2'), 'the remote-only solve is now visible without a prompt');
  assert.ok(account.sync?.reconciliationArchive && Object.keys(account.sync.reconciliationArchive).length === 1, 'pre-adoption view archived');
});

test('auto-adoption is idempotent: a second cycle does not re-adopt or re-archive', async () => {
  const h = harness(app([session('s1')], [solve('x1', 's1')]));
  await h.engine.drain();
  const after1 = (await h.store.read()).accounts[QA_IDENTITIES.a.id];
  assert.equal(after1.sync?.reconciliation, false);
  const archiveCount = Object.keys(after1.sync?.reconciliationArchive ?? {}).length;
  await h.engine.drain(); h.engine.dispose();
  const after2 = (await h.store.read()).accounts[QA_IDENTITIES.a.id];
  assert.equal(Object.keys(after2.sync?.reconciliationArchive ?? {}).length, archiveCount, 'no second archive entry');
});

test('divergent phone keeps reconciliation and loses nothing', async () => {
  // Local has a solve the remote lacks: real divergence, must keep the choice.
  const h = harness(app([session('s1')], [solve('x1', 's1'), solve('local-only', 's1')]));
  await h.engine.drain(); h.engine.dispose();
  const account = (await h.store.read()).accounts[QA_IDENTITIES.a.id];
  assert.equal(account.sync?.reconciliation, true, 'reconciliation preserved for a divergent device');
  assert.ok(account.data.solves.some(s => s.id === 'local-only'), 'the local-only solve is not erased');
});
