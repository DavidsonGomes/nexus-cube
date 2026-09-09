import type { MethodId, StageId, ContentProvenance, FocusPolicy } from '../../domain/types';

/** P0 contract surface for the Trainers module (docs/trainers-spec.md, docs/trainers-plan.md).
 * Consumed by Matiz (UI), Sonda (independent acceptance), Dobra (Roux pedagogy) and Trama
 * (finger trick curation). Runtime content lives in later phases; these types are the contract.
 */

/** Back insertions are a submode of the F2L trainer (spec item 12), not a trainer of their own:
 * their fixtures use trainerId 'f2l' with ids under f2l/back-insertions/.
 */
export type TrainerId =
  | 'lbl' | 'finger-tricks' | 'cross' | 'f2l' | 'oll' | 'pll' | 'oll-pll-two-step'
  | 'recognition' | 'lookahead' | 'inspection' | 'cross-first-pair'
  | 'roux' | 'one-handed' | 'algorithm-lab' | 'case-editor' | 'continue-here';

/** Catalog order is pedagogical: the beginner layer-by-layer group comes before CFOP. */
export type TrainerCatalogSection = 'lbl' | 'cfop' | 'roux' | 'technique';
export interface TrainerDefinition {
  readonly id: TrainerId;
  readonly section: TrainerCatalogSection;
  readonly methodId: MethodId | null;
  readonly name: string;
  readonly description: string;
  readonly order: number;
}
export interface TrainerGroupDefinition {
  readonly id: string;
  readonly trainerId: TrainerId;
  readonly name: string;
  readonly order: number;
}

/** Stage predicates exposed by contract with Dobra; they delegate to the existing
 * domain/solver validators and are never reimplemented by trainer content.
 */
export type StagePredicateId =
  | 'cross' | 'f2l-pair' | 'f2l-pair-formed' | 'f2l' | 'oll' | 'pll' | 'oll-edges' | 'pll-corners' | 'll-corners-placed'
  | 'fb' | 'sb' | 'cmll' | 'cmll-oriented' | 'eo' | 'lr' | 'finish'
  | 'centers' | 'any-legal';
export type TargetSlot = 'FR' | 'FL' | 'BR' | 'BL';
export interface StageCondition {
  readonly predicate: StagePredicateId;
  readonly targetSlot?: TargetSlot;
  readonly preserve?: readonly string[];
  readonly referenceFrame?: 'fixed' | 'centers';
}

/** Difficulty is declared by setup size; a minimum move count may only be announced
 * with generator proof (minimumProven), never assumed.
 */
export interface TrainerDifficultyLevel {
  readonly id: string;
  readonly name: string;
  readonly setupMoves: number;
  readonly announcedMinimumMoves?: number;
  readonly minimumProven: boolean;
}

export type TrainerExerciseKind = 'execution' | 'recognition';
/** App-verified option answers for recognition exercises: the engine's registered classifier
 * (classifierId) computes the correct optionId for each generated state; option display texts
 * come from curation. Piece-selection recognition needs no field: focus.pieces is the key.
 * A recognition fixture without this field is self-assessed or piece-selection only.
 */
export interface TrainerRecognitionSpec {
  readonly classifierId: string;
  readonly optionIds: readonly string[];
}
/** Verifiable intermediate milestone of a multi-step exercise (e.g. two-look flows): the
 * student checks the condition before continuing; it never replaces the fixture goal.
 */
export interface TrainerCheckpoint {
  readonly id: string;
  readonly name: string;
  readonly objective: string;
  readonly condition: StageCondition;
}
export interface TrainerFixtureSpec {
  readonly id: string;
  readonly trainerId: TrainerId;
  readonly methodId: MethodId | null;
  readonly stageId: StageId | null;
  readonly groupId: string;
  readonly kind: TrainerExerciseKind;
  readonly name: string;
  readonly objective: string;
  /** Optional curated side note shown to the student (Trama), promising nothing beyond the goal. */
  readonly observe?: string;
  readonly precondition: StageCondition | null;
  readonly checkpoints?: readonly TrainerCheckpoint[];
  readonly recognition?: TrainerRecognitionSpec;
  readonly goal: StageCondition;
  readonly preserve: readonly string[];
  readonly referenceFrame: 'fixed' | 'centers';
  readonly setupSubgroup: readonly string[] | null;
  readonly difficulty: readonly TrainerDifficultyLevel[] | null;
  readonly focus: FocusPolicy | null;
  readonly provenance: readonly ContentProvenance[];
}

/** Coverage is honest: counts derive from fixtures approved in tests, and 'complete'
 * requires an explicit externally verified proof marker, never inference.
 */
export interface TrainerCoverage {
  readonly trainerId: TrainerId;
  readonly validatedContentCount: number;
  readonly declared: 'introductory' | 'partial' | 'complete';
}

export type TimingModeId = 'free' | 'timed' | 'repetitions' | 'continuous-batch' | 'duration' | 'recognition';
export type TrainerAttemptOutcome = 'correct' | 'wrong' | 'consulted';
export type TrainerHand = 'left' | 'right';
/** Preparation always happens outside the clock: there is no prep duration field by design.
 * Inspection is recorded separately. Free mode never invents a zero time.
 */
export interface TrainerAttempt {
  readonly id: string;
  readonly trainerId: TrainerId;
  readonly contentId: string;
  readonly alternativeId: string | null;
  readonly hand: TrainerHand | null;
  readonly slot: TargetSlot | null;
  readonly timingMode: TimingModeId;
  readonly createdAt: string;
  readonly outcome: TrainerAttemptOutcome;
  readonly assisted: boolean;
  readonly rawMs: number | null;
  readonly inspectionMs: number | null;
  readonly cycles: number | null;
  readonly physicalCycles: number | null;
}

export interface TrainerPreference {
  readonly contentId: string;
  readonly favorite: boolean;
  readonly note: string;
  readonly preferredAlternativeId: string | null;
  readonly hand: TrainerHand | null;
  readonly slot: TargetSlot | null;
}

/** Trainer history is stored apart from solves and never feeds solve statistics. */
export interface TrainerDataV1 {
  readonly version: 1;
  readonly attempts: readonly TrainerAttempt[];
  readonly preferences: readonly TrainerPreference[];
}

export interface TrainerCaseStatistics {
  readonly attempts: number;
  readonly correctRate: number | null;
  readonly lastMs: number | null;
  readonly bestMs: number | null;
  readonly cleanCorrectMeanMs: number | null;
  readonly cleanCorrectSampleSize: number;
}
