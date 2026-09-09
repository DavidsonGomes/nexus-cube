import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrainerRandom } from '../../../src/data/trainers/cross-generator';
import { CFOP_RECOGNITION_FIXTURES, createCaseIdentificationClassifiers, createRecognitionExerciseGenerator } from '../../../src/data/trainers/cfop-recognition';
import { createLastLayerSetupGenerator } from '../../../src/data/trainers/last-layer-generator';
import { assertFixtureIds } from '../../../src/data/trainers/registry';
import { classifyRecognition } from '../../../src/data/trainers/recognition';

const { ollCaseId, pllCaseId, pllTwoSides } = createCaseIdentificationClassifiers();

test('case identification is independent and exact for all 57 OLL and 21 PLL cases under varied presentation', { timeout: 240_000 }, () => {
  const oll = createLastLayerSetupGenerator('OLL');
  for (const caseId of oll.caseIds) {
    const setup = oll.generate(caseId, createTrainerRandom(600 + oll.caseIds.indexOf(caseId)));
    assert.equal(ollCaseId.classify(setup.state), caseId);
  }
  const pll = createLastLayerSetupGenerator('PLL');
  for (const caseId of pll.caseIds) {
    const setup = pll.generate(caseId, createTrainerRandom(700 + pll.caseIds.indexOf(caseId)));
    assert.equal(pllCaseId.classify(setup.state), caseId);
  }
});

test('the two-sides criterion classifier lands every known class', () => {
  const pll = createLastLayerSetupGenerator('PLL');
  const expectations: readonly [string, string][] = [
    ['PLL-Ua', 'edges-only'], ['PLL-E', 'corners-only'], ['PLL-T', 'adjacent-swap'], ['PLL-Y', 'diagonal-swap'], ['PLL-Ga', 'double-three-cycles'],
  ];
  for (const [caseId, criterion] of expectations) {
    assert.equal(pllTwoSides.classify(pll.generate(caseId, createTrainerRandom(11)).state), criterion, caseId);
  }
});

test('recognition fixtures validate and generated exercises carry app-verified answers inside the options', () => {
  assertFixtureIds(CFOP_RECOGNITION_FIXTURES);
  const generator = createRecognitionExerciseGenerator();
  for (const fixture of CFOP_RECOGNITION_FIXTURES) for (let seed = 1; seed <= 4; seed++) {
    const exercise = generator.generate(fixture.id, createTrainerRandom(seed * 31));
    assert.ok(fixture.recognition!.optionIds.includes(exercise.answer), `${fixture.id}: ${exercise.answer}`);
    if (fixture.id !== 'cfop/recognition/pll-two-sides') assert.equal(exercise.answer, exercise.caseId, fixture.id);
  }
  assert.equal(classifyRecognition('oll-case-id', createLastLayerSetupGenerator('OLL').generate('OLL-07', createTrainerRandom(1)).state), 'OLL-07', 'classificador registrado no registry');
  assert.throws(() => generator.generate('cfop/recognition/none', createTrainerRandom(1)), /desconhecida/);
});
