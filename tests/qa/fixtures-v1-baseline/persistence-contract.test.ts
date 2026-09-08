import test from 'node:test';
import assert from 'node:assert/strict';
import { exportBackup, parseBackup, importBackup, loadData, saveData, validateData, exportCSV } from '../../src/data/store';
import { qaData, MemoryStorage, QA_KEY } from './contract-fixtures';

test('A4: backup restores complete independent fixture in one write', () => {
  const data = qaData(), serialized = exportBackup(data), storage = new MemoryStorage('previous QA value');
  assert.deepEqual(parseBackup(serialized), data);
  assert.deepEqual(importBackup(serialized, storage), data);
  assert.equal(storage.writes.length, 1);
  assert.equal(storage.writes[0][0], QA_KEY);
  assert.deepEqual(loadData(storage), { data, error: null });
});

test('A4: invalid last record and broken schema never mutate storage', () => {
  const base = JSON.parse(exportBackup(qaData()));
  const variants: Array<[string, (b: any) => void]> = [
    ['future version', b => { b.version = 999; }],
    ['unknown field', b => { b.data.silentExtra = true; }],
    ['last solve invalid', b => { b.data.solves.at(-1).rawMs = -1; }],
    ['penalty', b => { b.data.solves[0].penalty = 'DNS'; }],
    ['duplicate id', b => { b.data.solves[1].id = b.data.solves[0].id; }],
    ['orphan solve', b => { b.data.solves[0].sessionId = 'missing'; }],
    ['active session', b => { b.data.activeSessionId = 'missing'; }],
    ['unknown case', b => { b.data.studyAttempts[0].caseId = 'OLL-99'; }],
    ['duplicate session', b => { b.data.sessions[1].id = b.data.sessions[0].id; }],
    ['status', b => { b.data.progress['OLL-01'].status = 'invented'; }],
  ];
  const invalid = ['{', 'null', '[]', ...variants.map(([, mutate]) => { const b = structuredClone(base); mutate(b); return JSON.stringify(b); })];
  for (const text of invalid) {
    const storage = new MemoryStorage('QA SENTINEL');
    assert.throws(() => importBackup(text, storage), text);
    assert.equal(storage.getItem(QA_KEY), 'QA SENTINEL'); assert.equal(storage.writes.length, 0);
  }
  for (const number of [NaN, Infinity, -Infinity]) { const data = qaData(); data.solves[0].rawMs = number; assert.throws(() => validateData(data)); }
});

test('A3: load corrupted snapshot preserves exact recoverable bytes', () => {
  for (const corrupted of ['{unfinished', 'null', '{"version":999}', '']) {
    const storage = new MemoryStorage(corrupted);
    const result = loadData(storage);
    assert.equal(typeof result.error, 'string', 'corruption must be distinguishable from missing');
    assert.ok(result.error); assert.equal(storage.getItem(QA_KEY), corrupted); assert.equal(storage.writes.length, 0);
  }
});

test('A3/A4: write failure propagates without claiming successful restore', () => {
  const storage = new MemoryStorage('QA ORIGINAL'); storage.failWrites = true;
  assert.throws(() => saveData(qaData(), storage), /quota/);
  assert.throws(() => importBackup(exportBackup(qaData()), storage), /quota/);
  assert.equal(storage.getItem(QA_KEY), 'QA ORIGINAL'); assert.equal(storage.writes.length, 0);
});

test('A4: CSV contains escaped quotes, newline, Unicode and session scope', () => {
  const data = qaData();
  const csv = exportCSV(data);
  assert.ok(csv.includes('""aspas""')); assert.ok(csv.includes('segunda linha 🧊'));
  assert.ok(csv.includes('DNF')); assert.ok(csv.includes('+2'));
  const onlyA = exportCSV(data, 'qa-a'); assert.ok(!onlyA.includes('segunda linha 🧊'));
});
