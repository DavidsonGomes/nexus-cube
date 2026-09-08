import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createCloudServiceWithPorts } from '../../src/cloud/service';
import type { CloudService, ContextHandle } from '../../src/cloud/types';
import { ControlledStore, controlledAuthFactory } from './controlled-dependencies';
import { deferred, personalFixture, QA_IDENTITIES } from './fixtures';

const DATE = '2026-09-08T12:00:00.000Z';
const DEFAULT = { id: 'nexus-first-use-training-v1', name: 'Treino diário', mode: 'two-handed', createdAt: DATE };
function emptyData() {
  return { ...personalFixture('guest'), sessions: [], solves: [], progress: {}, studyAttempts: [], activeSessionId: null };
}
function context(service: CloudService): ContextHandle { const ctx = service.getSnapshot().context; assert.ok(ctx); return { ...ctx }; }
async function until(predicate: () => boolean) {
  for (let i = 0; i < 50; i++) { if (predicate()) return; await setImmediate(); }
  assert.fail('Expected controlled transition');
}
function setup(raw: string | null, store = new ControlledStore(), readError = false, syncEnabled = false) {
  const auth = controlledAuthFactory(); let serial = 0, reads = 0, writes = 0;
  const service = createCloudServiceWithPorts({ projectRef: 'synthetic-first-use', store, authFactory: auth.factory, syncEnabled,
    redirectTo: 'https://example.invalid/auth/callback', online: () => true, now: () => Date.parse(DATE), randomId: () => `first-use-${++serial}`,
    guestStorage: { getItem: () => { reads++; if (readError) throw new Error('Synthetic unreadable source'); return raw; }, setItem: () => { writes++; } },
  });
  return { service, store, counts: () => ({ reads, writes }) };
}

test('first use security: absent guest initializes once; reload and deleting last session never rearm', async t => {
  const h = setup(null); t.after(() => h.service.dispose()); await h.service.initialize();
  assert.deepEqual(h.service.getSnapshot().data?.sessions, [DEFAULT]);
  assert.deepEqual(h.counts(), { reads: 1, writes: 0 });
  const revision = h.service.getSnapshot().localRevision;
  const results = await Promise.all([h.service.ensureFirstUse(context(h.service)), h.service.ensureFirstUse(context(h.service))]);
  assert.ok(results.every(result => result.kind === 'committed'));
  assert.equal(h.service.getSnapshot().localRevision, revision);
  const data = h.service.getSnapshot().data!;
  assert.equal((await h.service.commit({ context: context(h.service), expectedLocalRevision: revision, change: { ...data, sessions: [], activeSessionId: null } })).kind, 'committed');
  const reopened = setup(null, new ControlledStore(h.store.peek())); t.after(() => reopened.service.dispose());
  await reopened.service.initialize(); await reopened.service.ensureFirstUse(context(reopened.service));
  assert.deepEqual(reopened.service.getSnapshot().data?.sessions, []);
  assert.deepEqual(reopened.counts(), { reads: 0, writes: 0 });
});

test('first use security: existing empty guest and unreadable source are not fresh absence', async t => {
  for (const readError of [false, true]) {
    const h = setup(JSON.stringify(emptyData()), undefined, readError); t.after(() => h.service.dispose()); await h.service.initialize();
    assert.deepEqual(h.service.getSnapshot().data?.sessions, []);
    assert.equal(h.store.peek().guest?.firstUse?.eligible, false);
    assert.deepEqual(h.counts(), { reads: 1, writes: 0 });
    if (readError) assert.ok(h.service.getSnapshot().error);
  }
});

test('first use security: quota abort preserves eligibility and data; explicit retry commits one stable default', async t => {
  const h = setup(JSON.stringify(emptyData())); t.after(() => h.service.dispose()); await h.service.initialize();
  await h.store.transact(state => { state.guest!.firstUse = { eligible: true, initialized: false, sessionId: DEFAULT.id, createdAt: DATE }; });
  const before = h.store.peek(); h.store.failNextCommit = true;
  const failed = await h.service.ensureFirstUse(context(h.service));
  assert.equal(failed.kind, 'error'); if (failed.kind === 'error') assert.equal(failed.code, 'storage-error');
  assert.deepEqual(h.store.peek(), before);
  const retry = await h.service.ensureFirstUse(context(h.service)); assert.equal(retry.kind, 'committed');
  assert.deepEqual(h.service.getSnapshot().data?.sessions, [DEFAULT]);
  assert.deepEqual(h.service.getSnapshot().data?.settings, before.guest!.data.settings);
  assert.equal(h.store.peek().guest!.firstUse!.initialized, true);
});

test('first use security: account waits for confirmed hydration and never adopts guest', async t => {
  const h = setup(JSON.stringify(personalFixture('guest')), undefined, false, true); t.after(() => h.service.dispose()); await h.service.initialize();
  assert.equal((await h.service.signIn({ email: QA_IDENTITIES.a.email, password: 'synthetic-unused' })).kind, 'authenticated');
  const ctx = context(h.service), before = h.store.peek();
  assert.equal((await h.service.ensureFirstUse(ctx)).kind, 'error');
  assert.deepEqual(h.store.peek(), before);
  // Dependency state only: this is not a proof of network hydration or server CAS.
  await h.store.transact(state => { state.accounts[QA_IDENTITIES.a.id].sync = { version: 1, epoch: 'synthetic', revision: '0', base: [], outbox: [], reconciliation: false, status: 'synced', error: null, received: null, adoptedSources: {}, hydrated: true }; });
  assert.equal((await h.service.ensureFirstUse(ctx)).kind, 'committed');
  assert.deepEqual(h.service.getSnapshot().data?.sessions, [DEFAULT]);
  assert.deepEqual(h.service.getSnapshot().data?.solves, []);
  assert.deepEqual(h.store.peek().guest, before.guest);
  assert.equal(h.store.peek().accounts[QA_IDENTITIES.a.id].sync!.outbox.length, 1);
  assert.equal(h.store.peek().accounts[QA_IDENTITIES.a.id].sync!.outbox[0].bootstrap, true);
});

test('capture security: delayed arm can be cancelled without solve; cancelled capability cannot complete', async t => {
  const h = setup(JSON.stringify(personalFixture('guest'))); t.after(() => h.service.dispose()); await h.service.initialize();
  const hold = deferred<void>(); h.store.holdNextResult = hold.promise;
  const arming = h.service.beginCapture({ context: context(h.service), source: 'timer', capture: { sessionId: 'same-session-id', mode: 'two-handed', scramble: 'R U' } });
  await until(() => Object.keys(h.store.peek().drafts).length === 1);
  hold.resolve(); const armed = await arming; assert.equal(armed.kind, 'armed'); if (armed.kind !== 'armed') return;
  const before = h.store.peek().guest;
  assert.equal((await h.service.cancelCapture(armed.capture)).kind, 'cancelled');
  assert.equal((await h.service.completeCapture({ capture: armed.capture, result: { rawMs: 100.5, penalty: 'none', note: '' } })).kind, 'error');
  assert.deepEqual(h.store.peek().guest, before);
  assert.equal((await h.service.signIn({ email: QA_IDENTITIES.b.email, password: 'synthetic-unused' })).kind, 'authenticated');
});

test('capture security: cancel quota failure keeps draft busy until explicit successful retry', async t => {
  const h = setup(JSON.stringify(personalFixture('guest'))); t.after(() => h.service.dispose()); await h.service.initialize();
  const armed = await h.service.beginCapture({ context: context(h.service), source: 'timer', capture: { sessionId: 'same-session-id', mode: 'two-handed', scramble: 'R U' } });
  assert.equal(armed.kind, 'armed'); if (armed.kind !== 'armed') return;
  const before = h.store.peek(); h.store.failNextCommit = true;
  assert.equal((await h.service.cancelCapture(armed.capture)).kind, 'error'); assert.deepEqual(h.store.peek(), before);
  const login = await h.service.signIn({ email: QA_IDENTITIES.b.email, password: 'synthetic-unused' });
  assert.equal(login.kind, 'error'); if (login.kind === 'error') assert.equal(login.code, 'busy-capture');
  assert.equal((await h.service.cancelCapture(armed.capture)).kind, 'cancelled');
});

test('capture security: guest arm result after external B activation has no old capability or personal payload', async t => {
  const h = setup(JSON.stringify(personalFixture('guest'))); t.after(() => h.service.dispose()); await h.service.initialize();
  const hold = deferred<void>(); h.store.holdNextResult = hold.promise;
  const arming = h.service.beginCapture({ context: context(h.service), source: 'timer', capture: { sessionId: 'same-session-id', mode: 'two-handed', scramble: 'R U' } });
  await until(() => Object.keys(h.store.peek().drafts).length === 1);
  await h.store.transact(state => { state.generation++; state.gate = 'active'; state.user = { ...QA_IDENTITIES.b }; state.accounts[QA_IDENTITIES.b.id] = { data: personalFixture('b'), revision: 1 }; });
  await until(() => h.service.getSnapshot().context === null);
  const before = h.store.peek(); hold.resolve(); const result = await arming;
  assert.equal(result.kind, 'error'); if (result.kind === 'error') assert.equal(result.code, 'identity-changed');
  assert.equal('capture' in result, false); assert.equal('data' in result, false);
  assert.deepEqual(h.store.peek(), before);
});
