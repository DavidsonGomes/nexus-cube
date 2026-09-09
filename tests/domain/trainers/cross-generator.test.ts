import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import { validateStage } from '../../../src/domain/stage-validation';
import { methodStateKey } from '../../../src/solver/methods/plan';
import { createCrossSetupGenerator, createTrainerRandom } from '../../../src/data/trainers/cross-generator';
import type { CubeState } from '../../../src/domain/types';

const FACE_TURNS = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap(face => [face, `${face}2`, `${face}'`]);
const crossSolved = (state: CubeState) => validateStage(state, { goal: 'cross' });
const generatorPromise = createCrossSetupGenerator();

function shortestCrossDepth(state: CubeState, limit: number): number {
  let frontier = [state];
  for (let depth = 0; depth <= limit; depth++) {
    if (frontier.some(crossSolved)) return depth;
    frontier = frontier.flatMap(current => FACE_TURNS.map(turn => applyAlgorithm(current, turn)));
  }
  return limit + 1;
}

test('the cross abstraction ceiling matches the known cross depth of eight', async () => {
  assert.equal((await generatorPromise).ceiling, 8);
});

test('generated cross setups carry a proven minimum for every requested difficulty', { timeout: 120_000 }, async () => {
  const generator = await generatorPromise;
  for (let target = 1; target <= 6; target++) {
    const setup = generator.generate(target, createTrainerRandom(1000 + target));
    assert.equal(setup.provenMinimumMoves, target);
    assert.equal(methodStateKey(applyAlgorithm(solvedCube(), setup.setup)), methodStateKey(setup.state), `setup reproduz o estado no alvo ${target}`);
    assert.equal(crossSolved(setup.state), false, `alvo ${target} não pode nascer resolvido`);
  }
});

test('the announced minimum is independently confirmed by brute force on shallow targets', { timeout: 120_000 }, async () => {
  const generator = await generatorPromise;
  for (let target = 1; target <= 3; target++) {
    const setup = generator.generate(target, createTrainerRandom(42 + target));
    assert.equal(shortestCrossDepth(setup.state, target), target, `mínimo real do alvo ${target}`);
  }
});

test('generation is deterministic per seed and rejects targets outside the proven range', async () => {
  const generator = await generatorPromise;
  assert.equal(generator.generate(4, createTrainerRandom(7)).setup, generator.generate(4, createTrainerRandom(7)).setup);
  assert.throws(() => generator.generate(0, createTrainerRandom(1)), /alcance provado/);
  assert.throws(() => generator.generate(9, createTrainerRandom(1)), /alcance provado/);
  assert.throws(() => generator.generate(2.5, createTrainerRandom(1)), /alcance provado/);
});
