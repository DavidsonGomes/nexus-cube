import type { MethodId, StageId } from '../../domain';
import { buildTrainerCoverage } from '../../data/trainers';
import type { TimingModeId, TrainerCatalogSection, TrainerFixtureSpec, TrainerId } from '../../data/trainers';

export type CatalogSectionId = TrainerCatalogSection;
import type { TrainerCatalogGroup, TrainerCatalogNode, TrainerFlowStep } from './types';

/** Interim structural list; display text lives in the i18n dictionary and the
 * structure migrates to the Prisma registry constant when published. Coverage
 * always derives from approved fixtures via buildTrainerCoverage; nothing here
 * activates a destination. The Roux stages are first-class catalog entries
 * (docs/solver-methods/roux-trainer-p3.md) sharing the `roux` trainer contract,
 * with per-stage coverage cut by the fixtures' stageId. `continue-here` is
 * reached from the solver, not from this catalog. */
export type TrainerNodeKey =
  | 'lbl-cross' | 'lbl-corners' | 'lbl-middle' | 'lbl-top-cross' | 'lbl-top-edges' | 'lbl-top-corners-position' | 'lbl-top-corners-orient'
  | 'cross' | 'f2l' | 'cross-first-pair' | 'oll' | 'pll' | 'oll-pll-two-step'
  | 'roux-fb' | 'roux-sb' | 'roux-cmll' | 'roux-lse'
  | 'finger-tricks' | 'one-handed' | 'recognition' | 'lookahead' | 'inspection' | 'algorithm-lab' | 'case-editor';

const CATALOG: readonly { key: TrainerNodeKey; trainerId: TrainerId | null; section: CatalogSectionId; order: number; stage: StageId | null; fixturePrefix: string | null; tool?: true; study: { methodId: MethodId; stageIds: readonly StageId[] } | null }[] = [
  { key: 'lbl-cross', trainerId: 'lbl', section: 'lbl', fixturePrefix: 'lbl/cross', order: 0, stage: null, study: null },
  { key: 'lbl-corners', trainerId: 'lbl', section: 'lbl', fixturePrefix: 'lbl/corners', order: 1, stage: null, study: null },
  { key: 'lbl-middle', trainerId: 'lbl', section: 'lbl', fixturePrefix: 'lbl/middle', order: 2, stage: null, study: null },
  { key: 'lbl-top-cross', trainerId: 'lbl', section: 'lbl', fixturePrefix: 'lbl/top-cross', order: 3, stage: null, study: null },
  { key: 'lbl-top-edges', trainerId: 'lbl', section: 'lbl', fixturePrefix: 'lbl/top-edges', order: 4, stage: null, study: null },
  { key: 'lbl-top-corners-position', trainerId: 'lbl', section: 'lbl', fixturePrefix: 'lbl/top-corners-position', order: 5, stage: null, study: null },
  { key: 'lbl-top-corners-orient', trainerId: 'lbl', section: 'lbl', fixturePrefix: 'lbl/top-corners-orient', order: 6, stage: null, study: null },
  { key: 'cross', trainerId: 'cross', section: 'cfop', order: 0, stage: null, fixturePrefix: null, study: { methodId: 'cfop', stageIds: ['cross'] } },
  { key: 'f2l', trainerId: 'f2l', section: 'cfop', order: 1, stage: null, fixturePrefix: null, study: { methodId: 'cfop', stageIds: ['f2l'] } },
  { key: 'cross-first-pair', trainerId: 'cross-first-pair', section: 'cfop', order: 2, stage: null, fixturePrefix: null, study: null },
  { key: 'oll', trainerId: 'oll', section: 'cfop', order: 3, stage: null, fixturePrefix: null, study: { methodId: 'cfop', stageIds: ['oll'] } },
  { key: 'pll', trainerId: 'pll', section: 'cfop', order: 4, stage: null, fixturePrefix: null, study: { methodId: 'cfop', stageIds: ['pll'] } },
  { key: 'oll-pll-two-step', trainerId: 'oll-pll-two-step', section: 'cfop', order: 5, stage: null, fixturePrefix: null, study: null },
  { key: 'roux-fb', trainerId: 'roux', section: 'roux', order: 0, stage: 'fb', fixturePrefix: null, study: { methodId: 'roux', stageIds: ['fb'] } },
  { key: 'roux-sb', trainerId: 'roux', section: 'roux', order: 1, stage: 'sb', fixturePrefix: null, study: { methodId: 'roux', stageIds: ['sb'] } },
  { key: 'roux-cmll', trainerId: 'roux', section: 'roux', order: 2, stage: 'cmll', fixturePrefix: null, study: { methodId: 'roux', stageIds: ['cmll'] } },
  { key: 'roux-lse', trainerId: 'roux', section: 'roux', order: 3, stage: 'lse', fixturePrefix: null, study: { methodId: 'roux', stageIds: ['lse'] } },
  { key: 'finger-tricks', trainerId: 'finger-tricks', section: 'technique', order: 0, stage: null, fixturePrefix: null, study: null },
  { key: 'recognition', trainerId: 'recognition', section: 'technique', order: 1, stage: null, fixturePrefix: null, study: null },
  { key: 'lookahead', trainerId: 'lookahead', section: 'technique', order: 2, stage: null, fixturePrefix: null, study: null },
  { key: 'inspection', trainerId: 'inspection', section: 'technique', order: 3, stage: null, fixturePrefix: null, study: null },
  { key: 'algorithm-lab', trainerId: 'algorithm-lab', section: 'technique', order: 4, stage: null, fixturePrefix: null, tool: true, study: null },
  { key: 'case-editor', trainerId: 'case-editor', section: 'technique', order: 5, stage: null, fixturePrefix: null, tool: true, study: null },
];

export const TRAINER_SECTIONS: readonly CatalogSectionId[] = ['lbl', 'cfop', 'roux', 'technique'];

export function buildTrainerCatalog(input: { studyCounts: (methodId: MethodId, stageId: StageId) => number; fixtures?: readonly TrainerFixtureSpec[] }): readonly TrainerCatalogGroup[] {
  const fixtures = input.fixtures ?? [];
  return TRAINER_SECTIONS.map(section => ({
    id: section,
    nodes: CATALOG.filter(item => item.section === section).sort((a, b) => a.order - b.order).map((item): TrainerCatalogNode => {
      const count = item.study ? item.study.stageIds.reduce((sum, stageId) => sum + input.studyCounts(item.study!.methodId, stageId), 0) : 0;
      const own = item.fixturePrefix ? fixtures.filter(fixture => fixture.id === item.fixturePrefix || fixture.id.startsWith(item.fixturePrefix + '/')) : item.stage ? fixtures.filter(fixture => fixture.stageId === item.stage) : fixtures;
      return {
        key: item.key,
        id: item.trainerId,
        tool: item.tool === true,
        coverage: item.trainerId === null ? null : buildTrainerCoverage(item.trainerId, own),
        study: item.study && count > 0 ? { methodId: item.study.methodId, stageId: item.study.stageIds[0], count } : null,
      };
    }),
  }));
}

export const TIMING_MODE_IDS: readonly TimingModeId[] = ['free', 'timed', 'repetitions', 'continuous-batch', 'duration', 'recognition'];
export const TRAINER_FLOW_STEP_IDS: readonly TrainerFlowStep[] = ['select', 'prepare', 'attempt', 'review'];
