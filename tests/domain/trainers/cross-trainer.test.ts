import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import { arePiecesSolved } from '../../../src/domain/stage-validation';
import { methodStateKey } from '../../../src/solver/methods/plan';
import { createCrossSetupGenerator, createTrainerRandom, crossPiecesOf } from '../../../src/data/trainers/cross-generator';
import { CROSS_TRAINER_FIXTURES, generateCrossExercise } from '../../../src/data/trainers/cross-trainer';
import { assertFixtureIds } from '../../../src/data/trainers/registry';
import type { Face } from '../../../src/domain/types';

test('color choice: every face has the same proven cross ceiling and generates its own cross', { timeout: 240_000 }, async () => {
  for (const face of ['U', 'R', 'F', 'D', 'L', 'B'] as Face[]) {
    const generator = await createCrossSetupGenerator(face);
    assert.equal(generator.ceiling, 8, `teto da face ${face}`);
    const setup = generator.generate(4, createTrainerRandom(50 + face.charCodeAt(0)));
    assert.equal(setup.face, face);
    assert.equal(setup.provenMinimumMoves, 4);
    assert.equal(arePiecesSolved(setup.state, crossPiecesOf(face)), false, `cruz da face ${face} nasce aberta`);
    assert.equal(methodStateKey(applyAlgorithm(solvedCube(), setup.setup)), methodStateKey(setup.state));
  }
});

test('the cross trainer fixture announces only proven minimums and levels drive the generator', { timeout: 120_000 }, async () => {
  assertFixtureIds(CROSS_TRAINER_FIXTURES);
  for (const level of CROSS_TRAINER_FIXTURES[0].difficulty!) {
    assert.equal(level.minimumProven, true, level.id);
    assert.equal(level.announcedMinimumMoves, level.setupMoves, level.id);
  }
  const exercise = await generateCrossExercise('medium', 'U', createTrainerRandom(9));
  assert.equal(exercise.provenMinimumMoves, 5);
  assert.equal(exercise.face, 'U');
  await assert.rejects(() => generateCrossExercise('impossible', 'D', createTrainerRandom(1)), /desconhecido/);
});
