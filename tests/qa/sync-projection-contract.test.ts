import assert from 'node:assert/strict';
import test from 'node:test';
import { projectSyncAccountData, projectSyncRecords, preflightSyncProjection, toSyncAccountData, toSyncRecords, validateSyncRecords } from '../../src/data/sync-projection';
import { CONTEXTS, EXPECTED, cloneExpectedData, syntheticData } from './automatic-sync-fixtures';

test('sync projection strips only local selection and preserves full synthetic account data', () => {
  const local = cloneExpectedData('accountA');
  const before = structuredClone(local);
  const account = toSyncAccountData(local);
  assert.equal('activeSessionId' in account, false);
  assert.deepEqual({ ...account, activeSessionId: null }, { ...before, activeSessionId: null });
  assert.deepEqual(local, before);
});

test('remote account projection keeps A data, never imports B or guest, and selection is local', () => {
  const local = cloneExpectedData('accountA');
  const incoming = toSyncAccountData(cloneExpectedData('accountA'));
  const projected = projectSyncAccountData(incoming, local);
  assert.equal(projected.kind, 'projected');
  if (projected.kind !== 'projected') return;
  assert.deepEqual(projected.data, local);
  assert.notDeepEqual(projected.data, EXPECTED.accountB);
  assert.notDeepEqual(projected.data, EXPECTED.guest);
  assert.equal(projected.data.activeSessionId, local.activeSessionId);
  assert.equal(CONTEXTS.a1.userId, CONTEXTS.a2.userId);
});

test('record projection round-trips every synthetic entity and preserves guest null mode', () => {
  for (const owner of ['accountA', 'accountB', 'guest'] as const) {
    const source = cloneExpectedData(owner);
    const records = toSyncRecords(source);
    const checked = validateSyncRecords(records);
    const projected = projectSyncRecords(records, source);
    assert.deepEqual(checked.data, { ...source, activeSessionId: null });
    assert.equal(projected.kind, 'projected');
    if (projected.kind === 'projected') assert.deepEqual(projected.data, source);
  }
  assert.equal(EXPECTED.guest.sessions[0]?.mode, null);
  assert.equal(EXPECTED.guest.solves[0]?.mode, null);
});

test('preflight measures both null and longest selection while rejecting non-V3 input', () => {
  const data = syntheticData('two-handed', 'x'.repeat(100));
  const bytes = preflightSyncProjection(toSyncAccountData(data));
  assert.equal(bytes.longestActiveSessionId, 'x'.repeat(100));
  assert.ok(bytes.snapshotWithNullBytes > 0);
  assert.ok(bytes.backupWithNullBytes > bytes.snapshotWithNullBytes);
  assert.throws(() => preflightSyncProjection({ ...data, version: 2 }));
});
