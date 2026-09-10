import { assertPersonalIdsUnique, assertTrainerAttempt, migrateTrainerData, validatePersonalAlgorithm, validatePersonalExercise } from '../../data/trainers';
import type { PersonalAlgorithm, PersonalExercise, TrainerAttempt, TrainerDataV1 } from '../../data/trainers';

/** Local, per-device persistence for trainer history and personal content
 * (separate from AppData by contract). The storage seam is injectable so save
 * failure and retry are testable; a failed save NEVER loses the payload: the
 * caller keeps it and retries with the same object. All shapes are validated
 * by the domain before writing. */
export interface TrainerStore {
  load(): TrainerDataV1;
  append(attempt: TrainerAttempt): { kind: 'saved'; data: TrainerDataV1 } | { kind: 'storage-error' };
  savePersonalAlgorithm(value: unknown): { kind: 'saved'; data: TrainerDataV1 } | { kind: 'storage-error' } | { kind: 'invalid'; message: string };
  savePersonalExercise(value: unknown): { kind: 'saved'; data: TrainerDataV1 } | { kind: 'storage-error' } | { kind: 'invalid'; message: string };
  removePersonal(id: string): { kind: 'saved'; data: TrainerDataV1 } | { kind: 'storage-error' };
}

const KEY = 'nexus-trainers-v1';

export function createTrainerStore(storage?: Pick<Storage, 'getItem' | 'setItem'>): TrainerStore {
  const backend = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
  let cached: TrainerDataV1 | null = null;
  function load(): TrainerDataV1 {
    if (cached) return cached;
    try {
      const raw = backend?.getItem(KEY);
      cached = migrateTrainerData(raw ? JSON.parse(raw) : null);
    } catch {
      cached = migrateTrainerData(null);
    }
    return cached;
  }
  function write(next: TrainerDataV1): { kind: 'saved'; data: TrainerDataV1 } | { kind: 'storage-error' } {
    try {
      backend?.setItem(KEY, JSON.stringify(next));
    } catch {
      return { kind: 'storage-error' };
    }
    cached = next;
    return { kind: 'saved', data: next };
  }
  return {
    load,
    append(attempt) {
      assertTrainerAttempt(attempt);
      const current = load();
      return write({ ...current, attempts: [...current.attempts, attempt] });
    },
    savePersonalAlgorithm(value) {
      const current = load();
      let algorithm: PersonalAlgorithm;
      try {
        algorithm = validatePersonalAlgorithm(value);
        assertPersonalIdsUnique([...current.personalAlgorithms, algorithm], current.personalExercises);
      } catch (error) {
        return { kind: 'invalid', message: error instanceof Error ? error.message : String(error) };
      }
      return write({ ...current, personalAlgorithms: [...current.personalAlgorithms, algorithm] });
    },
    savePersonalExercise(value) {
      const current = load();
      let exercise: PersonalExercise;
      try {
        exercise = validatePersonalExercise(value);
        assertPersonalIdsUnique(current.personalAlgorithms, [...current.personalExercises, exercise]);
      } catch (error) {
        return { kind: 'invalid', message: error instanceof Error ? error.message : String(error) };
      }
      return write({ ...current, personalExercises: [...current.personalExercises, exercise] });
    },
    removePersonal(id) {
      const current = load();
      return write({
        ...current,
        personalAlgorithms: current.personalAlgorithms.filter(item => item.id !== id),
        personalExercises: current.personalExercises.filter(item => item.id !== id),
      });
    },
  };
}
