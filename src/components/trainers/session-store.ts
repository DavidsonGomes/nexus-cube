import { assertTrainerAttempt, migrateTrainerData } from '../../data/trainers';
import type { TrainerAttempt, TrainerDataV1 } from '../../data/trainers';

/** Local, per-device persistence for trainer history (separate from AppData by
 * contract). The storage seam is injectable so save failure and retry are
 * testable; a failed save NEVER loses the attempt: the caller keeps it and
 * retries with the same object. */
export interface TrainerStore {
  load(): TrainerDataV1;
  append(attempt: TrainerAttempt): { kind: 'saved'; data: TrainerDataV1 } | { kind: 'storage-error' };
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
  return {
    load,
    append(attempt) {
      assertTrainerAttempt(attempt);
      const current = load();
      const next: TrainerDataV1 = { version: 1, attempts: [...current.attempts, attempt], preferences: current.preferences };
      try {
        backend?.setItem(KEY, JSON.stringify(next));
      } catch {
        return { kind: 'storage-error' };
      }
      cached = next;
      return { kind: 'saved', data: next };
    },
  };
}
