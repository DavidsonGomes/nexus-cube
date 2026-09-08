import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import type { AppData } from '../../src/domain/types';
import type { SyncRecord } from '../../src/data/sync-projection';
import type { SyncPullPage, SyncStoredRecord, WireValue } from '../../src/cloud/sync-types';

/** Independent encoding for fixture construction: Buffer, never product codec/hash. */
export function oracleWire(value: unknown): WireValue {
  const text = (input: string) => Buffer.from(input, 'utf16le').swap16().toString('hex');
  if (value === null) return ['null'];
  if (typeof value === 'boolean') return ['bool', value];
  if (typeof value === 'string') return ['string', text(value)];
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = value === 0 ? 0 : value, bytes = Buffer.alloc(8);
    bytes.writeDoubleBE(normalized);
    return ['number', bytes.toString('hex'), JSON.stringify(normalized)];
  }
  if (Array.isArray(value)) return ['array', Array.from(value, oracleWire)];
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return ['object', Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [text(key), oracleWire(child)])];
  throw new Error('Unsupported independent fixture value');
}

export const oracleDigest = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(oracleWire(value)), 'ascii').digest('hex')}`;

export function fixtureRecords(data: AppData): SyncRecord[] {
  return [
    ...data.sessions.map((value, i): SyncRecord => ({ entity: 'session', id: value.id, value, listPosition: String(i) })),
    ...data.solves.map((value, i): SyncRecord => ({ entity: 'solve', id: value.id, value, listPosition: String(i) })),
    ...Object.values(data.progress).map((value, i): SyncRecord => ({ entity: 'progress', id: value.caseId, value, listPosition: String(i) })),
    ...data.studyAttempts.map((value, i): SyncRecord => ({ entity: 'study', id: value.id, value, listPosition: String(i) })),
    { entity: 'settings', id: 'account', value: data.settings, listPosition: null },
  ];
}

export const fixtureBase = (data: AppData, revision = '9'): SyncStoredRecord[] => fixtureRecords(data).map(record => ({ entity: record.entity, id: record.id, revision, tombstone: false, record: oracleWire(record) }));
export const emptyPage = (revision: string): SyncPullPage => ({ epoch: 'synthetic-epoch', upperBound: revision, header: null, records: [], startOrdinal: 0, nextOrdinal: 0, complete: true, hasMore: false });

export function fixturePage(records: SyncStoredRecord[], origin: { operationId: string; requestDigest: string }, revision = '10', previousRevision = '9'): SyncPullPage {
  return { epoch: 'synthetic-epoch', upperBound: revision,
    header: { epoch: 'synthetic-epoch', revision, previousRevision, ...origin, transactionDigest: oracleDigest(records), changeCount: records.length },
    records: structuredClone(records), startOrdinal: 0, nextOrdinal: records.length, complete: true, hasMore: false };
}
