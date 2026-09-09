import { applyAlgorithm, canonicalOrientation, invertAlgorithm, solvedCube } from '../../domain/cube';
import { validateStage } from '../../domain/stage-validation';
import type { CubeState } from '../../domain/types';
import { COMPILED_CASES } from '../catalog-compiled';
import { simplifySolverAlgorithm } from '../../solver/methods/simplify';
import type { TrainerRandom } from './cross-generator';

export interface LastLayerSetup {
  readonly caseId: string;
  readonly family: 'OLL' | 'PLL';
  readonly setup: string;
  readonly state: CubeState;
  readonly solution: string;
  readonly rotation: string;
  readonly auf: string;
}
export interface LastLayerSetupGenerator { readonly family: 'OLL' | 'PLL'; readonly caseIds: readonly string[]; readonly generate: (caseId: string, random: TrainerRandom) => LastLayerSetup }

const ROTATIONS = ['', 'y', 'y2', "y'"] as const;
const AUF = ['', 'U', 'U2', "U'"] as const;
const F2L_PIECES = ['DF', 'DR', 'DB', 'DL', 'FR', 'DFR', 'FL', 'DFL', 'BR', 'DBR', 'BL', 'DBL'];
const join = (...parts: string[]) => parts.filter(Boolean).join(' ');

/** OLL setups start from a solved F2L with varied presentation (y angle and AUF); PLL setups
 * additionally start with the last layer already oriented. Every generated setup is
 * revalidated: the paired solution reaches the family goal and the first two layers hold at
 * both extremes, in the fixed reference. Divergence throws instead of shipping the exercise.
 */
export function createLastLayerSetupGenerator(family: 'OLL' | 'PLL'): LastLayerSetupGenerator {
  const cases = COMPILED_CASES.filter(item => item.family === family);
  const byId = new Map<string, (typeof cases)[number]>(cases.map(item => [item.id, item]));
  const solved = solvedCube();
  const generate = (caseId: string, random: TrainerRandom): LastLayerSetup => {
    const item = byId.get(caseId);
    if (!item) throw new Error(`Caso ${family} desconhecido: ${caseId}`);
    const rotation = ROTATIONS[Math.floor(random.next() * ROTATIONS.length)];
    const auf = AUF[Math.floor(random.next() * AUF.length)];
    const solution = simplifySolverAlgorithm(join(invertAlgorithm(auf), rotation, canonicalOrientation(item.algorithm), invertAlgorithm(rotation)));
    const setup = simplifySolverAlgorithm(invertAlgorithm(solution));
    const state = applyAlgorithm(solved, setup);
    const after = applyAlgorithm(state, solution);
    if (!validateStage(state, { goal: 'f2l', preserve: F2L_PIECES })) throw new Error(`Preparo sem F2L resolvido: ${caseId}`);
    if (family === 'PLL' && !validateStage(state, { goal: 'oll' })) throw new Error(`Preparo PLL sem última camada orientada: ${caseId}`);
    if (validateStage(state, { goal: family === 'OLL' ? 'oll' : 'pll' })) throw new Error(`Preparo já satisfaz o objetivo: ${caseId}`);
    if (!validateStage(after, { goal: family === 'OLL' ? 'oll' : 'pll', preserve: F2L_PIECES })) throw new Error(`Solução não atinge o objetivo: ${caseId}`);
    return { caseId, family, setup, state, solution, rotation, auf };
  };
  return { family, caseIds: cases.map(item => item.id), generate };
}
