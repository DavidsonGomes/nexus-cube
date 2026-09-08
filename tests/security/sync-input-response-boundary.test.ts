import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createCloudServiceWithPorts } from '../../src/cloud/service';
import type { SyncAccountState } from '../../src/cloud/sync-state';
import { ControlledStore, controlledAuthFactory } from './controlled-dependencies';
import { deferred, personalFixture, QA_IDENTITIES } from './fixtures';
import { fixtureBase } from './sync-oracle';

async function harness() {
  const store = new ControlledStore();
  await store.transact(state => {
    state.gate = 'active'; state.generation = 3; state.user = { ...QA_IDENTITIES.a };
    state.authInstance = 'security-instance'; state.allowedAuth = ['security-instance'];
    state.guest = { data: personalFixture('guest'), revision: 1 };
    for (const owner of ['a', 'b'] as const) {
      const sync: SyncAccountState = { version: 1, revision: '9', epoch: 'security-epoch',
        base: fixtureBase(personalFixture(owner)), outbox: [{ id: `operation-${owner}`, changes: [], conflict: `private-conflict-${owner}` }],
        reconciliation: false, status: 'conflict', error: null, received: null, adoptedSources: {}, hydrated: true };
      state.accounts[QA_IDENTITIES[owner].id] = { data: personalFixture(owner), revision: 1, sync };
    }
  });
  let serial = 0, pulls = 0;
  const auth = controlledAuthFactory(driver => { driver.identity = { ...QA_IDENTITIES.a }; });
  const service = createCloudServiceWithPorts({ projectRef: 'security-input-response', store, authFactory: auth.factory,
    syncEnabled: true, online: () => true, redirectTo: 'https://example.invalid/auth/callback', randomId: () => `controlled-${++serial}`,
    syncTransportFactory: () => ({ pull: async () => { pulls++; return new Promise<never>(() => {}); },
      push: async () => assert.fail('No upload authorized by this fixture'), status: async () => ({ revision: '9' }) }),
  });
  await service.initialize();
  for (let i = 0; i < 50 && !pulls; i++) await setImmediate();
  assert.equal(pulls, 1, 'Suspend scheduler on its controlled transport before the focused interleaving');
  return { store, service };
}

for (const boundary of ['final-read', 'read-error'] as const) {
  test(`sync response security: ${boundary} keeps captured A authority after caller retargets B`, async t => {
    const { store, service } = await harness(); t.after(() => service.dispose());
    const context = { ...service.getSnapshot().context! };
    const captured = deferred<void>(), release = deferred<void>();
    const originalRead = store.read.bind(store);
    let reads = 0;
    store.read = async () => {
      reads++;
      if (boundary === 'read-error' && reads === 1) {
        captured.resolve(); await release.promise; throw new Error('private-conflict-a');
      }
      const value = await originalRead();
      if (boundary === 'final-read' && reads === 2) { captured.resolve(); await release.promise; }
      return value;
    };
    const pending = service.listSyncConflicts(context);
    await captured.promise;
    const switched = await service.signIn({ email: QA_IDENTITIES.b.email, password: 'synthetic-only' });
    assert.equal(switched.kind, 'authenticated');
    const bContext = { ...service.getSnapshot().context! };
    assert.equal(bContext.userId, QA_IDENTITIES.b.id);
    Object.assign(context, bContext);
    release.resolve();
    const result = await pending;
    assert.equal(result.kind, 'error');
    if (result.kind === 'error') assert.equal(result.code, 'identity-changed');
    assert.equal(JSON.stringify(result).includes('private-conflict-a'), false);
    assert.equal('conflicts' in result, false);
    const positive = await service.listSyncConflicts(bContext);
    assert.equal(positive.kind, 'conflicts');
    if (positive.kind === 'conflicts') assert.deepEqual(positive.conflicts.map(c => c.reason), ['private-conflict-b']);
    assert.equal(service.getSnapshot().context?.userId, QA_IDENTITIES.b.id);
    assert.equal(store.peek().accounts[QA_IDENTITIES.a.id].sync!.outbox[0].id, 'operation-a');
  });
}
