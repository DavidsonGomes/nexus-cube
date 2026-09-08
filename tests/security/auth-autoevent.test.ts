import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createCloudServiceWithPorts } from '../../src/cloud/service';
import { AuthSessionInvalidError, type CloudIdentity, type CloudService } from '../../src/cloud/types';
import { ControlledStore, controlledAuthFactory } from './controlled-dependencies';
import { deferred, personalFixture, QA_IDENTITIES } from './fixtures';

async function until(predicate: () => boolean) {
  for (let turn = 0; turn < 50; turn++) {
    if (predicate()) return;
    await setImmediate();
  }
  assert.fail('Expected controlled autoevent transition did not occur');
}

async function loginAndSave(service: CloudService, account: 'a' | 'b') {
  assert.equal((await service.signIn({ email: QA_IDENTITIES[account].email, password: 'synthetic-password' })).kind, 'authenticated');
  const snapshot = service.getSnapshot(); assert.ok(snapshot.context);
  assert.equal((await service.commit({ context: snapshot.context, expectedLocalRevision: snapshot.localRevision, change: personalFixture(account) })).kind, 'committed');
  assert.deepEqual(service.getSnapshot().data, personalFixture(account));
}

async function setup() {
  const store = new ControlledStore(), auth = controlledAuthFactory();
  let serial = 0, online = true;
  const service = createCloudServiceWithPorts({
    projectRef: 'synthetic-autoevent-project', store, authFactory: auth.factory,
    redirectTo: 'https://app.example.invalid/',
    guestStorage: { getItem: () => JSON.stringify(personalFixture('guest')), setItem: () => { assert.fail('Autoevent must not rewrite guest source'); } },
    randomId: () => `synthetic-autoevent-${++serial}`, online: () => online,
  });
  await service.initialize(); await loginAndSave(service, 'a');
  await setImmediate(); // Drain prior publication reads before observing this event.
  return { service, store, auth, offline() { online = false; } };
}

for (const event of ['TOKEN_REFRESHED', 'USER_UPDATED']) {
  test(`autoevent ${event}: valid getUser verifies and republishes only A`, async t => {
    const h = await setup(); t.after(() => h.service.dispose());
    const driver = h.auth.drivers.at(-1)!;
    const before = h.store.peek();
    const pending = deferred<CloudIdentity | null>(); driver.nextGetUser = pending.promise;
    let publications = 0;
    const unsubscribe = h.service.subscribe(() => { publications++; }); t.after(unsubscribe);
    driver.emit(event);
    await until(() => driver.calls.includes('getUser'));
    assert.equal(publications, 0, 'event waits for identity verification');
    pending.resolve({ ...QA_IDENTITIES.a });
    await until(() => publications > 0);
    assert.deepEqual(h.store.peek(), before);
    assert.deepEqual(h.service.getSnapshot().identity, QA_IDENTITIES.a);
    assert.deepEqual(h.service.getSnapshot().data, personalFixture('a'));
    assert.equal(h.service.getSnapshot().error, null);
    assert.ok(!driver.calls.includes('refresh'), 'entrypoint is SDK event getUser, not public refresh');
  });

  test(`autoevent ${event}: typed invalid session closes original gate without deleting account data`, async t => {
    const h = await setup(); t.after(() => h.service.dispose());
    const driver = h.auth.drivers.at(-1)!;
    const before = h.store.peek(), oldContext = h.service.getSnapshot().context!;
    const pending = deferred<CloudIdentity | null>(); driver.nextGetUser = pending.promise;
    driver.emit(event); await until(() => driver.calls.includes('getUser'));
    pending.reject(new AuthSessionInvalidError());
    await until(() => h.store.peek().gate === 'locked');
    const after = h.store.peek();
    assert.equal(after.generation, before.generation + 1);
    assert.equal(after.authInstance, null); assert.deepEqual(after.allowedAuth, []);
    assert.deepEqual(after.accounts, before.accounts); assert.deepEqual(after.guest, before.guest);
    assert.equal(h.service.getSnapshot().identity, null); assert.equal(h.service.getSnapshot().data, null);
    assert.equal((await h.service.exportBackup(oldContext)).kind, 'error');
    h.offline(); assert.equal((await h.service.resumeOffline()).kind, 'error');
  });

  test(`autoevent ${event}: transport failure retains A and explicit offline continuation`, async t => {
    const h = await setup(); t.after(() => h.service.dispose());
    const driver = h.auth.drivers.at(-1)!;
    const before = h.store.peek(), oldContext = h.service.getSnapshot().context;
    const pending = deferred<CloudIdentity | null>(); driver.nextGetUser = pending.promise;
    const hidden: boolean[] = [];
    const unsubscribe = h.service.subscribe(() => { hidden.push(h.service.getSnapshot().data === null); }); t.after(unsubscribe);
    driver.emit(event); await until(() => driver.calls.includes('getUser'));
    pending.reject(new TypeError('Synthetic network failure'));
    await until(() => h.service.getSnapshot().error !== null);
    assert.deepEqual(h.store.peek(), before);
    assert.deepEqual(h.service.getSnapshot().context, oldContext);
    assert.deepEqual(h.service.getSnapshot().data, personalFixture('a'));
    assert.ok(hidden.length > 0); assert.ok(hidden.every(value => !value), 'transport must not hide workspace even transiently');
    h.offline(); assert.equal((await h.service.resumeOffline()).kind, 'authenticated');
    assert.equal(h.service.getSnapshot().status, 'offline-account');
    const exported = await h.service.exportBackup(h.service.getSnapshot().context!);
    assert.equal(exported.kind, 'exported');
    if (exported.kind === 'exported') assert.deepEqual(JSON.parse(exported.text).data, personalFixture('a'));
  });
}

for (const outcome of ['valid', 'invalid', 'transport'] as const) {
  test(`autoevent delayed A ${outcome}: new B generation and driver remain intact`, async t => {
    const h = await setup(); t.after(() => h.service.dispose());
    const aDriver = h.auth.drivers.at(-1)!;
    const pending = deferred<CloudIdentity | null>(); aDriver.nextGetUser = pending.promise;
    aDriver.emit('TOKEN_REFRESHED'); await until(() => aDriver.calls.includes('getUser'));
    await loginAndSave(h.service, 'b'); await setImmediate();
    const bDriver = h.auth.drivers.at(-1)!, before = h.store.peek();
    const visibleBefore = structuredClone(h.service.getSnapshot());
    if (outcome === 'valid') pending.resolve({ ...QA_IDENTITIES.a });
    else pending.reject(outcome === 'invalid' ? new AuthSessionInvalidError() : new TypeError('Synthetic late network failure'));
    await setImmediate(); await h.store.read(); await setImmediate();
    assert.deepEqual(h.store.peek(), before, 'old result cannot change B gate, auth storage or any account');
    assert.deepEqual(h.service.getSnapshot(), visibleBefore, 'old result cannot publish A, hide B or attach an old error');
    assert.equal(bDriver.disposed, false);
    const exported = await h.service.exportBackup(h.service.getSnapshot().context!);
    assert.equal(exported.kind, 'exported');
    if (exported.kind === 'exported') assert.deepEqual(JSON.parse(exported.text).data, personalFixture('b'));
    bDriver.emit('USER_UPDATED');
    await until(() => bDriver.calls.includes('getUser'));
    await setImmediate();
    assert.deepEqual(h.service.getSnapshot().identity, QA_IDENTITIES.b);
    assert.deepEqual(h.service.getSnapshot().data, personalFixture('b'));
  });
}
