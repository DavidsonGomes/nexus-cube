import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData } from '../../src/data';
import { createSyncActions } from '../../src/cloud/sync-actions';
import { initialSyncState } from '../../src/cloud/sync-state';
import { createMemoryCloudStore, initialCloudState, type CloudAtomicStore } from '../../src/cloud/storage';
import type { ContextHandle, Failure } from '../../src/cloud/types';

function deferred() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
function fixture(hold: 'drain' | 'read' | 'transact') {
  const seed = initialCloudState(); seed.gate = 'active'; seed.generation = 1; seed.user = { id: 'A', email: null };
  for (const owner of ['A','B']) {
    const sync = initialSyncState(false); sync.hydrated = true; sync.status = 'synced';
    sync.outbox = ['first','second'].map(id => ({ id, changes: [], conflict: `${owner}-${id}` }));
    seed.accounts[owner] = { data: createInitialData(), revision: 0, sync };
  }
  seed.guest = { data: createInitialData(), revision: 0 };
  const store = createMemoryCloudStore(seed); const wait = deferred();
  let held = false;
  const wrapped: CloudAtomicStore = {
    ...store,
    read: async () => { const state = await store.read(); if (hold === 'read' && !held) { held = true; await wait.promise; } return state; },
    transact: async change => { if (hold === 'transact' && !held) { held = true; await wait.promise; } return store.transact(change); },
  };
  const context: ContextHandle = { projectRef: 'qa', userId: 'A', generation: 1 };
  const same = (state: typeof seed, value: ContextHandle) => value.projectRef === 'qa' && value.userId === state.user?.id && value.generation === state.generation;
  const api = createSyncActions({
    store: wrapped, guard: (state, value) => { if (!same(state, value)) throw new Error('identity changed'); }, idle() {},
    randomId: () => 'new-operation', drain: async () => { if (hold === 'drain') await wait.promise; }, trigger() {},
    transport: async () => ({ push: async () => { throw new Error('No dispatch expected'); }, pull: async () => { throw new Error('No pull expected'); }, status: async () => ({ revision: '0' }), lookupSource: async () => ({ operationId: null }) }),
    after: async (value, result) => same(await store.read(), value) ? result : { kind: 'error', code: 'identity-changed', message: 'identity changed' } satisfies Failure,
  });
  return { api, store, context, wait, async changeToB() { await store.transact(state => { state.user = { id: 'B', email: null }; state.generation = 2; }); Object.assign(context, { userId: 'B', generation: 2 }); } };
}

for (const method of ['previewAccountReconciliation','previewGuestAdoption'] as const) {
  test(`${method} captures identity before drain and caller mutation`, async () => {
    const f = fixture('drain'); const pending = f.api[method]({ context: f.context });
    await f.changeToB(); f.wait.release();
    assert.equal((await pending as Failure).code, 'identity-changed');
    assert.equal(Object.keys((await f.store.read()).accounts.B.sync!.previews ?? {}).length, 0);
  });
}

test('conflict read cannot reinterpret an A result as B after input mutation', async () => {
  const f = fixture('read'); const pending = f.api.listSyncConflicts(f.context);
  await f.changeToB(); f.wait.release();
  const result = await pending; assert.equal((result as Failure).code, 'identity-changed'); assert.equal('conflicts' in result, false);
});

test('conflict action captures ID, choice and expected revision before deferred transaction', async () => {
  const f = fixture('transact');
  const input = { context: f.context, conflictId: 'first', choice: 'remote' as 'remote' | 'local', expectedRemoteRevision: '0' };
  const pending = f.api.resolveSyncConflict(input);
  input.conflictId = 'second'; input.choice = 'local'; input.expectedRemoteRevision = '999'; f.wait.release();
  assert.deepEqual(await pending, { kind: 'queued', operationId: null });
  assert.deepEqual((await f.store.read()).accounts.A.sync!.outbox.map(entry => entry.id), ['second']);
});

test('deferred conflict action cannot retarget B by mutating context', async () => {
  const f = fixture('transact'); const pending = f.api.resolveSyncConflict({ context: f.context, conflictId: 'first', choice: 'remote', expectedRemoteRevision: '0' });
  await f.changeToB(); f.wait.release();
  assert.equal((await pending as Failure).code, 'identity-changed');
  const state = await f.store.read(); for (const owner of ['A','B']) assert.deepEqual(state.accounts[owner].sync!.outbox.map(entry => entry.id), ['first','second']);
});
