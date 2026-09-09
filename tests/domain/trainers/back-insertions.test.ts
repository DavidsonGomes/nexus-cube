import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import { methodStateKey } from '../../../src/solver/methods/plan';
import { createTrainerRandom } from '../../../src/data/trainers/cross-generator';
import { createF2LSetupGenerator } from '../../../src/data/trainers/f2l-generator';
import { generateBackInsertion } from '../../../src/data/trainers/f2l-trainer-fixtures';
import { deRotateAlgorithm } from '../../../src/data/trainers/move-remap';

const solved = solvedCube();
const stateKey = (algorithm: string) => methodStateKey(applyAlgorithm(solved, algorithm));

test('deRotate rewrites zero-net-rotation sequences into the identical permutation without rotation tokens', () => {
  const fixtures = ["y R U R' y'", "y2 F R U R' U' F' y2", "x L2 D2 L' U' L D2 L' U L' x'", "y R U y' R'  y U2 y'", "R U R' U'"];
  for (const original of fixtures) {
    const rewritten = deRotateAlgorithm(original);
    assert.equal(/[xyz]/.test(rewritten), false, original);
    assert.equal(stateKey(rewritten), stateKey(original), original);
  }
  assert.throws(() => deRotateAlgorithm("y R U R'"), /rotação líquida/);
});

test('back insertion exercises deliver both spellings proved state-identical for BR and BL', { timeout: 240_000 }, () => {
  const generator = createF2LSetupGenerator();
  for (const slot of ['BR', 'BL'] as const) for (const caseId of generator.caseIds.filter((_, index) => index % 10 === 0)) {
    const exercise = generateBackInsertion(caseId, slot, createTrainerRandom(60 + slot.charCodeAt(0)));
    assert.equal(/[xyz]/.test(exercise.rotationlessSolution), false, `${caseId}/${slot} sem rotação`);
    assert.equal(
      methodStateKey(applyAlgorithm(exercise.state, exercise.rotationlessSolution)),
      methodStateKey(applyAlgorithm(exercise.state, exercise.solution)),
      `${caseId}/${slot} mesmas 54 cores nas duas grafias`,
    );
  }
});
