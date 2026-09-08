import type { AppData, Penalty, Solve } from '../../src/domain/types';

export const QA_KEY = 'nexus-cube:v1';
export const qaSolve = (rawMs: number, penalty: Penalty = 'none', index = 0, sessionId = 'qa-a'): Solve => ({
  id: `qa-${sessionId}-${index}`, sessionId, rawMs, penalty,
  scramble: "R U R' U'", createdAt: new Date(Date.UTC(2026, 8, 8, 12, 0, index)).toISOString(),
  source: 'manual', note: 'QA ARTIFICIAL',
});

export function qaData(): AppData {
  return {
    version: 1,
    sessions: [{ id: 'qa-a', name: 'QA A', createdAt: '2026-09-08T12:00:00.000Z' }, { id: 'qa-b', name: 'QA B', createdAt: '2026-09-08T12:00:00.000Z' }],
    activeSessionId: 'qa-b',
    solves: [qaSolve(10000, 'none', 0), qaSolve(11000, '+2', 1), { ...qaSolve(12000, 'DNF', 2, 'qa-b'), note: 'QA: "aspas", virgula;\nsegunda linha 🧊' }],
    settings: { theme: 'dark', inspection: true, inspectionSound: false, holdMs: 300, focus: false, hideRunningTime: true, animationSpeed: 1 },
    progress: { 'OLL-01': { caseId: 'OLL-01', favorite: true, status: 'learning', note: 'QA estudo 🧊' } },
    studyAttempts: [{ id: 'qa-study-1', caseId: 'OLL-01', createdAt: '2026-09-08T12:05:00.000Z', recognition: 'good', execution: 'again', durationMs: 23000 }],
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
