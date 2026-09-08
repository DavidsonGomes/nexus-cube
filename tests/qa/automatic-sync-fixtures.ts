import type { AppData, SolveMode, StoredSolveMode } from '../../src/domain/types';

/** Synthetic identities only. They are labels for local QA, not email addresses or accounts. */
export const SYNC_IDENTITIES = Object.freeze({
  accountA: 'qa-sync-account-a',
  accountB: 'qa-sync-account-b',
  guest: null,
} as const);

export type SyncContext = Readonly<{
  device: 'A1' | 'A2' | 'B1' | 'guest';
  userId: string | null;
  generation: number;
  projectRef: 'qa-sync-project';
}>;

export const CONTEXTS: Readonly<Record<'a1' | 'a2' | 'b1' | 'guest', SyncContext>> = Object.freeze({
  a1: { device: 'A1', userId: SYNC_IDENTITIES.accountA, generation: 1, projectRef: 'qa-sync-project' },
  a2: { device: 'A2', userId: SYNC_IDENTITIES.accountA, generation: 1, projectRef: 'qa-sync-project' },
  b1: { device: 'B1', userId: SYNC_IDENTITIES.accountB, generation: 1, projectRef: 'qa-sync-project' },
  guest: { device: 'guest', userId: SYNC_IDENTITIES.guest, generation: 1, projectRef: 'qa-sync-project' },
});

const settings = (theme: 'light' | 'dark' = 'light') => ({
  theme, inspection: false, inspectionSound: false, holdMs: 500, focus: false,
  hideRunningTime: false, animationSpeed: 1,
});

export function syntheticData(mode: StoredSolveMode = 'two-handed', sessionId = 'qa-sync-session-a'): AppData {
  return {
    version: 3,
    sessions: [{ id: sessionId, name: 'QA sync session A', createdAt: '2026-01-01T00:00:00.000Z', mode }],
    activeSessionId: sessionId,
    solves: [{ id: 'qa-sync-solve-a1', sessionId, mode, rawMs: 12340, penalty: 'none', scramble: "R U R'", createdAt: '2026-01-01T00:00:01.000Z', note: 'A1 sentinel', source: 'manual' }],
    progress: { 'OLL-30': { caseId: 'OLL-30', favorite: true, status: 'learning', note: 'A progress sentinel' } },
    studyAttempts: [{ id: 'qa-sync-study-a1', caseId: 'OLL-30', createdAt: '2026-01-01T00:00:02.000Z', recognition: 'good', execution: 'again', durationMs: 900 }],
    settings: settings(),
  };
}

export const EXPECTED = Object.freeze({
  accountA: syntheticData(),
  accountB: syntheticData('one-handed', 'qa-sync-session-b'),
  guest: syntheticData(null, 'qa-sync-session-guest'),
});

export type SyncScenario = Readonly<{
  id: string;
  invariant: string;
  contexts: readonly SyncContext[];
  expected: Readonly<Record<string, unknown>>;
}>;

export const SCENARIOS: readonly SyncScenario[] = Object.freeze([
  { id: 'remote-commit-arrives-a2', invariant: 'A1 change appears automatically in A2 without a sync button; B and guest remain unchanged.', contexts: [CONTEXTS.a1, CONTEXTS.a2, CONTEXTS.b1, CONTEXTS.guest], expected: { owner: SYNC_IDENTITIES.accountA, solveId: 'qa-sync-solve-a1', visibleOn: ['A1', 'A2'], absentOn: ['B1', 'guest'] } },
  { id: 'offline-retry-once', invariant: 'An offline save is queued once; retry after reconnection reuses operationId and one ack cannot duplicate the solve.', contexts: [CONTEXTS.a1, CONTEXTS.a2], expected: { operationId: 'qa-op-offline-1', maxAppliedCount: 1, solveId: 'qa-sync-solve-a1' } },
  { id: 'logout-switch-stale-response', invariant: 'A logout or switch invalidates A responses; a delayed A response cannot alter B.', contexts: [CONTEXTS.a1, CONTEXTS.b1], expected: { staleResponse: 'discarded', visibleIdentity: SYNC_IDENTITIES.accountB, data: EXPECTED.accountB } },
  { id: 'delete-tombstone', invariant: 'A deletion remains deleted when an offline or delayed device replays an older snapshot.', contexts: [CONTEXTS.a1, CONTEXTS.a2], expected: { deletedId: 'qa-sync-solve-a1', resurrected: false } },
  { id: 'account-settings-isolated', invariant: 'Account settings follow A across A devices, never B or guest; activeSessionId remains device-local.', contexts: [CONTEXTS.a1, CONTEXTS.a2, CONTEXTS.b1, CONTEXTS.guest], expected: { settings: { theme: 'dark' }, activeSessionIds: { A1: 'qa-sync-session-a', A2: null, B1: 'qa-sync-session-b', guest: 'qa-sync-session-guest' } } },
  { id: 'capture-immutable', invariant: 'A capture freezes sessionId, mode and scramble; identity switch or remote pull cannot rewrite the in-flight solve.', contexts: [CONTEXTS.a1, CONTEXTS.b1], expected: { sessionId: 'qa-sync-session-a', mode: 'two-handed', scramble: "R U R'", rejectedAfterSwitch: true } },
]);

export function cloneExpectedData(owner: 'accountA' | 'accountB' | 'guest'): AppData {
  return structuredClone(EXPECTED[owner]);
}
