import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData, exportBackup, importBackup, parseBackup } from '../../src/data/store';
import { MemoryStorage, qaData } from './contract-fixtures';

test('E1 QA v3 fixture preserves mode-null records before backup work', () => {
  const payloadOriginal = structuredClone(qaData());
  const before = structuredClone(payloadOriginal);
  const encoded = exportBackup(before);
  const restored = parseBackup(encoded);
  assert.deepEqual(restored, { ...before, version: 3 });
  assert.deepEqual(before, payloadOriginal, 'export/parse must not mutate the v3 payload');
  assert.deepEqual(Object.keys(before.progress), ['OLL-01']);
  assert.equal(before.solves.length, 3);
  assert.equal(before.studyAttempts.length, 1);
});

test('E1 invalid or quota import is atomic against the original snapshot', () => {
  const original = qaData();
  const storage = new MemoryStorage(JSON.stringify(original));
  const invalid = JSON.stringify({ format: 'nexus-cube', version: 999, exportedAt: new Date().toISOString(), data: original });
  assert.throws(() => importBackup(invalid, storage));
  assert.deepEqual(original, qaData(), 'invalid import must not mutate the original payload');
  assert.equal(storage.getItem('nexus-cube:v1'), JSON.stringify(original));
  const quota = new MemoryStorage(JSON.stringify(original)); quota.failWrites = true;
  assert.throws(() => importBackup(exportBackup(createInitialData()), quota), /quota/i);
  assert.equal(quota.getItem('nexus-cube:v1'), JSON.stringify(original));
});
