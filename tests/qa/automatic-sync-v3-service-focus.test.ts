import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudServiceWithPorts } from '../../src/cloud/service';
import { createMemoryCloudStore, initialCloudState } from '../../src/cloud/storage';
import { initialSyncState } from '../../src/cloud/sync-state';
import { expectedAccountData } from './automatic-sync-v3-service-fixtures';

const authFactory = () => ({
  signIn: async () => ({ user: { id: 'qa-account-a', email: 'qa-a@example.test' } }),
  signUp: async () => ({ user: { id: 'qa-account-a', email: 'qa-a@example.test' } }),
  getUser: async () => ({ id: 'qa-account-a', email: 'qa-a@example.test' }),
  signOut: async () => undefined, refresh: async () => ({ user: { id: 'qa-account-a', email: 'qa-a@example.test' } }),
  handleAuthCallback: async () => undefined, requestPasswordReset: async () => undefined, completePasswordReset: async () => undefined,
  subscribe: () => () => undefined, dispose: () => undefined,
} as any);

test('sync V3 service enqueues an independent A change without claiming remote acknowledgement', async () => {
  const state = initialCloudState(); state.gate = 'active'; state.generation = 7; state.user = { id: 'qa-account-a', email: 'qa-a@example.test' }; state.authInstance = 'qa'; state.allowedAuth = ['qa'];
  state.accounts['qa-account-a'] = { data: expectedAccountData('a'), revision: 0, sync: initialSyncState(false) };
  const store = createMemoryCloudStore(state); let pushes = 0;
  const service = createCloudServiceWithPorts({ projectRef: 'qa-sync-v3', configured: true, authFactory, store, online: () => true, redirectTo: 'https://example.test', syncEnabled: true, syncTransportFactory: () => ({
    status: async () => ({ revision: '0' }), lookupSource: async () => ({ operationId: null }),
    pull: async () => ({ epoch: 'qa', upperBound: '0', header: null, records: [], startOrdinal: 0, nextOrdinal: 0, complete: true, hasMore: false }),
    push: async () => { pushes++; throw new Error('drain is intentionally outside this bounded assertion'); },
  }), randomId: () => 'qa-operation-a1' });
  try {
    await service.initialize(); const before = service.getSnapshot(); assert.equal(before.context?.userId, 'qa-account-a');
    const next = structuredClone(before.data!); next.settings = { ...next.settings, theme: 'dark' };
    const result = await service.commit({ context: before.context!, expectedLocalRevision: before.localRevision, change: next });
    assert.equal(result.kind, 'committed');
    const stored = await store.read(); const sync = stored.accounts['qa-account-a'].sync!;
    assert.equal(sync.outbox.length, 1); assert.equal(sync.outbox[0].id, 'qa-operation-a1'); assert.deepEqual(stored.accounts['qa-account-a'].data, next);
    assert.equal(pushes, 0); assert.notEqual(service.getSnapshot().sync, 'synced');
  } finally { service.dispose(); }
});
