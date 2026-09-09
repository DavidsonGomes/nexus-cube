import { applyAlgorithm, invertAlgorithm, solvedCube } from '../../domain/cube';
import { methodStateKey } from '../../solver/methods/plan';
import { simplifySolverAlgorithm } from '../../solver/methods/simplify';
import type { MethodPlan, MethodStageId } from '../../solver/methods/types';
import type { CubeState } from '../../domain/types';

export interface ContinueHereExercise {
  readonly stageId: MethodStageId;
  readonly title: string;
  /** Physical preparation from a solved cube: the inverse of everything the plan still does. */
  readonly setup: string;
  readonly state: CubeState;
  /** The stage's own moves; progressive hints are its leading slices. */
  readonly stageTokens: readonly string[];
  /** Everything from this stage to the end; revealing it is the full answer. */
  readonly remainingTokens: readonly string[];
}

/** Spec item 17: any stage of a computed plan becomes an exercise. The plan always ends on
 * the 54 solved stickers, so the inverse of the remaining moves reproduces the stage's start
 * from a solved cube; the reproduction is verified here before the exercise ships.
 */
export function planStageToExercise(plan: MethodPlan, stageId: MethodStageId): ContinueHereExercise {
  const stage = plan.stages.find(item => item.id === stageId);
  if (!stage) throw new Error(`Etapa fora do plano: ${stageId}`);
  const remainingTokens = plan.tokens.slice(stage.startStep);
  const setup = simplifySolverAlgorithm(invertAlgorithm(remainingTokens.join(' ')));
  const state = applyAlgorithm(solvedCube(), setup);
  if (methodStateKey(state) !== methodStateKey(stage.initialState)) throw new Error(`Preparo divergente do estado da etapa: ${stageId}`);
  return { stageId, title: stage.title, setup, state, stageTokens: stage.tokens, remainingTokens };
}

export function continueHereHint(exercise: ContinueHereExercise, revealedMoves: number): readonly string[] {
  if (!Number.isInteger(revealedMoves) || revealedMoves < 0) throw new Error('Quantidade de dicas inválida.');
  return exercise.stageTokens.slice(0, Math.min(revealedMoves, exercise.stageTokens.length));
}
