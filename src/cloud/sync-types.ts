import type { ContextHandle, Failure } from './types';
import type { SyncRecord } from '../data';

export type SyncStatus = 'unavailable' | 'pending' | 'syncing' | 'synced' | 'offline' | 'conflict' | 'error' | 'reconciliation-required';
export type Revision = string;
/** Versioned JSON-safe envelope. All user strings are UTF16 code units in hex. */
export type WireValue = ['null'] | ['bool', boolean] | ['number', string, string] | ['string', string] | ['array', WireValue[]] | ['object', [string, WireValue][]];
export interface SyncChange { action: 'set' | 'delete' | 'restore'; entity: SyncRecord['entity']; id: string; expectedRevision: Revision | null; record: WireValue | null }
export interface SyncOperation { protocolVersion: 1; domainVersion: 3; wireVersion: 1; operationId: string; requestDigest: string; baseRevision: Revision; changes: SyncChange[]; sourceDigest?: string }
export interface SyncReceipt { kind: 'applied'; operationId: string; requestDigest: string; commitRevision: Revision; changeCount: number }
export interface SyncRejected { kind: 'conflict'; operationId: string; requestDigest: string; currentRevision: Revision; reason: 'revision' | 'tombstone' | 'source-adopted' }
export interface SyncStoredRecord { entity: SyncRecord['entity']; id: string; revision: Revision; tombstone: boolean; record: WireValue | null }
export interface SyncCommitHeader { epoch: string; revision: Revision; previousRevision: Revision; operationId: string; requestDigest: string; transactionDigest: string; changeCount: number }
export interface SyncPullPage { epoch: string; upperBound: Revision; header: SyncCommitHeader | null; records: SyncStoredRecord[]; startOrdinal: number; nextOrdinal: number; complete: boolean; hasMore: boolean }
export interface SyncTransport {
  push(operation: SyncOperation): Promise<SyncReceipt | SyncRejected>;
  pull(input: { afterRevision: Revision; upperBound: Revision | null; ordinal: number }): Promise<SyncPullPage>;
  status(): Promise<{ revision: Revision }>;
  lookupSource?(sourceDigest: string): Promise<{ operationId: string | null }>;
}
export type SyncTransportFactory = (input: { context: ContextHandle; rpc: (name: string, args: Record<string, unknown>) => Promise<unknown> }) => SyncTransport;
export interface SyncConflict { id: string; operationId: string; reason: string; expectedRemoteRevision: Revision; localChangeCount: number; entities: SyncRecord['entity'][] }
export type SyncConflictsResult = { kind: 'conflicts'; conflicts: SyncConflict[] } | Failure;
export interface SyncCounts { sessions: number; solves: number; progress: number; study: number }
export interface ReconciliationPreview {
  previewId: string; source: 'account' | 'guest'; local: SyncCounts; remote: SyncCounts;
  collisions: number; sourceDigest: string; remoteRevision: Revision;
  warning: string;
}
export type ReconciliationResult = { kind: 'preview'; preview: ReconciliationPreview } | Failure;
export type SyncChoiceResult = { kind: 'queued'; operationId: string | null } | Failure;
export interface CloudSyncAPI {
  listSyncConflicts(context: ContextHandle): Promise<SyncConflictsResult>;
  resolveSyncConflict(input: { context: ContextHandle; conflictId: string; choice: 'remote' | 'local'; expectedRemoteRevision: Revision }): Promise<SyncChoiceResult>;
  previewAccountReconciliation(input: { context: ContextHandle }): Promise<ReconciliationResult>;
  confirmAccountReconciliation(input: { context: ContextHandle; previewId: string; choice: 'remote' | 'merge' }): Promise<SyncChoiceResult>;
  previewGuestAdoption(input: { context: ContextHandle }): Promise<ReconciliationResult>;
  confirmGuestAdoption(input: { context: ContextHandle; previewId: string }): Promise<SyncChoiceResult>;
}
