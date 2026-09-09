import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData } from '../../src/data';
import { isLocalSubsetOfRemote } from '../../src/cloud/sync-actions';
import type { AppData, Session, Solve } from '../../src/domain/types';

// Safety hinge of the Causa 2 fix: auto-adopt WITHOUT asking only when local is a
// strict subset of remote (merge is a no-op). Any divergence keeps the choice
// flow, because blind adoption would erase local data — the original incident.
// Own oracle: build remote/local by hand and assert both branches.

const ISO = '2026-09-08T00:00:00.000Z';
const session = (id: string): Session => ({ id, name: 'S', createdAt: ISO, mode: 'two-handed' });
const solve = (id: string, sessionId: string, rawMs = 1000): Solve =>
  ({ id, sessionId, mode: 'two-handed', rawMs, penalty: 'none', scramble: "R U R'", createdAt: ISO, note: '', source: 'timer' });
const app = (sessions: Session[], solves: Solve[], settings?: Partial<AppData['settings']>): AppData => {
  const base = createInitialData();
  return { ...base, sessions, solves, settings: { ...base.settings, ...settings } };
};

test('subset: local fully contained in remote (equal records + settings) auto-adopts', () => {
  const remote = app([session('s1')], [solve('x1', 's1'), solve('x2', 's1')]);
  const local = app([session('s1')], [solve('x1', 's1')]); // fewer solves, all equal, same settings
  assert.equal(isLocalSubsetOfRemote(remote, local), true);
});

test('subset: identical local and remote auto-adopts (trivial no-op)', () => {
  const remote = app([session('s1')], [solve('x1', 's1')]);
  const local = app([session('s1')], [solve('x1', 's1')]);
  assert.equal(isLocalSubsetOfRemote(remote, local), true);
});

test('divergent: a local-only solve keeps the choice flow', () => {
  const remote = app([session('s1')], [solve('x1', 's1')]);
  const local = app([session('s1')], [solve('x1', 's1'), solve('local-only', 's1')]);
  assert.equal(isLocalSubsetOfRemote(remote, local), false);
});

test('divergent: same id, different value keeps the choice flow', () => {
  const remote = app([session('s1')], [solve('x1', 's1', 1000)]);
  const local = app([session('s1')], [solve('x1', 's1', 2000)]); // edited locally
  assert.equal(isLocalSubsetOfRemote(remote, local), false);
});

test('divergent: differing settings keeps the choice flow (never overwrite settings silently)', () => {
  const remote = app([session('s1')], [solve('x1', 's1')], { holdMs: 300 });
  const local = app([session('s1')], [solve('x1', 's1')], { holdMs: 999 });
  assert.equal(isLocalSubsetOfRemote(remote, local), false);
});

test('divergent: a local-only session keeps the choice flow', () => {
  const remote = app([session('s1')], [solve('x1', 's1')]);
  const local = app([session('s1'), session('s2')], [solve('x1', 's1')]);
  assert.equal(isLocalSubsetOfRemote(remote, local), false);
});

test('divergent: local-only progress keeps the choice flow', () => {
  const remote = app([session('s1')], [solve('x1', 's1')]);
  const local = app([session('s1')], [solve('x1', 's1')]);
  local.progress = { 'OLL-01': { caseId: 'OLL-01', favorite: true, status: 'learning', note: '' } };
  assert.equal(isLocalSubsetOfRemote(remote, local), false);
});

test('divergent: a record the remote tombstoned but the phone still holds keeps the choice flow', () => {
  // The remote projection excludes tombstoned records (projected over liveBase),
  // so a locally-still-present solve the server deleted looks local-only to merge:
  // merged re-adds it and diverges. Auto-adopting would resurrect a deleted
  // record silently; keeping the choice flow is the safe behavior. Modeled as a
  // remote WITHOUT the record and a local that still has it.
  const remote = app([session('s1')], []);
  const local = app([session('s1')], [solve('deleted-on-server', 's1')]);
  assert.equal(isLocalSubsetOfRemote(remote, local), false);
});
