import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudServiceWithPorts } from '../../src/cloud/service';
import { ControlledStore, controlledAuthFactory } from './controlled-dependencies';
import { QA_IDENTITIES } from './fixtures';
import { automaticSyncFixture, SYNC_NUMBER_VECTORS, SYNC_TEXT_VECTORS } from './sync-fixtures';

test('sync input baseline: real cloud commit/export preserves accepted V3 text, fractions and order', async t => {
  const store = new ControlledStore(), auth = controlledAuthFactory();
  let serial = 0;
  const service = createCloudServiceWithPorts({
    projectRef: 'synthetic-sync-input', store, authFactory: auth.factory,
    redirectTo: 'https://app.example.invalid/', randomId: () => `input-${++serial}`, online: () => true,
    guestStorage: { getItem: () => null, setItem: () => { assert.fail('Account write cannot alter guest source'); } },
  });
  t.after(() => service.dispose());
  await service.initialize();
  assert.equal((await service.signIn({ email: QA_IDENTITIES.a.email, password: 'synthetic-password' })).kind, 'authenticated');
  const input = automaticSyncFixture().a1;
  const original = input.solves[0];
  input.solves = SYNC_TEXT_VECTORS.map((vector, index) => ({
    ...original, id: `text-${99 - index}`, note: vector.text,
    rawMs: SYNC_NUMBER_VECTORS[index % SYNC_NUMBER_VECTORS.length].value,
  }));
  // JSON persistence normalizes -0; all other values and array order are exact.
  const expected = structuredClone(input);
  for (const solve of expected.solves) if (Object.is(solve.rawMs, -0)) solve.rawMs = 0;
  const context = service.getSnapshot().context!;
  const saved = await service.commit({ context, expectedLocalRevision: 0, change: input });
  assert.equal(saved.kind, 'committed');
  assert.deepEqual(store.peek().accounts[QA_IDENTITIES.a.id].data, expected);
  assert.deepEqual(service.getSnapshot().data, expected);
  const backup = await service.exportBackup(context);
  assert.equal(backup.kind, 'exported');
  if (backup.kind !== 'exported') assert.fail('Expected exported fixture');
  const envelope = JSON.parse(backup.text);
  assert.deepEqual(Object.keys(envelope).sort(), ['data', 'exportedAt', 'format', 'version']);
  assert.deepEqual(envelope.data, expected);
  assert.deepEqual(envelope.data.solves.map((solve: { id: string }) => solve.id), input.solves.map(solve => solve.id));
  assert.deepEqual(Object.keys(envelope.data).sort(), ['activeSessionId', 'progress', 'sessions', 'settings', 'solves', 'studyAttempts', 'version']);
});
