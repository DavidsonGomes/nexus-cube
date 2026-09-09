import { applyAlgorithm, invertAlgorithm, solvedCube } from '../../domain/cube';
import { pieceStickerIds, validateStage } from '../../domain/stage-validation';
import { simplifySolverAlgorithm } from '../../solver/methods/simplify';
import type { CubeState } from '../../domain/types';
import { CANONICAL_PIECE_NAMES } from './finger-tricks';
import { createF2LSetupGenerator } from './f2l-generator';
import type { TargetSlot, TrainerFixtureSpec } from './types';
import type { TrainerRandom } from './cross-generator';

const solved = solvedCube();
const cellNames = new Map<string, string>();
for (const name of CANONICAL_PIECE_NAMES) {
  const ids = pieceStickerIds([name]);
  cellNames.set(String(solved.find(sticker => ids.includes(sticker.id))!.position), name);
}

/** Where a piece ends after a sequence, named by the canonical home piece of that cell.
 * Pure domain computation; it is the app-side verification of every prediction exercise.
 */
export function trackPieceCell(state: CubeState, algorithm: string, piece: string): string {
  const ids = new Set(pieceStickerIds([piece]));
  const after = applyAlgorithm(state, algorithm);
  const sticker = after.find(item => ids.has(item.id));
  if (!sticker) throw new Error(`Peça desconhecida no rastreio: ${piece}`);
  const cell = cellNames.get(String(sticker.position));
  if (!cell) throw new Error(`Célula sem nome canônico: ${String(sticker.position)}`);
  return cell;
}

const SLOTS: readonly TargetSlot[] = ['FR', 'FL', 'BR', 'BL'];
const base = {
  trainerId: 'lookahead',
  methodId: 'cfop',
  stageId: 'f2l',
  groupId: 'lookahead',
  kind: 'recognition',
  precondition: { predicate: 'cross' },
  preserve: ['DF', 'DR', 'DB', 'DL', 'D'],
  referenceFrame: 'fixed',
  goal: { predicate: 'any-legal' },
  setupSubgroup: null,
  difficulty: null,
  focus: null,
  provenance: [{ title: 'Gerador F2L Nexus Cube', url: 'src/data/trainers/f2l-generator.ts', author: 'Nexus Cube', license: 'MIT (Nexus Cube)', notes: 'Previsão verificada pelo rastreador de peças do domínio; metrônomo e pausa são opções de tela.' }],
} satisfies Partial<TrainerFixtureSpec>;

/** Lookahead trainer fixtures (spec item 9): follow a piece, or the next pair, while another
 * step executes; the pause-and-ask answer is the tracked destination cell, app-verified.
 */
export const LOOKAHEAD_FIXTURES: readonly TrainerFixtureSpec[] = [
  {
    ...base, id: 'cfop/lookahead/track-piece',
    name: 'Seguir uma peça',
    objective: 'Enquanto a inserção do par executa, acompanhe a peça indicada e responda onde ela termina.',
  },
  {
    ...base, id: 'cfop/lookahead/next-pair',
    name: 'Prever o próximo par',
    objective: 'Enquanto o par atual é resolvido, acompanhe o canto e a aresta do próximo par e responda onde eles terminam.',
  },
];

export interface LookaheadExercise {
  readonly fixtureId: string;
  readonly caseId: string;
  readonly slot: TargetSlot;
  readonly state: CubeState;
  readonly setup: string;
  readonly algorithm: string;
  readonly questions: readonly { readonly piece: string; readonly answerCell: string }[];
}
export function verifyLookaheadAnswer(exercise: LookaheadExercise, piece: string, selectedCell: string): boolean {
  const question = exercise.questions.find(item => item.piece === piece);
  if (!question) throw new Error(`Pergunta de lookahead desconhecida: ${piece}`);
  return question.answerCell === selectedCell;
}

const EJECT_FORMS = ["R U R'", "R U' R'", "R U2 R'"];
const ROTATIONS = ['', 'y', 'y2', "y'"];
const conjugate = (rotation: string, algorithm: string) => [rotation, algorithm, invertAlgorithm(rotation)].filter(Boolean).join(' ');

export function createLookaheadGenerator() {
  const f2l = createF2LSetupGenerator();
  const generate = (fixtureId: string, random: TrainerRandom): LookaheadExercise => {
    if (!LOOKAHEAD_FIXTURES.some(fixture => fixture.id === fixtureId)) throw new Error(`Fixture de lookahead desconhecida: ${fixtureId}`);
    for (let attempt = 0; attempt < 200; attempt++) {
      const caseId = f2l.caseIds[Math.floor(random.next() * f2l.caseIds.length)];
      const slot = SLOTS[Math.floor(random.next() * SLOTS.length)];
      const setup = f2l.generate(caseId, slot, random);
      if (fixtureId === 'cfop/lookahead/track-piece') {
        // The raw setup is the exact inverse of the solution, so every piece would end at
        // home; last-layer noise (validated to keep the insertion working) makes the tracked
        // destination a real prediction.
        const noise = [`${['', 'U', 'U2', "U'"][Math.floor(random.next() * 4)]} ${["R U R' U R U2 R'", "F R U R' U' F'"][Math.floor(random.next() * 2)]}`.trim()];
        const state = applyAlgorithm(setup.state, noise[0]);
        if (!validateStage(applyAlgorithm(state, setup.solution), { goal: 'f2l-pair', targetSlot: slot })) continue;
        const piece = ['UF', 'UR', 'UB', 'UL'][Math.floor(random.next() * 4)];
        const answerCell = trackPieceCell(state, setup.solution, piece);
        if (answerCell === piece) continue;
        return { fixtureId, caseId, slot, state, setup: simplifySolverAlgorithm(`${setup.setup} ${noise[0]}`), algorithm: setup.solution, questions: [{ piece, answerCell }] };
      }
      // Next pair: eject the following pair out of its slot first, then confirm the current
      // solution still completes its own pair with the cross intact; only then ask where the
      // ejected pieces travel while the current insertion runs.
      const nextSlot = SLOTS[(SLOTS.indexOf(slot) + 1 + Math.floor(random.next() * 3)) % SLOTS.length];
      const eject = conjugate(ROTATIONS[Math.floor(random.next() * 4)], EJECT_FORMS[Math.floor(random.next() * 3)]);
      const state = applyAlgorithm(setup.state, eject);
      const after = applyAlgorithm(state, setup.solution);
      if (!validateStage(after, { goal: 'f2l-pair', targetSlot: slot })) continue;
      if (validateStage(state, { goal: 'f2l-pair', targetSlot: nextSlot })) continue;
      const questions = [nextSlot, `D${nextSlot}`].map(piece => ({ piece, answerCell: trackPieceCell(state, setup.solution, piece) }));
      if (questions.every(question => question.answerCell === question.piece)) continue;
      return { fixtureId, caseId, slot, state, setup: simplifySolverAlgorithm(`${setup.setup} ${eject}`), algorithm: setup.solution, questions };
    }
    throw new Error(`Não foi possível gerar exercício de lookahead: ${fixtureId}`);
  };
  return { fixtureIds: LOOKAHEAD_FIXTURES.map(fixture => fixture.id), generate };
}
