import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, invertAlgorithm, solvedCube } from '../../../src/domain/cube';
import { arePiecesSolved } from '../../../src/domain/stage-validation';
import { methodStateKey } from '../../../src/solver/methods/plan';
import { CFOP_TWO_LOOK_FIXTURES } from '../../../src/data/trainers/cfop-two-look-fixtures';
import { createTrainerRandom } from '../../../src/data/trainers/cross-generator';
import { assertFixtureIds } from '../../../src/data/trainers/registry';
import { checkStageCondition, isLLCornersPermuted, isLLEdgesOriented } from '../../../src/data/trainers/stage-validators';
import { createTwoLookSetupGenerator } from '../../../src/data/trainers/two-look-generator';

import { COMPILED_CASES } from '../../../src/data/catalog-compiled';

const F2L_PIECES = ['DF', 'DR', 'DB', 'DL', 'FR', 'DFR', 'FL', 'DFL', 'BR', 'DBR', 'BL', 'DBL'];
const solved = solvedCube();
const caseState = (id: string) => {
  const item = COMPILED_CASES.find(entry => entry.id === id);
  assert.ok(item, id);
  return applyAlgorithm(solved, invertAlgorithm(item!.algorithm));
};
const generator = createTwoLookSetupGenerator();

test('two-look milestone predicates separate edge orientation and corner permutation', () => {
  assert.equal(isLLEdgesOriented(solved), true);
  assert.equal(isLLCornersPermuted(solved), true);
  const cornersOnly = caseState('OLL-27');
  assert.equal(isLLEdgesOriented(cornersOnly), true, 'caso só de cantos mantém a cruz do topo');
  assert.equal(checkStageCondition(cornersOnly, { predicate: 'oll' }), false);
  assert.equal(isLLEdgesOriented(caseState('OLL-01')), false, 'caso ponto nasce sem a cruz do topo');
  assert.equal(isLLCornersPermuted(caseState('PLL-Ua')), true, 'permutação só de arestas mantém cantos posicionados');
  assert.equal(isLLCornersPermuted(caseState('PLL-Aa')), false, 'cantos permutados nascem fora do marco');
  assert.equal(isLLEdgesOriented(applyAlgorithm(solved, 'L')), false, 'F2L quebrado reprova');
});

test('the six two-look fixtures pass registry validation including checkpoint uniqueness', () => {
  assertFixtureIds(CFOP_TWO_LOOK_FIXTURES);
  const full = CFOP_TWO_LOOK_FIXTURES.find(fixture => fixture.id === 'cfop/ll-two-look/oll-full');
  assert.equal(full?.checkpoints?.length, 1);
  assert.throws(() => assertFixtureIds([{ ...full!, checkpoints: [...full!.checkpoints!, ...full!.checkpoints!] }]), /repetidos/);
});

test('every fixture generates setups whose steps hit the checkpoint and then the goal, preserving F2L', { timeout: 240_000 }, () => {
  for (const fixture of CFOP_TWO_LOOK_FIXTURES) for (let seed = 1; seed <= 8; seed++) {
    const setup = generator.generate(fixture.id, createTrainerRandom(seed * 100));
    assert.equal(methodStateKey(applyAlgorithm(solved, setup.setup)), methodStateKey(setup.state), `${fixture.id} setup`);
    if (fixture.precondition) assert.equal(checkStageCondition(setup.state, fixture.precondition), true, `${fixture.id} precondição`);
    assert.equal(checkStageCondition(setup.state, fixture.goal), false, `${fixture.id} objetivo em aberto`);
    let current = setup.state;
    for (const step of setup.steps) {
      current = applyAlgorithm(current, step.algorithm);
      assert.equal(arePiecesSolved(current, F2L_PIECES), true, `${fixture.id} preserva F2L após cada olhar`);
      if (step.checkpointId) {
        const checkpoint = fixture.checkpoints?.find(item => item.id === step.checkpointId);
        assert.ok(checkpoint, `${fixture.id} checkpoint declarado`);
        assert.equal(checkStageCondition(current, checkpoint!.condition), true, `${fixture.id} marco ${step.checkpointId}`);
      }
    }
    assert.equal(checkStageCondition(current, fixture.goal), true, `${fixture.id} objetivo final`);
    assert.equal(setup.solution, setup.steps.map(step => step.algorithm).filter(Boolean).join(' '), `${fixture.id} solução é a concatenação dos olhares`);
  }
});

test('generation is deterministic per seed and unknown fixtures are rejected', () => {
  assert.deepEqual(generator.generate('cfop/ll-two-look/pll-full', createTrainerRandom(4)), generator.generate('cfop/ll-two-look/pll-full', createTrainerRandom(4)));
  assert.throws(() => generator.generate('cfop/ll-two-look/none', createTrainerRandom(1)), /desconhecida/);
});
