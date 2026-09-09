import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import { validateStage } from '../../../src/domain/stage-validation';
import { methodStateKey } from '../../../src/solver/methods/plan';
import { createTrainerRandom } from '../../../src/data/trainers/cross-generator';
import { createLastLayerSetupGenerator } from '../../../src/data/trainers/last-layer-generator';

const oll = createLastLayerSetupGenerator('OLL');
const pll = createLastLayerSetupGenerator('PLL');

test('all 57 OLL and 21 PLL cases generate validated setups with the goal reached only by the solution', { timeout: 240_000 }, () => {
  assert.equal(oll.caseIds.length, 57);
  assert.equal(pll.caseIds.length, 21);
  for (const generator of [oll, pll]) for (const caseId of generator.caseIds) {
    const setup = generator.generate(caseId, createTrainerRandom(31));
    assert.equal(methodStateKey(applyAlgorithm(solvedCube(), setup.setup)), methodStateKey(setup.state), `${caseId} setup`);
    assert.equal(validateStage(setup.state, { goal: 'f2l' }), true, `${caseId} F2L resolvido no preparo`);
    const goal = generator.family === 'OLL' ? 'oll' as const : 'pll' as const;
    if (generator.family === 'PLL') assert.equal(validateStage(setup.state, { goal: 'oll' }), true, `${caseId} última camada orientada`);
    assert.equal(validateStage(setup.state, { goal }), false, `${caseId} não nasce resolvido`);
    assert.equal(validateStage(applyAlgorithm(setup.state, setup.solution), { goal }), true, `${caseId} solução atinge o objetivo`);
  }
});

test('presentation varies across seeds while staying valid', () => {
  for (const [generator, caseId] of [[oll, 'OLL-21'], [pll, 'PLL-T']] as const) {
    const presentations = new Set<string>();
    for (let seed = 1; seed <= 16; seed++) presentations.add(methodStateKey(generator.generate(caseId, createTrainerRandom(seed)).state));
    assert.ok(presentations.size > 1, `${caseId} apresentação variada`);
  }
});

test('generation is deterministic per seed and unknown cases are rejected', () => {
  assert.deepEqual(oll.generate('OLL-27', createTrainerRandom(5)), oll.generate('OLL-27', createTrainerRandom(5)));
  assert.throws(() => pll.generate('PLL-Zz', createTrainerRandom(1)), /desconhecido/);
});
