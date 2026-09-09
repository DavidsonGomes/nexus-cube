import { applyAlgorithm } from '../../domain/cube';
import { validateStage } from '../../domain/stage-validation';
import { createF2LSetupGenerator } from './f2l-generator';
import type { F2LSetup, F2LSetupGenerator } from './f2l-generator';
import { deRotateAlgorithm } from './move-remap';
import type { TrainerFixtureSpec } from './types';
import type { TrainerRandom } from './cross-generator';

const F2L_PRESERVE = ['DF', 'DR', 'DB', 'DL', 'D'] as const;
const base = {
  trainerId: 'f2l',
  methodId: 'cfop',
  stageId: 'f2l',
  groupId: 'f2l',
  kind: 'execution',
  precondition: { predicate: 'cross' },
  preserve: F2L_PRESERVE,
  referenceFrame: 'fixed',
  setupSubgroup: null,
  difficulty: null,
  provenance: [{ title: 'Cube Coach, algoritmos F2L', url: 'https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts', author: 'Luke Jackson', license: 'MIT', notes: 'Casos mapeados aos quatro slots por conjugação, validação nova de identidade/estado/preservação.' }],
} satisfies Partial<TrainerFixtureSpec>;

/** F2L trainer fixtures (spec item 4): whole-pair practice per slot, and the two-step flow
 * separating formation from insertion with the pair-formed checkpoint. The two-step pool
 * contains only cases whose solution really passes through a formed pair, derived from the
 * solutions themselves; slot, case draw and rotation alternatives are runtime choices.
 */
export const F2L_TRAINER_FIXTURES: readonly TrainerFixtureSpec[] = [
  {
    ...base, id: 'cfop/f2l/insert',
    name: 'Par completo',
    objective: 'Resolva o par de canto e aresta no slot escolhido, preservando a cruz e os demais pares.',
    goal: { predicate: 'f2l-pair' },
    focus: { kind: 'pieces', pieces: ['FR', 'DFR'], referencePieces: [...F2L_PRESERVE] },
  },
  {
    ...base, id: 'f2l/back-insertions/two-ways',
    name: 'Inserções traseiras',
    objective: 'Resolva o par de um slot traseiro de dois jeitos e compare: com rotação do cubo e sem rotação, inserindo por trás.',
    goal: { predicate: 'f2l-pair' },
    focus: { kind: 'pieces', pieces: ['BR', 'DBR'], referencePieces: [...F2L_PRESERVE] },
  },
  {
    ...base, id: 'cfop/f2l/two-step',
    name: 'Formar e inserir',
    objective: 'Primeiro FORME o par (canto e aresta conectados, em qualquer lugar), confira o marco e então insira no slot.',
    checkpoints: [{ id: 'pair-formed', name: 'Par formado', objective: 'Confira o canto e a aresta conectados com as cores casando antes de inserir.', condition: { predicate: 'f2l-pair-formed' } }],
    goal: { predicate: 'f2l-pair' },
    focus: { kind: 'pieces', pieces: ['FR', 'DFR'], referencePieces: [...F2L_PRESERVE] },
  },
];

export interface BackInsertionExercise extends F2LSetup {
  /** The same permutation as the rotated solution, spelled without any rotation token and
   * proved identical by state; grips and back moves come from curation, never invented here.
   */
  readonly rotationlessSolution: string;
}
let sharedGenerator: F2LSetupGenerator | undefined;
export function generateBackInsertion(caseId: string, slot: 'BR' | 'BL', random: TrainerRandom): BackInsertionExercise {
  sharedGenerator ??= createF2LSetupGenerator();
  const setup = sharedGenerator.generate(caseId, slot, random);
  const rotationlessSolution = deRotateAlgorithm(setup.solution);
  if (!validateStage(applyAlgorithm(setup.state, rotationlessSolution), { goal: 'f2l-pair', targetSlot: slot })) {
    throw new Error(`Variante sem rotação divergente: ${caseId}/${slot}`);
  }
  return { ...setup, rotationlessSolution };
}
