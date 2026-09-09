import { createInitialData, projectSyncRecords, toSyncAccountData } from '../data';
import type { AppData } from '../domain/types';
import type { CloudAtomicStore, CloudState } from './storage';
import type { CloudSyncAPI, SyncCounts, SyncTransport } from './sync-types';
import type { ContextHandle, Failure } from './types';
import { digest } from './codec';
import { diffRecords, equal, fold, keyOf, liveBase, type SyncAccountState } from './sync-state';

interface Ports {
  store: CloudAtomicStore; guard(state: CloudState, context: ContextHandle): void;
  after<T>(context: ContextHandle, result: T, publish?: boolean): Promise<T | Failure>;
  idle(state: CloudState): void; randomId(): string; drain(): Promise<void>; trigger(): void;
  transport(context: ContextHandle): Promise<SyncTransport | null>;
}
const counts = (data: AppData): SyncCounts => ({ sessions: data.sessions.length, solves: data.solves.length, progress: Object.keys(data.progress).length, study: data.studyAttempts.length });
const failed = (error: unknown): Failure => ({ kind: 'error', code: 'invalid', message: error instanceof Error ? error.message : 'Não foi possível concluir a escolha.' });
function projected(records: ReturnType<typeof liveBase>, previous: AppData): AppData {
  if (!records.length) return createInitialData();
  const result = projectSyncRecords(records, previous);
  if (result.kind !== 'projected') throw new Error('Limite da projeção excedido. Fonte preservada.');
  return result.data;
}
function merge(remote: AppData, source: AppData, id: () => string): { data: AppData; collisions: number } {
  const data = structuredClone(remote); let collisions = 0;
  const sessions = new Map(data.sessions.map(session => [session.id, session])); const remap = new Map<string, string>();
  for (const session of source.sessions) {
    const existing = sessions.get(session.id);
    if (existing && equal(existing, session)) { remap.set(session.id, session.id); continue; }
    const next = { ...session, id: existing ? id() : session.id }; if (existing) collisions++;
    remap.set(session.id, next.id); sessions.set(next.id, next); data.sessions.push(next);
  }
  for (const solve of source.solves) {
    const next = { ...solve, sessionId: remap.get(solve.sessionId)! }; const existing = data.solves.find(item => item.id === next.id);
    if (existing && equal(existing, next)) continue;
    if (existing) { next.id = id(); collisions++; } data.solves.push(next);
  }
  for (const attempt of source.studyAttempts) {
    const existing = data.studyAttempts.find(item => item.id === attempt.id);
    if (existing && equal(existing, attempt)) continue;
    if (existing) collisions++; data.studyAttempts.push({ ...attempt, id: existing ? id() : attempt.id });
  }
  for (const [key, value] of Object.entries(source.progress)) { if (data.progress[key] && !equal(data.progress[key], value)) collisions++; data.progress[key] = value; }
  data.settings = structuredClone(source.settings);
  // Validate actual serialization and both selection budgets through the domain.
  toSyncAccountData(data);
  return { data, collisions };
}
/** Safe auto-adoption predicate for Causa 2. WIRED to production: the sync engine
 * calls the reducer below after a pull to auto-hydrate a subset device. True only
 * when merging the local snapshot into the remote projection changes nothing at
 * all: every local record is already in remote with an equal value, settings
 * match, and there are zero collisions. When true, the local state is a strict
 * subset of remote and adopting `remote` loses no local data. Any real divergence
 * (a local-only record, a differing value, differing settings) makes merge add or
 * rename something, so this is false and the choice flow must stay. `randomId` is
 * only reached on a collision, which already fails the equality, so the constant
 * never affects the verdict. merge/projected validate through the domain and can
 * throw near the size ceiling; a throw here must not become a recurring sync
 * error that hides the choice, so it is caught and treated as "not a subset". */
export function isLocalSubsetOfRemote(remote: AppData, local: AppData): boolean {
  try {
    const plan = merge(remote, local, () => 'x0collisionplaceholder');
    return plan.collisions === 0 && equal(plan.data, remote);
  } catch { return false; }
}
/** Safe auto-adoption reducer for Causa 2. When a device sits in reconciliation
 * only because it carried local state, and that local state is a strict subset of
 * the pulled remote (nothing to lose), adopt the remote WITHOUT a user choice:
 * archive the pre-replacement view like confirm('remote'), surface the remote,
 * and clear reconciliation. Any real divergence leaves reconciliation intact so
 * the choice flow stays — blind adoption would erase local data. Runs only with a
 * hydrated account and an EMPTY outbox (a non-empty queue is divergence by
 * definition). Returns true iff it adopted. Reuses the single subset oracle. */
export function autoAdoptSubsetReconciliation(account: { data: AppData; revision: number; sync?: SyncAccountState; syncNeedsReconciliation?: boolean }, randomId: () => string): boolean {
  const sync = account.sync;
  if (!sync || !sync.reconciliation || !sync.hydrated || sync.received || sync.outbox.length) return false;
  // projected() validates through the domain and can throw near the size ceiling.
  // A throw must leave reconciliation intact (the choice flow stays), never wedge
  // the cycle into a recurring sync error, so failure means "do not auto-adopt".
  let remote: AppData;
  try { remote = projected(liveBase(sync), account.data); } catch { return false; }
  if (!isLocalSubsetOfRemote(remote, account.data)) return false;
  const archive = (sync.reconciliationArchive ??= {});
  archive[randomId()] = { sourceSnapshot: structuredClone(account.data), outbox: [], sourceDigest: 'auto-adopt', replaced: structuredClone(account.data) };
  const keys = Object.keys(archive); if (keys.length > 20) delete archive[keys[0]];
  account.data = remote; account.revision++; sync.reconciliation = false; account.syncNeedsReconciliation = false;
  sync.status = 'synced';
  return true;
}
export function createSyncActions(ports: Ports): CloudSyncAPI {
  async function failFor(context: ContextHandle, error: unknown): Promise<Failure> {
    try { return await ports.after(context, failed(error)); } catch (failure) { return failed(failure); }
  }
  function requireHydrated(sync: SyncAccountState) {
    if (!sync.hydrated || sync.received || sync.error || ['syncing','error','offline','unavailable'].includes(sync.status)) throw new Error('A base remota ainda não foi confirmada. Reconecte e tente novamente.');
  }
  function account(state: CloudState, context: ContextHandle) {
    ports.guard(state, context); ports.idle(state);
    if (!context.userId || !state.accounts[context.userId]?.sync) throw new Error('Sincronização de conta indisponível.');
    return state.accounts[context.userId];
  }
  async function preview(context: ContextHandle, source: 'account' | 'guest') {
    try {
      await ports.drain();
      const state = await ports.store.read(); const current = account(state, context); const sync = current.sync!;
      requireHydrated(sync);
      const sourceSnapshot = structuredClone(source === 'guest' ? state.guest?.data : current.data);
      if (!sourceSnapshot || (source === 'guest' && state.guestError)) throw new Error('Recupere a fonte visitante antes da adoção.');
      const sourceDigest = await digest({ source, data: toSyncAccountData(sourceSnapshot) });
      if (sync.adoptedSources[sourceDigest]) throw new Error('Esta fonte já foi adotada nesta conta.');
      const transport = await ports.transport(context);
      if (!transport?.lookupSource) throw new Error('Conecte-se ao serviço para verificar adoções anteriores.');
      if ((await transport.lookupSource(sourceDigest)).operationId) throw new Error('Esta fonte já foi adotada nesta conta no servidor.');
      const remote = projected(liveBase(sync), current.data); const plan = merge(remote, sourceSnapshot, ports.randomId); const previewId = ports.randomId();
      await ports.store.transact(next => {
        const currentNext = account(next, context);
        requireHydrated(currentNext.sync!);
        if (currentNext.revision !== current.revision || currentNext.sync!.revision !== sync.revision || !equal(currentNext.sync!.outbox, sync.outbox)) throw new Error('Os dados mudaram. Gere nova prévia.');
        const previews = currentNext.sync!.previews ??= {};
        // One active preview per source, preserving already adopted sources.
        for (const [key, old] of Object.entries(previews)) if (old.source === source) delete previews[key];
        previews[previewId] = { generation: context.generation, localRevision: current.revision, remoteRevision: sync.revision, source, sourceDigest, sourceSnapshot, merged: plan.data, remote, queueSnapshot: structuredClone(sync.outbox) };
      });
      return await ports.after(context, { kind: 'preview' as const, preview: { previewId, source, local: counts(sourceSnapshot), remote: counts(remote), collisions: plan.collisions, sourceDigest, remoteRevision: sync.revision, warning: 'Mesclar preserva registros com IDs diferentes, renomeia colisões e usa progresso e configurações desta fonte. A fonte confirmada é um snapshot; dados posteriores continuam separados.' } });
    } catch (error) { return failFor(context, error); }
  }
  async function confirm(context: ContextHandle, previewId: string, choice: 'remote' | 'merge', source: 'account' | 'guest') {
    try {
      const operationId = ports.randomId();
      const result = await ports.store.transact(state => {
        const current = account(state, context); const sync = current.sync!; const plan = sync.previews?.[previewId];
        requireHydrated(sync);
        if (!plan || plan.source !== source || plan.generation !== context.generation || plan.localRevision !== current.revision || plan.remoteRevision !== sync.revision) throw new Error('Prévia expirada ou dados alterados. Revise novamente.');
        if (!equal(sync.outbox, plan.queueSnapshot)) throw new Error('A fila mudou. Gere nova prévia.');
        if (sync.outbox.length && (source !== 'account' || !sync.reconciliation)) throw new Error('Conclua ou resolva a fila antes de adotar outra fonte.');
        if (sync.adoptedSources[plan.sourceDigest]) throw new Error('Fonte já adotada.');
        const next = choice === 'remote' ? plan.remote : plan.merged;
        const changes = diffRecords(plan.remote, next, liveBase(sync));
        // Archive the exact pre-replacement local view unconditionally: it is the
        // only copy of edits made between preview and confirm, and of any local
        // records not represented in the queue. Preserve the queue too when non-empty.
        const archive = (sync.reconciliationArchive ??= {});
        archive[previewId] = { sourceSnapshot: plan.sourceSnapshot, outbox: structuredClone(sync.outbox), sourceDigest: plan.sourceDigest, replaced: structuredClone(current.data) };
        // Bound the archive to the newest 20 reconciliations; oldest fall off.
        const keys = Object.keys(archive); if (keys.length > 20) delete archive[keys[0]];
        if (sync.outbox.length) sync.outbox = [];
        current.data = next; current.revision++; sync.reconciliation = false; current.syncNeedsReconciliation = false;
        if (changes.length) sync.outbox.push({ id: operationId, changes, sourceDigest: plan.sourceDigest });
        else sync.adoptedSources[plan.sourceDigest] = operationId;
        // Keep the exact source for crash recovery; never erase guest/source bytes.
        sync.status = changes.length ? 'pending' : 'synced';
        return { kind: 'queued' as const, operationId: changes.length ? operationId : null };
      });
      ports.trigger(); return await ports.after(context, result, true);
    } catch (error) { return failFor(context, error); }
  }
  return {
    previewAccountReconciliation: input => preview({ ...input.context }, 'account'),
    previewGuestAdoption: input => preview({ ...input.context }, 'guest'),
    confirmAccountReconciliation: input => confirm({ ...input.context }, input.previewId, input.choice, 'account'),
    confirmGuestAdoption: input => confirm({ ...input.context }, input.previewId, 'merge', 'guest'),
    listSyncConflicts: async suppliedContext => {
      const context = { ...suppliedContext };
      try { const state = await ports.store.read(); const current = account(state, context); return await ports.after(context, { kind: 'conflicts' as const, conflicts: current.sync!.outbox.filter(entry => entry.conflict).map(entry => ({ id: entry.id, operationId: entry.id, reason: entry.conflict!, expectedRemoteRevision: current.sync!.revision, localChangeCount: entry.changes.length, entities: [...new Set(entry.changes.map(change => change.entity))] })) }); } catch (error) { return failFor(context, error); }
    },
    resolveSyncConflict: async input => {
      const context = { ...input.context };
      const { conflictId, choice, expectedRemoteRevision } = input;
      try {
        const operationId = ports.randomId();
        const result = await ports.store.transact(state => {
          const current = account(state, context); const sync = current.sync!;
          if (sync.revision !== expectedRemoteRevision) throw new Error('O servidor mudou. Revise o conflito novamente.');
          const index = sync.outbox.findIndex(entry => entry.id === conflictId && entry.conflict);
          if (index < 0) throw new Error('Conflito não disponível.');
          const entry = sync.outbox[index];
          if (choice === 'remote') {
            const archive = (sync.discardedConflicts ??= []);
            archive.push({ at: operationId, entry: structuredClone(entry) });
            if (archive.length > 50) archive.splice(0, archive.length - 50);
            sync.outbox.splice(index, 1);
          }
          else {
            const base = new Map(liveBase(sync).map(record => [keyOf(record), record]));
            sync.outbox[index] = { id: operationId, changes: entry.changes.map(change => ({ ...change, before: base.get(keyOf(change)) ?? null, restore: !!change.after && sync.base.some(record => keyOf(record) === keyOf(change) && record.tombstone) })), sourceDigest: entry.sourceDigest };
          }
          current.data = fold(sync, current.data); current.revision++; sync.status = 'pending';
          return { kind: 'queued' as const, operationId: choice === 'remote' ? null : operationId };
        });
        ports.trigger(); return await ports.after(context, result, true);
      } catch (error) { return failFor(context, error); }
    },
  };
}
