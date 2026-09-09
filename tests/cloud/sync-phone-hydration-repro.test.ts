import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine } from '../../src/cloud/sync-engine';
import { initialCloudState, createMemoryCloudStore } from '../../src/cloud/storage';
import type { SyncAccountState } from '../../src/cloud/sync-state';
import type { ContextHandle } from '../../src/cloud/types';
import { fixtureBase, fixturePage, emptyPage } from '../security/sync-oracle';
import { automaticSyncFixture, SYNC_OPERATION_IDS } from '../security/sync-fixtures';
import { QA_IDENTITIES } from '../security/fixtures';

// Field bug repro: desktop pushed history (remote revision high); the phone,
// which had local state when sync was first enabled, sits in reconciliation and
// never shows the pulled remote. This isolates whether the pull path itself is
// broken (it is not) from the reconciliation gate (the real cause), with no two
// browser profiles. The remote is LARGER than the phone's local view.

const fixture = automaticSyncFixture();
const context: ContextHandle = { projectRef: 'synthetic', userId: QA_IDENTITIES.a.id, generation: 7 };
const remotePage = () => fixturePage(
  [{ entity: 'solve', id: fixture.newSolve.id, revision: '10', tombstone: false,
     record: (fixtureBase(fixture.afterCreateA1, '10').find(r => r.id === fixture.newSolve.id))!.record }],
  { operationId: SYNC_OPERATION_IDS.create, requestDigest: 'synthetic-request-digest' }, '10', '9');

function phone(reconciliation: boolean) {
  const sync: SyncAccountState = { version: 1, revision: '9', epoch: 'synthetic-epoch',
    base: fixtureBase(fixture.a1, '9'), outbox: [], reconciliation, status: reconciliation ? 'reconciliation-required' : 'pending',
    error: null, received: null, adoptedSources: {}, hydrated: false };
  const seed = initialCloudState(); seed.gate = 'active'; seed.generation = 7; seed.user = { ...QA_IDENTITIES.a };
  seed.accounts[QA_IDENTITIES.a.id] = { data: structuredClone(fixture.a1), revision: 1, sync };
  const store = createMemoryCloudStore(seed);
  const transport = async () => ({ status: async () => ({ revision: '10' }), lookupSource: async () => ({ operationId: null }),
    pull: async ({ afterRevision }: { afterRevision: string }) => afterRevision === '9' ? remotePage() : emptyPage('10'),
    push: async () => { throw new Error('phone should not push in this repro'); } });
  const engine = createSyncEngine({ store, context: () => context,
    isCurrent: c => c.userId === QA_IDENTITIES.a.id && c.generation === 7,
    guard: (root, c) => { if (root.user?.id !== c.userId || root.generation !== c.generation) throw new Error('context'); },
    transport, online: () => true });
  return { store, engine };
}

test('phone with reconciliation OFF pulls and shows the larger remote history (progress adopted)', async () => {
  const p = phone(false); await p.engine.drain(); p.engine.dispose();
  const state = await p.store.read(); const account = state.accounts[QA_IDENTITIES.a.id];
  assert.equal(account.sync?.revision, '10', 'pulled to remote revision');
  assert.ok(account.data.solves.some(s => s.id === fixture.newSolve.id), 'the desktop-pushed solve is now visible on the phone');
});

test('phone in reconciliation pulls into base but holds the remote out of account.data until the user resolves it', async () => {
  // This is one candidate mechanism for the field report, not proven to be the
  // one in production. When reconciliation is armed, the UI shows an explicit
  // "Revise seus dados para começar" prompt (PersistenceStatus/SyncReview), so
  // the field test is: does the phone show that prompt? If yes, this path; if the
  // phone shows no sync UI at all, it is running a stale (syncEnabled:false) bundle.
  const p = phone(true); await p.engine.drain(); p.engine.dispose();
  const state = await p.store.read(); const account = state.accounts[QA_IDENTITIES.a.id];
  assert.equal(account.sync?.revision, '10', 'the pull itself still advances base/revision');
  assert.equal(account.sync?.reconciliation, true, 'still reconciliation-required');
  assert.ok(!account.data.solves.some(s => s.id === fixture.newSolve.id), 'remote history is held back until reconciliation is resolved by the user');
});
