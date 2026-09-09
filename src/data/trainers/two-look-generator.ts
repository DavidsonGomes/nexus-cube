import { applyAlgorithm, canonicalOrientation, invertAlgorithm, solvedCube } from '../../domain/cube';
import type { CubeState } from '../../domain/types';
import { COMPILED_CASES } from '../catalog-compiled';
import { simplifySolverAlgorithm } from '../../solver/methods/simplify';
import { CFOP_TWO_LOOK_FIXTURES } from './cfop-two-look-fixtures';
import { checkStageCondition } from './stage-validators';
import type { StageCondition } from './types';
import type { TrainerRandom } from './cross-generator';

export interface TwoLookStep { readonly checkpointId: string | null; readonly algorithm: string }
export interface TwoLookSetup {
  readonly fixtureId: string;
  readonly caseId: string;
  readonly setup: string;
  readonly state: CubeState;
  readonly solution: string;
  readonly steps: readonly TwoLookStep[];
}
export interface TwoLookSetupGenerator { readonly fixtureIds: readonly string[]; readonly generate: (fixtureId: string, random: TrainerRandom) => TwoLookSetup }

const AUF = ['', 'U', 'U2', "U'"] as const;
const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
const byId = new Map<string, string>(COMPILED_CASES.map(item => [item.id, canonicalOrientation(item.algorithm)]));
const algorithmsOf = (ids: readonly string[]) => ids.map(id => {
  const algorithm = byId.get(id);
  if (!algorithm) throw new Error(`Caso do guia 2-look ausente do catálogo: ${id}`);
  return algorithm;
});
/** The same substep cases the catalog TWO_LOOK_GUIDE teaches; a recut, not a new catalog. */
const EDGE_CASES = ['OLL-01', 'OLL-44', 'OLL-45'];
const CORNER_CASES = ['OLL-21', 'OLL-22', 'OLL-23', 'OLL-24', 'OLL-25', 'OLL-26', 'OLL-27'];
const PLL_CORNER_CASES = ['PLL-Aa', 'PLL-E'];
const PLL_EDGE_CASES = ['PLL-Ua', 'PLL-Ub', 'PLL-H', 'PLL-Z'];
const OLL_IDS = COMPILED_CASES.filter(item => item.family === 'OLL').map(item => item.id);
const PLL_IDS = COMPILED_CASES.filter(item => item.family === 'PLL').map(item => item.id);

/** Breadth-first over rounds of (pre-AUF, substep algorithm), with a trailing AUF when the
 * target is exact. Small by construction: the guide substep sets are tiny and two rounds
 * cover every reachable pattern; failure to find a step is an error, never a silent skip.
 */
function searchLook(state: CubeState, algorithms: readonly string[], target: StageCondition, rounds: number): string {
  let frontier: { state: CubeState; sequence: string }[] = [{ state, sequence: '' }];
  for (let round = 0; round <= rounds; round++) {
    for (const node of frontier) {
      if (target.predicate === 'finish') {
        const closing = AUF.find(u => checkStageCondition(applyAlgorithm(node.state, u), target));
        if (closing !== undefined) return simplifySolverAlgorithm(join(node.sequence, closing));
      } else if (checkStageCondition(node.state, target)) {
        return simplifySolverAlgorithm(node.sequence);
      }
    }
    frontier = frontier.flatMap(node => AUF.flatMap(u => algorithms.map(algorithm => ({
      state: applyAlgorithm(node.state, join(u, algorithm)),
      sequence: join(node.sequence, u, algorithm),
    }))));
  }
  throw new Error('Subetapa 2-look sem solução no conjunto do guia.');
}

const PLANS: Record<string, { pool: readonly string[]; looks: readonly { checkpointId: string | null; algorithms: readonly string[]; target: StageCondition; rounds: number }[] }> = {
  'cfop/ll-two-look/oll-edges': { pool: OLL_IDS, looks: [{ checkpointId: null, algorithms: algorithmsOf(EDGE_CASES), target: { predicate: 'oll-edges' }, rounds: 2 }] },
  'cfop/ll-two-look/oll-corners': { pool: CORNER_CASES, looks: [{ checkpointId: null, algorithms: algorithmsOf(CORNER_CASES), target: { predicate: 'oll' }, rounds: 2 }] },
  'cfop/ll-two-look/pll-corners': { pool: PLL_IDS, looks: [{ checkpointId: null, algorithms: algorithmsOf(PLL_CORNER_CASES), target: { predicate: 'pll-corners' }, rounds: 3 }] },
  'cfop/ll-two-look/pll-edges': { pool: PLL_EDGE_CASES, looks: [{ checkpointId: null, algorithms: algorithmsOf(PLL_EDGE_CASES), target: { predicate: 'finish' }, rounds: 2 }] },
  'cfop/ll-two-look/oll-full': {
    pool: OLL_IDS,
    looks: [
      { checkpointId: 'edges-oriented', algorithms: algorithmsOf(EDGE_CASES), target: { predicate: 'oll-edges' }, rounds: 2 },
      { checkpointId: null, algorithms: algorithmsOf(CORNER_CASES), target: { predicate: 'oll' }, rounds: 2 },
    ],
  },
  'cfop/ll-two-look/pll-full': {
    pool: PLL_IDS,
    looks: [
      { checkpointId: 'corners-permuted', algorithms: algorithmsOf(PLL_CORNER_CASES), target: { predicate: 'pll-corners' }, rounds: 3 },
      { checkpointId: null, algorithms: algorithmsOf(PLL_EDGE_CASES), target: { predicate: 'finish' }, rounds: 2 },
    ],
  },
};

export function createTwoLookSetupGenerator(): TwoLookSetupGenerator {
  const solved = solvedCube();
  const fixtures = new Map(CFOP_TWO_LOOK_FIXTURES.map(fixture => [fixture.id, fixture]));
  const generate = (fixtureId: string, random: TrainerRandom): TwoLookSetup => {
    const fixture = fixtures.get(fixtureId), plan = PLANS[fixtureId];
    if (!fixture || !plan) throw new Error(`Fixture 2-look desconhecida: ${fixtureId}`);
    for (let attempt = 0; attempt < 100; attempt++) {
      const caseId = plan.pool[Math.floor(random.next() * plan.pool.length)];
      const auf = AUF[Math.floor(random.next() * AUF.length)];
      const setup = simplifySolverAlgorithm(join(invertAlgorithm(byId.get(caseId)!), auf));
      const state = applyAlgorithm(solved, setup);
      if (fixture.precondition && !checkStageCondition(state, fixture.precondition)) continue;
      if (checkStageCondition(state, fixture.goal)) continue;
      let current = state;
      const steps: TwoLookStep[] = [];
      for (const look of plan.looks) {
        const algorithm = searchLook(current, look.algorithms, look.target, look.rounds);
        current = applyAlgorithm(current, algorithm);
        steps.push({ checkpointId: look.checkpointId, algorithm });
      }
      if (!checkStageCondition(current, fixture.goal)) throw new Error(`Solução 2-look não fecha o objetivo: ${fixtureId}`);
      // The checkpoint boundary stays visible: the solution is the plain concatenation of the
      // steps, each already simplified inside itself, never merged across the two looks.
      return { fixtureId, caseId, setup, state, solution: join(...steps.map(step => step.algorithm)), steps };
    }
    throw new Error(`Não foi possível gerar preparo 2-look: ${fixtureId}`);
  };
  return { fixtureIds: CFOP_TWO_LOOK_FIXTURES.map(fixture => fixture.id), generate };
}
