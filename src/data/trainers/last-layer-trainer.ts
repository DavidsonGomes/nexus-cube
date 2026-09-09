import { createLastLayerSetupGenerator } from './last-layer-generator';
import type { LastLayerSetup, LastLayerSetupGenerator } from './last-layer-generator';
import type { TrainerFixtureSpec } from './types';
import type { TrainerRandom } from './cross-generator';

const base = {
  methodId: 'cfop',
  groupId: 'last-layer',
  kind: 'execution',
  precondition: { predicate: 'f2l' },
  preserve: ['DF', 'DR', 'DB', 'DL', 'FR', 'DFR', 'FL', 'DFL', 'BR', 'DBR', 'BL', 'DBL'],
  referenceFrame: 'fixed',
  setupSubgroup: null,
  difficulty: null,
  provenance: [{ title: 'Cube Coach, algoritmos OLL/PLL', url: 'https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts', author: 'Luke Jackson', license: 'MIT', notes: 'Apresentação variada por AUF e ângulo; preparo com F2L resolvido (OLL) e última camada orientada (PLL).' }],
} satisfies Partial<TrainerFixtureSpec>;

/** OLL and PLL trainer fixtures (spec items 5 and 6): the case draw, groups, custom sets and
 * the preferred alternative are runtime choices over the validated generator pools; coverage
 * counts derive from those pools, tested case by case, never from a fixed total.
 */
export const LAST_LAYER_TRAINER_FIXTURES: readonly TrainerFixtureSpec[] = [
  {
    ...base, id: 'cfop/oll/single', trainerId: 'oll', stageId: 'oll',
    name: 'Caso de OLL',
    objective: 'Reconheça e oriente o caso apresentado; a solução fica oculta durante a tentativa.',
    goal: { predicate: 'oll' },
    focus: { kind: 'oll-orientation' },
  },
  {
    ...base, id: 'cfop/pll/single', trainerId: 'pll', stageId: 'pll',
    name: 'Caso de PLL',
    objective: 'Permute a última camada já orientada, praticando os ajustes de U inicial e final.',
    precondition: { predicate: 'oll' },
    goal: { predicate: 'finish' },
    focus: { kind: 'last-layer' },
  },
];

const generators = new Map<'OLL' | 'PLL', LastLayerSetupGenerator>();
function generatorFor(family: 'OLL' | 'PLL'): LastLayerSetupGenerator {
  let generator = generators.get(family);
  if (!generator) { generator = createLastLayerSetupGenerator(family); generators.set(family, generator); }
  return generator;
}
export function lastLayerCaseIds(family: 'OLL' | 'PLL'): readonly string[] {
  return generatorFor(family).caseIds;
}
export function generateLastLayerExercise(family: 'OLL' | 'PLL', caseId: string, random: TrainerRandom): LastLayerSetup {
  return generatorFor(family).generate(caseId, random);
}
