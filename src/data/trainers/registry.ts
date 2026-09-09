import { COMPILED_CASES } from '../catalog-compiled';
import type { TrainerCoverage, TrainerFixtureSpec, TrainerId } from './types';

/** The 78 v1 study IDs (57 OLL, 21 PLL). Versioned migration must keep them byte-identical;
 * progress, favorites and notes keyed by them survive every trainer addition.
 */
export const LEGACY_CASE_IDS: readonly string[] = Object.freeze(
  COMPILED_CASES.filter(item => item.family === 'OLL' || item.family === 'PLL').map(item => item.id),
);

const NAMESPACED_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*){1,3}$/;
export function isNamespacedTrainerId(id: string): boolean {
  return NAMESPACED_ID.test(id);
}
export function assertTrainerContentId(id: string): void {
  if (LEGACY_CASE_IDS.includes(id)) return;
  if (!isNamespacedTrainerId(id)) throw new Error(`ID de conteudo de treinador invalido: ${id}`);
}

export function assertFixtureIds(fixtures: readonly Pick<TrainerFixtureSpec, 'id' | 'difficulty' | 'checkpoints'>[]): void {
  const seen = new Set<string>(LEGACY_CASE_IDS);
  for (const fixture of fixtures) {
    if (!isNamespacedTrainerId(fixture.id)) throw new Error(`Fixture sem namespace valido: ${fixture.id}`);
    if (seen.has(fixture.id)) throw new Error(`ID de fixture duplicado ou colidindo com o legado: ${fixture.id}`);
    seen.add(fixture.id);
    for (const level of fixture.difficulty ?? []) {
      if (level.announcedMinimumMoves !== undefined && !level.minimumProven) throw new Error(`Minimo de movimentos anunciado sem prova do gerador: ${fixture.id}/${level.id}`);
    }
    const checkpoints = fixture.checkpoints ?? [];
    if (new Set(checkpoints.map(checkpoint => checkpoint.id)).size !== checkpoints.length) throw new Error(`Checkpoints com IDs repetidos: ${fixture.id}`);
  }
}

/** Counts come only from the fixtures actually given (approved in tests upstream);
 * 'complete' is never derived here because completeness needs an external proof.
 */
export function buildTrainerCoverage(trainerId: TrainerId, validatedFixtures: readonly TrainerFixtureSpec[]): TrainerCoverage {
  const own = validatedFixtures.filter(fixture => fixture.trainerId === trainerId);
  assertFixtureIds(own);
  return { trainerId, validatedContentCount: own.length, declared: own.length ? 'partial' : 'introductory' };
}
