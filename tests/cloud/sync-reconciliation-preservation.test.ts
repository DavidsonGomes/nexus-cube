import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData, toSyncRecords, type SyncRecord } from '../../src/data';
import { createSyncActions } from '../../src/cloud/sync-actions';
import { createSyncEngine } from '../../src/cloud/sync-engine';
import { fold, enqueueChange, keyOf, initialSyncState, type SyncAccountState, type OutboxEntry } from '../../src/cloud/sync-state';
import { encodeWire, digest } from '../../src/cloud/codec';
import { createMemoryCloudStore, initialCloudState, type CloudAtomicStore } from '../../src/cloud/storage';
import type { ContextHandle, Failure } from '../../src/cloud/types';
import type { SyncPullPage, SyncStoredRecord, SyncTransport } from '../../src/cloud/sync-types';

const ISO = '2026-09-08T00:00:00.000Z';
let positionSeed = 0;
const nextPosition = () => String(++positionSeed * 4294967296);
function record(entity: 'session' | 'solve', id: string, sessionId?: string): SyncRecord {
  const data = createInitialData();
  if (entity === 'session') data.sessions = [{ id, name: 'S', createdAt: ISO, mode: 'two-handed' }];
  else {
    data.sessions = [{ id: sessionId!, name: 'S', createdAt: ISO, mode: 'two-handed' }];
    data.solves = [{ id, sessionId: sessionId!, mode: 'two-handed', rawMs: 1000, penalty: 'none', scramble: "R U R'", createdAt: ISO, note: '', source: 'timer' }];
  }
  const found = toSyncRecords(data).find(r => r.entity === entity && r.id === id)!;
  return { ...found, listPosition: nextPosition() };
}
const solve = (id: string, sessionId: string): SyncRecord => record('solve', id, sessionId);
const session = (id: string): SyncRecord => record('session', id);
const stored = (rec: SyncRecord, revision: string, tombstone = false) => ({ entity: rec.entity, id: rec.id, revision, tombstone, record: tombstone ? null : encodeWire(rec) });
const settingsRecord = () => toSyncRecords(createInitialData()).find(rec => rec.entity === 'settings')!;

function baseSync(records: SyncRecord[]): SyncAccountState {
  const sync = initialSyncState(false); sync.hydrated = true; sync.revision = '5'; sync.epoch = 'e';
  sync.base = [stored(settingsRecord(), '1'), ...records.map(record => stored(record, '1'))];
  return sync;
}

test('C1 cascade: a before-null conflict does not hide later independent entries', () => {
  const sync = baseSync([session('s1')]);
  // Server now already has solve x1 (created on the other device): before:null conflicts.
  sync.base.push(stored(solve('x1', 's1'), '2'));
  const conflicting: OutboxEntry = { id: 'op1', changes: [{ entity: 'solve', id: 'x1', before: null, after: solve('x1', 's1') }] };
  const independent: OutboxEntry = { id: 'op2', changes: [{ entity: 'solve', id: 'x2', before: null, after: solve('x2', 's1') }] };
  sync.outbox = [conflicting, independent];
  const data = fold(sync, createInitialData());
  assert.equal(conflicting.conflict !== undefined, true, 'genuine before-mismatch is a conflict');
  assert.equal(independent.conflict, undefined, 'independent entry never marked conflict');
  assert.equal(independent.blocked ?? false, false, 'independent entry is not tainted');
  assert.ok(data.solves.some(s => s.id === 'x2'), 'independent solve stays visible despite the earlier conflict');
});

test('C1 taint: a dependent entry is skipped from the projection but never marked conflict', () => {
  // The realistic C1 chain: op1 creates x1 locally (before:null) while the server
  // already has x1 (rev 2) => op1 is a genuine conflict. op2 then edits the SAME
  // local x1 (before = op1.after), so after op1 is skipped, records still holds the
  // server x1 and op2's before looks mismatched. Taint must catch op2 BEFORE the
  // value check, so it is skipped without ever being promoted to a conflict.
  const serverX1 = solve('x1', 's1');
  const localX1 = solve('x1', 's1');
  const sync = baseSync([session('s1')]);
  sync.base.push(stored(serverX1, '2'));
  const conflicting: OutboxEntry = { id: 'op1', changes: [{ entity: 'solve', id: 'x1', before: null, after: localX1 }] };
  const editedAfter = { ...localX1, value: { ...(localX1.value as Record<string, unknown>), rawMs: 2000 } as SyncRecord['value'] };
  const dependent: OutboxEntry = { id: 'op2', changes: [{ entity: 'solve', id: 'x1', before: localX1, after: editedAfter }] };
  sync.outbox = [conflicting, dependent];
  fold(sync, createInitialData());
  assert.equal(dependent.conflict, undefined, 'tainted-dependent entry must NOT receive a conflict');
  assert.equal(dependent.blocked, true, 'tainted-dependent entry is blocked from the projection');
});

test('F1 referential taint: a solve whose conflicted parent session is skipped is blocked, not orphaned', () => {
  // op1 creates session s2 locally while the server already has s2 (rev 2): op1
  // conflicts. op2 creates a solve in s2 with before:null; its key is not tainted
  // and records has no such solve, so the shared-key/value checks miss it. Without
  // referential taint it would apply, projecting a solve whose session is absent,
  // and fold would throw a domain validation error (wedge with wrong status).
  const serverS2 = session('s2');
  const sync = baseSync([session('s1')]);
  sync.base.push(stored(serverS2, '2'));
  const conflicting: OutboxEntry = { id: 'op1', changes: [{ entity: 'session', id: 's2', before: null, after: session('s2') }] };
  const child: OutboxEntry = { id: 'op2', changes: [{ entity: 'solve', id: 'y1', before: null, after: solve('y1', 's2') }] };
  sync.outbox = [conflicting, child];
  let data: ReturnType<typeof createInitialData> | null = null;
  assert.doesNotThrow(() => { data = fold(sync, createInitialData()); }, 'fold must never produce a domain-invalid projection');
  assert.equal(child.conflict, undefined, 'the orphaned child is not a resolvable conflict');
  assert.equal(child.blocked, true, 'the orphaned child is blocked from the projection');
  assert.ok(!data!.solves.some(s => s.id === 'y1'), 'the orphan solve never reaches the projection');
});

test('F1 no false-block: a solve whose parent session is created by an earlier applied entry still applies', () => {
  // op1 creates session s3 cleanly (before:null, not on server): it APPLIES.
  // op2 creates a solve in s3. Its parent is not in base, but op1 put it in the
  // projection, so referential taint must NOT block op2.
  const sync = baseSync([session('s1')]);
  const parentOp: OutboxEntry = { id: 'op1', changes: [{ entity: 'session', id: 's3', before: null, after: session('s3') }] };
  const childOp: OutboxEntry = { id: 'op2', changes: [{ entity: 'solve', id: 'z1', before: null, after: solve('z1', 's3') }] };
  sync.outbox = [parentOp, childOp];
  const data = fold(sync, createInitialData());
  assert.equal(parentOp.blocked, false, 'clean parent applies');
  assert.equal(childOp.blocked ?? false, false, 'child of an applied parent is not blocked');
  assert.equal(childOp.conflict, undefined, 'child of an applied parent is not a conflict');
  assert.ok(data.solves.some(s => s.id === 'z1'), 'the child solve reaches the projection');
});

test('F1 corner: a solve whose parent session is server-tombstoned is blocked silently, not orphaned', () => {
  // The parent session exists in base only as a tombstone, so liveBase filters it
  // out and records has no s4. A child solve referencing s4 must be blocked, never
  // a conflict, and never reach the projection as an orphan. (Vigia corner case.)
  const sync = baseSync([session('s1')]);
  sync.base.push(stored(session('s4'), '2', true));
  const childOp: OutboxEntry = { id: 'op-solve', changes: [{ entity: 'solve', id: 'y3', before: null, after: solve('y3', 's4') }] };
  sync.outbox = [childOp];
  let data: ReturnType<typeof createInitialData> | null = null;
  assert.doesNotThrow(() => { data = fold(sync, createInitialData()); });
  assert.equal(childOp.blocked, true, 'orphan against a tombstoned parent is blocked');
  assert.equal(childOp.conflict, undefined, 'never a resolvable conflict');
  assert.ok(!data!.solves.some(s => s.id === 'y3'), 'no orphan in the projection');
});

test('invariant 5 (enqueue guard): edits during reconciliation stay out of the outbox but live in account.data', () => {
  const sync = initialSyncState(true);
  const before = createInitialData();
  const after = { ...before, settings: { ...before.settings, holdMs: 555 } };
  const account = { data: after, sync };
  enqueueChange(account, before, after, 'op-during-reconciliation');
  assert.equal(sync.outbox.length, 0, 'no enqueue while reconciliation-required');
  assert.equal(account.data.settings.holdMs, 555, 'the local edit still lives in account.data');
});

function actionsFixture(seedSync: (sync: SyncAccountState, data: ReturnType<typeof createInitialData>) => void) {
  const seed = initialCloudState(); seed.gate = 'active'; seed.generation = 1; seed.user = { id: 'A', email: null };
  const sync = initialSyncState(false); sync.hydrated = true; sync.status = 'synced'; sync.revision = '5'; sync.epoch = 'e';
  sync.base = [stored(settingsRecord(), '1')];
  const data = createInitialData(); seedSync(sync, data);
  seed.accounts.A = { data, revision: 1, sync }; seed.guest = { data: createInitialData(), revision: 0 };
  const store = createMemoryCloudStore(seed) as CloudAtomicStore;
  const context: ContextHandle = { projectRef: 'qa', userId: 'A', generation: 1 };
  const api = createSyncActions({
    store, guard() {}, idle() {}, randomId: () => 'new-operation', drain: async () => {}, trigger() {},
    transport: async () => ({ push: async () => { throw new Error('no dispatch'); }, pull: async () => { throw new Error('no pull'); }, status: async () => ({ revision: '0' }), lookupSource: async () => ({ operationId: null }) }),
    after: async (_value, result) => result,
  });
  return { api, store, context };
}

test('invariant 4: resolving a conflict as remote archives the discarded afters before splicing', async () => {
  const f = actionsFixture((sync) => {
    sync.outbox = [{ id: 'c1', conflict: 'server changed', changes: [{ entity: 'solve', id: 'x9', before: null, after: solve('x9', 's1') }] }];
  });
  const result = await f.api.resolveSyncConflict({ context: f.context, conflictId: 'c1', choice: 'remote', expectedRemoteRevision: '5' });
  assert.equal(result.kind, 'queued');
  const state = await f.store.read(); const sync = state.accounts.A.sync!;
  assert.equal(sync.outbox.length, 0, 'conflict spliced from the queue');
  assert.equal(sync.discardedConflicts?.length, 1, 'discarded conflict archived');
  assert.equal(sync.discardedConflicts![0].entry.changes[0].after?.id, 'x9', 'the afters are preserved in the archive');
});

test('invariant 1: a pull whose projection shrinks the local view archives the dropped keys and prior data', async () => {
  // Local account.data shows a solve that is not represented in base or outbox
  // (e.g. written during reconciliation). A completing pull refolds and the key
  // vanishes without a tombstone: the C2 fingerprint. The engine must archive it.
  const seed = initialCloudState(); seed.gate = 'active'; seed.generation = 1; seed.user = { id: 'A', email: null };
  const sync = initialSyncState(false); sync.hydrated = true; sync.revision = '9'; sync.epoch = 'e';
  sync.base = [stored(settingsRecord(), '1')];
  const local = createInitialData();
  local.sessions.push({ id: 's1', name: 'S', createdAt: ISO, mode: 'two-handed' });
  local.solves.push({ id: 'ghost', sessionId: 's1', mode: 'two-handed', rawMs: 1000, penalty: 'none', scramble: "R U R'", createdAt: ISO, note: '', source: 'timer' });
  seed.accounts.A = { data: local, revision: 1, sync };
  const store = createMemoryCloudStore(seed);
  const records: SyncStoredRecord[] = [{ entity: 'settings', id: 'account', revision: '10', tombstone: false, record: encodeWire(settingsRecord()) }];
  const page: SyncPullPage = { epoch: 'e', upperBound: '10', startOrdinal: 0, nextOrdinal: records.length, complete: true, hasMore: false, records,
    header: { epoch: 'e', revision: '10', previousRevision: '9', operationId: 'op-shrink', requestDigest: 'sha256:' + '0'.repeat(64), transactionDigest: await digest(records), changeCount: records.length } };
  let pulled = false;
  const transport: SyncTransport = { status: async () => ({ revision: '9' }), push: async () => { throw new Error('no push'); },
    pull: async () => { if (pulled) return { epoch: 'e', upperBound: '10', header: null, records: [], startOrdinal: 0, nextOrdinal: 0, complete: true, hasMore: false }; pulled = true; return page; } };
  const context: ContextHandle = { projectRef: 'qa', userId: 'A', generation: 1 };
  const engine = createSyncEngine({ store: store as CloudAtomicStore, context: () => context,
    isCurrent: c => c.userId === 'A' && c.generation === 1, guard: () => {}, transport: async () => transport, online: () => true, intervalMs: 60_000 });
  await engine.drain(); engine.dispose();
  const after = (await store.read()).accounts.A.sync!;
  assert.equal(after.droppedProjections?.length, 1, 'the shrinking projection is archived');
  assert.ok(after.droppedProjections![0].keys.includes('solve:ghost'), 'the vanished key is recorded');
  assert.ok(after.droppedProjections![0].previous.solves.some(s => s.id === 'ghost'), 'pre-replacement data is recoverable');
});

test('invariants 3 and 5: confirming remote archives the pre-replacement local view even with an empty queue', async () => {
  const f = actionsFixture((sync, data) => {
    // A local solve exists in account.data but was never queued (edited during reconciliation).
    data.sessions.push({ id: 's1', name: 'S', createdAt: ISO, mode: 'two-handed' });
    data.solves.push({ id: 'local-only', sessionId: 's1', mode: 'two-handed', rawMs: 1000, penalty: 'none', scramble: "R U R'", createdAt: ISO, note: '', source: 'timer' });
    sync.previews = { p1: { generation: 1, localRevision: 1, remoteRevision: '5', source: 'account', sourceDigest: 'd', sourceSnapshot: createInitialData(), merged: createInitialData(), remote: createInitialData(), queueSnapshot: [] } };
  });
  const result = await f.api.confirmAccountReconciliation({ context: f.context, previewId: 'p1', choice: 'remote' });
  assert.equal(result.kind, 'queued');
  const state = await f.store.read(); const sync = state.accounts.A.sync!;
  const archived = sync.reconciliationArchive?.p1;
  assert.ok(archived?.replaced, 'pre-replacement local data archived unconditionally');
  assert.ok(archived!.replaced!.solves.some(s => s.id === 'local-only'), 'the unqueued local solve is recoverable from the archive');
});
