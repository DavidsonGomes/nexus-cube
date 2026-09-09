import { U_CORNERS, arePiecesSolved, isSecondBlockSolved, pieceStickerIds, validateStage } from '../../domain/stage-validation';
import { applyAlgorithm, solvedCube } from '../../domain/cube';
import type { CubeState, StageGoal, ValidationSpec } from '../../domain/types';
import type { StageCondition, StagePredicateId, TrainerFixtureSpec } from './types';

/** Reusable stage predicates, by contract with Dobra (docs/solver-methods/roux-trainer-p3.md).
 * Every predicate delegates to the existing domain validators shared with the solver planner;
 * trainers never duplicate stage rules.
 */
const GOALS: Partial<Record<StagePredicateId, StageGoal>> = {
  cross: 'cross', 'f2l-pair': 'f2l-pair', f2l: 'f2l', oll: 'oll', pll: 'pll',
  fb: 'first-block', sb: 'second-block', cmll: 'cmll', eo: 'lse-eo', lr: 'lse-lr', finish: 'solved',
};
const CENTERS = ['U', 'R', 'F', 'D', 'L', 'B'] as const;

/** Two-look CMLL intermediate goal (Dobra contract item 4): the four upper corners oriented,
 * permutation free, with both blocks intact. Orientation reads the corners' own U stickers
 * against the vertical axis, not the OLL mask.
 */
const upperCornerTopStickerIds = (() => {
  const cornerStickerIds = new Set(pieceStickerIds(U_CORNERS));
  return solvedCube().filter(sticker => cornerStickerIds.has(sticker.id) && sticker.color === 'U').map(sticker => sticker.id);
})();
export function isCMLLOriented(state: CubeState): boolean {
  if (!isSecondBlockSolved(state)) return false;
  return state.filter(sticker => upperCornerTopStickerIds.includes(sticker.id)).every(sticker => sticker.normal[1] === 1);
}

/** Two-look CFOP milestones (P2): edge orientation with corners free, and corner permutation
 * up to AUF with the last layer kept oriented. Both keep the first two layers intact.
 */
const U_EDGES = ['UF', 'UR', 'UB', 'UL'] as const;
const upperEdgeTopStickerIds = (() => {
  const edgeStickerIds = new Set(pieceStickerIds(U_EDGES));
  return solvedCube().filter(sticker => edgeStickerIds.has(sticker.id) && sticker.color === 'U').map(sticker => sticker.id);
})();
export function isLLEdgesOriented(state: CubeState): boolean {
  if (!validateStage(state, { goal: 'f2l' })) return false;
  return state.filter(sticker => upperEdgeTopStickerIds.includes(sticker.id)).every(sticker => sticker.normal[1] === 1);
}
const AUF = ['', 'U', 'U2', "U'"] as const;
export function isLLCornersPermuted(state: CubeState): boolean {
  if (!validateStage(state, { goal: 'oll' })) return false;
  return AUF.some(u => arePiecesSolved(applyAlgorithm(state, u), U_CORNERS));
}

/** LBL milestone (single new predicate of the approved proposal): the four upper corners sit
 * in their exact home cells, twist free. Sticker positions are cubie positions in this model,
 * so placement is position equality of the piece's stickers, ignoring normals.
 */
const upperCornerHomes = (() => {
  const solved = solvedCube();
  return U_CORNERS.map(piece => {
    const ids = pieceStickerIds([piece]);
    return { ids, home: String(solved.find(sticker => ids.includes(sticker.id))!.position) };
  });
})();
export function isLLCornersPlaced(state: CubeState): boolean {
  return upperCornerHomes.every(({ ids, home }) => state.filter(sticker => ids.includes(sticker.id)).every(sticker => String(sticker.position) === home));
}

/** F2L formation milestone (spec item 4, formation vs insertion): the slot's corner and edge
 * sit in adjacent cells and every face the block shows carries matching colors on both
 * cubies, anywhere on the cube and in any orientation. Insertion is not required.
 */
export function isF2LPairFormed(state: CubeState, slot: 'FR' | 'FL' | 'BR' | 'BL'): boolean {
  const cubieOf = (piece: string) => {
    const ids = new Set(pieceStickerIds([piece]));
    return state.filter(sticker => ids.has(sticker.id));
  };
  const corner = cubieOf(`D${slot}`), edge = cubieOf(slot);
  const cornerPosition = corner[0].position, edgePosition = edge[0].position;
  const deltas = [0, 1, 2].map(axis => Math.abs(cornerPosition[axis] - edgePosition[axis]));
  if (deltas.reduce((sum, delta) => sum + delta, 0) !== 1) return false;
  for (const cornerSticker of corner) {
    const shared = edge.find(sticker => String(sticker.normal) === String(cornerSticker.normal));
    if (shared && shared.color !== cornerSticker.color) return false;
  }
  return true;
}

export function stageConditionSpec(condition: StageCondition): ValidationSpec | null {
  const goal = GOALS[condition.predicate];
  if (!goal) return null;
  return {
    goal,
    ...(condition.targetSlot !== undefined ? { targetSlot: condition.targetSlot } : {}),
    ...(condition.preserve !== undefined ? { preserve: condition.preserve } : {}),
    ...(condition.referenceFrame !== undefined ? { referenceFrame: condition.referenceFrame } : {}),
  };
}

const SPECIAL: Partial<Record<StagePredicateId, (state: CubeState, condition: StageCondition) => boolean>> = {
  'any-legal': () => true,
  centers: (state, condition) => arePiecesSolved(state, CENTERS, condition.referenceFrame ?? 'fixed'),
  'cmll-oriented': state => isCMLLOriented(state),
  'oll-edges': state => isLLEdgesOriented(state),
  'pll-corners': state => isLLCornersPermuted(state),
  'll-corners-placed': state => isLLCornersPlaced(state),
  'f2l-pair-formed': (state, condition) => isF2LPairFormed(state, condition.targetSlot ?? 'FR'),
};
export function checkStageCondition(state: CubeState, condition: StageCondition): boolean {
  const special = SPECIAL[condition.predicate];
  if (special) {
    if (condition.preserve && !arePiecesSolved(state, condition.preserve, condition.referenceFrame ?? 'fixed')) return false;
    return special(state, condition);
  }
  const spec = stageConditionSpec(condition);
  if (!spec) throw new Error(`Predicado de etapa desconhecido: ${condition.predicate}`);
  return validateStage(state, spec);
}

/** A generated practice start is valid when the fixture precondition holds, preserved pieces
 * are intact, and an execution goal is still open (recognition fixtures have no execution
 * goal to keep open).
 */
export function checkFixtureStart(state: CubeState, fixture: Pick<TrainerFixtureSpec, 'precondition' | 'preserve' | 'referenceFrame' | 'goal' | 'kind'>): boolean {
  if (fixture.precondition && !checkStageCondition(state, fixture.precondition)) return false;
  if (fixture.preserve.length && !arePiecesSolved(state, fixture.preserve, fixture.referenceFrame)) return false;
  if (fixture.kind === 'execution' && checkStageCondition(state, fixture.goal)) return false;
  return true;
}

/** Solution reproduction acceptance: precondition holds at the start state, the goal holds at
 * the end state, and preservation is checked on both extremes; pieces may move in between.
 */
export function checkStageTransition(before: CubeState, after: CubeState, fixture: { precondition: StageCondition | null; goal: StageCondition; preserve: readonly string[]; referenceFrame: 'fixed' | 'centers' }): boolean {
  if (fixture.precondition && !checkStageCondition(before, fixture.precondition)) return false;
  if (!checkStageCondition(after, fixture.goal)) return false;
  if (!fixture.preserve.length) return true;
  return arePiecesSolved(before, fixture.preserve, fixture.referenceFrame) && arePiecesSolved(after, fixture.preserve, fixture.referenceFrame);
}
