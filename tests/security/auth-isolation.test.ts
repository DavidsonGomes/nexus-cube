import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createCloudServiceWithPorts } from '../../src/cloud/service';
import { AuthSessionInvalidError } from '../../src/cloud/types';
import type { CaptureHandle, CloudIdentity, CloudService, ContextHandle } from '../../src/cloud/types';
import type { Solve } from '../../src/domain/types';
import { ControlledStore, controlledAuthFactory, type ControlledAuthDriver } from './controlled-dependencies';
import { deferred, personalFixture, QA_IDENTITIES } from './fixtures';

const PROJECT = 'synthetic-security-project';
const REDIRECT = 'https://app.example.invalid/';
const INPUT_PASSWORD = 'synthetic-unused-password';
const CAPTURE_RESULT = { rawMs: 99.5, penalty: 'none' as const, note: 'synthetic-capture-note' };
let instanceNamespace = 0;

async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return;
    await setImmediate();
  }
  assert.fail('Expected deterministic test transition did not occur');
}
async function setup(options: {
  store?: ControlledStore;
  configure?: (driver: ControlledAuthDriver, index: number) => void;
} = {}) {
  const store = options.store ?? new ControlledStore();
  const auth = controlledAuthFactory(options.configure);
  let guestRaw = JSON.stringify(personalFixture('guest'));
  const originalGuest = guestRaw;
  let guestWrites = 0;
  let online = true;
  let serial = 0;
  const namespace = ++instanceNamespace;
  let clock = Date.parse('2026-09-08T12:00:00.000Z');
  const service = createCloudServiceWithPorts({
    projectRef: PROJECT, store, authFactory: auth.factory, redirectTo: REDIRECT,
    guestStorage: { getItem: () => guestRaw, setItem: (_key, value) => { guestRaw = value; guestWrites++; } },
    online: () => online, now: () => clock,
    randomId: () => `synthetic-${namespace}-instance-${++serial}`,
  });
  await service.initialize();
  return { service, store, auth, originalGuest,
    get guestRaw() { return guestRaw; }, get guestWrites() { return guestWrites; },
    offline() { online = false; },
    nextId() { return `synthetic-${namespace}-instance-${serial + 1}`; },
    advanceClock() { clock += 60000; },
  };
}
function context(service: CloudService): ContextHandle {
  const value = service.getSnapshot().context;
  assert.ok(value, 'a context must exist at this test step');
  return { ...value };
}
async function login(service: CloudService, account: 'a' | 'b') {
  const result = await service.signIn({ email: QA_IDENTITIES[account].email, password: INPUT_PASSWORD });
  assert.equal(result.kind, 'authenticated');
  assert.equal(service.getSnapshot().identity?.id, QA_IDENTITIES[account].id);
  return context(service);
}
async function saveFixture(service: CloudService, account: 'a' | 'b') {
  const result = await service.commit({ context: context(service), expectedLocalRevision: service.getSnapshot().localRevision, change: personalFixture(account) });
  assert.equal(result.kind, 'committed');
  assert.deepEqual(service.getSnapshot().data, personalFixture(account));
}
async function exported(service: CloudService) {
  const result = await service.exportBackup(context(service));
  assert.equal(result.kind, 'exported');
  if (result.kind !== 'exported') assert.fail('Export denied in positive control');
  return JSON.parse(result.text) as { data: unknown };
}
async function capture(service: CloudService, source: 'timer' | 'manual' = 'timer'): Promise<CaptureHandle> {
  const result = await service.beginCapture({ context: context(service), capture: { sessionId: 'same-session-id', mode: 'two-handed', scramble: 'R U' }, source });
  assert.equal(result.kind, 'armed');
  if (result.kind !== 'armed') assert.fail('Capture did not arm');
  return result.capture;
}
function expectedCapturedSolve(id: string, source: 'timer' | 'manual' = 'timer'): Solve {
  return { id, sessionId: 'same-session-id', mode: 'two-handed',
    ...CAPTURE_RESULT, scramble: 'R U',
    createdAt: '2026-09-08T12:00:00.000Z', source };
}

test('auth isolation: guest source survives login, accounts do not adopt it', async t => {
  const h = await setup(); t.after(() => h.service.dispose());
  assert.deepEqual(h.service.getSnapshot().data, personalFixture('guest'));
  await login(h.service, 'a');
  assert.deepEqual(h.service.getSnapshot().data?.solves, []);
  assert.deepEqual(h.service.getSnapshot().data?.sessions, []);
  assert.equal(h.service.getSnapshot().sync, 'unavailable');
  assert.equal(h.service.getSnapshot().accountImport, 'unavailable');
  const importResult = await h.service.recover({ context: context(h.service), data: personalFixture('guest') });
  assert.equal(importResult.kind, 'error');
  if (importResult.kind === 'error') assert.equal(importResult.code, 'import-unavailable');
  assert.equal(h.guestRaw, h.originalGuest); assert.equal(h.guestWrites, 0);
});

for (const session of [true, false]) {
  test(`auth signup: ${session ? 'session opens only new empty account' : 'null session requires confirmation without fake authentication'}`, async t => {
    const h = await setup({ configure: driver => { driver.nextSignUp = Promise.resolve(session ? { ...QA_IDENTITIES.a } : null); } });
    t.after(() => h.service.dispose());
    const result = await h.service.signUp({ email: QA_IDENTITIES.a.email, password: INPUT_PASSWORD });
    assert.equal(result.kind, session ? 'authenticated' : 'confirmation-required');
    if (session) {
      assert.equal(h.service.getSnapshot().identity?.id, QA_IDENTITIES.a.id);
      assert.deepEqual(h.service.getSnapshot().data?.solves, []);
      assert.deepEqual(h.service.getSnapshot().data?.sessions, []);
    } else {
      assert.equal(h.service.getSnapshot().identity, null);
      assert.equal(h.service.getSnapshot().context, null);
      assert.equal(h.service.getSnapshot().data, null);
      assert.ok(!('identity' in result));
      assert.deepEqual(h.store.peek().accounts, {});
    }
    assert.equal(h.guestRaw, h.originalGuest);
    assert.equal(h.guestWrites, 0);
    assert.equal(h.service.getSnapshot().accountImport, 'unavailable');
  });
}

test('auth isolation: A/B share record IDs but exact exports remain separated from guest', async t => {
  const h = await setup(); t.after(() => h.service.dispose());
  await login(h.service, 'a'); await saveFixture(h.service, 'a');
  const oldA = context(h.service);
  await login(h.service, 'b'); await saveFixture(h.service, 'b');
  assert.deepEqual((await exported(h.service)).data, personalFixture('b'));
  for (const result of [await h.service.exportBackup(oldA), await h.service.listDrafts(oldA), await h.service.commit({ context: oldA, expectedLocalRevision: 1, change: personalFixture('a') })]) {
    assert.equal(result.kind, 'error');
    assert.ok(!JSON.stringify(result).includes('synthetic-private-a'));
  }
  await login(h.service, 'a');
  assert.deepEqual((await exported(h.service)).data, personalFixture('a'));
  await h.service.openGuest();
  assert.deepEqual((await exported(h.service)).data, personalFixture('guest'));
  assert.equal(h.guestRaw, h.originalGuest);
});

test('auth storage: abort preserves previous account, revision and guest; explicit retry succeeds', async t => {
  const h = await setup(); t.after(() => h.service.dispose());
  await login(h.service, 'a');
  const before = h.store.peek();
  h.store.failNextCommit = true;
  const result = await h.service.commit({ context: context(h.service), expectedLocalRevision: 0, change: personalFixture('a') });
  assert.equal(result.kind, 'error');
  assert.deepEqual(h.store.peek(), before);
  assert.equal(h.service.getSnapshot().localRevision, 0);
  assert.equal(h.guestRaw, h.originalGuest);
  await saveFixture(h.service, 'a');
});

test('auth logout: failed gate persistence is memory-only failure and hides the active workspace', async t => {
  const h = await setup(); t.after(() => h.service.dispose());
  const oldA = await login(h.service, 'a'); await saveFixture(h.service, 'a');
  const before = h.store.peek(); h.store.failNextCommit = true;
  assert.equal((await h.service.signOut()).kind, 'logout-storage-error');
  assert.equal(h.service.getSnapshot().data, null);
  assert.equal(h.service.getSnapshot().identity, null);
  assert.deepEqual(h.store.peek(), before, 'no invented durable logout marker');
  assert.equal((await h.service.exportBackup(oldA)).kind, 'error');
  assert.equal((await h.service.resumeOffline()).kind, 'error');
});

test('auth logout: durable gate denies stale auth storage and offline reopen', async t => {
  const h = await setup(); t.after(() => h.service.dispose());
  const oldA = await login(h.service, 'a'); await saveFixture(h.service, 'a');
  const oldDriver = h.auth.drivers.at(-1)!;
  await oldDriver.storage.setItem(oldDriver.storageKey, 'synthetic-token-value');
  const result = await h.service.signOut();
  assert.equal(result.kind, 'logged-out');
  assert.equal(h.store.peek().gate, 'locked');
  assert.deepEqual(h.store.peek().auth, {});
  await assert.rejects(oldDriver.storage.setItem(oldDriver.storageKey, 'synthetic-late-refresh'));
  assert.equal(await oldDriver.storage.getItem(oldDriver.storageKey), null);
  assert.equal((await h.service.exportBackup(oldA)).kind, 'error');
  h.offline(); assert.equal((await h.service.resumeOffline()).kind, 'error');
});

test('auth race: delayed signIn A cannot replace already authenticated B', async t => {
  const pending = deferred<CloudIdentity>();
  const h = await setup({ configure: (driver, index) => { if (index === 0) driver.nextSignIn = pending.promise; } });
  t.after(() => h.service.dispose());
  const a = h.service.signIn({ email: QA_IDENTITIES.a.email, password: INPUT_PASSWORD });
  await until(() => h.auth.drivers[0]?.calls.includes('signIn') ?? false);
  await login(h.service, 'b'); await saveFixture(h.service, 'b');
  pending.resolve({ ...QA_IDENTITIES.a });
  assert.equal((await a).kind, 'error');
  assert.equal(h.service.getSnapshot().identity?.id, QA_IDENTITIES.b.id);
  assert.deepEqual((await exported(h.service)).data, personalFixture('b'));
});

test('auth race: refresh A completing after login B does not reinstall A', async t => {
  const h = await setup(); t.after(() => h.service.dispose());
  await login(h.service, 'a');
  const aDriver = h.auth.drivers.at(-1)!;
  const pending = deferred<CloudIdentity | null>(); aDriver.nextRefresh = pending.promise;
  const refreshing = h.service.refresh();
  await until(() => aDriver.calls.includes('refresh'));
  await login(h.service, 'b'); await saveFixture(h.service, 'b');
  pending.resolve({ ...QA_IDENTITIES.a });
  assert.equal((await refreshing).kind, 'error');
  assert.equal(h.service.getSnapshot().identity?.id, QA_IDENTITIES.b.id);
  assert.deepEqual(h.service.getSnapshot().data, personalFixture('b'));
});

test('auth invalidation: explicit refresh with no user closes gate instead of retaining access', async t => {
  const h = await setup(); t.after(() => h.service.dispose());
  const oldA = await login(h.service, 'a'); await saveFixture(h.service, 'a');
  h.auth.drivers.at(-1)!.nextRefresh = Promise.resolve(null);
  assert.equal((await h.service.refresh()).kind, 'error');
  assert.equal(h.service.getSnapshot().data, null, 'known invalid session must hide personal data');
  assert.equal((await h.service.exportBackup(oldA)).kind, 'error');
  assert.equal((await h.service.resumeOffline()).kind, 'error');
});

for (const invalid of [true, false]) {
  test(`auth refresh error: ${invalid ? 'classified invalid session closes gate' : 'transport failure preserves offline continuation'}`, async t => {
    const h = await setup(); t.after(() => h.service.dispose());
    const oldA = await login(h.service, 'a'); await saveFixture(h.service, 'a');
    const before = h.store.peek();
    const pending = deferred<CloudIdentity | null>(); h.auth.drivers.at(-1)!.nextRefresh = pending.promise;
    const refreshing = h.service.refresh();
    await until(() => h.auth.drivers.at(-1)!.calls.includes('refresh'));
    pending.reject(invalid ? new AuthSessionInvalidError() : new TypeError('Synthetic network failure'));
    assert.equal((await refreshing).kind, 'error');
    if (invalid) {
      assert.equal(h.store.peek().gate, 'locked');
      assert.equal(h.service.getSnapshot().data, null);
      assert.equal((await h.service.exportBackup(oldA)).kind, 'error');
      assert.equal((await h.service.resumeOffline()).kind, 'error');
    } else {
      assert.deepEqual(h.store.peek(), before, 'transient error cannot destroy the established account');
      h.offline();
      assert.equal((await h.service.resumeOffline()).kind, 'authenticated');
      assert.deepEqual((await exported(h.service)).data, personalFixture('a'));
    }
  });
}

for (const outcome of ['null', 'invalid-error', 'transport-error'] as const) {
  test(`auth refresh race: delayed ${outcome} from A cannot invalidate B`, async t => {
    const h = await setup(); t.after(() => h.service.dispose());
    await login(h.service, 'a');
    const aDriver = h.auth.drivers.at(-1)!;
    const pending = deferred<CloudIdentity | null>(); aDriver.nextRefresh = pending.promise;
    const refreshing = h.service.refresh();
    await until(() => aDriver.calls.includes('refresh'));
    await login(h.service, 'b'); await saveFixture(h.service, 'b');
    const before = h.store.peek();
    if (outcome === 'null') pending.resolve(null);
    else pending.reject(outcome === 'invalid-error' ? new AuthSessionInvalidError() : new TypeError('Synthetic network failure'));
    const result = await refreshing;
    assert.equal(result.kind, 'error');
    assert.ok(!('identity' in result));
    assert.deepEqual(h.store.peek(), before);
    assert.equal(h.service.getSnapshot().identity?.id, QA_IDENTITIES.b.id);
    assert.deepEqual((await exported(h.service)).data, personalFixture('b'));
  });
}

test('auth invalidation: failed online identity check cannot be bypassed with resumeOffline', async t => {
  const h = await setup();
  await login(h.service, 'a'); await saveFixture(h.service, 'a');
  const seed = h.store.peek(); h.service.dispose();
  const restarted = await setup({ store: new ControlledStore(seed) });
  t.after(() => restarted.service.dispose());
  assert.equal(restarted.service.getSnapshot().data, null);
  const resumed = await restarted.service.resumeOffline();
  assert.equal(resumed.kind, 'error', 'online verification returned null; offline path cannot reopen account');
  assert.equal(restarted.service.getSnapshot().data, null);
});

for (const invalid of [true, false]) {
  test(`auth initialize: ${invalid ? 'verified invalid session denies offline reopening' : 'transport failure preserves explicit offline reopening'}`, async t => {
    const h = await setup();
    await login(h.service, 'a'); await saveFixture(h.service, 'a');
    const seed = h.store.peek(); h.service.dispose();
    const restarted = await setup({ store: new ControlledStore(seed), configure: driver => {
      driver.getUser = async () => { throw invalid ? new AuthSessionInvalidError() : new TypeError('Synthetic network failure'); };
    } });
    t.after(() => restarted.service.dispose());
    assert.equal(restarted.service.getSnapshot().data, null, 'startup error never implicitly reveals account');
    const result = await restarted.service.resumeOffline();
    if (invalid) {
      assert.equal(result.kind, 'error');
      assert.equal(restarted.store.peek().gate, 'locked');
      assert.equal(restarted.service.getSnapshot().data, null);
    } else {
      assert.equal(result.kind, 'authenticated');
      assert.deepEqual(restarted.store.peek(), seed);
      assert.deepEqual((await exported(restarted.service)).data, personalFixture('a'));
    }
  });
}

test('auth recovery: verified recovery A cannot update B after voluntary switch', async t => {
  const h = await setup(); t.after(() => h.service.dispose());
  assert.equal((await h.service.requestPasswordReset(QA_IDENTITIES.a.email)).kind, 'email-requested');
  const flow = h.store.peek().flow!;
  const callback = await h.service.handleAuthCallback(`${REDIRECT}?code=synthetic&cloud_flow=${flow.id}`);
  assert.equal(callback.kind, 'recovery-required');
  await login(h.service, 'b'); await saveFixture(h.service, 'b');
  const result = await h.service.completePasswordReset({ recoveryContextId: flow.id, password: INPUT_PASSWORD });
  assert.equal(result.kind, 'error');
  assert.deepEqual(h.auth.drivers.flatMap(driver => driver.passwordUpdateIdentities), []);
  assert.deepEqual(h.service.getSnapshot().data, personalFixture('b'));
});

test('auth recovery: exchange A in flight cannot replace B', async t => {
  const h = await setup(); t.after(() => h.service.dispose());
  await h.service.requestPasswordReset(QA_IDENTITIES.a.email);
  const flow = h.store.peek().flow!;
  const pending = deferred<CloudIdentity>(); h.auth.drivers.at(-1)!.nextExchange = pending.promise;
  const callback = h.service.handleAuthCallback(`${REDIRECT}?code=synthetic&cloud_flow=${flow.id}`);
  await until(() => h.auth.drivers[0]?.calls.includes('exchangeCode') ?? false);
  await login(h.service, 'b'); pending.resolve({ ...QA_IDENTITIES.a });
  assert.equal((await callback).kind, 'error');
  assert.equal(h.service.getSnapshot().identity?.id, QA_IDENTITIES.b.id);
  assert.equal(h.service.getSnapshot().recoveryContextId, null);
});

test('auth capture: voluntary logout blocks, forged capability fails, invalidated A only completes quarantined draft', async t => {
  const h = await setup(); t.after(() => h.service.dispose());
  await login(h.service, 'a'); await saveFixture(h.service, 'a');
  const oldA = context(h.service), handle = await capture(h.service);
  assert.equal((await h.service.signOut()).kind, 'error');
  assert.equal(h.service.getSnapshot().identity?.id, QA_IDENTITIES.a.id);
  const forged = { ...handle, context: { ...handle.context } };
  assert.equal((await h.service.completeCapture({ capture: forged, result: CAPTURE_RESULT })).kind, 'error');
  h.auth.drivers.at(-1)!.emit('SIGNED_OUT');
  await until(() => h.store.peek().gate === 'locked');
  await login(h.service, 'b'); await saveFixture(h.service, 'b');
  const before = h.store.peek();
  const result = CAPTURE_RESULT;
  assert.equal((await h.service.completeCapture({ capture: handle, result })).kind, 'draft-saved');
  assert.deepEqual(h.store.peek().accounts, before.accounts);
  assert.deepEqual(h.service.getSnapshot().data, personalFixture('b'));
  assert.equal((await h.service.completeCapture({ capture: handle, result })).kind, 'draft-saved');
  assert.equal((await h.service.completeCapture({ capture: handle, result: { ...result, rawMs: 100 } })).kind, 'error');
  assert.equal((await h.service.listDrafts(oldA)).kind, 'error');
  const bDrafts = await h.service.listDrafts(context(h.service));
  assert.deepEqual(bDrafts, { kind: 'drafts', drafts: [] });
  await login(h.service, 'a');
  const aDrafts = await h.service.listDrafts(context(h.service));
  assert.equal(aDrafts.kind, 'drafts');
  if (aDrafts.kind === 'drafts') assert.deepEqual(aDrafts.drafts.map(item => item.result), [result]);
});

test('auth race: committed A response arriving after B takeover is identity-changed without A payload', async t => {
  const h = await setup(); t.after(() => h.service.dispose());
  const oldA = await login(h.service, 'a');
  const held = deferred<void>(); h.store.holdNextResult = held.promise;
  const saving = h.service.commit({ context: oldA, expectedLocalRevision: 0, change: personalFixture('a') });
  await until(() => h.store.peek().accounts[QA_IDENTITIES.a.id]?.revision === 1);
  const peer = await setup({ store: h.store, configure: driver => { driver.identity = { ...QA_IDENTITIES.a }; } });
  t.after(() => peer.service.dispose());
  await login(peer.service, 'b'); await saveFixture(peer.service, 'b');
  held.resolve();
  const result = await saving;
  assert.equal(result.kind, 'error');
  if (result.kind === 'error') assert.equal(result.code, 'identity-changed');
  assert.ok(!('data' in result), 'late API response itself must not carry A data');
  assert.deepEqual(h.store.peek().accounts[QA_IDENTITIES.a.id].data, personalFixture('a'), 'A commit remains valid in A partition');
  assert.deepEqual(peer.service.getSnapshot().data, personalFixture('b'));
});

test('auth race: finished capture A response arriving after B takeover contains no A data', async t => {
  const h = await setup(); t.after(() => h.service.dispose());
  await login(h.service, 'a'); await saveFixture(h.service, 'a');
  const handle = await capture(h.service);
  await h.service.completeCapture({ capture: handle, result: CAPTURE_RESULT });
  const held = deferred<void>(); h.store.holdNextResult = held.promise;
  const finishing = h.service.finishCapture({ capture: handle, expectedLocalRevision: 1 });
  await until(() => h.store.peek().drafts[handle.id]?.state === 'committed');
  const peer = await setup({ store: h.store, configure: driver => { driver.identity = { ...QA_IDENTITIES.a }; } });
  t.after(() => peer.service.dispose());
  await login(peer.service, 'b'); held.resolve();
  const result = await finishing;
  assert.equal(result.kind, 'error');
  if (result.kind === 'error') assert.equal(result.code, 'identity-changed');
  assert.ok(!('data' in result));
  assert.equal(h.store.peek().accounts[QA_IDENTITIES.a.id].data.solves.length, 2);
  assert.equal(peer.service.getSnapshot().identity?.id, QA_IDENTITIES.b.id);
});

test('auth draft reload: verified A resumes completed draft and saves once with a new capability', async t => {
  const h = await setup();
  await login(h.service, 'a'); await saveFixture(h.service, 'a');
  const oldHandle = await capture(h.service);
  const expectedSolve = expectedCapturedSolve(h.nextId());
  await h.service.completeCapture({ capture: oldHandle, result: CAPTURE_RESULT });
  assert.deepEqual(h.store.peek().drafts[oldHandle.id].solve, expectedSolve);
  const seed = h.store.peek(); h.service.dispose();
  const restarted = await setup({ store: new ControlledStore(seed), configure: driver => { driver.identity = { ...QA_IDENTITIES.a }; } });
  t.after(() => restarted.service.dispose());
  assert.equal(restarted.service.getSnapshot().status, 'authenticated');
  const result = await restarted.service.resumeCapture({ context: context(restarted.service), draftId: oldHandle.id });
  assert.equal(result.kind, 'resumed');
  if (result.kind !== 'resumed') assert.fail('Verified A must receive a fresh capability');
  assert.deepEqual(result.draft.solve, expectedSolve);
  assert.equal((await restarted.service.completeCapture({ capture: oldHandle, result: CAPTURE_RESULT })).kind, 'error');
  restarted.advanceClock();
  const finish = await restarted.service.finishCapture({ capture: result.capture, expectedLocalRevision: 1 });
  assert.equal(finish.kind, 'committed');
  const expected = personalFixture('a'); expected.solves.push(expectedSolve);
  assert.deepEqual(restarted.service.getSnapshot().data, expected);
  assert.equal((await restarted.service.finishCapture({ capture: result.capture, expectedLocalRevision: 1 })).kind, 'committed');
  assert.equal(restarted.service.getSnapshot().data?.solves.length, 2);
  assert.deepEqual(await restarted.service.listDrafts(context(restarted.service)), { kind: 'drafts', drafts: [] });
});

test('auth draft metadata: failed persistence freezes manual ID/time and retry cannot change result', async t => {
  const h = await setup(); t.after(() => h.service.dispose());
  await login(h.service, 'a'); await saveFixture(h.service, 'a');
  const handle = await capture(h.service, 'manual');
  const expected = expectedCapturedSolve(h.nextId(), 'manual');
  const before = h.store.peek(); h.store.failNextCommit = true;
  assert.equal((await h.service.completeCapture({ capture: handle, result: CAPTURE_RESULT })).kind, 'error');
  assert.deepEqual(h.store.peek(), before, 'no durable result after abort');
  h.advanceClock();
  assert.equal((await h.service.completeCapture({ capture: handle, result: { ...CAPTURE_RESULT, rawMs: 100 } })).kind, 'error');
  assert.equal((await h.service.completeCapture({ capture: handle, result: CAPTURE_RESULT })).kind, 'draft-saved');
  assert.deepEqual(h.store.peek().drafts[handle.id].solve, expected);
  const resumed = await h.service.resumeCapture({ context: context(h.service), draftId: handle.id });
  assert.equal(resumed.kind, 'resumed');
  if (resumed.kind !== 'resumed') assert.fail('Expected authenticated resume');
  assert.equal((await h.service.finishCapture({ capture: handle, expectedLocalRevision: 1 })).kind, 'error', 'nonce invalidates even a capability still present in the same service WeakMap');
  assert.equal((await h.service.completeCapture({ capture: handle, result: CAPTURE_RESULT })).kind, 'error');
  assert.equal((await h.service.finishCapture({ capture: resumed.capture, expectedLocalRevision: 1 })).kind, 'committed');
  assert.deepEqual(h.service.getSnapshot().data?.solves.at(-1), expected);
});

test('auth draft reload: interrupted draft can be discarded by verified A, unblocking logout', async t => {
  const h = await setup();
  await login(h.service, 'a'); await saveFixture(h.service, 'a');
  const oldHandle = await capture(h.service);
  const seed = h.store.peek(); h.service.dispose();
  const restarted = await setup({ store: new ControlledStore(seed), configure: driver => { driver.identity = { ...QA_IDENTITIES.a }; } });
  t.after(() => restarted.service.dispose());
  const drafts = await restarted.service.listDrafts(context(restarted.service));
  assert.equal(drafts.kind, 'drafts');
  if (drafts.kind === 'drafts') assert.equal(drafts.drafts[0].result, null, 'crash creates no invented time');
  assert.equal((await restarted.service.resumeCapture({ context: context(restarted.service), draftId: oldHandle.id })).kind, 'error', 'interrupted metadata cannot be resumed as a finished solve');
  assert.equal((await restarted.service.discardDraft({ context: context(restarted.service), draftId: oldHandle.id })).kind, 'cancelled');
  assert.equal((await restarted.service.signOut()).kind, 'logged-out');
  assert.equal(restarted.store.peek().accounts[QA_IDENTITIES.a.id].data.solves.length, 1);
});

test('auth draft reload: B and guest cannot resume or discard A draft', async t => {
  const h = await setup(); t.after(() => h.service.dispose());
  await login(h.service, 'a'); await saveFixture(h.service, 'a');
  const oldHandle = await capture(h.service);
  h.auth.drivers.at(-1)!.emit('SIGNED_OUT');
  await until(() => h.store.peek().gate === 'locked');
  await login(h.service, 'b');
  for (const guest of [false, true]) {
    if (guest) await h.service.openGuest();
    const selected = context(h.service);
    assert.equal((await h.service.resumeCapture({ context: selected, draftId: oldHandle.id })).kind, 'error');
    assert.equal((await h.service.discardDraft({ context: selected, draftId: oldHandle.id })).kind, 'error');
  }
  assert.equal(h.store.peek().drafts[oldHandle.id].state, 'armed');
});

for (const operation of ['signIn', 'refresh', 'resumeOffline', 'callback'] as const) {
  test(`auth identity final await: ${operation} cannot return A after observing B`, async t => {
    const sdk = deferred<CloudIdentity>();
    const h = await setup({ configure: (driver, index) => {
      if (operation === 'signIn' && index === 1) driver.nextSignIn = sdk.promise;
    } }); t.after(() => h.service.dispose());
    await login(h.service, 'a'); await saveFixture(h.service, 'a');
    const peer = await setup({ store: h.store, configure: driver => { driver.identity = { ...QA_IDENTITIES.a }; } });
    t.after(() => peer.service.dispose());
    await setImmediate();
    const captured = deferred<void>(), release = deferred<void>();
    let pending: ReturnType<CloudService['refresh']>;
    if (operation === 'resumeOffline') {
      h.offline();
      h.store.holdNextRead = { captured: () => captured.resolve(), release: release.promise };
      pending = h.service.resumeOffline();
      await captured.promise;
    } else if (operation === 'refresh') {
      const driver = h.auth.drivers.at(-1)!; driver.nextRefresh = sdk.promise;
      pending = h.service.refresh(); await until(() => driver.calls.includes('refresh'));
      h.store.holdNextRead = { captured: () => captured.resolve(), release: release.promise };
      sdk.resolve({ ...QA_IDENTITIES.a }); await captured.promise;
    } else if (operation === 'callback') {
      await h.service.requestPasswordReset(QA_IDENTITIES.a.email);
      const flow = h.store.peek().flow!;
      h.auth.drivers.at(-1)!.nextExchange = sdk.promise;
      pending = h.service.handleAuthCallback(`${REDIRECT}?code=synthetic&cloud_flow=${flow.id}`);
      await until(() => h.auth.drivers.at(-1)!.calls.includes('exchangeCode'));
      h.store.holdNextResult = release.promise;
      sdk.resolve({ ...QA_IDENTITIES.a });
      await until(() => h.store.peek().gate === 'recovery');
      await setImmediate();
    } else {
      // Pause activate's transaction result, then capture precisely its last read.
      pending = h.service.signIn({ email: QA_IDENTITIES.a.email, password: INPUT_PASSWORD });
      await until(() => h.auth.drivers[1]?.calls.includes('signIn') ?? false);
      const txRelease = deferred<void>(); h.store.holdNextResult = txRelease.promise;
      sdk.resolve({ ...QA_IDENTITIES.a }); await until(() => h.store.peek().gate === 'active');
      await setImmediate();
      h.store.holdNextRead = { captured: () => captured.resolve(), release: release.promise };
      txRelease.resolve(); await captured.promise;
    }
    await login(peer.service, 'b'); await saveFixture(peer.service, 'b');
    await setImmediate(); release.resolve();
    const result = await pending;
    assert.equal(result.kind, 'error');
    if (result.kind === 'error') assert.equal(result.code, 'identity-changed');
    assert.ok(!('identity' in result) && !('recoveryContextId' in result));
    assert.ok(!JSON.stringify(h.service.getSnapshot()).includes(QA_IDENTITIES.a.id));
    assert.deepEqual(peer.service.getSnapshot().data, personalFixture('b'));
  });
}

for (const operation of ['commit', 'export', 'drafts', 'finish'] as const) {
  test(`auth final read: delayed ${operation} snapshot from A cannot return or republish after B notification`, async t => {
    const h = await setup(); t.after(() => h.service.dispose());
    await login(h.service, 'a'); await saveFixture(h.service, 'a');
    const oldA = context(h.service);
    const peer = await setup({ store: h.store, configure: driver => { driver.identity = { ...QA_IDENTITIES.a }; } });
    t.after(() => peer.service.dispose());
    let draft: CaptureHandle | undefined;
    if (operation === 'finish' || operation === 'drafts') {
      draft = await capture(h.service);
      await h.service.completeCapture({ capture: draft, result: CAPTURE_RESULT });
    }
    await setImmediate(); // Drain subscription reads before controlling this operation.
    const txResult = deferred<void>(); h.store.holdNextResult = txResult.promise;
    const writes = h.store.writes;
    const pending = operation === 'commit'
      ? h.service.commit({ context: oldA, expectedLocalRevision: 1, change: personalFixture('a') })
      : operation === 'export' ? h.service.exportBackup(oldA)
        : operation === 'drafts' ? h.service.listDrafts(oldA)
          : h.service.finishCapture({ capture: draft!, expectedLocalRevision: 1 });
    await until(() => h.store.writes > writes);
    await setImmediate();
    const readCaptured = deferred<void>(), readRelease = deferred<void>();
    h.store.holdNextRead = { captured: () => readCaptured.resolve(), release: readRelease.promise };
    txResult.resolve(); await readCaptured.promise;
    if (operation === 'drafts') {
      peer.auth.drivers[0].emit('SIGNED_OUT');
      await until(() => h.store.peek().gate === 'locked');
    }
    await login(peer.service, 'b'); await saveFixture(peer.service, 'b');
    await until(() => h.service.getSnapshot().data === null);
    readRelease.resolve();
    const result = await pending;
    assert.equal(result.kind, 'error', 'a final old read cannot override an observed identity change');
    if (result.kind === 'error') assert.equal(result.code, 'identity-changed');
    assert.ok(!('data' in result) && !('text' in result) && !('drafts' in result));
    assert.ok(!JSON.stringify(h.service.getSnapshot()).includes('synthetic-private-a'), 'no republishing old A snapshot');
    assert.deepEqual(peer.service.getSnapshot().data, personalFixture('b'));
  });
}
