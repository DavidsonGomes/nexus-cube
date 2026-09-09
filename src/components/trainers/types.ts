import type { MethodId, StageId } from '../../domain';
import type { TrainerCoverage, TrainerId } from '../../data/trainers';

/** Presentational contracts for the Treinadores module. Data authority is the
 * Prisma P0 contract in src/data/trainers; display text is resolved from the
 * i18n dictionary, never embedded in components. */

export interface TrainerCatalogNode {
  key: import('./catalog').TrainerNodeKey;
  /** null while the group's Prisma contract (lbl) is pending: renders as preparing. */
  id: TrainerId | null;
  coverage: TrainerCoverage | null;
  study: { methodId: MethodId; stageId: StageId; count: number } | null;
}

export interface TrainerCatalogGroup {
  id: import('./catalog').CatalogSectionId;
  nodes: readonly TrainerCatalogNode[];
}

export type TrainerFlowStep = 'select' | 'prepare' | 'attempt' | 'review';
