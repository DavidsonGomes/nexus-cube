import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainerRandom } from '../../../src/data/trainers/cross-generator';
import { LAST_LAYER_TRAINER_FIXTURES, generateLastLayerExercise, lastLayerCaseIds } from '../../../src/data/trainers/last-layer-trainer';
import { assertFixtureIds } from '../../../src/data/trainers/registry';
import { checkStageCondition } from '../../../src/data/trainers/stage-validators';

test('OLL and PLL trainer fixtures validate and case pools carry the whole validated catalog', () => {
  assertFixtureIds(LAST_LAYER_TRAINER_FIXTURES);
  assert.equal(lastLayerCaseIds('OLL').length, 57);
  assert.equal(lastLayerCaseIds('PLL').length, 21);
});

test('the exercise wrapper draws validated setups matching each fixture contract', () => {
  const oll = generateLastLayerExercise('OLL', 'OLL-33', createTrainerRandom(4));
  assert.equal(checkStageCondition(oll.state, { predicate: 'f2l' }), true);
  assert.equal(checkStageCondition(oll.state, { predicate: 'oll' }), false);
  const pll = generateLastLayerExercise('PLL', 'PLL-T', createTrainerRandom(4));
  assert.equal(checkStageCondition(pll.state, { predicate: 'oll' }), true);
  assert.equal(checkStageCondition(pll.state, { predicate: 'finish' }), false);
  assert.throws(() => generateLastLayerExercise('OLL', 'PLL-T', createTrainerRandom(1)), /desconhecido/);
});
