import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData } from '../../src/data';
import { createCloudServiceWithPorts } from '../../src/cloud/service';
import { createMemoryCloudStore, initialCloudState } from '../../src/cloud/storage';
import { initialSyncState } from '../../src/cloud/sync-state';
import type { AuthDriver } from '../../src/cloud/types';

const user = { id: 'A', email: null };
function harness(enabled?: boolean, prior = true) {
  const seed = initialCloudState(); seed.gate = 'active'; seed.generation = 1; seed.user = user; seed.authInstance = 'auth-A'; seed.allowedAuth = ['auth-A'];
  seed.guest = { data: createInitialData(), revision: 0 };
  const sync = initialSyncState(false); sync.hydrated = true; sync.revision = '7';
  sync.outbox = [{ id: 'old-operation', changes: [], receipt: { kind: 'applied', operationId: 'old-operation', requestDigest: 'old-digest', commitRevision: '8', changeCount: 1 } }];
  seed.accounts.A = { data: createInitialData(), revision: 0, ...(prior ? { sync } : {}) };
  const memory = createMemoryCloudStore(seed); const store = { ...memory, close: () => {} }; let rpc = 0; let factories = 0; let pulls = 0;
  const driver: AuthDriver = { signIn: async () => user, signUp: async () => user, getUser: async () => user, refresh: async () => user, exchangeCode: async () => user, resetPassword: async () => {}, updatePassword: async () => {}, signOut: async () => {}, subscribe: () => () => {}, dispose: () => {}, rpc: async () => { rpc++; throw new Error('No real RPC allowed'); } };
  const make = () => createCloudServiceWithPorts({ projectRef: 'synthetic', online: () => true, syncEnabled: enabled, store, authFactory: () => driver, redirectTo: 'https://example.invalid/', syncTransportFactory: () => { factories++; return { push: async () => { throw new Error('Unexpected push'); }, pull: async () => { pulls++; return { epoch: 'test', upperBound: '0', header: null, records: [], startOrdinal: 0, nextOrdinal: 0, complete: true, hasMore: false }; }, status: async () => ({ revision: '0' }) }; } });
  return { make, store, counts: () => ({ rpc, factories, pulls }) };
}

test('OFF default preserves queued receipts and edits across reload with zero sync dispatch', async () => {
  const h = harness(); const service = h.make(); const original = (await h.store.read()).accounts.A.sync;
  await service.initialize(); const snapshot = service.getSnapshot(); const context = snapshot.context!;
  assert.equal(snapshot.status,'authenticated'); assert.equal(snapshot.sync,'unavailable'); assert.equal(snapshot.syncHydrated,false); assert.equal(snapshot.accountImport,'unavailable');
  const edit = await service.commit({ context, expectedLocalRevision: 0, change: data => ({ ...data, settings: { ...data.settings, holdMs: 777 } }) });
  assert.equal(edit.kind,'committed'); if (edit.kind === 'committed') assert.equal(edit.sync,'unavailable');
  for (const result of [await service.previewGuestAdoption({ context }), await service.previewAccountReconciliation({ context }), await service.listSyncConflicts(context), await service.confirmGuestAdoption({ context, previewId:'forged' })]) { assert.equal(result.kind,'error'); if (result.kind === 'error') assert.equal(result.code,'unavailable'); }
  const state = await h.store.read(); assert.deepEqual(state.accounts.A.sync,original); assert.equal(state.accounts.A.syncNeedsReconciliation,true);
  assert.equal(state.accounts.A.data.settings.holdMs,777);
  service.dispose(); const reloaded = h.make(); await reloaded.initialize();
  assert.equal(reloaded.getSnapshot().data!.settings.holdMs,777);
  assert.deepEqual((await h.store.read()).accounts.A.sync,original);
  assert.deepEqual(h.counts(),{ rpc:0,factories:0,pulls:0 });
  const firstUse = await reloaded.ensureFirstUse(reloaded.getSnapshot().context!); assert.equal(firstUse.kind,'error');
  assert.equal((await h.store.read()).accounts.A.data.sessions.length,0);
  reloaded.dispose();
});

test('ON requires explicit opt in and performs automatic validated hydration', async () => {
  const h = harness(true,false); const service = h.make(); await service.initialize();
  for (let i=0; i<100 && service.getSnapshot().sync!=='synced'; i++) await new Promise(resolve => setTimeout(resolve,5));
  assert.equal(service.getSnapshot().sync,'synced'); assert.equal(service.getSnapshot().syncHydrated,true);
  assert.equal(h.counts().rpc,0); assert.ok(h.counts().factories>0); assert.ok(h.counts().pulls>0);
  service.dispose();
});
