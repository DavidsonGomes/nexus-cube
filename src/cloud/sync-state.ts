import { createInitialData, toSyncRecords, projectSyncRecords, type SyncRecord } from '../data';
import type { AppData } from '../domain/types';
import type { SyncCommitHeader, SyncOperation, SyncReceipt, SyncStatus, SyncStoredRecord } from './sync-types';
import { decodeWire } from './codec';

export interface LocalChange { entity: SyncRecord['entity']; id: string; before: SyncRecord | null; after: SyncRecord | null; restore?: boolean }
export interface OutboxEntry { id: string; changes: LocalChange[]; operation?: SyncOperation; receipt?: SyncReceipt; conflict?: string; sourceDigest?: string; bootstrap?: boolean }
export interface SyncAccountState {
  version: 1; revision: string; epoch: string | null; base: SyncStoredRecord[]; outbox: OutboxEntry[];
  reconciliation: boolean; status: SyncStatus; error: string | null;
  received: { header: SyncCommitHeader; upperBound: string; nextOrdinal: number; records: SyncStoredRecord[] } | null;
  adoptedSources: Record<string, string>;
  hydrated?: boolean;
  previews?: Record<string, { generation: number; localRevision: number; remoteRevision: string; source: 'account' | 'guest'; sourceDigest: string; sourceSnapshot: AppData; merged: AppData; remote: AppData; queueSnapshot: OutboxEntry[] }>;
  reconciliationArchive?: Record<string, { sourceSnapshot: AppData; outbox: OutboxEntry[]; sourceDigest: string }>;
}
export const keyOf = (record: { entity: string; id: string }) => `${record.entity}:${record.id}`;
/** Object insertion order is not domain data. Array order and key presence are.
 * JS numeric equality preserves binary64 values, with persisted -0 == +0.
 */
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (Object.hasOwn(a, i) !== Object.hasOwn(b, i) || !equal(a[i], b[i])) return false;
    return true;
  }
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
export function initialSyncState(reconciliation: boolean): SyncAccountState {
  return { version: 1, revision: '0', epoch: null, base: [], outbox: [], reconciliation, status: reconciliation ? 'reconciliation-required' : 'pending', error: null, received: null, adoptedSources: {} };
}
export function diffRecords(before: AppData, after: AppData, reference: SyncRecord[] = []): LocalChange[] {
  const positions = new Map(reference.map(record => [keyOf(record), record.listPosition]));
  const oldRecords = new Map(toSyncRecords(before).map(record => [keyOf(record), { ...record, listPosition: positions.get(keyOf(record)) ?? record.listPosition } as SyncRecord]));
  const nextRecords = toSyncRecords(after);
  const previous = new Map<string, bigint>();
  for (let index = 0; index < nextRecords.length; index++) {
    const record = nextRecords[index]; if (record.entity === 'settings') continue;
    const prev = previous.get(record.entity) ?? -1n;
    const existing = oldRecords.get(keyOf(record))?.listPosition;
    let position = existing == null ? null : BigInt(existing);
    if (position === null || position <= prev) {
      let upper: bigint | null = null;
      for (let next = index + 1; next < nextRecords.length; next++) {
        if (nextRecords[next].entity !== record.entity) continue;
        const candidate = oldRecords.get(keyOf(nextRecords[next]))?.listPosition;
        if (candidate != null && BigInt(candidate) > prev + 1n) { upper = BigInt(candidate); break; }
      }
      position = upper === null ? prev + 4294967296n : (prev + upper) / 2n;
    }
    if (position > 18446744073709551615n) throw new Error('Position space exhausted');
    record.listPosition = position.toString(); previous.set(record.entity, position);
  }
  const newRecords = new Map(nextRecords.map(record => [keyOf(record), record]));
  const result: LocalChange[] = [];
  for (const key of new Set([...oldRecords.keys(), ...newRecords.keys()])) {
    const a = oldRecords.get(key) ?? null; const b = newRecords.get(key) ?? null;
    if (!equal(a, b)) result.push({ entity: (a ?? b)!.entity, id: (a ?? b)!.id, before: a, after: b });
  }
  return result;
}
export function enqueueChange(account: { data: AppData; sync?: SyncAccountState }, before: AppData, after: AppData, operationId: string) {
  const sync = account.sync; if (!sync || sync.reconciliation) return;
  const reference = new Map(liveBase(sync).map(record => [keyOf(record), record]));
  for (const entry of sync.outbox) for (const change of entry.changes) { if (change.after) reference.set(keyOf(change), change.after); else reference.delete(keyOf(change)); }
  const changes = diffRecords(before, after, [...reference.values()]);
  if (!changes.length) return;
  sync.outbox.push({ id: operationId, changes }); sync.status = 'pending'; sync.error = null;
}
export function liveBase(sync: SyncAccountState): SyncRecord[] {
  return sync.base.filter(record => !record.tombstone).map(record => decodeWire(record.record) as SyncRecord);
}
/** Remove proven operations before folding. Never infer acceptance from equal values. */
export function fold(sync: SyncAccountState, previous: AppData): AppData {
  const records = new Map(liveBase(sync).map(record => [keyOf(record), record]));
  if (!records.has('settings:account')) for (const record of toSyncRecords(createInitialData())) records.set(keyOf(record), record);
  let blocked = false;
  for (const entry of sync.outbox) {
    if (blocked) continue;
    if (entry.conflict || entry.changes.some(change => !equal(records.get(keyOf(change)) ?? null, change.before))) {
      entry.conflict ??= 'Os mesmos dados mudaram no servidor. Escolha qual versão manter.';
      blocked = true; continue;
    }
    for (const change of entry.changes) { if (change.after) records.set(keyOf(change), change.after); else records.delete(keyOf(change)); }
  }
  const projection = projectSyncRecords([...records.values()], previous);
  if (projection.kind !== 'projected') throw new Error('Capacidade da projeção excedida. Dados e fila preservados.');
  return projection.data;
}
