import { arePiecesSolved, FIRST_BLOCK_PIECES, SECOND_BLOCK_PIECES, U_CORNERS } from '../../../domain/stage-validation';
import type { CubeState } from '../../../domain/types';
import { methodGoalSatisfied } from '../plan';

export const ROUX_LEFT = [...FIRST_BLOCK_PIECES, 'L'] as const;
export const ROUX_BLOCKS = [...ROUX_LEFT, ...SECOND_BLOCK_PIECES, 'R'] as const;
export const ROUX_CORNERS = [...ROUX_BLOCKS, ...U_CORNERS] as const;
export const rouxFirstBlock = (state: CubeState) => methodGoalSatisfied(state, { kind: 'first-block' });
export const rouxSecondBlock = (state: CubeState) => methodGoalSatisfied(state, { kind: 'second-block' });
export const rouxCMLL = (state: CubeState) => methodGoalSatisfied(state, { kind: 'cmll' });
export const rouxEO = (state: CubeState) => methodGoalSatisfied(state, { kind: 'lse-eo' });
export const rouxLR = (state: CubeState) => methodGoalSatisfied(state, { kind: 'lse-lr' });
export const rouxSolved = (state: CubeState) => methodGoalSatisfied(state, { kind: 'solved' });
export const rouxCentersFixed = (state: CubeState) => arePiecesSolved(state, ['U', 'R', 'F', 'D', 'L', 'B']);
