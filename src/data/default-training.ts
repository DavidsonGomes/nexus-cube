import type { AppData } from '../domain/types';
import { saveData } from './store';

export interface FirstUseTrainingInput {
  /** Internal repository decision after successful hydration, never inferred here. */
  eligibleFirstUse: boolean;
  /** Generated once by the repository and reused across transaction retries. */
  sessionId: string;
  createdAt: string;
}
export interface FirstUseTrainingResult { data: AppData; created: boolean }
export const DEFAULT_TRAINING_NAME = 'Treino diário';

function checkedCopy(data: AppData): AppData {
  if (!data || typeof data !== 'object' || data.version !== 3) throw new Error('Primeiro uso exige dados V3 válidos; migração é uma operação separada.');
  let serialized = '';
  // Pure staging: reuse the exact schema and both byte budgets, without storage I/O.
  saveData(data, { getItem: () => null, setItem: (_key, value) => { serialized = value; } });
  return JSON.parse(serialized) as AppData;
}

export function ensureFirstUseTraining(data: AppData, input: FirstUseTrainingInput): FirstUseTrainingResult {
  const current = checkedCopy(data);
  if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype ||
    Object.keys(input).length !== 3 || ['eligibleFirstUse', 'sessionId', 'createdAt'].some(key => !Object.hasOwn(input, key)) ||
    typeof input.eligibleFirstUse !== 'boolean' || typeof input.sessionId !== 'string' || typeof input.createdAt !== 'string') {
    throw new Error('Decisão de primeiro uso inválida.');
  }
  if (!input.eligibleFirstUse || current.sessions.length || current.solves.length || Object.keys(current.progress).length || current.studyAttempts.length) {
    return { data: current, created: false };
  }
  const next = checkedCopy({ ...current,
    sessions: [{ id: input.sessionId, name: DEFAULT_TRAINING_NAME, createdAt: input.createdAt, mode: 'two-handed' }],
    activeSessionId: input.sessionId,
  });
  return { data: next, created: true };
}
