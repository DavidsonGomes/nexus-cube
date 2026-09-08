import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createCloudServiceWithPorts } from '../../src/cloud/service';
import type { CloudState } from '../../src/cloud/storage';
import { ControlledStore, controlledAuthFactory } from './controlled-dependencies';
import { personalFixture, QA_IDENTITIES } from './fixtures';
import { emptyPage, fixtureBase, fixtureRecords } from './sync-oracle';

async function until(predicate: () => boolean) {
  for (let i = 0; i < 50; i++) { if (predicate()) return; await setImmediate(); }
  assert.fail('Expected controlled reconciliation transition');
}
async function harness(options: { pullFails?: boolean; seed?: CloudState } = {}) {
  const store = new ControlledStore(options.seed); let pulls = 0, pushes = 0, serial = 0;
  if (!options.seed) await store.transact(state => {
    state.gate = 'active'; state.generation = 3; state.user = { ...QA_IDENTITIES.a }; state.authInstance = 'synthetic-reconcile'; state.allowedAuth = ['synthetic-reconcile'];
    state.guest = { data: personalFixture('guest'), revision: 1 };
    const original = personalFixture('a'), local = structuredClone(original);
    local.solves[0].note = 'local pending note'; local.settings.holdMs = 888.5;
    const before = fixtureRecords(original).find(record => record.entity === 'solve')!;
    state.accounts[QA_IDENTITIES.a.id] = { data: local, revision: 4, syncNeedsReconciliation: true, sync: {
      version: 1, revision: '9', epoch: 'synthetic-epoch', base: fixtureBase(original), hydrated: true,
      status: 'pending', error: null, reconciliation: false, received: null, adoptedSources: {},
      outbox: [{ id: 'old-unsubmitted-intent', changes: [{ entity: 'solve', id: before.id, before, after: { ...before, value: local.solves[0] } }] }],
    } };
    state.accounts[QA_IDENTITIES.b.id] = { data: personalFixture('b'), revision: 2 };
  });
  const auth = controlledAuthFactory(driver => { driver.identity = { ...QA_IDENTITIES.a }; });
  const service = createCloudServiceWithPorts({ projectRef: 'synthetic-reconcile', syncEnabled: true, store, authFactory: auth.factory,
    redirectTo: 'https://example.invalid/auth/callback', online: () => true, randomId: () => `reconcile-${++serial}`,
    syncTransportFactory: () => ({
      pull: async () => { pulls++; if (options.pullFails) throw new Error('Synthetic pull unavailable'); return emptyPage('9'); },
      push: async () => { pushes++; assert.fail('Fixture choice remote must not upload'); },
      status: async () => ({ revision: '9' }), lookupSource: async () => ({ operationId: null }),
    }),
  });
  await service.initialize(); await until(() => pulls > 0 && ['reconciliation-required', 'error', 'synced'].includes(service.getSnapshot().sync));
  return { service, store, counts: () => ({ pulls, pushes }) };
}

test('sync reconciliation: explicit remote choice archives old queue and source atomically, clears marker across reload', async t => {
  const h = await harness(); t.after(() => h.service.dispose()); const before = h.store.peek();
  const context = h.service.getSnapshot().context!;
  const preview = await h.service.previewAccountReconciliation({ context });
  assert.equal(preview.kind, 'preview'); if (preview.kind !== 'preview') return;
  assert.equal((await h.service.confirmAccountReconciliation({ context, previewId: preview.preview.previewId, choice: 'remote' })).kind, 'queued');
  await until(() => h.service.getSnapshot().sync === 'synced');
  const after = h.store.peek(), account = after.accounts[QA_IDENTITIES.a.id];
  assert.deepEqual(account.data, personalFixture('a'));
  assert.deepEqual(account.sync!.outbox, []); assert.equal(account.syncNeedsReconciliation, false);
  assert.equal(account.sync!.reconciliation, false);
  const archive = account.sync!.reconciliationArchive![preview.preview.previewId];
  assert.deepEqual(archive.outbox, before.accounts[QA_IDENTITIES.a.id].sync!.outbox);
  assert.deepEqual(archive.sourceSnapshot, before.accounts[QA_IDENTITIES.a.id].data);
  assert.deepEqual(after.guest, before.guest); assert.deepEqual(after.accounts[QA_IDENTITIES.b.id], before.accounts[QA_IDENTITIES.b.id]);
  assert.equal(h.counts().pushes, 0); h.service.dispose();
  const reopened = await harness({ seed: after }); t.after(() => reopened.service.dispose());
  await until(() => reopened.service.getSnapshot().sync === 'synced');
  assert.equal(reopened.store.peek().accounts[QA_IDENTITIES.a.id].syncNeedsReconciliation, false);
  assert.equal(reopened.store.peek().accounts[QA_IDENTITIES.a.id].sync!.reconciliation, false);
});

test('sync reconciliation: quota on explicit choice preserves queue, source and pending marker', async t => {
  const h = await harness(); t.after(() => h.service.dispose()); const context = h.service.getSnapshot().context!;
  const preview = await h.service.previewAccountReconciliation({ context });
  assert.equal(preview.kind, 'preview'); if (preview.kind !== 'preview') return;
  const before = h.store.peek(); h.store.failNextCommit = true;
  const result = await h.service.confirmAccountReconciliation({ context, previewId: preview.preview.previewId, choice: 'remote' });
  assert.equal(result.kind, 'error'); assert.deepEqual(h.store.peek(), before); assert.equal(h.counts().pushes, 0);
});

test('sync reconciliation: failed pull cannot produce actionable preview from historical base', async t => {
  const h = await harness({ pullFails: true }); t.after(() => h.service.dispose());
  assert.equal(h.service.getSnapshot().syncHydrated, false);
  const before = h.store.peek(), context = h.service.getSnapshot().context!;
  const result = await h.service.previewAccountReconciliation({ context });
  assert.notEqual(result.kind, 'preview', 'source lookup success does not confirm the base or upper bound');
  assert.deepEqual(h.store.peek().accounts[QA_IDENTITIES.a.id].data, before.accounts[QA_IDENTITIES.a.id].data);
  assert.deepEqual(h.store.peek().accounts[QA_IDENTITIES.a.id].sync!.outbox, before.accounts[QA_IDENTITIES.a.id].sync!.outbox);
});
