import { createInitialData, toSyncRecords } from '../data';
import type { CloudAtomicStore, CloudState } from './storage';
import type { ContextHandle } from './types';
import type { SyncOperation, SyncPullPage, SyncTransport } from './sync-types';
import { digest, encodeWire } from './codec';
import { equal, fold, keyOf, type SyncAccountState } from './sync-state';

export interface SyncEnginePorts {
  store: CloudAtomicStore;
  context(): ContextHandle | null;
  isCurrent(context: ContextHandle): boolean;
  guard(state: CloudState, context: ContextHandle): void;
  transport(context: ContextHandle): Promise<SyncTransport | null>;
  online(): boolean;
  intervalMs?: number;
  onError?(error: unknown, context: ContextHandle): Promise<void>;
  onHydrated?(context: ContextHandle): Promise<void>;
  autoAdopt?(context: ContextHandle): Promise<void>;
}
const revision = (value: string): bigint => { if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('Invalid revision'); return BigInt(value); };

export function createSyncEngine(ports: SyncEnginePorts) {
  let stopped = false; let running: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null; let failures = 0;
  const assert = (state: CloudState, context: ContextHandle) => {
    if (!ports.isCurrent(context)) throw new Error('Identity changed');
    ports.guard(state, context);
  };
  async function update(context: ContextHandle, callback: (sync: SyncAccountState, state: CloudState) => void) {
    await ports.store.transact(state => { assert(state, context); const sync = state.accounts[context.userId!]?.sync; if (!sync) throw new Error('Sync unavailable'); callback(sync, state); });
  }
  async function pull(context: ContextHandle, transport: SyncTransport) {
    let more = true; let cut: string | null = null;
    while (more && !stopped) {
      const state = await ports.store.read(); assert(state, context);
      const sync = state.accounts[context.userId!].sync!;
      const partial = sync.received;
      const page = await transport.pull({ afterRevision: sync.revision, upperBound: partial?.upperBound ?? cut, ordinal: partial?.nextOrdinal ?? 0 });
      validatePage(page, sync);
      const records = [...(partial?.records ?? []), ...page.records];
      if (page.header && page.complete && await digest(records) !== page.header.transactionDigest) throw new Error('Transaction digest mismatch');
      await update(context, (current, next) => {
        if (current.revision !== sync.revision || !equal(current.received, partial)) throw new Error('Concurrent pull; retry');
        if (!page.header) { current.hydrated = true; return; }
        current.epoch = page.epoch;
        if (!page.complete) { current.received = { header: page.header, upperBound: page.upperBound, nextOrdinal: page.nextOrdinal, records }; return; }
        const base = new Map(current.base.map(record => [keyOf(record), record]));
        for (const record of records) base.set(keyOf(record), record);
        const index = current.outbox.findIndex(entry => entry.id === page.header!.operationId);
        if (index >= 0) {
          const entry = current.outbox[index];
          if (!entry.operation || entry.operation.requestDigest !== page.header.requestDigest) throw new Error('Operation origin mismatch');
          if (entry.sourceDigest) current.adoptedSources[entry.sourceDigest] = entry.id;
          current.outbox.splice(index, 1);
        }
        current.base = [...base.values()]; current.revision = page.header.revision; current.received = null;
        // Internal first-use intent is conditional on an empty remote account.
        // Another device's first commit wins the account CAS. Never upload a
        // second default, and preserve all subsequent user intents/conflicts.
        current.outbox = current.outbox.filter(entry => !entry.bootstrap);
        if (!page.hasMore) current.hydrated = true;
        if (!current.reconciliation) {
          const account = next.accounts[context.userId!]; const projected = fold(current, account.data);
          if (!equal(projected, account.data)) {
            // Detect keys the user currently sees that vanish from the projection
            // without a matching server tombstone. This is the C1/C2 fingerprint:
            // a smaller projection silently replacing a larger local view. Archive
            // the pre-replacement data, then assign. Never refuse the assignment,
            // which would wedge sync; visibility loss is recoverable from here.
            const before = new Set(toSyncRecords(account.data).map(keyOf));
            const after = new Set(toSyncRecords(projected).map(keyOf));
            const tombstoned = new Set(current.base.filter(record => record.tombstone).map(keyOf));
            const dropped = [...before].filter(key => !after.has(key) && !tombstoned.has(key) && key !== 'settings:account');
            const log = (current.droppedProjections ??= []);
            const last = log[log.length - 1];
            // Bound to the last 20 distinct drops: growth is per remote commit, not
            // per poll, and repeated identical key-sets add no recovery information.
            if (dropped.length && !(last && equal(last.keys, dropped))) {
              log.push({ at: page.header.operationId, keys: dropped, previous: structuredClone(account.data) });
              if (log.length > 20) log.splice(0, log.length - 20);
            }
            account.data = projected; account.revision++;
          }
        }
      });
      cut = page.upperBound; more = page.hasMore || !page.complete;
    }
  }
  function validatePage(page: SyncPullPage, sync: SyncAccountState) {
    if (!page || typeof page.epoch !== 'string' || !Array.isArray(page.records) || page.records.length > 200 || revision(page.upperBound) < revision(sync.revision)) throw new Error('Invalid pull page');
    if (sync.epoch && sync.epoch !== page.epoch) throw new Error('Server epoch changed; recovery required');
    if (sync.received && (page.upperBound !== sync.received.upperBound || !equal(page.header, sync.received.header))) throw new Error('Mixed transaction fragments');
    if (!Number.isSafeInteger(page.startOrdinal) || !Number.isSafeInteger(page.nextOrdinal) || page.startOrdinal !== (sync.received?.nextOrdinal ?? 0) || page.nextOrdinal !== page.startOrdinal + page.records.length) throw new Error('Ordinal gap');
    if (!page.header) { if (page.records.length || !page.complete || page.hasMore || page.upperBound !== sync.revision) throw new Error('Missing commit'); return; }
    const head = page.header;
    if (page.complete && page.hasMore !== (revision(head.revision) < revision(page.upperBound))) throw new Error('Incomplete confirmed upper bound');
    if (head.epoch !== page.epoch || head.previousRevision !== sync.revision || revision(head.revision) !== revision(sync.revision) + 1n || revision(head.revision) > revision(page.upperBound) || page.nextOrdinal > head.changeCount || page.complete !== (page.nextOrdinal === head.changeCount) || (!page.complete && !page.records.length)) throw new Error('Invalid commit range');
    const keys = new Set<string>();
    for (const record of [...(sync.received?.records ?? []), ...page.records]) {
      if (record.revision !== head.revision || keys.has(keyOf(record)) || record.tombstone !== (record.record === null)) throw new Error('Invalid changed record');
      keys.add(keyOf(record));
    }
  }
  async function cycle() {
    const context = ports.context(); if (!context?.userId || stopped || !ports.isCurrent(context)) return;
    try {
      if (!ports.online()) { await update(context, sync => { sync.status = 'offline'; }); return; }
      const transport = await ports.transport(context); if (!transport) return;
      await update(context, sync => { sync.status = 'syncing'; sync.error = null; sync.hydrated = false; });
      await pull(context, transport);
      // Safe auto-adoption: if reconciliation is armed only because of local state
      // that is a strict subset of the pulled remote, adopt it without a prompt.
      await ports.autoAdopt?.(context);
      await ports.onHydrated?.(context);
      for (let count = 0; count < 100 && !stopped; count++) {
        const state = await ports.store.read(); assert(state, context);
        const sync = state.accounts[context.userId].sync!;
        if (sync.reconciliation) break;
        const entry = sync.outbox[0]; if (!entry || entry.conflict) break;
        if (entry.receipt) { await pull(context, transport); break; }
        if (!entry.operation) {
          const revisions = new Map(sync.base.map(record => [keyOf(record), record]));
          const payload = { protocolVersion: 1 as const, domainVersion: 3 as const, wireVersion: 1 as const, kind: entry.sourceDigest ? 'adoption' as const : 'mutation' as const, operationId: entry.id, baseRevision: sync.revision, changes: entry.changes.map(change => ({ entity: change.entity, id: change.id, action: !change.after ? 'delete' as const : change.restore ? 'restore' as const : 'set' as const, expectedRevision: revisions.get(keyOf(change))?.revision ?? null, record: change.after ? encodeWire(change.after) : null })), ...(entry.sourceDigest ? { sourceDigest: entry.sourceDigest } : {}) };
          // An empty account still needs the settings record when first written.
          if (sync.revision === '0' && !payload.changes.some(change => change.entity === 'settings')) {
            const settings = toSyncRecords(createInitialData()).find(record => record.entity === 'settings')!;
            payload.changes.push({ entity: 'settings', id: 'account', action: 'set', expectedRevision: null, record: encodeWire(settings) });
          }
          const operation: SyncOperation = { ...payload, requestDigest: await digest(payload) };
          await update(context, current => { const first = current.outbox[0]; if (first?.id !== entry.id || current.revision !== sync.revision) throw new Error('Concurrent queue change'); first.operation ??= operation; });
          continue;
        }
        // Gate read immediately before dispatch, plus isCurrent after any await.
        assert(await ports.store.read(), context);
        const receipt = await transport.push(entry.operation);
        if (receipt.operationId !== entry.id || receipt.requestDigest !== entry.operation.requestDigest) throw new Error('Invalid receipt origin');
        await update(context, current => {
          const queued = current.outbox.find(item => item.id === entry.id);
          if (!queued) return; // A concurrent pull already proved this operation.
          if (receipt.kind === 'applied') queued.receipt = receipt;
          else queued.conflict = 'O servidor recebeu uma revisão diferente. Revise o conflito.';
        });
        await pull(context, transport);
      }
      await update(context, sync => { sync.status = sync.reconciliation ? 'reconciliation-required' : sync.outbox.some(entry => entry.conflict) ? 'conflict' : sync.outbox.length ? 'pending' : 'synced'; });
      failures = 0;
    } catch (error) {
      failures++;
      if (ports.isCurrent(context)) {
        await ports.onError?.(error, context);
        if (ports.isCurrent(context)) try { await update(context, sync => { sync.status = ports.online() ? 'error' : 'offline'; sync.error = 'Não foi possível confirmar a sincronização. Os dados locais e a fila foram preservados.'; }); } catch { /* A closed gate cannot publish old account status. */ }
      }
    }
  }
  function trigger() {
    if (stopped || running) return;
    if (timer) clearTimeout(timer);
    running = cycle().finally(() => { running = null; if (!stopped) { timer = setTimeout(trigger, Math.min(60_000, (ports.intervalMs ?? 15_000) * 2 ** Math.min(failures, 3))); (timer as unknown as { unref?: () => void }).unref?.(); } });
  }
  const event = () => trigger();
  if (typeof window !== 'undefined') { window.addEventListener('online', event); window.addEventListener('focus', event); }
  return { trigger, async drain() { trigger(); await running; }, dispose() { stopped = true; if (timer) clearTimeout(timer); if (typeof window !== 'undefined') { window.removeEventListener('online', event); window.removeEventListener('focus', event); } } };
}
