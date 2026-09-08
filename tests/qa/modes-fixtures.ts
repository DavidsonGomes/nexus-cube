import type { AppData, Penalty, Settings, Solve, Session, StudyAttempt } from '../../src/domain/types';

export type LegacyMode = null;
export type CurrentMode = 'two-handed' | 'one-handed' | null;

export interface LegacyPayload {
  version: 1 | 2;
  sessions: Array<Omit<Session, 'mode'>>;
  activeSessionId: string;
  solves: Array<Omit<Solve, 'mode'>>;
  progress: Record<string, { caseId: string; favorite: boolean; status: 'new' | 'learning' | 'mastered'; note: string }>;
  studyAttempts: StudyAttempt[];
  settings: Settings;
}

export interface CurrentPayload extends Omit<LegacyPayload, 'version' | 'sessions' | 'solves' | 'activeSessionId'> {
  version: 3;
  activeSessionId: string | null;
  sessions: Array<Session & { mode: CurrentMode }>;
  solves: Array<Solve & { mode: CurrentMode }>;
}

const solve = (id: string, sessionId: string, rawMs: number, penalty: Penalty = 'none'): Omit<Solve, 'mode'> => ({
  id, sessionId, rawMs, penalty, scramble: "R U R' U'", createdAt: '2026-09-08T12:10:00.000Z', source: 'manual', note: 'QA modes',
});

export function legacyFixture(version: 1 | 2 = 1): LegacyPayload {
  return {
    version,
    sessions: [{ id: 'legacy-a', name: 'Legado A', createdAt: '2026-09-08T12:00:00.000Z' }, { id: 'legacy-b', name: 'Legado B', createdAt: '2026-09-08T12:01:00.000Z' }],
    activeSessionId: 'legacy-a',
    solves: [solve('legacy-solve-a', 'legacy-a', 10000), solve('legacy-solve-b', 'legacy-b', 12000, '+2')],
    progress: {}, studyAttempts: [], settings: { theme: 'dark', inspection: true, inspectionSound: false, holdMs: 300, focus: false, hideRunningTime: true, animationSpeed: 1 },
  };
}

export function currentFixture(): CurrentPayload {
  const legacy = legacyFixture(1);
  const base: Omit<CurrentPayload, 'version' | 'sessions' | 'solves'> = legacy;
  return {
    ...base, version: 3,
    sessions: [{ ...legacy.sessions[0], mode: 'two-handed' }, { ...legacy.sessions[1], mode: 'one-handed' }, { id: 'legacy-null', name: 'Legado não classificado', createdAt: '2026-09-08T12:02:00.000Z', mode: null }],
    solves: [
      { ...legacy.solves[0], mode: 'two-handed' },
      { ...legacy.solves[1], mode: 'one-handed' },
      { ...solve('null-solve', 'legacy-null', 13000, 'DNF'), mode: null },
    ],
  };
}

export function clone<T>(value: T): T { return structuredClone(value); }
