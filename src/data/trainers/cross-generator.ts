import { applyAlgorithm, solvedCube } from '../../domain/cube';
import type { CubeState, Face } from '../../domain/types';
import { buildAnchorPDB, createAnchorModel } from '../../solver/methods/anchors';
import { simplifySolverAlgorithm } from '../../solver/methods/simplify';

const EDGE_NAMES = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'] as const;
/** The four edges of a face, in the canonical spelling; the D face yields the classic cross. */
export function crossPiecesOf(face: Face): readonly string[] {
  return EDGE_NAMES.filter(name => name.includes(face));
}

export interface TrainerRandom { next(): number }
/** Deterministic splitmix32 so generated setups are reproducible in tests and sessions. */
export function createTrainerRandom(seed: number): TrainerRandom {
  let value = seed >>> 0;
  return {
    next() {
      value = (value + 0x9e3779b9) >>> 0;
      let mixed = value;
      mixed ^= mixed >>> 16; mixed = Math.imul(mixed, 0x21f0aaad);
      mixed ^= mixed >>> 15; mixed = Math.imul(mixed, 0x735a2d97);
      mixed ^= mixed >>> 15;
      return (mixed >>> 0) / 4294967296;
    },
  };
}

export interface CrossSetup {
  readonly setup: string;
  readonly state: CubeState;
  readonly provenMinimumMoves: number;
  readonly face: Face;
  /** One optimal cross solution from the same complete BFS; its length equals the proven minimum. */
  readonly solution: string;
}
export interface CrossSetupGenerator { readonly face: Face; readonly ceiling: number; readonly generate: (targetMinimum: number, random: TrainerRandom) => CrossSetup }

const CROSS_TURNS = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap(face => [face, `${face}2`, `${face}'`]);
const parseAlgorithmLength = (algorithm: string) => algorithm.trim() ? algorithm.trim().split(/\s+/).length : 0;

/** Difficulty by proven minimum: the anchor PDB is a complete BFS over the exact cross
 * abstraction (the four edges of the chosen face under all face turns), so its distance IS
 * the minimum face-turn count to solve that cross of the generated state. The setup is built
 * by a distance-increasing walk, so the announced minimum is proven, never estimated.
 * The proof covers the cross subproblem only; nothing here claims whole-solve optimality.
 * The face parameter is the color choice of spec item 3; D is the classic white cross.
 */
export async function createCrossSetupGenerator(face: Face = 'D'): Promise<CrossSetupGenerator> {
  const pdb = await buildAnchorPDB(createAnchorModel('edge', CROSS_TURNS), crossPiecesOf(face));
  let ceiling = 0;
  for (const distance of pdb.distances) { if (distance > ceiling) ceiling = distance; }
  const generate = (targetMinimum: number, random: TrainerRandom): CrossSetup => {
    if (!Number.isInteger(targetMinimum) || targetMinimum < 1 || targetMinimum > ceiling) throw new Error(`Dificuldade de cruz fora do alcance provado (1 a ${ceiling}).`);
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = pdb.encode(solvedCube());
      const moves: string[] = [];
      while (pdb.distances[code] < targetMinimum) {
        const rising: number[] = [];
        for (let move = 0; move < CROSS_TURNS.length; move++) {
          if (pdb.distances[pdb.transition(code, move)] === pdb.distances[code] + 1) rising.push(move);
        }
        if (!rising.length) break;
        const move = rising[Math.floor(random.next() * rising.length)];
        moves.push(CROSS_TURNS[move]);
        code = pdb.transition(code, move);
      }
      if (pdb.distances[code] !== targetMinimum) continue;
      const setup = simplifySolverAlgorithm(moves.join(' '));
      const state = applyAlgorithm(solvedCube(), setup);
      if (pdb.distances[pdb.encode(state)] !== targetMinimum) throw new Error('Preparo de cruz divergente da prova.');
      const solution = pdb.solution(state).join(' ');
      if (parseAlgorithmLength(solution) !== targetMinimum) throw new Error('Solução de cruz divergente do mínimo provado.');
      return { setup, state, provenMinimumMoves: targetMinimum, face, solution };
    }
    throw new Error('Não foi possível gerar preparo de cruz na dificuldade pedida.');
  };
  return { face, ceiling, generate };
}
