import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, invertAlgorithm, solvedCube } from '../../../src/domain/cube';
import { validateStage } from '../../../src/domain/stage-validation';
import { createTrainerRandom } from '../../../src/data/trainers/cross-generator';
import { CROSS_TRAINER_FIXTURES } from '../../../src/data/trainers/cross-trainer';
import { CROSS_PAIR_FIXTURES, createCrossPairGenerator } from '../../../src/data/trainers/cross-pair-trainer';
import { LOOKAHEAD_FIXTURES, createLookaheadGenerator, trackPieceCell, verifyLookaheadAnswer } from '../../../src/data/trainers/lookahead';
import { assertFixtureIds } from '../../../src/data/trainers/registry';

const solved = solvedCube();

test('the piece tracker names destinations canonically and round-trips through the inverse', () => {
  assert.equal(trackPieceCell(solved, '', 'UF'), 'UF');
  assert.equal(trackPieceCell(solved, 'U', 'UF'), 'UL');
  const scramble = "R U R' U' F2 D B'";
  for (const piece of ['UF', 'DFR', 'FR', 'ULF']) {
    const destination = trackPieceCell(solved, scramble, piece);
    const back = trackPieceCell(applyAlgorithm(solved, scramble), invertAlgorithm(scramble), piece);
    assert.equal(back, piece, `${piece} volta para casa pelo inverso (foi a ${destination})`);
  }
});

test('lookahead exercises ask verifiable questions with moving answers', { timeout: 240_000 }, () => {
  assertFixtureIds([...LOOKAHEAD_FIXTURES, ...CROSS_PAIR_FIXTURES, ...CROSS_TRAINER_FIXTURES]);
  const generator = createLookaheadGenerator();
  for (const fixture of LOOKAHEAD_FIXTURES) for (let seed = 1; seed <= 4; seed++) {
    const exercise = generator.generate(fixture.id, createTrainerRandom(seed * 41));
    assert.ok(exercise.questions.length >= 1, fixture.id);
    assert.ok(exercise.questions.some(question => question.answerCell !== question.piece), `${fixture.id} tem resposta não trivial`);
    for (const question of exercise.questions) {
      assert.equal(trackPieceCell(exercise.state, exercise.algorithm, question.piece), question.answerCell);
      assert.equal(verifyLookaheadAnswer(exercise, question.piece, question.answerCell), true);
      assert.equal(verifyLookaheadAnswer(exercise, question.piece, question.piece === 'UF' ? 'UB' : 'UF'), question.answerCell === (question.piece === 'UF' ? 'UB' : 'UF'));
    }
    if (fixture.id === 'cfop/lookahead/next-pair') {
      assert.equal(validateStage(applyAlgorithm(exercise.state, exercise.algorithm), { goal: 'f2l-pair', targetSlot: exercise.slot }), true, 'a inserção atual continua concluindo');
    }
  }
});

test('cross plus first pair exercises expose the proven cross and non-trivial predictions', { timeout: 240_000 }, async () => {
  const generator = await createCrossPairGenerator();
  for (const fixture of CROSS_PAIR_FIXTURES) for (let seed = 1; seed <= 3; seed++) {
    const exercise = generator.generate(fixture.id, createTrainerRandom(seed * 53));
    assert.ok(exercise.provenCrossMinimum >= 3 && exercise.provenCrossMinimum <= 5);
    assert.equal(validateStage(applyAlgorithm(exercise.state, exercise.crossSolution), { goal: 'cross' }), true, `${fixture.id} solução de cruz confere`);
    assert.equal(validateStage(applyAlgorithm(exercise.state, exercise.crossSolution), { goal: 'f2l-pair', targetSlot: exercise.slot }), false, `${fixture.id} o par não vem de graça`);
    if (fixture.id === 'cfop/cross-pair/predict') {
      assert.ok(exercise.questions && exercise.questions.some(question => question.answerCell !== question.piece), 'previsão não trivial');
      for (const question of exercise.questions!) assert.equal(trackPieceCell(exercise.state, exercise.crossSolution, question.piece), question.answerCell);
    } else {
      assert.equal(exercise.questions, undefined);
    }
  }
});
