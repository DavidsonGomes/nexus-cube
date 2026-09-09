import { applyAlgorithm, canonicalOrientation, invertAlgorithm, solvedCube } from '../../domain/cube';
import type { CubeState } from '../../domain/types';
import { COMPILED_CASES } from '../catalog-compiled';
import { methodStateKey } from '../../solver/methods/plan';
import { createLastLayerSetupGenerator } from './last-layer-generator';
import { registerRecognitionClassifier } from './recognition';
import type { RecognitionClassifier } from './recognition';
import type { TrainerFixtureSpec } from './types';
import type { TrainerRandom } from './cross-generator';

const AUF = ['', 'U', 'U2', "U'"] as const;
const ROTATIONS = ['', 'y', 'y2', "y'"] as const;
const solved = solvedCube();
const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
const conjugate = (rotation: string, algorithm: string) => join(rotation, algorithm, invertAlgorithm(rotation));
const LL_CELLS: readonly (readonly [number, number, number])[] = [
  [0, 1, 1], [1, 1, 0], [0, 1, -1], [-1, 1, 0],
  [1, 1, 1], [1, 1, -1], [-1, 1, -1], [-1, 1, 1],
];

// Corner twist DIRECTION matters: two dot cases share the same up/not-up mask, so each cell
// records where the cubie's U sticker points (up, along the cell's x, or along its z).
function orientationPattern(state: CubeState): string {
  let current = state;
  const readings: string[] = [];
  for (let turn = 0; turn < 4; turn++) {
    readings.push(LL_CELLS.map(cell => {
      const top = current.find(sticker => String(sticker.position) === String(cell) && sticker.color === 'U');
      if (!top) throw new Error('Peça da última camada sem adesivo U.');
      if (top.normal[1] === 1) return 'u';
      return top.normal[0] !== 0 ? 'x' : 'z';
    }).join(''));
    current = applyAlgorithm(current, 'U');
  }
  return readings.sort()[0];
}

const PLL_CRITERIA: Record<string, string> = {
  Ua: 'edges-only', Ub: 'edges-only', H: 'edges-only', Z: 'edges-only',
  Aa: 'corners-only', Ab: 'corners-only', E: 'corners-only',
  F: 'adjacent-swap', Ja: 'adjacent-swap', Jb: 'adjacent-swap', Ra: 'adjacent-swap', Rb: 'adjacent-swap', T: 'adjacent-swap',
  V: 'diagonal-swap', Y: 'diagonal-swap', Na: 'diagonal-swap', Nb: 'diagonal-swap',
  Ga: 'double-three-cycles', Gb: 'double-three-cycles', Gc: 'double-three-cycles', Gd: 'double-three-cycles',
};

interface CaseIdentifiers { readonly ollCaseId: RecognitionClassifier; readonly pllCaseId: RecognitionClassifier; readonly pllTwoSides: RecognitionClassifier }
let identifiers: CaseIdentifiers | undefined;

/** Independent app verification of case identity: OLL by the orientation pattern of the last
 * layer minimized over AUF (proved unique per case at build), PLL by the exact-state table of
 * every AUF and angle variant of each case (cross-case collision rejected at build). The
 * two-sides criterion maps the identified PLL case to its CubeSkills class, the same profile
 * table used by the existing pll-recognition domain.
 */
export function createCaseIdentificationClassifiers(): CaseIdentifiers {
  if (identifiers) return identifiers;
  const ollPatterns = new Map<string, string>();
  for (const item of COMPILED_CASES.filter(entry => entry.family === 'OLL')) {
    const pattern = orientationPattern(applyAlgorithm(solved, invertAlgorithm(canonicalOrientation(item.algorithm))));
    const existing = ollPatterns.get(pattern);
    if (existing && existing !== item.id) throw new Error(`Padrão OLL ambíguo entre ${existing} e ${item.id}.`);
    ollPatterns.set(pattern, item.id);
  }
  const pllKeys = new Map<string, string>();
  for (const item of COMPILED_CASES.filter(entry => entry.family === 'PLL')) {
    for (const auf of AUF) for (const rotation of ROTATIONS) {
      const state = applyAlgorithm(solved, invertAlgorithm(join(invertAlgorithm(auf), conjugate(rotation, canonicalOrientation(item.algorithm)))));
      const key = methodStateKey(state);
      const existing = pllKeys.get(key);
      if (existing && existing !== item.id) throw new Error(`Variante PLL ambígua entre ${existing} e ${item.id}.`);
      pllKeys.set(key, item.id);
    }
  }
  const ollCaseId: RecognitionClassifier = {
    id: 'oll-case-id',
    optionIds: COMPILED_CASES.filter(entry => entry.family === 'OLL').map(entry => entry.id),
    classify(state) {
      const caseId = ollPatterns.get(orientationPattern(state));
      if (!caseId) throw new Error('Estado fora dos 57 padrões OLL.');
      return caseId;
    },
  };
  const pllCase = (state: CubeState): string => {
    for (const auf of AUF) {
      const caseId = pllKeys.get(methodStateKey(applyAlgorithm(state, auf)));
      if (caseId) return caseId;
    }
    throw new Error('Estado fora das variantes PLL conhecidas.');
  };
  const pllCaseId: RecognitionClassifier = {
    id: 'pll-case-id',
    optionIds: COMPILED_CASES.filter(entry => entry.family === 'PLL').map(entry => entry.id),
    classify: pllCase,
  };
  const pllTwoSides: RecognitionClassifier = {
    id: 'pll-two-sides-criterion',
    optionIds: ['edges-only', 'corners-only', 'adjacent-swap', 'diagonal-swap', 'double-three-cycles'],
    classify(state) {
      const name = pllCase(state).replace('PLL-', '');
      const criterion = PLL_CRITERIA[name];
      if (!criterion) throw new Error(`Caso PLL sem critério de classe: ${name}.`);
      return criterion;
    },
  };
  identifiers = { ollCaseId, pllCaseId, pllTwoSides };
  registerRecognitionClassifier(ollCaseId);
  registerRecognitionClassifier(pllCaseId);
  registerRecognitionClassifier(pllTwoSides);
  return identifiers;
}

const base = {
  trainerId: 'recognition',
  methodId: 'cfop',
  groupId: 'recognition',
  kind: 'recognition',
  precondition: { predicate: 'f2l' },
  preserve: ['DF', 'DR', 'DB', 'DL', 'FR', 'DFR', 'FL', 'DFL', 'BR', 'DBR', 'BL', 'DBL'],
  referenceFrame: 'fixed',
  goal: { predicate: 'any-legal' },
  setupSubgroup: null,
  difficulty: null,
  focus: { kind: 'last-layer' },
  provenance: [{ title: 'Cube Coach, algoritmos OLL/PLL', url: 'https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts', author: 'Luke Jackson', license: 'MIT', notes: 'Casos apresentados sem nome nem algoritmo; ajustes U e ângulos variados; gabarito verificado por classificador independente.' }],
} satisfies Partial<TrainerFixtureSpec>;

/** Recognition trainer fixtures (spec item 8): cases shown without name or algorithm, varied
 * by AUF and angle; the answer is app-verified by the independent classifiers above, and the
 * mental-answer variant is the same fixture practiced self-assessed.
 */
export const CFOP_RECOGNITION_FIXTURES: readonly TrainerFixtureSpec[] = [
  {
    ...base, id: 'cfop/recognition/oll-case', stageId: 'oll',
    name: 'Reconhecer o caso de OLL',
    objective: 'Identifique o caso apresentado apenas pelo padrão do topo, sem nome nem algoritmo.',
    recognition: { classifierId: 'oll-case-id', optionIds: COMPILED_CASES.filter(entry => entry.family === 'OLL').map(entry => entry.id) },
  },
  {
    ...base, id: 'cfop/recognition/pll-case', stageId: 'pll',
    name: 'Reconhecer o caso de PLL',
    objective: 'Identifique o caso de permutação apresentado, variando ajustes de U e o ângulo.',
    precondition: { predicate: 'oll' },
    recognition: { classifierId: 'pll-case-id', optionIds: COMPILED_CASES.filter(entry => entry.family === 'PLL').map(entry => entry.id) },
  },
  {
    ...base, id: 'cfop/recognition/pll-two-sides', stageId: 'pll',
    name: 'PLL por duas laterais',
    objective: 'Olhe apenas duas laterais e responda a classe do caso: só arestas, só cantos, troca adjacente, troca diagonal ou dois ciclos de três.',
    precondition: { predicate: 'oll' },
    recognition: { classifierId: 'pll-two-sides-criterion', optionIds: ['edges-only', 'corners-only', 'adjacent-swap', 'diagonal-swap', 'double-three-cycles'] },
  },
];

export interface RecognitionExercise { readonly fixtureId: string; readonly caseId: string; readonly setup: string; readonly state: CubeState; readonly answer: string }
export function createRecognitionExerciseGenerator() {
  const { ollCaseId, pllCaseId, pllTwoSides } = createCaseIdentificationClassifiers();
  const oll = createLastLayerSetupGenerator('OLL'), pll = createLastLayerSetupGenerator('PLL');
  const plans: Record<string, { family: 'OLL' | 'PLL'; classifier: RecognitionClassifier }> = {
    'cfop/recognition/oll-case': { family: 'OLL', classifier: ollCaseId },
    'cfop/recognition/pll-case': { family: 'PLL', classifier: pllCaseId },
    'cfop/recognition/pll-two-sides': { family: 'PLL', classifier: pllTwoSides },
  };
  const generate = (fixtureId: string, random: TrainerRandom): RecognitionExercise => {
    const plan = plans[fixtureId];
    if (!plan) throw new Error(`Fixture de reconhecimento desconhecida: ${fixtureId}`);
    const generator = plan.family === 'OLL' ? oll : pll;
    const caseId = generator.caseIds[Math.floor(random.next() * generator.caseIds.length)];
    const setup = generator.generate(caseId, random);
    return { fixtureId, caseId, setup: setup.setup, state: setup.state, answer: plan.classifier.classify(setup.state) };
  };
  return { fixtureIds: CFOP_RECOGNITION_FIXTURES.map(fixture => fixture.id), generate };
}
