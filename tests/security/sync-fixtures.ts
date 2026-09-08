import type { AppData, Settings, Solve } from '../../src/domain/types';
import { personalFixture, QA_IDENTITIES } from './fixtures';

/** External expectations only. No imports of cloud codec, projection or validators. */
export const SYNC_ACTORS = {
  a1: { user: QA_IDENTITIES.a, deviceId: 'synthetic-device-a1' },
  a2: { user: QA_IDENTITIES.a, deviceId: 'synthetic-device-a2' },
  b: { user: QA_IDENTITIES.b, deviceId: 'synthetic-device-b' },
  guest: { user: null, deviceId: 'synthetic-device-guest' },
} as const;

export const SYNC_OPERATION_IDS = {
  create: '10000000-0000-4000-8000-000000000001',
  edit: '10000000-0000-4000-8000-000000000002',
  remove: '10000000-0000-4000-8000-000000000003',
  restore: '10000000-0000-4000-8000-000000000004',
  preferences: '10000000-0000-4000-8000-000000000005',
} as const;

export const ACCOUNT_SETTINGS_AFTER: Settings = {
  theme: 'system', inspection: true, inspectionSound: true, holdMs: 450.5,
  focus: true, hideRunningTime: true, animationSpeed: 1.5,
};

/** Accepted JS text must survive every wire path exactly, including SQL-hostile units. */
export const SYNC_TEXT_VECTORS = [
  { name: 'empty', text: '', utf16be: '' },
  { name: 'nul', text: '\u0000', utf16be: '0000' },
  { name: 'lone-high', text: '\ud800', utf16be: 'd800' },
  { name: 'lone-low', text: '\udc00', utf16be: 'dc00' },
  { name: 'replacement-distinct', text: '\ufffd', utf16be: 'fffd' },
  { name: 'astral-pair', text: '\ud83d\ude00', utf16be: 'd83dde00' },
  { name: 'composed', text: '\u00e9', utf16be: '00e9' },
  { name: 'decomposed', text: 'e\u0301', utf16be: '00650301' },
  { name: 'quote-slash-lf', text: '"\\\n', utf16be: '0022005c000a' },
] as const;

/** IEEE754 payload expectations are literal independent vectors, not encoder output. */
export const SYNC_NUMBER_VECTORS = [
  { value: 0, binary64be: '0000000000000000' },
  { value: -0, binary64be: '0000000000000000' },
  { value: 0.1, binary64be: '3fb999999999999a' },
  { value: 1.5, binary64be: '3ff8000000000000' },
  { value: Number.MIN_VALUE, binary64be: '0000000000000001' },
] as const;

export function automaticSyncFixture() {
  const a1 = personalFixture('a');
  a1.sessions.push({ id: 'other-session-id', name: 'synthetic-other-a', mode: 'two-handed', createdAt: '2026-09-08T12:00:00.000Z' });
  const a2: AppData = structuredClone(a1);
  a2.activeSessionId = 'other-session-id';
  const b = personalFixture('b'), guest = personalFixture('guest');
  const newSolve: Solve = {
    id: 'sync-created-solve', sessionId: 'same-session-id', mode: 'two-handed',
    rawMs: 0.1, penalty: '+2', scramble: 'R U',
    createdAt: '2026-09-08T12:00:01.000Z',
    note: 'synthetic-private-a\u0000\ud800\udc00\ufffd\u00e9e\u0301', source: 'manual',
  };
  const remoteEdit: Solve = { ...newSolve, rawMs: 1.5, note: 'synthetic-remote-revision-eleven' };
  const intentAfterCreate: Solve = { ...newSolve, note: 'synthetic-pending-op2' };
  const afterCreateA1: AppData = { ...structuredClone(a1), solves: [...structuredClone(a1.solves), { ...newSolve }] };
  const afterCreateA2: AppData = { ...structuredClone(a2), solves: [...structuredClone(a2.solves), { ...newSolve }] };
  const afterSettingsA2: AppData = { ...structuredClone(a2), settings: { ...ACCOUNT_SETTINGS_AFTER } };
  return {
    a1, a2, b, guest, newSolve, remoteEdit, intentAfterCreate,
    afterCreateA1, afterCreateA2, afterSettingsA2,
    // Deletion leaves each original snapshot: delayed update cannot recreate newSolve.
    afterDeleteA1: structuredClone(a1), afterDeleteA2: structuredClone(a2),
    // Explicit restore appends after the existing solve with the same createdAt.
    afterRestoreA2: structuredClone(afterCreateA2),
  };
}
