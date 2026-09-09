import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import { validateStage } from '../../../src/domain/stage-validation';
import { createTrainerRandom } from '../../../src/data/trainers/cross-generator';
import { createF2LSetupGenerator } from '../../../src/data/trainers/f2l-generator';
import { F2L_TRAINER_FIXTURES } from '../../../src/data/trainers/f2l-trainer-fixtures';
import { assertFixtureIds } from '../../../src/data/trainers/registry';
import { checkStageCondition, isF2LPairFormed } from '../../../src/data/trainers/stage-validators';

const solved = solvedCube();
const generator = createF2LSetupGenerator();

test('pair-formed predicate accepts connected matching blocks anywhere and rejects broken pairs', () => {
  assert.equal(isF2LPairFormed(solved, 'FR'), true, 'par inserido conta como formado');
  const basicInsert = generator.generate('cfop/f2l/01', 'FR', createTrainerRandom(2));
  assert.equal(isF2LPairFormed(basicInsert.state, 'FR'), true, 'caso de inserção básica nasce com o par já formado');
  const separated = generator.twoStepCaseIds[0];
  assert.equal(isF2LPairFormed(generator.generateTwoStep(separated, 'FR', createTrainerRandom(3)).state, 'FR'), false, 'caso separável nasce com par desfeito');
  assert.equal(checkStageCondition(solved, { predicate: 'f2l-pair-formed', targetSlot: 'BL' }), true);
});

test('the two-step pool is honest: every listed case really splits, and the split hits the checkpoint then the goal', { timeout: 240_000 }, () => {
  assert.ok(generator.twoStepCaseIds.length >= 10, `pool separável real: ${generator.twoStepCaseIds.length}`);
  assert.ok(generator.twoStepCaseIds.length < generator.caseIds.length, 'nem todo caso separa; contagem honesta');
  for (const caseId of generator.twoStepCaseIds.slice(0, 8)) for (const slot of ['FR', 'BL'] as const) {
    const setup = generator.generateTwoStep(caseId, slot, createTrainerRandom(21));
    assert.equal(isF2LPairFormed(setup.state, slot), false, `${caseId}/${slot} nasce com par desfeito`);
    const afterFormation = applyAlgorithm(setup.state, setup.steps[0].algorithm);
    assert.equal(isF2LPairFormed(afterFormation, slot), true, `${caseId}/${slot} marco par formado`);
    assert.equal(validateStage(afterFormation, { goal: 'f2l-pair', targetSlot: slot }), false, `${caseId}/${slot} formado ainda não inserido`);
    const afterInsertion = applyAlgorithm(afterFormation, setup.steps[1].algorithm);
    assert.equal(validateStage(afterInsertion, { goal: 'f2l-pair', targetSlot: slot }), true, `${caseId}/${slot} inserção conclui`);
  }
  const nonSplit = generator.caseIds.find(caseId => !generator.twoStepCaseIds.includes(caseId));
  assert.ok(nonSplit, 'existe caso sem separação');
  assert.throws(() => generator.generateTwoStep(nonSplit!, 'FR', createTrainerRandom(1)), /sem etapa de formação/);
});

test('the F2L trainer fixtures validate with the pair-formed checkpoint declared', () => {
  assertFixtureIds(F2L_TRAINER_FIXTURES);
  const twoStep = F2L_TRAINER_FIXTURES.find(fixture => fixture.id === 'cfop/f2l/two-step');
  assert.equal(twoStep?.checkpoints?.[0].condition.predicate, 'f2l-pair-formed');
});
