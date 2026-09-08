import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine } from '../../src/cloud/sync-engine';
import type { SyncAccountState, OutboxEntry } from '../../src/cloud/sync-state';
import type { ContextHandle } from '../../src/cloud/types';
import type { SyncOperation, SyncStoredRecord, SyncTransport } from '../../src/cloud/sync-types';
import { ControlledStore } from './controlled-dependencies';
import { automaticSyncFixture, SYNC_OPERATION_IDS } from './sync-fixtures';
import { QA_IDENTITIES, deferred } from './fixtures';
import { emptyPage, fixtureBase, fixturePage, oracleWire } from './sync-oracle';

async function harness(transport: SyncTransport, options: { tombstone?: boolean } = {}) {
  const fixture = automaticSyncFixture();
  const after = { entity: 'solve' as const, id: fixture.newSolve.id, value: fixture.newSolve, listPosition: '1' };
  const entry: OutboxEntry = { id: SYNC_OPERATION_IDS.create, changes: [{ entity: 'solve', id: after.id, before: null, after }] };
  const state: SyncAccountState = { version: 1, revision: '9', epoch: 'synthetic-epoch', base: fixtureBase(fixture.a1), outbox: [entry], reconciliation: false, status: 'pending', error: null, received: null, adoptedSources: {} };
  if (options.tombstone) state.base.push({ entity: 'solve', id: after.id, revision: '9', tombstone: true, record: null });
  const store = new ControlledStore();
  const initialContext: ContextHandle = { projectRef: 'synthetic-engine', userId: QA_IDENTITIES.a.id, generation: 7 };
  let selected = initialContext;
  await store.transact(root => {
    root.generation = 7; root.gate = 'active'; root.user = { ...QA_IDENTITIES.a };
    root.accounts[QA_IDENTITIES.a.id] = { data: fixture.afterCreateA1, revision: 1, sync: state };
    root.accounts[QA_IDENTITIES.b.id] = { data: fixture.b, revision: 1 };
  });
  const engine = createSyncEngine({
    store, context: () => selected,
    isCurrent: context => context.userId === selected.userId && context.generation === selected.generation,
    guard: (root, context) => { if (root.gate !== 'active' || root.user?.id !== context.userId || root.generation !== context.generation) throw new Error('Synthetic gate mismatch'); },
    transport: async () => transport, online: () => true, intervalMs: 60_000,
  });
  return { fixture, store, engine, after,
    sync: () => store.peek().accounts[QA_IDENTITIES.a.id].sync!,
    async switchToB() {
      selected = { ...initialContext, userId: QA_IDENTITIES.b.id, generation: 8 };
      await store.transact(root => { root.generation = 8; root.user = { ...QA_IDENTITIES.b }; });
    },
  };
}

test('sync engine: lost ack retries identical frozen operation then pull confirms exactly one solve', async t => {
  const pushes: SyncOperation[] = []; let pulls = 0;
  const transport: SyncTransport = {
    status: async () => ({ revision: '9' }),
    push: async operation => {
      pushes.push(structuredClone(operation));
      if (pushes.length === 1) throw new Error('Synthetic ack loss');
      return { kind: 'applied', operationId: operation.operationId, requestDigest: operation.requestDigest, commitRevision: '10', changeCount: 1 };
    },
    pull: async () => {
      if (++pulls <= 2) return emptyPage('9');
      const operation = pushes[0];
      return fixturePage([{ entity: 'solve', id: 'sync-created-solve', revision: '10', tombstone: false, record: operation.changes[0].record }], operation);
    },
  };
  const h = await harness(transport); t.after(() => h.engine.dispose());
  await h.engine.drain();
  assert.equal(h.sync().outbox.length, 1); assert.equal(h.sync().revision, '9');
  await h.engine.drain();
  assert.equal(pushes.length, 2); assert.deepEqual(pushes[1], pushes[0]);
  assert.equal(h.sync().revision, '10'); assert.equal(h.sync().outbox.length, 0);
  assert.equal(h.sync().status, 'synced');
  assert.deepEqual(h.store.peek().accounts[QA_IDENTITIES.a.id].data, h.fixture.afterCreateA1);
  assert.deepEqual(h.store.peek().accounts[QA_IDENTITIES.b.id].data, h.fixture.b);
});

test('sync engine: pull before ack correlates op1 while later remote revision preserves op2 conflict', async t => {
  let operation: SyncOperation | undefined, pulls = 0, pushes = 0;
  const transport: SyncTransport = {
    status: async () => ({ revision: '11' }),
    push: async input => { pushes++; operation = structuredClone(input); throw new Error('Synthetic ack loss'); },
    pull: async () => {
      if (++pulls === 1) return emptyPage('9');
      const record: SyncStoredRecord = { entity: 'solve', id: h.after.id, revision: '10', tombstone: false, record: oracleWire(h.after) };
      if (pulls === 2) return { ...fixturePage([record], operation!), upperBound: '11', hasMore: true };
      return fixturePage([{ ...record, revision: '11', record: oracleWire({ ...h.after, value: h.fixture.remoteEdit }) }], { operationId: '20000000-0000-4000-8000-000000000001', requestDigest: 'synthetic-other-request' }, '11', '10');
    },
  };
  const h = await harness(transport); t.after(() => h.engine.dispose());
  await h.engine.drain();
  await h.store.transact(root => { root.accounts[QA_IDENTITIES.a.id].sync!.outbox.push({ id: SYNC_OPERATION_IDS.edit, changes: [{ entity: 'solve', id: h.after.id, before: h.after, after: { ...h.after, value: h.fixture.intentAfterCreate } }] }); });
  await h.engine.drain();
  assert.equal(pushes, 1, 'pull proves op1 without replay or sending conflicting op2');
  assert.equal(h.sync().revision, '11');
  assert.equal(h.sync().outbox.length, 1); assert.equal(h.sync().outbox[0].id, SYNC_OPERATION_IDS.edit);
  assert.ok(h.sync().outbox[0].conflict);
  assert.deepEqual(h.sync().outbox[0].changes[0].after?.value, h.fixture.intentAfterCreate);
  assert.equal(h.store.peek().accounts[QA_IDENTITIES.a.id].data.solves.filter(solve => solve.id === h.after.id).length, 1);
});

test('sync engine: incomplete transaction with mismatched continuation cannot install partial base', async t => {
  let calls = 0;
  const transport: SyncTransport = { status: async () => ({ revision: '10' }), push: async () => { assert.fail('Incomplete pull must not dispatch'); }, pull: async () => {
    const records: SyncStoredRecord[] = [
      { entity: 'solve', id: h.after.id, revision: '10', tombstone: false, record: oracleWire(h.after) },
      { entity: 'solve', id: 'second-record', revision: '10', tombstone: true, record: null },
    ];
    const page = fixturePage(records, { operationId: SYNC_OPERATION_IDS.create, requestDigest: 'synthetic-unrelated' });
    if (++calls === 1) return { ...page, records: records.slice(0, 1), nextOrdinal: 1, complete: false, hasMore: true };
    return { ...page, startOrdinal: 0, records: records.slice(1), nextOrdinal: 1 };
  } };
  const h = await harness(transport); t.after(() => h.engine.dispose());
  const before = h.store.peek().accounts[QA_IDENTITIES.a.id];
  await h.engine.drain();
  assert.equal(h.sync().revision, '9'); assert.deepEqual(h.sync().base, before.sync!.base);
  assert.deepEqual(h.store.peek().accounts[QA_IDENTITIES.a.id].data, before.data);
  assert.equal(h.sync().received?.nextOrdinal, 1); assert.equal(h.sync().received?.records.length, 1);
  assert.equal(h.sync().outbox.length, 1); assert.equal(h.sync().status, 'error');
});

test('sync engine: A pull returned after B activation cannot alter B or A confirmed base', async t => {
  const pending = deferred<ReturnType<typeof emptyPage>>(), started = deferred<void>();
  const transport: SyncTransport = { status: async () => ({ revision: '9' }), push: async () => { assert.fail('Old A dispatch forbidden'); }, pull: async () => { started.resolve(); return pending.promise; } };
  const h = await harness(transport); t.after(() => h.engine.dispose());
  const running = h.engine.drain(); await started.promise; await h.switchToB();
  const before = h.store.peek(); pending.resolve(emptyPage('9')); await running;
  assert.deepEqual(h.store.peek(), before);
});

test('sync engine: create colliding with tombstone must never be promoted to restore implicitly', async t => {
  const pushes: SyncOperation[] = [];
  const transport: SyncTransport = { status: async () => ({ revision: '9' }), pull: async () => emptyPage('9'), push: async operation => { pushes.push(structuredClone(operation)); throw new Error('Synthetic stop after observing dispatch'); } };
  const h = await harness(transport, { tombstone: true }); t.after(() => h.engine.dispose());
  await h.engine.drain();
  assert.ok(pushes.every(operation => operation.changes.every(change => change.action !== 'restore')), 'no explicit restore intent was supplied');
  assert.equal(h.sync().base.find(record => record.id === h.after.id)?.tombstone, true);
});

test('sync engine: hasMore false before confirmed upper bound cannot report synced', async t => {
  let pulls = 0;
  const transport: SyncTransport = {
    status: async () => ({ revision: '11' }),
    push: async () => { assert.fail('This fixture has no local intent'); },
    pull: async () => {
      if (++pulls > 1) throw new Error('Synthetic stop: missing commit eleven');
      const record: SyncStoredRecord = { entity: 'solve', id: h.after.id, revision: '10', tombstone: false, record: oracleWire(h.after) };
      return { ...fixturePage([record], { operationId: '20000000-0000-4000-8000-000000000002', requestDigest: 'synthetic-remote-request' }), upperBound: '11', hasMore: false };
    },
  };
  const h = await harness(transport); t.after(() => h.engine.dispose());
  await h.store.transact(root => { const account = root.accounts[QA_IDENTITIES.a.id]; account.sync!.outbox = []; account.data = h.fixture.a1; });
  const before = h.store.peek().accounts[QA_IDENTITIES.a.id];
  await h.engine.drain();
  assert.notEqual(h.sync().status, 'synced', 'commit eleven was advertised but never received');
  assert.notEqual(h.sync().revision, '11', 'upper bound cannot fabricate applied revision');
  assert.equal(h.sync().hydrated, before.sync!.hydrated, 'invalid page cannot confirm hydration');
  assert.deepEqual(h.sync().base, before.sync!.base);
  assert.deepEqual(h.sync().outbox, before.sync!.outbox);
  assert.deepEqual(h.store.peek().accounts[QA_IDENTITIES.a.id].data, before.data);
});
