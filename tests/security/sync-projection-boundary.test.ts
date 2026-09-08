import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSyncAccountData, toSyncAccountData } from '../../src/data/sync-projection';
import { ACCOUNT_SETTINGS_AFTER, automaticSyncFixture, SYNC_TEXT_VECTORS } from './sync-fixtures';

test('sync projection boundary: account settings transfer while device selection and exact order remain local', () => {
  const { a1, a2 } = automaticSyncFixture();
  a1.settings = { ...ACCOUNT_SETTINGS_AFTER };
  a1.solves = SYNC_TEXT_VECTORS.map((vector, index) => ({
    ...a1.solves[0], id: `solve-${99 - index}`, note: vector.text, rawMs: index === 0 ? Number.MIN_VALUE : 0.1,
  }));
  const { activeSessionId: _selection, ...expectedAccount } = structuredClone(a1);
  const beforeA1 = structuredClone(a1), beforeA2 = structuredClone(a2);
  assert.deepEqual(toSyncAccountData(a1), expectedAccount);
  // Incoming fixture is constructed independently, not obtained from the outbound SUT.
  const projected = projectSyncAccountData(expectedAccount, a2);
  assert.equal(projected.kind, 'projected');
  if (projected.kind !== 'projected') assert.fail('Small valid V3 fixture must project');
  assert.deepEqual(projected.data, { ...expectedAccount, activeSessionId: 'other-session-id' });
  assert.equal(projected.selectionChange, 'none');
  assert.deepEqual(a1, beforeA1); assert.deepEqual(a2, beforeA2);
});

test('sync projection boundary: account payload cannot inject owner, local selection, extra fields or future domain', () => {
  const { a1, a2 } = automaticSyncFixture();
  const { activeSessionId: _selection, ...account } = structuredClone(a1);
  const before = structuredClone(a2);
  for (const hostile of [
    { ...account, owner_id: '22222222-2222-4222-8222-222222222222' },
    { ...account, activeSessionId: 'same-session-id' },
    { ...account, serverRevision: '9' },
    { ...account, version: 4 },
    { ...account, version: 2 },
    { ...account, sessions: account.sessions.map(({ mode: _mode, ...session }) => session) },
  ]) {
    assert.throws(() => projectSyncAccountData(hostile, a2));
    assert.deepEqual(a2, before, 'rejected payload cannot mutate the current snapshot');
  }
});
