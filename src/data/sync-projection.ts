import type { AppData, CaseProgress, Session, Settings, Solve, StudyAttempt } from '../domain/types';
import { BACKUP_ENVELOPE_OVERHEAD_BYTES, MAX_ACCOUNT_SNAPSHOT_BYTES, MAX_BACKUP_BYTES, MAX_SNAPSHOT_BYTES, saveData, utf8ByteLength, validateData } from './store';

/** Domain snapshot only. Transport, revisions and tombstones belong to cloud. */
export type SyncAccountDataV3 = Omit<AppData, 'activeSessionId'>;
/** Domain entities plus ordering only; no transport/revision metadata. */
export type SyncRecord =
  | { entity: 'session'; id: string; value: Session; listPosition: string }
  | { entity: 'solve'; id: string; value: Solve; listPosition: string }
  | { entity: 'progress'; id: string; value: CaseProgress; listPosition: string }
  | { entity: 'study'; id: string; value: StudyAttempt; listPosition: string }
  | { entity: 'settings'; id: 'account'; value: Settings; listPosition: null };
export type SyncSelectionChange = 'none' | 'removed' | 'mode-changed';
export interface SyncProjectionBytes {
  snapshotWithNullBytes: number;
  snapshotWithLongestSelectionBytes: number;
  backupWithNullBytes: number;
  backupWithLongestSelectionBytes: number;
  selectionExtraBytes: number;
  longestActiveSessionId: string | null;
  snapshotLimitBytes: number;
  accountLimitBytes: number;
  backupLimitBytes: number;
  fitsWithNull: boolean;
  fitsAllSelections: boolean;
}
export type SyncProjectionResult =
  | { kind: 'projected'; data: AppData; selectionChange: SyncSelectionChange; bytes: SyncProjectionBytes }
  | { kind: 'capacity-blocked'; reason: 'account-limit' | 'selection-reserve-required'; selectionChange: SyncSelectionChange; bytes: SyncProjectionBytes };

const accountKeys = ['version', 'sessions', 'solves', 'progress', 'studyAttempts', 'settings'];

function requireV3(value: unknown): asserts value is AppData {
  if (!value || typeof value !== 'object' || (value as {version?:unknown}).version !== 3) throw new Error('Sincronização exige domínio V3 explícito.');
}
function accountWithNull(value: unknown): AppData {
  requireV3(value);
  if (Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== accountKeys.length || accountKeys.some(key => !Object.hasOwn(value, key))) {
    throw new Error('Snapshot de conta inválido: seleção local, campos extras ou campos ausentes.');
  }
  // Source schema is checked before any projection; no legacy migration here.
  return validateData({ ...value, activeSessionId: null });
}
function measure(data: AppData): SyncProjectionBytes {
  let longestActiveSessionId: string | null = null;
  for (const session of data.sessions) {
    if (longestActiveSessionId === null || session.id.length > longestActiveSessionId.length) longestActiveSessionId = session.id;
  }
  const snapshotWithNullBytes = utf8ByteLength(JSON.stringify({ ...data, activeSessionId: null }));
  const snapshotWithLongestSelectionBytes = utf8ByteLength(JSON.stringify({ ...data, activeSessionId: longestActiveSessionId }));
  // With a one-character ID, null is larger. The guard must include null too.
  const largestSnapshotBytes = Math.max(snapshotWithNullBytes, snapshotWithLongestSelectionBytes);
  const backupWithNullBytes = snapshotWithNullBytes + BACKUP_ENVELOPE_OVERHEAD_BYTES;
  const backupWithLongestSelectionBytes = snapshotWithLongestSelectionBytes + BACKUP_ENVELOPE_OVERHEAD_BYTES;
  return {
    snapshotWithNullBytes, snapshotWithLongestSelectionBytes, backupWithNullBytes, backupWithLongestSelectionBytes,
    selectionExtraBytes: Math.max(0, snapshotWithLongestSelectionBytes - snapshotWithNullBytes), longestActiveSessionId,
    snapshotLimitBytes: MAX_SNAPSHOT_BYTES, accountLimitBytes: MAX_ACCOUNT_SNAPSHOT_BYTES, backupLimitBytes: MAX_BACKUP_BYTES,
    fitsWithNull: snapshotWithNullBytes <= MAX_ACCOUNT_SNAPSHOT_BYTES && backupWithNullBytes <= MAX_BACKUP_BYTES,
    fitsAllSelections: snapshotWithNullBytes <= MAX_ACCOUNT_SNAPSHOT_BYTES && largestSnapshotBytes <= MAX_SNAPSHOT_BYTES && largestSnapshotBytes + BACKUP_ENVELOPE_OVERHEAD_BYTES <= MAX_BACKUP_BYTES,
  };
}

/** Measures both legal local extremes; does not silently reserve space or mutate. */
export function preflightSyncProjection(account: unknown): SyncProjectionBytes {
  return measure(accountWithNull(account));
}

/** Full local serialization is validated, including the actual selection budget. */
export function toSyncAccountData(data: AppData): SyncAccountDataV3 {
  requireV3(data);
  let snapshot = '';
  saveData(data, { getItem: () => null, setItem: (_key, text) => { snapshot = text; } });
  const { activeSessionId: _local, ...account } = JSON.parse(snapshot) as AppData;
  return account;
}

/** Incoming settings are account data. The local selection is never uploaded. */
export function projectSyncAccountData(account: unknown, previousLocal: AppData): SyncProjectionResult {
  requireV3(previousLocal);
  const previous = validateData(previousLocal);
  const incoming = accountWithNull(account);
  const bytes = measure(incoming);
  let activeSessionId = previous.activeSessionId;
  let selectionChange: SyncSelectionChange = 'none';
  if (activeSessionId !== null) {
    const before = previous.sessions.find(session => session.id === activeSessionId)!;
    const after = incoming.sessions.find(session => session.id === activeSessionId);
    if (!after) { activeSessionId = null; selectionChange = 'removed'; }
    else if (after.mode !== before.mode) { activeSessionId = null; selectionChange = 'mode-changed'; }
  }
  if (!bytes.fitsAllSelections) {
    return { kind: 'capacity-blocked', reason: bytes.fitsWithNull ? 'selection-reserve-required' : 'account-limit', selectionChange, bytes };
  }
  // Canonical JSON matches save/export, including -0 normalization, without writes.
  const data = JSON.parse(JSON.stringify({ ...incoming, activeSessionId })) as AppData;
  return { kind: 'projected', data, selectionChange, bytes };
}

export function toSyncRecords(data: AppData): SyncRecord[] {
  const account = toSyncAccountData(data);
  return [
    ...account.sessions.map((value, index): SyncRecord => ({ entity: 'session', id: value.id, value, listPosition: String(index) })),
    ...account.solves.map((value, index): SyncRecord => ({ entity: 'solve', id: value.id, value, listPosition: String(index) })),
    ...Object.values(account.progress).map((value, index): SyncRecord => ({ entity: 'progress', id: value.caseId, value, listPosition: String(index) })),
    ...account.studyAttempts.map((value, index): SyncRecord => ({ entity: 'study', id: value.id, value, listPosition: String(index) })),
    { entity: 'settings', id: 'account', value: account.settings, listPosition: null },
  ];
}

function recordsAccount(records: unknown): SyncAccountDataV3 {
  if (!Array.isArray(records) || records.length > 201186) throw new Error('Coleção de entidades inválida ou excessiva.');
  const groups = new Map<string, { id: string; value: unknown; position: bigint }[]>();
  const ids = new Set<string>(), positions = new Set<string>();
  let settings: unknown;
  for (const record of records) {
    if (!record || typeof record !== 'object' || Object.getPrototypeOf(record) !== Object.prototype || Object.keys(record).length !== 4 || ['entity','id','value','listPosition'].some(key => !Object.hasOwn(record,key))) throw new Error('Entidade com campos ausentes ou extras.');
    if (!['session','solve','progress','study','settings'].includes(record.entity) || typeof record.id !== 'string' || !record.value || typeof record.value !== 'object' || Array.isArray(record.value)) throw new Error('Tipo, identificador ou valor de entidade inválido.');
    const key = JSON.stringify([record.entity,record.id]);
    if (ids.has(key)) throw new Error('Identificador de entidade duplicado.');
    ids.add(key);
    if (record.entity === 'settings') {
      if (record.id !== 'account' || record.listPosition !== null) throw new Error('Configurações exigem id account e posição null.');
      settings = record.value; continue;
    }
    if (record.id !== record.value[record.entity === 'progress' ? 'caseId' : 'id']) throw new Error('Identificador difere do valor da entidade.');
    if (typeof record.listPosition !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(record.listPosition) || BigInt(record.listPosition) > 18446744073709551615n) throw new Error('Posição exige string decimal uint64 canônica.');
    const positionKey = JSON.stringify([record.entity,record.listPosition]);
    if (positions.has(positionKey)) throw new Error('Posição duplicada na coleção.');
    positions.add(positionKey);
    const group = groups.get(record.entity) ?? [];
    group.push({id:record.id,value:record.value,position:BigInt(record.listPosition)});groups.set(record.entity,group);
  }
  const ordered = (entity:string) => (groups.get(entity) ?? []).sort((a,b) => a.position < b.position ? -1 : a.position > b.position ? 1 : 0);
  const data = accountWithNull({version:3,sessions:ordered('session').map(r=>r.value),solves:ordered('solve').map(r=>r.value),
    progress:Object.fromEntries(ordered('progress').map(r=>[r.id,r.value])),studyAttempts:ordered('study').map(r=>r.value),settings});
  const {activeSessionId:_local,...account} = data;
  return account;
}

/** Complete live collection only. Caller must inspect byte flags before commit. */
export function validateSyncRecords(records: unknown): {data: AppData; bytes: SyncProjectionBytes} {
  const account = recordsAccount(records),data = accountWithNull(account);
  return {data:JSON.parse(JSON.stringify(data)) as AppData,bytes:measure(data)};
}

export function projectSyncRecords(records: unknown, previousLocal: AppData): SyncProjectionResult {
  return projectSyncAccountData(recordsAccount(records),previousLocal);
}
