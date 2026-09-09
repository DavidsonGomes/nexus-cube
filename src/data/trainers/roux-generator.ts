import { applyAlgorithm, invertAlgorithm, parseAlgorithm, solvedCube } from '../../domain/cube';
import { arePiecesSolved } from '../../domain/stage-validation';
import type { CubeState } from '../../domain/types';
import { CMLL_SOURCES } from '../expansion-sources/cmll';
import { searchBlock, searchContext, turns } from '../../solver/methods/roux/search';
import { CMLL_INTRO_CASES, ROUX_TRAINER_FIXTURES } from '../../solver/methods/roux/trainer-fixtures';
import { simplifySolverAlgorithm } from '../../solver/methods/simplify';
import { checkStageCondition } from './stage-validators';
import type { TrainerFixtureSpec } from './types';
import type { TrainerRandom } from './cross-generator';

export interface RouxSetup { readonly fixtureId: string; readonly setup: string; readonly state: CubeState; readonly caseId?: string }
export interface RouxSetupGenerator { readonly fixtureIds: readonly string[]; readonly generate: (fixtureId: string, random: TrainerRandom, options?: { levelId?: string }) => Promise<RouxSetup> }

const solved = solvedCube();
const CMLL_CASE_BY_FIXTURE = new Map<string, string>([
  ['roux/cmll/oriented-1', 'roux/cmll/01'],
  ['roux/cmll/oriented-2', 'roux/cmll/02'],
  ...CMLL_INTRO_CASES.map(({ fixtureId, caseId }): [string, string] => [fixtureId, caseId]),
]);
const CMLL_ALGORITHMS = new Map(CMLL_SOURCES.map(source => [source.id, source.algorithm]));
const SB_PIECES = ['DR', 'FR', 'BR', 'DFR', 'DBR', 'U'];

function pick<T>(values: readonly T[], random: TrainerRandom): T { return values[Math.floor(random.next() * values.length)]; }
function netUFix(tokens: readonly string[]): string {
  const net = tokens.reduce((sum, token) => token[0] === 'U' ? (sum + (token === 'U' ? 1 : token === 'U2' ? 2 : 3)) % 4 : sum, 0);
  return ['', "U'", 'U2', 'U'][net];
}
function walkOf(subgroup: readonly string[], length: number, random: TrainerRandom, normalizeU: boolean): string {
  const tokens = Array.from({ length }, () => pick(subgroup.flatMap(move => [move, `${move}2`, `${move}'`].filter(t => parseAlgorithm(t).length === 1)), random));
  return simplifySolverAlgorithm([...tokens, ...(normalizeU ? [netUFix(tokens)] : [])].join(' '));
}
function startValid(fixture: TrainerFixtureSpec, state: CubeState): boolean {
  if (fixture.precondition && !checkStageCondition(state, fixture.precondition)) return false;
  if (fixture.preserve.length && !arePiecesSolved(state, fixture.preserve, fixture.referenceFrame)) return false;
  if (fixture.kind === 'execution' && checkStageCondition(state, fixture.goal)) return false;
  return true;
}

/** Generates practice setups for the 24 Roux fixtures (Dobra contract items 3 and 5):
 * subgroup fixtures use a filtered random walk (net U normalized for the U/M family so the
 * CMLL precondition holds by construction), CMLL fixtures invert the licensed corpus case and
 * vary the free U/M edges without touching the corner case, and the two null-subgroup SB
 * steps derive a valid start from a prefix of a real second-block solution. Every candidate
 * is validated against the fixture precondition, preservation and open goal before shipping.
 */
export function createRouxSetupGenerator(): RouxSetupGenerator {
  const byId = new Map(ROUX_TRAINER_FIXTURES.map(fixture => [fixture.id, fixture]));
  async function generate(fixtureId: string, random: TrainerRandom, options: { levelId?: string } = {}): Promise<RouxSetup> {
    const fixture = byId.get(fixtureId);
    if (!fixture) throw new Error(`Fixture Roux desconhecida: ${fixtureId}`);
    const level = options.levelId === undefined ? fixture.difficulty?.[0] : fixture.difficulty?.find(item => item.id === options.levelId);
    if (options.levelId !== undefined && !level) throw new Error(`Nível desconhecido: ${fixtureId}/${options.levelId}`);
    const length = level?.setupMoves ?? 10;
    for (let attempt = 0; attempt < 300; attempt++) {
      // Two-look draws from the WHOLE corpus (Dobra's adjustment): every corpus case is a
      // permutation variant of some orientation group, so the first look uses the group's
      // intro case and the second look starts from a genuine oriented variant; drawing an
      // O-group case teaches the legitimate "already oriented, go straight to look two".
      const caseId = CMLL_CASE_BY_FIXTURE.get(fixtureId)
        ?? (fixtureId === 'roux/cmll/orientation-recognition' || fixtureId === 'roux/cmll/two-look' ? pick([...CMLL_ALGORITHMS.keys()], random) : undefined);
      let setup: string;
      if (caseId !== undefined) {
        const algorithm = CMLL_ALGORITHMS.get(caseId);
        if (!algorithm) throw new Error(`Caso CMLL fora do corpus: ${caseId}`);
        setup = simplifySolverAlgorithm(`${invertAlgorithm(parseAlgorithm(algorithm).join(' '))} ${walkOf(['U', 'M'], 6, random, true)}`);
      } else if (fixture.setupSubgroup) {
        setup = walkOf(fixture.setupSubgroup, length, random, fixture.setupSubgroup.every(move => move === 'U' || move === 'M'));
      } else if (fixtureId === 'roux/fb/pieces') {
        setup = walkOf(['U', 'R', 'F', 'D', 'L', 'B'], length, random, false);
      } else if (fixtureId === 'roux/sb/pieces') {
        setup = walkOf(['U', 'R', 'M', 'r'], length, random, false);
      } else if (fixtureId === 'roux/sb/square' || fixtureId === 'roux/sb/block') {
        const walk = walkOf(['U', 'R', 'M', 'r'], 8, random, false);
        const start = applyAlgorithm(solved, walk);
        const solution = parseAlgorithm(await searchBlock(start, SB_PIECES, turns('URMr'), searchContext({})));
        const candidates: string[] = [];
        for (let cut = 0; cut <= solution.length; cut++) {
          const prefix = solution.slice(0, cut).join(' ');
          if (startValid(fixture, applyAlgorithm(start, prefix))) candidates.push(prefix);
        }
        if (!candidates.length) continue;
        setup = simplifySolverAlgorithm(`${walk} ${pick(candidates, random)}`);
      } else {
        throw new Error(`Fixture sem estratégia de geração: ${fixtureId}`);
      }
      const state = applyAlgorithm(solved, setup);
      if (!startValid(fixture, state)) continue;
      return { fixtureId, setup, state, ...(caseId !== undefined ? { caseId } : {}) };
    }
    throw new Error(`Não foi possível gerar preparo válido: ${fixtureId}`);
  }
  return { fixtureIds: ROUX_TRAINER_FIXTURES.map(fixture => fixture.id), generate };
}
