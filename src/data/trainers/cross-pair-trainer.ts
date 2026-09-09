import { applyAlgorithm } from '../../domain/cube';
import { validateStage } from '../../domain/stage-validation';
import type { CubeState } from '../../domain/types';
import { createCrossSetupGenerator } from './cross-generator';
import type { CrossSetupGenerator, TrainerRandom } from './cross-generator';
import { trackPieceCell } from './lookahead';
import type { TargetSlot, TrainerFixtureSpec } from './types';

const SLOTS: readonly TargetSlot[] = ['FR', 'FL', 'BR', 'BL'];
const base = {
  trainerId: 'cross-first-pair',
  methodId: 'cfop',
  stageId: 'cross',
  groupId: 'cross-first-pair',
  kind: 'execution',
  precondition: null,
  preserve: [],
  referenceFrame: 'fixed',
  setupSubgroup: ['U', 'R', 'F', 'D', 'L', 'B'],
  difficulty: null,
  focus: { kind: 'pieces', pieces: ['DF', 'DR', 'DB', 'DL', 'DFR', 'FR'], referencePieces: ['D'] },
  provenance: [{ title: 'Gerador de cruz Nexus Cube', url: 'src/data/trainers/cross-generator.ts', author: 'Nexus Cube', license: 'MIT (Nexus Cube)', notes: 'Transição cruz para F2L; previsão verificada pelo rastreador de peças do domínio.' }],
} satisfies Partial<TrainerFixtureSpec>;

/** Cross plus first pair fixtures (spec item 11), the objective made explicit per fixture:
 * predict announces where the pair pieces end after the planned cross; anticipate solves the
 * cross and then the pair with the cross checkpoint between; xcross solves both together.
 */
export const CROSS_PAIR_FIXTURES: readonly TrainerFixtureSpec[] = [
  {
    ...base, id: 'cfop/cross-pair/predict', kind: 'recognition',
    name: 'Prever o primeiro par',
    objective: 'Planeje a cruz e responda onde o canto e a aresta do primeiro par terminam quando ela executar.',
    goal: { predicate: 'any-legal' },
  },
  {
    ...base, id: 'cfop/cross-pair/anticipate',
    name: 'Cruz e depois o par',
    objective: 'Resolva a cruz, confira o marco e emende o primeiro par sem pausar o olhar.',
    checkpoints: [{ id: 'cross-done', name: 'Cruz pronta', objective: 'Confira as quatro arestas da cruz antes de emendar o par.', condition: { predicate: 'cross' } }],
    goal: { predicate: 'f2l-pair' },
  },
  {
    ...base, id: 'cfop/cross-pair/xcross',
    name: 'X-cross',
    objective: 'Resolva a cruz e o primeiro par JUNTOS, planejando os dois desde a inspeção.',
    goal: { predicate: 'f2l-pair' },
  },
];

export interface CrossPairExercise {
  readonly fixtureId: string;
  readonly slot: TargetSlot;
  readonly state: CubeState;
  readonly setup: string;
  readonly crossSolution: string;
  readonly provenCrossMinimum: number;
  readonly questions?: readonly { readonly piece: string; readonly answerCell: string }[];
}

export async function createCrossPairGenerator() {
  const cross: CrossSetupGenerator = await createCrossSetupGenerator('D');
  const generate = (fixtureId: string, random: TrainerRandom): CrossPairExercise => {
    if (!CROSS_PAIR_FIXTURES.some(fixture => fixture.id === fixtureId)) throw new Error(`Fixture cruz+par desconhecida: ${fixtureId}`);
    for (let attempt = 0; attempt < 100; attempt++) {
      const target = 3 + Math.floor(random.next() * 3);
      const setup = cross.generate(target, random);
      const slot = SLOTS[Math.floor(random.next() * SLOTS.length)];
      if (validateStage(applyAlgorithm(setup.state, setup.solution), { goal: 'f2l-pair', targetSlot: slot })) continue;
      const exercise: CrossPairExercise = { fixtureId, slot, state: setup.state, setup: setup.setup, crossSolution: setup.solution, provenCrossMinimum: setup.provenMinimumMoves };
      if (fixtureId !== 'cfop/cross-pair/predict') return exercise;
      const questions = [`D${slot}`, slot].map(piece => ({ piece, answerCell: trackPieceCell(setup.state, setup.solution, piece) }));
      if (questions.every(question => question.answerCell === question.piece)) continue;
      return { ...exercise, questions };
    }
    throw new Error(`Não foi possível gerar exercício cruz+par: ${fixtureId}`);
  };
  return { fixtureIds: CROSS_PAIR_FIXTURES.map(fixture => fixture.id), generate };
}
