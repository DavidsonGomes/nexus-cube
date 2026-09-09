import { CROSS_PIECES } from '../../domain/stage-validation';
import type { StageId } from '../../domain/types';
import type { StageCondition } from './types';

export interface LBLStageSpec {
  readonly id: string;
  readonly stageId: StageId;
  readonly precondition: StageCondition | null;
  readonly goal: StageCondition;
  readonly preserve: readonly string[];
}

const CROSS = [...CROSS_PIECES] as readonly string[];
const FIRST_LAYER = [...CROSS, 'DFR', 'DFL', 'DBR', 'DBL', 'D'] as readonly string[];
const TWO_LAYERS = [...FIRST_LAYER, 'FR', 'FL', 'BR', 'BL'] as readonly string[];
const U_EDGES = ['UF', 'UR', 'UB', 'UL'] as readonly string[];

/** The seven beginner stages of docs/solver-methods/lbl-proposta-conjunta.md, defined once
 * for both consumers (Dobra's trainer fixtures and the future Layers solver mode). Conditions
 * only: names and pedagogy come from Trama's curation and are never written here.
 * cross, f2l and finish reuse the shared domain predicates; top-cross reuses the same
 * oll-edges published for the CFOP two-look, with no redefinition; ll-corners-placed is the
 * proposal's single new predicate. Preservation of the final stage holds at the extremes
 * only, as the pedagogy declares for the repeated corner twist.
 */
export const LBL_STAGES: readonly LBLStageSpec[] = [
  // 'white-cross' keeps the library stage lookup unambiguous: consumers find STAGES by id
  // alone and 'cross' already names the CFOP stage; the goal predicate is still the shared cross.
  { id: 'lbl/cross', stageId: 'white-cross', precondition: null, goal: { predicate: 'cross' }, preserve: [] },
  { id: 'lbl/corners', stageId: 'first-corners', precondition: { predicate: 'cross' }, goal: { predicate: 'any-legal', preserve: FIRST_LAYER }, preserve: [...CROSS, 'D'] },
  { id: 'lbl/middle', stageId: 'middle-edges', precondition: { predicate: 'any-legal', preserve: FIRST_LAYER }, goal: { predicate: 'f2l' }, preserve: FIRST_LAYER },
  { id: 'lbl/top-cross', stageId: 'top-cross', precondition: { predicate: 'f2l' }, goal: { predicate: 'oll-edges' }, preserve: TWO_LAYERS },
  { id: 'lbl/top-edges', stageId: 'top-edges', precondition: { predicate: 'oll-edges' }, goal: { predicate: 'any-legal', preserve: U_EDGES }, preserve: TWO_LAYERS },
  { id: 'lbl/top-corners-position', stageId: 'top-corners-position', precondition: { predicate: 'any-legal', preserve: U_EDGES }, goal: { predicate: 'll-corners-placed' }, preserve: [...TWO_LAYERS, ...U_EDGES] },
  { id: 'lbl/top-corners-orient', stageId: 'top-corners-orient', precondition: { predicate: 'll-corners-placed' }, goal: { predicate: 'finish' }, preserve: [...TWO_LAYERS, ...U_EDGES] },
];
