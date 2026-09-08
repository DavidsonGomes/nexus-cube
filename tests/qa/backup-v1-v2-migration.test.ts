import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exportBackup, importBackup, parseBackup } from '../../src/data/store';
import { MemoryStorage } from './contract-fixtures';
import { recordStudyAttempt } from '../../src/domain/study';

const archivedV1 = readFileSync(new URL('../../tests/domain/fixtures/backup-v1.json', import.meta.url), 'utf8');
const archivedV2 = readFileSync(new URL('../../tests/domain/fixtures/backup-v2.json', import.meta.url), 'utf8');
const archivedV1Payload = JSON.parse(archivedV1).data;

test('E1 archived v1 migrates in memory to v3 with explicit null modes', () => {
  const legacy = parseBackup(archivedV1);
  assert.equal(legacy.version, 3, 'validated legacy data is normalized to v3 in memory');
  const storage = new MemoryStorage();
  const migrated = importBackup(archivedV1, storage);
  assert.equal(migrated.version, 3);
  assert.equal(storage.writes.length, 1);
  const persisted = JSON.parse(storage.writes[0][1]);
  assert.equal(persisted.version, 3);
  const expected = {...archivedV1Payload, version: 3, activeSessionId: archivedV1Payload.activeSessionId,
    sessions: archivedV1Payload.sessions.map((session: object) => ({...session, mode: null})),
    solves: archivedV1Payload.solves.map((solve: object) => ({...solve, mode: null}))};
  assert.deepEqual(migrated, expected, 'raw archived v1 data preserved with only v3 and null modes added');
});

test('E1 migrated legacy roundtrip remains stable and invalid import never writes', () => {
  const storage = new MemoryStorage();
  const migrated = importBackup(archivedV1, storage);
  const roundtrip = parseBackup(exportBackup(migrated));
  assert.deepEqual(roundtrip, migrated);
  const writes = storage.writes.length;
  assert.throws(() => importBackup(archivedV1.slice(0, -3), storage));
  assert.equal(storage.writes.length, writes);
});

test('E2 archived v2 retains legacy and expansion IDs without mixing study with solves', () => {
  const data = parseBackup(archivedV2);
  const rawV2 = JSON.parse(archivedV2).data;
  const expectedV3 = {...rawV2, version: 3,
    sessions: rawV2.sessions.map((session: object) => ({...session, mode: null})),
    solves: rawV2.solves.map((solve: object) => ({...solve, mode: null}))};
  assert.deepEqual(data, expectedV3, 'v2 parser preserves raw payload with only v3 and null modes added');
  for (const id of ['OLL-30', 'cfop/f2l/01', 'roux/cmll/01', 'cfop/cross/alinhar-uma-aresta', 'roux/lse/fechar-centros']) assert.ok(data.progress[id], id);
  const before = structuredClone(data);
  let after = recordStudyAttempt(data, {caseId: 'cfop/f2l/01', recognition: 'good', execution: 'again', durationMs: 12000});
  after = recordStudyAttempt(after, {caseId: 'roux/cmll/01', recognition: 'good', execution: 'good', durationMs: null});
  after = recordStudyAttempt(after, {caseId: 'cfop/cross/alinhar-uma-aresta', recognition: 'again', execution: 'good', durationMs: 8000});
  assert.deepEqual(after.sessions, before.sessions);
  assert.deepEqual(after.solves, before.solves);
  assert.deepEqual(after.progress, before.progress);
  assert.equal(after.studyAttempts.length, before.studyAttempts.length + 3);
  assert.deepEqual(parseBackup(exportBackup(after)), after, 'v2 roundtrip preserves all fields');
});
