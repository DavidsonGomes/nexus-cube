import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createCloudServiceWithPorts } from '../../src/cloud/service';
import type { CloudSnapshot } from '../../src/cloud/types';
import type { SyncAccountState } from '../../src/cloud/sync-state';
import { ControlledStore, controlledAuthFactory } from './controlled-dependencies';
import { deferred, personalFixture, QA_IDENTITIES } from './fixtures';
import { emptyPage, fixtureBase } from './sync-oracle';

async function until(predicate: () => boolean) {
  for (let i = 0; i < 50; i++) { if (predicate()) return; await setImmediate(); }
  assert.fail('Expected controlled transition');
}
async function seededStore() {
  const store = new ControlledStore();
  const sync: SyncAccountState = { version: 1, revision: '9', epoch: 'synthetic-epoch', base: fixtureBase(personalFixture('a')),
    outbox: [{ id: 'old-accepted-operation', changes: [], receipt: { kind: 'applied', operationId: 'old-accepted-operation', requestDigest: 'synthetic-old-digest', commitRevision: '10', changeCount: 1 } }],
    reconciliation: false, status: 'pending', error: null, received: null, adoptedSources: {}, hydrated: true };
  await store.transact(state => {
    state.gate = 'active'; state.generation = 3; state.user = { ...QA_IDENTITIES.a }; state.authInstance = 'synthetic-auth'; state.allowedAuth = ['synthetic-auth'];
    state.guest = { data: personalFixture('guest'), revision: 1 };
    state.accounts[QA_IDENTITIES.a.id] = { data: personalFixture('a'), revision: 2, sync };
    state.accounts[QA_IDENTITIES.b.id] = { data: personalFixture('b'), revision: 1 };
  });
  return store;
}
function serviceHarness(store: ControlledStore, enabled?: boolean) {
  let rpc = 0, factories = 0, pulls = 0, pushes = 0, serial = 0;
  const response = deferred<ReturnType<typeof emptyPage>>();
  const auth = controlledAuthFactory(driver => { driver.identity = { ...QA_IDENTITIES.a }; Object.assign(driver, { rpc: async () => { rpc++; assert.fail('Real RPC forbidden'); } }); });
  const service = createCloudServiceWithPorts({ projectRef: 'synthetic-gate-security', store, authFactory: auth.factory,
    ...(enabled === undefined ? {} : { syncEnabled: enabled }), online: () => true, redirectTo: 'https://example.invalid/auth/callback',
    now: () => Date.parse('2026-09-08T12:00:00.000Z'), randomId: () => `gate-id-${++serial}`,
    guestStorage: { getItem: () => { assert.fail('Existing guest must not reread source'); }, setItem: () => { assert.fail('Guest source write forbidden'); } },
    syncTransportFactory: () => { factories++; return {
      push: async () => { pushes++; assert.fail('Unconfirmed data must not upload'); },
      pull: async () => { pulls++; return response.promise; }, status: async () => ({ revision: '9' }),
    }; },
  });
  return { service, response, counts: () => ({ rpc, factories, pulls, pushes }) };
}

for (const enabled of [undefined, false]) test(`sync gate security: ${enabled === undefined ? 'default' : 'explicit'} OFF keeps Auth/capture local with zero scheduler or dispatch`, async t => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events = new EventTarget(); Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  t.after(() => { if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window'); });
  const add = t.mock.method(events, 'addEventListener'); const timeout = t.mock.method(globalThis, 'setTimeout');
  const store = await seededStore(), original = store.peek(); const syncBytes = JSON.stringify(original.accounts[QA_IDENTITIES.a.id].sync);
  const h = serviceHarness(store, enabled); t.after(() => h.service.dispose()); await h.service.initialize();
  assert.equal(h.service.getSnapshot().status, 'authenticated');
  assert.equal(h.service.getSnapshot().sync, 'unavailable'); assert.equal(h.service.getSnapshot().syncHydrated, false);
  const context = h.service.getSnapshot().context!;
  const edit = await h.service.commit({ context, expectedLocalRevision: 2, change: data => ({ ...data, settings: { ...data.settings, holdMs: 777.5 } }) });
  assert.equal(edit.kind, 'committed'); if (edit.kind === 'committed') assert.equal(edit.sync, 'unavailable');
  const arm = await h.service.beginCapture({ context, source: 'manual', capture: { sessionId: 'same-session-id', mode: 'two-handed', scramble: 'R U' } });
  assert.equal(arm.kind, 'armed'); if (arm.kind !== 'armed') return;
  assert.equal((await h.service.completeCapture({ capture: arm.capture, result: { rawMs: 123.5, penalty: 'none', note: 'gate-local-only' } })).kind, 'draft-saved');
  assert.equal((await h.service.finishCapture({ capture: arm.capture, expectedLocalRevision: 3 })).kind, 'committed');
  const actions = [await h.service.listSyncConflicts(context), await h.service.resolveSyncConflict({ context, conflictId: 'old-accepted-operation', choice: 'local', expectedRemoteRevision: '9' }),
    await h.service.previewAccountReconciliation({ context }), await h.service.confirmAccountReconciliation({ context, previewId: 'forged', choice: 'merge' }),
    await h.service.previewGuestAdoption({ context }), await h.service.confirmGuestAdoption({ context, previewId: 'forged' })];
  for (const result of actions) { assert.equal(result.kind, 'error'); if (result.kind === 'error') assert.equal(result.code, 'unavailable'); }
  events.dispatchEvent(new Event('focus')); events.dispatchEvent(new Event('online')); await setImmediate();
  const after = store.peek();
  assert.equal(JSON.stringify(after.accounts[QA_IDENTITIES.a.id].sync), syncBytes);
  assert.equal(after.accounts[QA_IDENTITIES.a.id].syncNeedsReconciliation, true);
  assert.equal(after.accounts[QA_IDENTITIES.a.id].data.settings.holdMs, 777.5);
  assert.equal(after.accounts[QA_IDENTITIES.a.id].data.solves.at(-1)?.note, 'gate-local-only');
  assert.deepEqual(after.guest, original.guest); assert.deepEqual(after.accounts[QA_IDENTITIES.b.id], original.accounts[QA_IDENTITIES.b.id]);
  h.service.dispose(); const reload = serviceHarness(new ControlledStore(after), enabled); t.after(() => reload.service.dispose()); await reload.service.initialize();
  assert.deepEqual(reload.service.getSnapshot().data, after.accounts[QA_IDENTITIES.a.id].data);
  assert.equal(reload.service.getSnapshot().sync, 'unavailable');
  assert.deepEqual(h.counts(), { rpc: 0, factories: 0, pulls: 0, pushes: 0 }); assert.deepEqual(reload.counts(), h.counts());
  assert.equal(add.mock.callCount(), 0, 'OFF must not register engine events');
  assert.equal(timeout.mock.callCount(), 0, 'OFF must not schedule engine work');
});

test('sync gate security: ON cannot publish historical synced status before pull after OFF edits', async t => {
  const store = await seededStore();
  await store.transact(state => { const account = state.accounts[QA_IDENTITIES.a.id]; account.sync!.outbox = []; account.sync!.status = 'synced'; account.syncNeedsReconciliation = true; account.data.settings.holdMs = 888.5; account.revision++; });
  const before = store.peek(), h = serviceHarness(store, true), views: CloudSnapshot[] = [];
  t.after(() => h.service.dispose()); h.service.subscribe(() => views.push(structuredClone(h.service.getSnapshot())));
  await h.service.initialize(); await until(() => h.counts().pulls === 1);
  assert.equal(store.peek().accounts[QA_IDENTITIES.a.id].sync!.reconciliation, true);
  assert.deepEqual(store.peek().accounts[QA_IDENTITIES.a.id].data, before.accounts[QA_IDENTITIES.a.id].data);
  assert.deepEqual(store.peek().accounts[QA_IDENTITIES.a.id].sync!.base, before.accounts[QA_IDENTITIES.a.id].sync!.base);
  assert.equal(h.counts().pushes, 0);
  assert.equal(views.some(view => view.status === 'authenticated' && view.sync === 'synced'), false, 'old synced cannot describe edits that were never sent or reconciled');
});

test('sync gate security: explicit ON with no prior sync waits for pull then requires reconciliation', async t => {
  const store = await seededStore();
  await store.transact(state => { delete state.accounts[QA_IDENTITIES.a.id].sync; state.accounts[QA_IDENTITIES.a.id].syncNeedsReconciliation = true; });
  const before = store.peek(), h = serviceHarness(store, true); t.after(() => h.service.dispose());
  await h.service.initialize(); await until(() => h.counts().pulls === 1);
  assert.notEqual(h.service.getSnapshot().sync, 'synced'); assert.equal(h.service.getSnapshot().syncHydrated, false);
  h.response.resolve(emptyPage('0'));
  await until(() => h.service.getSnapshot().sync === 'reconciliation-required');
  assert.deepEqual(store.peek().accounts[QA_IDENTITIES.a.id].data, before.accounts[QA_IDENTITIES.a.id].data);
  assert.equal(h.counts().pushes, 0); assert.equal(h.counts().rpc, 0);
});
