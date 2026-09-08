import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudServiceWithPorts } from '../../src/cloud/service';
import { createMemoryCloudStore } from '../../src/cloud/storage';
import type { AuthDriver, AuthDriverFactory, CloudIdentity } from '../../src/cloud/types';
import { createInitialData } from '../../src/data/store';
import { createSession } from '../../src/data/mutations';
import { MemoryStorage } from './contract-fixtures';

function authFactory(): AuthDriverFactory {
  let authInstances = 0;
  return ({ storageKey }) => {
    authInstances += 1;
    const identity: CloudIdentity = { id: authInstances === 1 ? 'user-a' : 'user-b', email: `${storageKey}@synthetic.invalid` };
    const listeners = new Set<(event: string) => void>();
    const driver: AuthDriver = {
      signUp: async () => identity,
      signIn: async () => identity,
      getUser: async () => identity,
      resetPassword: async () => undefined,
      exchangeCode: async () => identity,
      updatePassword: async () => undefined,
      signOut: async () => undefined,
      refresh: async () => identity,
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      dispose: () => listeners.clear(),
    };
    return driver;
  };
}
function service() {
  return createCloudServiceWithPorts({ projectRef: 'qa-project', authFactory: authFactory(), store: createMemoryCloudStore(), guestStorage: new MemoryStorage(), online: () => true, redirectTo: 'http://127.0.0.1:3101/auth', randomId: (() => { let n = 0; return () => `id-${++n}`; })() });
}

test('AUTH-01: guest, signup and refresh expose explicit local context', async () => {
  const cloud = service(); await cloud.initialize();
  assert.equal(cloud.getSnapshot().status, 'guest');
  const result = await cloud.signUp({ email: 'a@synthetic.invalid', password: 'not-real' });
  assert.equal(result.kind, 'authenticated');
  assert.equal(cloud.getSnapshot().identity?.id, 'user-a');
  assert.equal(cloud.getSnapshot().sync, 'unavailable');
  assert.equal((await cloud.refresh()).kind, 'authenticated'); cloud.dispose();
});

test('AUTH-02: account contexts do not expose previous account data after logout', async () => {
  const cloud = service(); await cloud.initialize(); await cloud.signIn({ email: 'a@synthetic.invalid', password: 'x' });
  const current = cloud.getSnapshot(); const data = createSession(createInitialData(), 'A session', 'two-handed');
  assert.equal((await cloud.commit({ context: current.context!, expectedLocalRevision: current.localRevision, change: data })).kind, 'committed');
  const logout = await cloud.signOut(); assert.equal(logout.kind, 'logged-out'); assert.equal(cloud.getSnapshot().data, null);
  await cloud.signIn({ email: 'b@synthetic.invalid', password: 'x' });
  assert.equal(cloud.getSnapshot().identity?.id, 'user-b');
  assert.deepEqual(cloud.getSnapshot().data, createInitialData()); cloud.dispose();
});

test('AUTH-03: capture blocks voluntary logout and finish persists original context payload', async () => {
  const cloud = service(); await cloud.initialize(); await cloud.signIn({ email: 'a@synthetic.invalid', password: 'x' });
  const snap = cloud.getSnapshot(); const data = createSession(createInitialData(), 'A session', 'two-handed');
  await cloud.commit({ context: snap.context!, expectedLocalRevision: snap.localRevision, change: data });
  const armed = await cloud.beginCapture({ context: cloud.getSnapshot().context!, capture: { sessionId: data.sessions[0].id, mode: 'two-handed', scramble: "R U R' U'" }, source: 'timer' });
  assert.equal(armed.kind, 'armed');
  assert.equal((await cloud.signOut()).kind, 'error');
  if (armed.kind === 'armed') {
    await cloud.completeCapture({ capture: armed.capture, result: { rawMs: 1234, penalty: 'none', note: 'synthetic timer' } });
    const finished = await cloud.finishCapture({ capture: armed.capture, expectedLocalRevision: cloud.getSnapshot().localRevision });
    assert.equal(finished.kind, 'committed');
    const saved = cloud.getSnapshot().data?.solves.at(-1)!;
    assert.equal(cloud.getSnapshot().data?.solves.length, 1);
    assert.equal(saved.sessionId, data.sessions[0].id); assert.equal(saved.mode, 'two-handed'); assert.equal(saved.scramble, "R U R' U'");
    assert.equal(saved.source, 'timer'); assert.equal(saved.rawMs, 1234); assert.equal(saved.penalty, 'none'); assert.equal(saved.note, 'synthetic timer');
    const retry = await cloud.finishCapture({ capture: armed.capture, expectedLocalRevision: cloud.getSnapshot().localRevision });
    assert.equal(retry.kind, 'committed'); assert.equal(cloud.getSnapshot().data?.solves.length, 1);
  }
  cloud.dispose();
});

test('AUTH-04: account export is local while import/adoption remains unavailable', async () => {
  const cloud = service(); await cloud.initialize(); await cloud.signIn({ email: 'a@synthetic.invalid', password: 'x' }); const context = cloud.getSnapshot().context!;
  const exported = await cloud.exportBackup(context); assert.equal(exported.kind, 'exported');
  const accountRecovery = await cloud.recover({ context, data: createInitialData() });
  assert.notEqual(accountRecovery.kind, 'committed');
  assert.equal(cloud.getSnapshot().sync, 'unavailable'); cloud.dispose();
});

test('AUTH-05: reload resumes an account offline without exposing a guest or discarding local data', async () => {
  const store = createMemoryCloudStore(); const ports = { projectRef:'qa-reload', authFactory:authFactory(), store, guestStorage:new MemoryStorage(), online:()=>true, redirectTo:'http://127.0.0.1:3101/auth' };
  const first = createCloudServiceWithPorts(ports); await first.initialize(); await first.signIn({email:'a@synthetic.invalid',password:'x'});
  const before = first.getSnapshot(); const sentinel = createSession(createInitialData(), 'A sentinel', 'two-handed');
  await first.commit({ context: before.context!, expectedLocalRevision: before.localRevision, change: sentinel });
  const expected = first.getSnapshot().data; first.dispose();
  const offline = createCloudServiceWithPorts({...ports, online:()=>false}); await offline.initialize();
  const resumed = await offline.resumeOffline(); assert.equal(resumed.kind, 'authenticated'); assert.equal(offline.getSnapshot().status, 'offline-account');
  assert.equal(offline.getSnapshot().identity?.id, 'user-a'); assert.deepEqual(offline.getSnapshot().data, expected); offline.dispose();
});

test('AUTH-06: stale response from account A cannot replace account B and empty auth results stay explicit', async () => {
  let calls = 0;
  let resolveA!: (value: CloudIdentity) => void; let resolveB!: (value: CloudIdentity) => void;
  const aWait = new Promise<CloudIdentity>(resolve => { resolveA = resolve; }); const bWait = new Promise<CloudIdentity>(resolve => { resolveB = resolve; });
  const delayed: AuthDriverFactory = (_options) => ({
    signUp: async () => null,
    signIn: async (email) => { calls++; return email.startsWith('a@') ? aWait : bWait; },
    getUser: async () => null, resetPassword: async () => undefined, exchangeCode: async () => ({id:'user-a',email:null}), updatePassword: async () => undefined, signOut: async () => undefined, refresh: async () => null,
    subscribe: () => () => undefined, dispose: () => undefined,
  } as unknown as AuthDriver);
  const cloud = createCloudServiceWithPorts({ projectRef:'qa-race', authFactory: delayed, store:createMemoryCloudStore(), guestStorage:new MemoryStorage(), online:()=>true, redirectTo:'http://127.0.0.1:3101/auth' });
  await cloud.initialize(); const empty = await cloud.signUp({email:'empty@synthetic.invalid',password:'x'}); assert.equal(empty.kind, 'confirmation-required');
  const a = cloud.signIn({email:'a@synthetic.invalid',password:'x'}); const b = cloud.signIn({email:'b@synthetic.invalid',password:'x'});
  resolveB({id:'user-b', email:'b@synthetic.invalid'}); const bResult = await b; resolveA({id:'user-a', email:'a@synthetic.invalid'}); const aResult = await a; const results = [aResult,bResult];
  assert.ok(results.some(result => result.kind === 'error' && result.code === 'identity-changed'));
  assert.equal(cloud.getSnapshot().identity?.id, 'user-b'); assert.equal(calls >= 2, true); cloud.dispose();
});
