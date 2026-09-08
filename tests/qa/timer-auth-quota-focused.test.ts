import assert from 'node:assert/strict';
import test from 'node:test';
import { createCloudServiceWithPorts } from '../../src/cloud/service';
import { createMemoryCloudStore, type CloudAtomicStore } from '../../src/cloud/storage';
import type { AuthDriver, AuthDriverFactory, CloudIdentity } from '../../src/cloud/types';
import { createInitialData } from '../../src/data/store';
import { createSession } from '../../src/data/mutations';
import { MemoryStorage } from './contract-fixtures';

function driverFactory(): AuthDriverFactory {
  return () => {
    const user: CloudIdentity = { id: 'qa-user-a', email: 'synthetic-a.invalid' };
    return {
      signUp: async (_email, _password) => null,
      signIn: async (email) => { if (email === 'error') throw new Error('synthetic auth error'); return user; },
      getUser: async () => user, resetPassword: async () => undefined, exchangeCode: async () => user,
      updatePassword: async () => undefined, signOut: async () => undefined, refresh: async () => user,
      subscribe: () => () => undefined, dispose: () => undefined,
    };
  };
}
function failOnceStore(): { store: CloudAtomicStore; fail(): void } {
  const inner = createMemoryCloudStore(); let shouldFail = false;
  return { store: { read: inner.read, subscribe: inner.subscribe, close: inner.close, transact: async change => { if (shouldFail) { shouldFail = false; throw new Error('synthetic quota'); } return inner.transact(change); } }, fail: () => { shouldFail = true; } };
}
function service(store: CloudAtomicStore) {
  return createCloudServiceWithPorts({ projectRef: 'qa-timer', authFactory: driverFactory(), store, guestStorage: new MemoryStorage(), online: () => true, redirectTo: 'http://127.0.0.1:3000/auth', randomId: (() => { let n = 0; return () => `qa-id-${++n}`; })() });
}

test('quota on finish preserves one completed draft and retry commits one solve', async () => {
  const seam = failOnceStore(); let now = 1700000000000; const generated: string[] = [];
  const cloud = createCloudServiceWithPorts({ projectRef: 'qa-timer', authFactory: driverFactory(), store: seam.store, guestStorage: new MemoryStorage(), online: () => true, redirectTo: 'http://127.0.0.1:3000/auth', now: () => now, randomId: (() => { let n = 0; return () => { const value = `qa-id-${++n}`; generated.push(value); return value; }; })() });
  await cloud.initialize(); await cloud.signIn({ email: 'a', password: 'x' });
  const base = cloud.getSnapshot(); const data = createSession(createInitialData(), 'Treino', 'two-handed');
  await cloud.commit({ context: base.context!, expectedLocalRevision: base.localRevision, change: data });
  const armed = await cloud.beginCapture({ context: cloud.getSnapshot().context!, capture: { sessionId: data.sessions[0].id, mode: 'two-handed', scramble: 'R U' }, source: 'timer' });
  assert.equal(armed.kind, 'armed'); if (armed.kind !== 'armed') return;
  const resultInput = { rawMs: 600, penalty: 'none' as const, note: 'qa' };
  assert.equal((await cloud.completeCapture({ capture: armed.capture, result: resultInput })).kind, 'draft-saved');
  const beforeFailure = await seam.store.read(); const beforeRevision = cloud.getSnapshot().localRevision; const frozenDraft = structuredClone(beforeFailure.drafts[armed.capture.id]);
  seam.fail(); const failed = await cloud.finishCapture({ capture: armed.capture, expectedLocalRevision: beforeRevision });
  assert.equal(failed.kind, 'error'); if (failed.kind === 'error') assert.equal(failed.code, 'storage-error');
  const afterFailure = await seam.store.read(); assert.deepEqual(afterFailure, beforeFailure); assert.equal(cloud.getSnapshot().localRevision, beforeRevision);
  assert.equal(frozenDraft.state, 'completed'); assert.equal(frozenDraft.solve?.sessionId, data.sessions[0].id); assert.equal(frozenDraft.solve?.mode, 'two-handed'); assert.equal(frozenDraft.solve?.scramble, 'R U'); assert.equal(frozenDraft.solve?.rawMs, resultInput.rawMs); assert.equal(frozenDraft.solve?.penalty, resultInput.penalty); assert.equal(frozenDraft.solve?.note, resultInput.note); assert.equal(frozenDraft.solve?.source, 'timer'); assert.equal(frozenDraft.solve?.createdAt, new Date(now).toISOString());
  const drafts = await cloud.listDrafts(cloud.getSnapshot().context!); assert.equal(drafts.kind, 'drafts'); if (drafts.kind === 'drafts') { assert.equal(drafts.drafts.length, 1); assert.equal(drafts.drafts[0].id, armed.capture.id); assert.equal(drafts.drafts[0].state, 'completed'); }
  now += 1;
  const done = await cloud.finishCapture({ capture: armed.capture, expectedLocalRevision: cloud.getSnapshot().localRevision }); assert.equal(done.kind, 'committed');
  const afterCommit = await seam.store.read(); const saved = cloud.getSnapshot().data?.solves[0]; assert.equal(afterCommit.accounts['qa-user-a']?.data.solves.length, 1); assert.deepEqual(saved, frozenDraft.solve); const revisionAfterCommit = cloud.getSnapshot().localRevision;
  const retryAgain = await cloud.finishCapture({ capture: armed.capture, expectedLocalRevision: revisionAfterCommit }); assert.equal(retryAgain.kind, 'committed'); assert.equal(cloud.getSnapshot().localRevision, revisionAfterCommit); assert.deepEqual(cloud.getSnapshot().data?.solves, [saved]); assert.ok(generated.length > 0); cloud.dispose();
});

test('authenticated and pending/error outcomes do not create solves or drafts', async () => {
  const store = createMemoryCloudStore(); const cloud = service(store); await cloud.initialize(); const seed = await store.read();
  assert.equal((await cloud.signUp({ email: 'pending', password: 'x' })).kind, 'confirmation-required');
  const error = await cloud.signIn({ email: 'error', password: 'x' }); assert.equal(error.kind, 'error'); if (error.kind === 'error') assert.equal(error.code, 'auth-error');
  const ok = await cloud.signIn({ email: 'ok', password: 'x' }); assert.equal(ok.kind, 'authenticated');
  const confirmed = await store.read(); assert.ok(confirmed.generation > seed.generation); assert.equal(ok.kind, 'authenticated'); if (ok.kind === 'authenticated') { assert.equal(ok.identity.id, 'qa-user-a'); assert.equal(confirmed.user?.id, 'qa-user-a'); assert.deepEqual(ok.context, { projectRef: 'qa-timer', userId: confirmed.user!.id, generation: confirmed.generation }); assert.deepEqual(cloud.getSnapshot().context, ok.context); }
  assert.equal(confirmed.accounts['qa-user-a']?.data.solves.length, 0); assert.deepEqual(confirmed.drafts, {}); cloud.dispose();
});
