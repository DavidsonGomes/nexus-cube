import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData, toSyncRecords, type SyncRecord } from '../../src/data';
import { fold, initialSyncState, type OutboxEntry, type SyncAccountState } from '../../src/cloud/sync-state';
import { encodeWire } from '../../src/cloud/codec';

const ISO = '2026-09-08T00:00:00.000Z';
let seed = 0;
const position = () => String(++seed * 4294967296);
function makeRecord(entity: 'session' | 'solve', id: string, sessionId?: string): SyncRecord {
  const data = createInitialData();
  if (entity === 'session') data.sessions = [{ id, name: 'S', createdAt: ISO, mode: 'two-handed' }];
  else {
    data.sessions = [{ id: sessionId!, name: 'S', createdAt: ISO, mode: 'two-handed' }];
    data.solves = [{ id, sessionId: sessionId!, mode: 'two-handed', rawMs: 1000, penalty: 'none', scramble: "R U R'", createdAt: ISO, note: '', source: 'timer' }];
  }
  const found = toSyncRecords(data).find(r => r.entity === entity && r.id === id)!;
  return { ...found, listPosition: position() };
}
const stored = (rec: SyncRecord, revision: string, tombstone = false) =>
  ({ entity: rec.entity, id: rec.id, revision, tombstone, record: tombstone ? null : encodeWire(rec) });
const settingsRecord = () => toSyncRecords(createInitialData()).find(rec => rec.entity === 'settings')!;

function syncWithBase(): SyncAccountState {
  const sync = initialSyncState(false);
  sync.hydrated = true; sync.revision = '5'; sync.epoch = 'e';
  sync.base = [stored(settingsRecord(), '1')];
  return sync;
}

// Independent adversarial probes for the F1 referential taint. Expected results
// stated externally: a child of a skipped parent is silently blocked (never a
// resolvable conflict, never a domain-invalid orphan, never a throw), and a
// child of an applied in-queue parent is never falsely blocked.

test('F1 acceptance: push-conflicted session creation plus child solve folds without throwing', () => {
  const sync = syncWithBase();
  const sessionCreate: OutboxEntry = {
    id: 'op-session',
    conflict: 'O servidor recebeu uma revisão diferente. Revise o conflito.',
    changes: [{ entity: 'session', id: 's2', before: null, after: makeRecord('session', 's2') }],
  };
  const childSolve: OutboxEntry = {
    id: 'op-solve',
    changes: [{ entity: 'solve', id: 'y1', before: null, after: makeRecord('solve', 'y1', 's2') }],
  };
  sync.outbox = [sessionCreate, childSolve];
  const data = fold(sync, createInitialData());
  assert.equal(childSolve.blocked, true, 'child of the skipped session is blocked');
  assert.equal(childSolve.conflict, undefined, 'child is never promoted to a resolvable conflict');
  assert.equal(data.solves.some(s => s.id === 'y1'), false, 'no orphan solve reaches the projection');
  assert.equal(data.sessions.some(s => s.id === 's2'), false, 'the conflicted session is not projected either');
});

test('F1 no false block: child of a session applied earlier in the queue still projects', () => {
  const sync = syncWithBase();
  const sessionCreate: OutboxEntry = {
    id: 'op-session',
    changes: [{ entity: 'session', id: 's3', before: null, after: makeRecord('session', 's3') }],
  };
  const childSolve: OutboxEntry = {
    id: 'op-solve',
    changes: [{ entity: 'solve', id: 'y2', before: null, after: makeRecord('solve', 'y2', 's3') }],
  };
  sync.outbox = [sessionCreate, childSolve];
  const data = fold(sync, createInitialData());
  assert.equal(childSolve.blocked ?? false, false, 'child of an applied parent is not blocked');
  assert.equal(childSolve.conflict, undefined, 'and not a conflict');
  assert.ok(data.solves.some(s => s.id === 'y2'), 'the child solve reaches the projection');
});

test('F1 corner: child of a server-tombstoned session is blocked silently, not thrown', () => {
  const sync = syncWithBase();
  const ghostSession = makeRecord('session', 's4');
  sync.base.push(stored(ghostSession, '2', true));
  const childSolve: OutboxEntry = {
    id: 'op-solve',
    changes: [{ entity: 'solve', id: 'y3', before: null, after: makeRecord('solve', 'y3', 's4') }],
  };
  sync.outbox = [childSolve];
  const data = fold(sync, createInitialData());
  assert.equal(childSolve.blocked, true, 'orphan against a tombstoned parent is blocked');
  assert.equal(childSolve.conflict, undefined, 'never a resolvable conflict');
  assert.equal(data.solves.some(s => s.id === 'y3'), false, 'no orphan in the projection');
});
