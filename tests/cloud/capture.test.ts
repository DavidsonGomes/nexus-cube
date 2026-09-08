import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData } from '../../src/data';
import { createCloudServiceWithPorts } from '../../src/cloud/service';
import { createMemoryCloudStore, initialCloudState, type CloudAtomicStore } from '../../src/cloud/storage';
import type { CaptureHandle } from '../../src/cloud/types';

function harness() {
  const seed = initialCloudState();
  seed.guest = { revision: 0, data: { ...createInitialData(), sessions: [{ id: 's', name: 'Test', mode: 'two-handed', createdAt: '2026-01-01T00:00:00.000Z' }], activeSessionId: 's' } };
  const memory = createMemoryCloudStore(seed);
  let abort = false, serial = 0, clock = Date.parse('2026-09-08T10:00:00.000Z');
  const store: CloudAtomicStore = { ...memory, close: () => {}, transact: change => memory.transact(state => { const result = change(state); if (abort) { abort = false; throw new Error('synthetic quota'); } return result; }) };
  const make = () => createCloudServiceWithPorts({ projectRef: 'synthetic', configured: false, store, authFactory: () => { throw new Error('Unexpected Auth dispatch'); }, redirectTo: 'https://example.invalid/', now: () => clock, randomId: () => `id-${++serial}` });
  return { make, store, abort: () => { abort = true; }, later: () => { clock += 60000; } };
}
const result = { rawMs: 0.1, penalty: '+2' as const, note: '\u0000\ud800😀'.repeat(2000) };
async function armed(service: ReturnType<ReturnType<typeof harness>['make']>): Promise<CaptureHandle> {
  const response = await service.beginCapture({ context: service.getSnapshot().context!, capture: { sessionId: 's', mode: 'two-handed', scramble: 'R U' }, source: 'manual' });
  assert.equal(response.kind, 'armed');
  if (response.kind !== 'armed') throw new Error('not armed');
  return response.capture;
}

test('quota retry freezes solve metadata and completed reload appends exactly once', async () => {
  const h = harness(), service = h.make(); await service.initialize();
  const before = structuredClone(service.getSnapshot().data!);
  const capture = await armed(service);
  h.abort(); assert.equal((await service.completeCapture({ capture, result })).kind, 'error');
  assert.equal((await h.store.read()).drafts[capture.id].state, 'armed');
  h.later(); assert.equal((await service.completeCapture({ capture, result: { ...result, rawMs: 9 } })).kind, 'error');
  assert.equal((await service.completeCapture({ capture, result })).kind, 'draft-saved');
  const frozen = (await h.store.read()).drafts[capture.id].solve!;
  assert.equal(frozen.createdAt, '2026-09-08T10:00:00.000Z');
  assert.equal(frozen.id, 'id-3');
  assert.equal(frozen.note, result.note);
  const reloaded = h.make(); await reloaded.initialize();
  const resumed = await reloaded.resumeCapture({ context: reloaded.getSnapshot().context!, draftId: capture.id });
  assert.equal(resumed.kind, 'resumed'); if (resumed.kind !== 'resumed') return;
  assert.deepEqual(resumed.draft.solve, frozen);
  assert.equal((await service.completeCapture({ capture, result })).kind, 'error');
  const finished = await reloaded.finishCapture({ capture: resumed.capture, expectedLocalRevision: 0 });
  assert.equal(finished.kind, 'committed');
  assert.deepEqual(reloaded.getSnapshot().data, { ...before, solves: [frozen] });
  assert.equal((await reloaded.finishCapture({ capture: resumed.capture, expectedLocalRevision: 0 })).kind, 'committed');
  assert.equal(reloaded.getSnapshot().localRevision, 1);
  service.dispose(); reloaded.dispose();
});

test('interrupted and old metadata drafts require explicit discard without invented solves', async () => {
  const h = harness(), service = h.make(); await service.initialize(); const capture = await armed(service);
  const reloaded = h.make(); await reloaded.initialize();
  assert.equal((await reloaded.resumeCapture({ context: reloaded.getSnapshot().context!, draftId: capture.id })).kind, 'error');
  await h.store.transact(state => { delete state.drafts[capture.id].source; });
  const list = await reloaded.listDrafts(reloaded.getSnapshot().context!);
  assert.equal(list.kind, 'drafts'); if (list.kind === 'drafts') { assert.equal(list.drafts[0].state, 'discard-only'); assert.equal(list.drafts[0].solve, null); }
  assert.equal((await reloaded.discardDraft({ context: reloaded.getSnapshot().context!, draftId: capture.id })).kind, 'cancelled');
  assert.equal((await service.completeCapture({ capture, result })).kind, 'error');
  assert.deepEqual(reloaded.getSnapshot().data?.solves, []);
  service.dispose(); reloaded.dispose();
});

test('finish rollback preserves draft and rejects parent drift without reassigning session', async () => {
  const h = harness(), service = h.make(); await service.initialize(); const capture = await armed(service);
  await service.completeCapture({ capture, result });
  h.abort(); assert.equal((await service.finishCapture({ capture, expectedLocalRevision: 0 })).kind, 'error');
  assert.equal((await h.store.read()).drafts[capture.id].state, 'completed');
  await h.store.transact(state => { state.guest!.data.sessions[0].mode = 'one-handed'; });
  assert.equal((await service.finishCapture({ capture, expectedLocalRevision: 0 })).kind, 'error');
  const state = await h.store.read(); assert.equal(state.drafts[capture.id].solve!.mode, 'two-handed'); assert.deepEqual(state.guest!.data.solves, []);
  service.dispose();
});

test('unconfigured Auth preserves guest and performs zero Auth dispatches', async () => {
  const h = harness(), service = h.make(); await service.initialize();
  const before = service.getSnapshot();
  const response = await service.signIn({ email: 'synthetic@example.invalid', password: 'unused' });
  assert.equal(response.kind, 'error'); if (response.kind === 'error') assert.equal(response.code, 'unavailable');
  assert.deepEqual(service.getSnapshot().data, before.data);
  assert.equal(service.getSnapshot().sync, 'unavailable');
  service.dispose();
});
