import { applyAlgorithm, invertAlgorithm, solvedCube } from '../../domain/cube';
import type { CubeState } from '../../domain/types';
import { COMPILED_CASES } from '../catalog-compiled';
import { LBL_SLICE2_FIXTURES, LBL_TRAINER_FIXTURES } from '../../solver/methods/lbl/trainer-fixtures';
import { simplifySolverAlgorithm } from '../../solver/methods/simplify';
import { createCrossSetupGenerator } from './cross-generator';
import type { TrainerRandom } from './cross-generator';
import { classifyRecognition } from './recognition';
import { checkFixtureStart } from './stage-validators';

export interface LBLSetup {
  readonly fixtureId: string;
  readonly setup: string;
  readonly state: CubeState;
  readonly caseId?: string;
  readonly provenMinimumMoves?: number;
  /** App-verified recognition key, present only for fixtures declaring a classifier. */
  readonly answer?: string;
}
export interface LBLSetupGenerator { readonly fixtureIds: readonly string[]; readonly generate: (fixtureId: string, random: TrainerRandom) => LBLSetup }

const solved = solvedCube();
const ROTATIONS = ['', 'y', 'y2', "y'"] as const;
const AUF = ['', 'U', 'U2', "U'"] as const;
const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
const conjugate = (rotation: string, algorithm: string) => join(rotation, algorithm, invertAlgorithm(rotation));
const pick = <T,>(values: readonly T[], random: TrainerRandom): T => values[Math.floor(random.next() * values.length)];
const algorithmOf = (id: string): string => {
  const item = COMPILED_CASES.find(entry => entry.id === id);
  if (!item) throw new Error(`Caso do catálogo ausente: ${id}`);
  return item.algorithm;
};
const CORNER_EJECTS = ["R U R'", "R U' R'", "R U2 R'"];
const MIDDLE_INSERT = "U R U' R' U' F' U F";
const OLL_IDS = COMPILED_CASES.filter(item => item.family === 'OLL').map(item => item.id);
const ORIENTED_LL_IDS = ['OLL-21', 'OLL-22', 'OLL-23', 'OLL-24', 'OLL-25', 'OLL-26', 'OLL-27', ...COMPILED_CASES.filter(item => item.family === 'PLL').map(item => item.id)];
const CORNER_PERM_IDS = ['PLL-Aa', 'PLL-E'];

/** One constructive strategy per stage of the approved LBL proposal, always revalidated by
 * checkFixtureStart before shipping (precondition, preservation, open goal); a candidate
 * that fails is retried, and structural impossibilities throw instead of shipping.
 * The final stage inverts the beginner corner-twist mechanic itself (pairs of R' D' R D
 * with U steps whose twists cancel modulo three), so its starts are placed-but-twisted
 * exactly like a real solve reaches them.
 */
export async function createLBLSetupGenerator(): Promise<LBLSetupGenerator> {
  const cross = await createCrossSetupGenerator();
  const fixtures = new Map([...LBL_TRAINER_FIXTURES, ...LBL_SLICE2_FIXTURES].map(fixture => [fixture.id, fixture]));
  const strategies: Record<string, (random: TrainerRandom) => { setup: string; caseId?: string; provenMinimumMoves?: number }> = {
    'lbl/cross': random => {
      const target = 2 + Math.floor(random.next() * 4);
      const generated = cross.generate(target, random);
      return { setup: generated.setup, provenMinimumMoves: generated.provenMinimumMoves };
    },
    'lbl/corners': random => ({
      setup: join(...Array.from({ length: 3 + Math.floor(random.next() * 3) }, () => join(pick(AUF, random), conjugate(pick(ROTATIONS, random), pick(CORNER_EJECTS, random))))),
    }),
    'lbl/middle': random => ({
      setup: join(...Array.from({ length: 2 + Math.floor(random.next() * 2) }, () => join(pick(AUF, random), invertAlgorithm(conjugate(pick(ROTATIONS, random), MIDDLE_INSERT))))),
    }),
    'lbl/top-cross': random => {
      const caseId = pick(OLL_IDS, random);
      return { setup: join(invertAlgorithm(algorithmOf(caseId)), pick(AUF, random)), caseId };
    },
    'lbl/top-edges': random => {
      const caseId = pick(ORIENTED_LL_IDS, random);
      return { setup: join(invertAlgorithm(algorithmOf(caseId)), pick(AUF, random)), caseId };
    },
    'lbl/top-corners-position': random => ({
      setup: join(...Array.from({ length: 1 + Math.floor(random.next() * 2) }, () => conjugate(pick(AUF, random), invertAlgorithm(algorithmOf(pick(CORNER_PERM_IDS, random)))))),
    }),
    'lbl/top-corners-orient': random => {
      const twists = Array.from({ length: 3 }, () => Math.floor(random.next() * 3));
      twists.push((3 - (twists[0] + twists[1] + twists[2]) % 3) % 3);
      const solving = twists.map(twist => join(...Array.from({ length: 2 * twist }, () => "R' D' R D"), 'U')).join(' ');
      return { setup: invertAlgorithm(solving) };
    },
  };
  // Slice 2 (Dobra): the per-piece and recognition fixtures reuse the parent stage strategy;
  // recognition validity is gated below by the classifier answer falling in the fixture options.
  strategies['lbl/corners/one'] = strategies['lbl/corners'];
  strategies['lbl/middle/one'] = strategies['lbl/middle'];
  strategies['lbl/cross/pieces'] = random => ({ setup: join(...Array.from({ length: 12 }, () => pick(['U', 'D', 'L', 'R', 'F', 'B'].flatMap(face => [face, `${face}2`, `${face}'`]), random))) });
  strategies['lbl/corners/pieces'] = strategies['lbl/corners'];
  strategies['lbl/middle/pieces'] = strategies['lbl/middle'];
  strategies['lbl/top-cross/pattern'] = strategies['lbl/top-cross'];
  strategies['lbl/top-edges/match'] = strategies['lbl/top-edges'];
  strategies['lbl/top-corners-position/spot'] = strategies['lbl/top-corners-position'];
  const generate = (fixtureId: string, random: TrainerRandom): LBLSetup => {
    const fixture = fixtures.get(fixtureId), strategy = strategies[fixtureId];
    if (!fixture || !strategy) throw new Error(`Fixture LBL desconhecida: ${fixtureId}`);
    for (let attempt = 0; attempt < 300; attempt++) {
      const candidate = strategy(random);
      const setup = simplifySolverAlgorithm(candidate.setup);
      const state = applyAlgorithm(solved, setup);
      if (!checkFixtureStart(state, fixture)) continue;
      let answer: string | undefined;
      if (fixture.recognition) {
        answer = classifyRecognition(fixture.recognition.classifierId, state);
        if (!fixture.recognition.optionIds.includes(answer)) continue;
      }
      return { fixtureId, setup, state, ...(candidate.caseId !== undefined ? { caseId: candidate.caseId } : {}), ...(candidate.provenMinimumMoves !== undefined ? { provenMinimumMoves: candidate.provenMinimumMoves } : {}), ...(answer !== undefined ? { answer } : {}) };
    }
    throw new Error(`Não foi possível gerar preparo LBL válido: ${fixtureId}`);
  };
  return { fixtureIds: [...LBL_TRAINER_FIXTURES, ...LBL_SLICE2_FIXTURES].map(fixture => fixture.id), generate };
}
