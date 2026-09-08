import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData, STORAGE_KEY } from '../../src/data';
import { createCloudServiceWithPorts } from '../../src/cloud/service';
import { createMemoryCloudStore, type CloudAtomicStore } from '../../src/cloud/storage';

function harness(raw: string | null = null) {
  const memory = createMemoryCloudStore(); let quota = false; let serial = 0;
  const store: CloudAtomicStore = { ...memory, close: () => {}, transact: change => memory.transact(state => { const value = change(state); if (quota && state.guest?.data.sessions.length) { quota = false; throw new Error('synthetic quota'); } return value; }) };
  const service = () => createCloudServiceWithPorts({ projectRef: 'synthetic', configured: false, store, guestStorage: { getItem: key => key === STORAGE_KEY ? raw : null, setItem: () => { throw new Error('Original must stay unchanged'); } }, authFactory: () => { throw new Error('Unexpected Auth'); }, redirectTo: 'https://example.invalid/', now: () => Date.parse('2026-09-08T10:00:00.000Z'), randomId: () => `id-${++serial}` });
  return { service, store, failOnce: () => { quota = true; } };
}

test('two initializations create one default atomically and deletion never rearms', async () => {
  const h = harness(); const a = h.service(); const b = h.service();
  await Promise.all([a.initialize(), b.initialize()]);
  const state = await h.store.read();
  assert.equal(state.guest!.revision, 1);
  assert.deepEqual(state.guest!.data.sessions, [{ id: 'nexus-first-use-training-v1', name: 'Treino diário', mode: 'two-handed', createdAt: '2026-09-08T10:00:00.000Z' }]);
  assert.equal(state.guest!.firstUse!.initialized, true);
  const context = a.getSnapshot().context!;
  assert.equal((await a.commit({ context, expectedLocalRevision: 1, change: { ...state.guest!.data, sessions: [], activeSessionId: null } })).kind, 'committed');
  await a.ensureFirstUse(context);
  assert.equal((await h.store.read()).guest!.data.sessions.length, 0);
  a.dispose(); b.dispose();
});

test('quota preserves eligible marker and retry keeps the frozen candidate', async () => {
  const h = harness(); h.failOnce(); const service = h.service(); await service.initialize();
  const failed = await h.store.read();
  assert.equal(failed.guest!.data.sessions.length, 0);
  assert.equal(failed.guest!.revision, 0);
  assert.equal(failed.guest!.firstUse!.initialized, false);
  assert.equal(service.getSnapshot().error?.code, 'storage-error');
  const result = await service.ensureFirstUse(service.getSnapshot().context!);
  assert.equal(result.kind, 'committed');
  const next = await h.store.read();
  assert.equal(next.guest!.data.sessions[0].createdAt, failed.guest!.firstUse!.createdAt);
  assert.equal(next.guest!.data.sessions[0].id, failed.guest!.firstUse!.sessionId);
  service.dispose();
});

test('valid existing empty source and corrupt source do not acquire defaults', async () => {
  for (const raw of [JSON.stringify(createInitialData()), '{invalid']) {
    const h = harness(raw); const service = h.service(); await service.initialize();
    assert.equal(service.getSnapshot().data!.sessions.length, 0);
    await service.ensureFirstUse(service.getSnapshot().context!);
    assert.equal((await h.store.read()).guest!.data.sessions.length, 0);
    assert.equal((await h.store.read()).guest!.firstUse!.eligible, false);
    service.dispose();
  }
});

test('a late durable arm can be cancelled without creating a solve', async () => {
  const h = harness(); const service = h.service(); await service.initialize();
  const context = service.getSnapshot().context!;
  const pending = service.beginCapture({ context, source: 'timer', capture: { sessionId: 'nexus-first-use-training-v1', mode: 'two-handed', scramble: 'R U' } });
  // The release already happened in the UI before this await resolves.
  const armed = await pending;
  assert.equal(armed.kind, 'armed'); if (armed.kind !== 'armed') return;
  assert.deepEqual(await service.cancelCapture(armed.capture), { kind: 'cancelled' });
  const state = await h.store.read();
  assert.equal(state.drafts[armed.capture.id].state, 'cancelled');
  assert.equal(state.guest!.data.solves.length, 0);
  service.dispose();
});
