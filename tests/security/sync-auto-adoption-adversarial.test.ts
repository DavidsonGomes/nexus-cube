import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData, toSyncRecords, type SyncRecord } from '../../src/data';
import { autoAdoptSubsetReconciliation, isLocalSubsetOfRemote } from '../../src/cloud/sync-actions';
import { initialSyncState, type SyncAccountState } from '../../src/cloud/sync-state';
import { encodeWire } from '../../src/cloud/codec';
import type { AppData, Session, Solve } from '../../src/domain/types';

// Independent adversarial probes for the safe auto-adoption reducer, driven
// through the REAL sync state (base records + tombstones), not a modeled remote.
// Expected results stated externally per case.

const ISO = '2026-09-08T00:00:00.000Z';
const session = (id: string): Session => ({ id, name: 'S', createdAt: ISO, mode: 'two-handed' });
const solve = (id: string, sessionId: string, rawMs = 1000): Solve =>
  ({ id, sessionId, mode: 'two-handed', rawMs, penalty: 'none', scramble: "R U R'", createdAt: ISO, note: '', source: 'timer' });
const app = (sessions: Session[], solves: Solve[]): AppData => ({ ...createInitialData(), sessions, solves });

function syncFromRemote(remote: AppData, tombstonedExtra?: SyncRecord): SyncAccountState {
  const sync = initialSyncState(true);
  sync.hydrated = true; sync.revision = '7'; sync.epoch = 'e';
  sync.base = toSyncRecords(remote).map(record => ({ entity: record.entity, id: record.id, revision: '7', tombstone: false, record: encodeWire(record) }));
  if (tombstonedExtra) sync.base.push({ entity: tombstonedExtra.entity, id: tombstonedExtra.id, revision: '7', tombstone: true, record: null });
  return sync;
}

test('true subset adopts, preserves the local selection, archives, and is idempotent', () => {
  const remote = app([session('s1')], [solve('x1', 's1'), solve('x2', 's1')]);
  const local = app([session('s1')], [solve('x1', 's1')]);
  local.activeSessionId = 's1';
  const account = { data: local, revision: 3, sync: syncFromRemote(remote), syncNeedsReconciliation: true };
  assert.equal(autoAdoptSubsetReconciliation(account, () => 'probe-op'), true);
  assert.ok(account.data.solves.some(s => s.id === 'x2'), 'remote-only solve now visible');
  assert.equal(account.data.activeSessionId, 's1', 'local selection preserved through projection');
  assert.equal(account.sync!.reconciliation, false);
  assert.equal(account.syncNeedsReconciliation, false);
  assert.equal(account.revision, 4);
  const archived = account.sync!.reconciliationArchive!['probe-op'];
  assert.ok(archived?.replaced?.solves.length === 1 && archived.replaced.solves[0].id === 'x1', 'pre-adoption view archived');
  assert.equal(autoAdoptSubsetReconciliation(account, () => 'probe-op-2'), false, 'second cycle is a no-op');
  assert.equal(Object.keys(account.sync!.reconciliationArchive!).length, 1, 'no re-archive on replay');
});

test('a server-tombstoned record the phone still holds keeps the choice flow through the real base', () => {
  const remote = app([session('s1')], []);
  const ghost = toSyncRecords(app([session('s1')], [solve('deleted-on-server', 's1')])).find(r => r.entity === 'solve')!;
  const local = app([session('s1')], [solve('deleted-on-server', 's1')]);
  const account = { data: local, revision: 3, sync: syncFromRemote(remote, ghost) };
  assert.equal(autoAdoptSubsetReconciliation(account, () => 'probe-op'), false, 'no silent resurrection or deletion');
  assert.equal(account.sync!.reconciliation, true, 'choice flow intact');
  assert.ok(account.data.solves.some(s => s.id === 'deleted-on-server'), 'local data untouched');
});

test('guards refuse: not hydrated, partial page received, or non-empty outbox', () => {
  const remote = app([session('s1')], [solve('x1', 's1')]);
  const local = app([session('s1')], [solve('x1', 's1')]);
  const hydration = { data: structuredClone(local), revision: 1, sync: syncFromRemote(remote) };
  hydration.sync.hydrated = false;
  assert.equal(autoAdoptSubsetReconciliation(hydration, () => 'op'), false);
  const partial = { data: structuredClone(local), revision: 1, sync: syncFromRemote(remote) };
  partial.sync.received = { header: {} as never, upperBound: '8', nextOrdinal: 1, records: [] };
  assert.equal(autoAdoptSubsetReconciliation(partial, () => 'op'), false);
  const queued = { data: structuredClone(local), revision: 1, sync: syncFromRemote(remote) };
  queued.sync.outbox.push({ id: 'op-pending', changes: [] });
  assert.equal(autoAdoptSubsetReconciliation(queued, () => 'op'), false);
});

test('divergent study attempts keep the choice flow (class not covered by the owner tests)', () => {
  const remote = app([session('s1')], [solve('x1', 's1')]);
  const local = app([session('s1')], [solve('x1', 's1')]);
  local.studyAttempts = [{ id: 'a1', caseId: 'OLL-01', createdAt: ISO, recognition: 'good', execution: 'good', durationMs: 900 }];
  assert.equal(isLocalSubsetOfRemote(remote, local), false);
});
