import type { AppData, LegacyAppDataV1, Penalty, Solve } from '../../src/domain/types';

/** Archived v1 payload shape. It intentionally retains version 1 for migration tests. */
export type LegacyAppData = LegacyAppDataV1;

export const QA_KEY = 'nexus-cube:v1';
export const qaSolve = (rawMs: number, penalty: Penalty = 'none', index = 0, sessionId = 'qa-a', mode: Solve['mode'] = null): Solve => ({
  id: `qa-${sessionId}-${index}`, sessionId, mode, rawMs, penalty,
  scramble: "R U R' U'", createdAt: new Date(Date.UTC(2026, 8, 8, 12, 0, index)).toISOString(),
  source: 'manual', note: 'QA ARTIFICIAL',
});

export function qaDataV1(): LegacyAppData {
  return {
    version: 1,
    sessions: [{ id: 'qa-a', name: 'QA A', createdAt: '2026-09-08T12:00:00.000Z' }, { id: 'qa-b', name: 'QA B', createdAt: '2026-09-08T12:00:00.000Z' }],
    activeSessionId: 'qa-b',
    solves: [qaSolve(10000, 'none', 0), qaSolve(11000, '+2', 1), { ...qaSolve(12000, 'DNF', 2, 'qa-b'), note: 'QA: "aspas", virgula;\nsegunda linha 🧊' }].map(({ mode: _mode, ...solve }) => solve),
    settings: { theme: 'dark', inspection: true, inspectionSound: false, holdMs: 300, focus: false, hideRunningTime: true, animationSpeed: 1 },
    progress: { 'OLL-01': { caseId: 'OLL-01', favorite: true, status: 'learning', note: 'QA estudo 🧊' } },
    studyAttempts: [{ id: 'qa-study-1', caseId: 'OLL-01', createdAt: '2026-09-08T12:05:00.000Z', recognition: 'good', execution: 'again', durationMs: 23000 }],
  };
}

export function qaData(): AppData {
  const legacy = qaDataV1();
  return {
    ...legacy,
    version: 3,
    activeSessionId: legacy.activeSessionId,
    sessions: legacy.sessions.map(s => ({ ...s, mode: null })),
    solves: legacy.solves.map(s => ({ ...s, mode: null })),
  };
}

// Deliberadamente privado de cada teste: nunca usa localStorage real do portal.
export class MemoryStorage {
  values = new Map<string, string>();
  writes: Array<[string, string]> = [];
  failWrites = false;
  constructor(initial?: string) { if (initial !== undefined) this.values.set(QA_KEY, initial); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('QA: quota simulada');
    this.writes.push([key, value]); this.values.set(key, value);
  }
}
