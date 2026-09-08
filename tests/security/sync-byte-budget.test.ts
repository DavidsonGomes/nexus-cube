import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { exportBackup, parseBackup, saveData } from '../../src/data/store';
import { preflightSyncProjection, projectSyncAccountData } from '../../src/data/sync-projection';
import { compactV3BoundaryFixture, HISTORIC_V3_SNAPSHOT_BYTES } from './sync-byte-fixtures';

const bytes = (text: string) => Buffer.byteLength(text, 'utf8');
const stamp = '2026-09-08T12:00:00.000Z';
const envelopeBytes = bytes(JSON.stringify({ format: 'nexus-cube', version: 3, exportedAt: stamp, data: {} })) - 2;

for (const selection of ['null', 'id1', 'id100'] as const) {
  test(`sync byte budget: historic full V3 with ${selection} projects longest selection without loss`, () => {
    const source = compactV3BoundaryFixture(selection);
    assert.equal(bytes(JSON.stringify(source)), HISTORIC_V3_SNAPSHOT_BYTES);
    const { activeSessionId: _selected, ...account } = source;
    const nullBytes = bytes(JSON.stringify({ ...account, activeSessionId: null }));
    const longBytes = bytes(JSON.stringify({ ...account, activeSessionId: 'x'.repeat(100) }));
    assert.equal(nullBytes - HISTORIC_V3_SNAPSHOT_BYTES, selection === 'id1' ? 1 : selection === 'id100' ? -98 : 0);
    assert.equal(longBytes - nullBytes, 98);
    const budget = preflightSyncProjection(account);
    assert.equal(budget.snapshotWithNullBytes, nullBytes);
    assert.equal(budget.snapshotWithLongestSelectionBytes, longBytes);
    assert.equal(budget.backupWithLongestSelectionBytes, longBytes + envelopeBytes);
    assert.equal(budget.fitsAllSelections, true);
    const previous = { ...source, activeSessionId: 'x'.repeat(100), solves: [] };
    const projection = projectSyncAccountData(account, previous);
    assert.equal(projection.kind, 'projected');
    if (projection.kind !== 'projected') assert.fail('Historic supported source cannot lose capacity');
    assert.equal(projection.data.activeSessionId, 'x'.repeat(100), 'no forced null');
    assert.deepEqual(projection.data.solves, source.solves);
    let persisted = '';
    saveData(projection.data, { getItem: () => null, setItem: (_key, value) => { persisted = value; } });
    assert.equal(bytes(persisted), longBytes);
    assert.deepEqual(JSON.parse(persisted), { ...account, activeSessionId: 'x'.repeat(100) });
    const backup = exportBackup(projection.data);
    assert.equal(bytes(backup), longBytes + envelopeBytes);
    assert.deepEqual(parseBackup(backup), { ...account, activeSessionId: 'x'.repeat(100) });
  });
}

test('sync byte budget: fixed account +1 is refused even when full snapshot fits selection reserve', () => {
  // Old ID1 at capacity needs null +1. One byte beyond that is account overflow.
  const source = compactV3BoundaryFixture('null', HISTORIC_V3_SNAPSHOT_BYTES + 2);
  const { activeSessionId: _selected, ...account } = source;
  const budget = preflightSyncProjection(account);
  assert.equal(budget.fitsWithNull, false);
  assert.equal(budget.fitsAllSelections, false);
  const previous = { ...source, solves: [] };
  const projection = projectSyncAccountData(account, previous);
  assert.equal(projection.kind, 'capacity-blocked');
  if (projection.kind === 'capacity-blocked') assert.equal(projection.reason, 'account-limit');
  let persisted = 'synthetic-previous';
  assert.throws(() => saveData(source, { getItem: () => persisted, setItem: (_key, value) => { persisted = value; } }));
  assert.equal(persisted, 'synthetic-previous');
  assert.throws(() => exportBackup(source));
  assert.equal(source.activeSessionId, null);
  assert.equal(source.solves.length, 5000, 'failure did not truncate content');
});
