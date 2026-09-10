import { assertPersonalIdsUnique, validatePersonalAlgorithm, validatePersonalExercise } from './personal';
import type { TimingModeId, TrainerAttempt, TrainerCaseStatistics, TrainerDataV1 } from './types';

const fail = (message: string): never => { throw new Error(`Treino invalido: ${message}`); };
const isMs = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Timing invariants of docs/trainers-spec.md: preparation is never timed (no field exists),
 * free mode records no invented time, duration mode counts user-informed physical cycles,
 * and a consulted outcome always marks the execution as assisted.
 */
export function assertTrainerAttempt(attempt: TrainerAttempt): void {
  const rules: Record<TimingModeId, () => void> = {
    free: () => { if (attempt.rawMs !== null) fail('modo livre nao registra tempo.'); },
    timed: () => { if (!isMs(attempt.rawMs)) fail('modo cronometrado exige tempo.'); },
    repetitions: () => {
      if (!isMs(attempt.rawMs)) fail('repeticoes exigem tempo.');
      if (!Number.isInteger(attempt.cycles) || (attempt.cycles as number) < 1) fail('repeticoes exigem ciclos.');
    },
    'continuous-batch': () => { if (!Number.isInteger(attempt.cycles) || (attempt.cycles as number) < 1) fail('lote continuo exige ciclos.'); },
    duration: () => {
      if (attempt.rawMs !== null) fail('treino por duracao nao mede tempo individual.');
      if (!Number.isInteger(attempt.physicalCycles) || (attempt.physicalCycles as number) < 0) fail('treino por duracao exige ciclos fisicos informados.');
    },
    recognition: () => { if (!isMs(attempt.rawMs)) fail('reconhecimento exige tempo da resposta.'); },
  };
  const rule = rules[attempt.timingMode];
  if (!rule) fail(`modo de cronometragem desconhecido: ${String(attempt.timingMode)}.`);
  rule();
  if (attempt.outcome === 'consulted' && !attempt.assisted) fail('consulta durante a tentativa marca execucao assistida.');
  if (attempt.inspectionMs !== null && !isMs(attempt.inspectionMs)) fail('inspecao registrada exige duracao valida.');
}

/** Plain mean over clean correct attempts only, reported with its sample size. */
export function computeTrainerCaseStatistics(attempts: readonly TrainerAttempt[]): TrainerCaseStatistics {
  const timed = attempts.filter(attempt => attempt.rawMs !== null);
  const clean = timed.filter(attempt => attempt.outcome === 'correct' && !attempt.assisted);
  const correct = attempts.filter(attempt => attempt.outcome === 'correct').length;
  return {
    attempts: attempts.length,
    correctRate: attempts.length ? correct / attempts.length : null,
    lastMs: timed.length ? timed[timed.length - 1].rawMs : null,
    bestMs: clean.length ? Math.min(...clean.map(attempt => attempt.rawMs as number)) : null,
    cleanCorrectMeanMs: clean.length ? clean.reduce((sum, attempt) => sum + (attempt.rawMs as number), 0) / clean.length : null,
    cleanCorrectSampleSize: clean.length,
  };
}

export function createEmptyTrainerDataV1(): TrainerDataV1 {
  return { version: 1, attempts: [], preferences: [], personalAlgorithms: [], personalExercises: [] };
}

const DATA_KEYS = ['version', 'attempts', 'preferences', 'personalAlgorithms', 'personalExercises'] as const;
const ATTEMPT_KEYS = ['id', 'trainerId', 'contentId', 'alternativeId', 'hand', 'slot', 'timingMode', 'createdAt', 'outcome', 'assisted', 'rawMs', 'inspectionMs', 'cycles', 'physicalCycles'] as const;
const PREFERENCE_KEYS = ['contentId', 'favorite', 'note', 'preferredAlternativeId', 'hand', 'slot'] as const;
function exactKeys(value: unknown, keys: readonly string[], what: string): void {
  if (!value || typeof value !== 'object') fail(`${what} invalido.`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key))) fail(`${what} com campos ausentes ou desconhecidos.`);
}

/** Versioned entry point: absent storage starts empty; v1 payloads are validated and kept as
 * they are. Exactly FIVE keys, and a MISSING key is refused like an extra one (Sonda's
 * data-safety ruling): with nothing shipped there is no three-key legacy, so a truncated
 * version 1 payload accepted as an older shape would be silent loss of the personal
 * collections, the mirror of the extra-key destruction already forbidden here.
 * Trainer storage is separate from AppData, so the 78 legacy study IDs and their progress are
 * untouched by construction; tests assert that invariant explicitly.
 */
export function migrateTrainerData(value: unknown): TrainerDataV1 {
  if (value === undefined || value === null) return createEmptyTrainerDataV1();
  if (typeof value !== 'object' || (value as { version?: unknown }).version !== 1) fail('versao de dados de treino desconhecida.');
  exactKeys(value, DATA_KEYS, 'pacote de treino');
  const data = value as TrainerDataV1;
  if (!Array.isArray(data.attempts) || !Array.isArray(data.preferences) || !Array.isArray(data.personalAlgorithms) || !Array.isArray(data.personalExercises)) fail('estrutura de dados de treino invalida.');
  for (const attempt of data.attempts) { exactKeys(attempt, ATTEMPT_KEYS, 'tentativa de treino'); assertTrainerAttempt(attempt); }
  for (const preference of data.preferences) exactKeys(preference, PREFERENCE_KEYS, 'preferencia de treino');
  const personalAlgorithms = data.personalAlgorithms.map(validatePersonalAlgorithm);
  const personalExercises = data.personalExercises.map(validatePersonalExercise);
  assertPersonalIdsUnique(personalAlgorithms, personalExercises);
  return { version: 1, attempts: [...data.attempts], preferences: [...data.preferences], personalAlgorithms, personalExercises };
}
