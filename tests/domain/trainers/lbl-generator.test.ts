import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import { methodStateKey } from '../../../src/solver/methods/plan';
import { LBL_SLICE2_FIXTURES, LBL_TRAINER_FIXTURES } from '../../../src/solver/methods/lbl/trainer-fixtures';
import { createTrainerRandom } from '../../../src/data/trainers/cross-generator';
import { createLBLSetupGenerator } from '../../../src/data/trainers/lbl-generator';
import { checkFixtureStart, checkStageCondition, isLLCornersPlaced } from '../../../src/data/trainers/stage-validators';

const generatorPromise = createLBLSetupGenerator();

test('all fifteen LBL fixtures (stages plus slice 2) generate valid starts across seeds', { timeout: 240_000 }, async () => {
  const generator = await generatorPromise;
  assert.equal(generator.fixtureIds.length, 15);
  for (const fixture of [...LBL_TRAINER_FIXTURES, ...LBL_SLICE2_FIXTURES]) for (let seed = 1; seed <= 5; seed++) {
    const setup = generator.generate(fixture.id, createTrainerRandom(seed * 17));
    assert.equal(methodStateKey(applyAlgorithm(solvedCube(), setup.setup)), methodStateKey(setup.state), `${fixture.id} setup reproduz o estado`);
    assert.equal(checkFixtureStart(setup.state, fixture), true, `${fixture.id} início válido`);
    if (fixture.recognition) {
      assert.ok(setup.answer !== undefined && fixture.recognition.optionIds.includes(setup.answer), `${fixture.id} gabarito dentro das opções: ${setup.answer}`);
    } else {
      assert.equal(setup.answer, undefined, `${fixture.id} sem gabarito indevido`);
    }
  }
});

test('the cross stage carries the proven minimum from the complete BFS generator', { timeout: 120_000 }, async () => {
  const generator = await generatorPromise;
  for (let seed = 1; seed <= 4; seed++) {
    const setup = generator.generate('lbl/cross', createTrainerRandom(seed));
    assert.ok(setup.provenMinimumMoves !== undefined && setup.provenMinimumMoves >= 2 && setup.provenMinimumMoves <= 5, 'mínimo provado presente e no alvo');
    assert.equal(checkStageCondition(setup.state, { predicate: 'cross' }), false);
  }
});

test('the final stage starts placed but twisted, exactly like a real beginner solve reaches it', { timeout: 120_000 }, async () => {
  const generator = await generatorPromise;
  for (let seed = 1; seed <= 5; seed++) {
    const setup = generator.generate('lbl/top-corners-orient', createTrainerRandom(seed * 7));
    assert.equal(isLLCornersPlaced(setup.state), true, 'cantos no lugar');
    assert.equal(checkStageCondition(setup.state, { predicate: 'finish' }), false, 'cubo ainda aberto');
    assert.equal(checkStageCondition(setup.state, { predicate: 'oll' }), false, 'cantos realmente tortos');
  }
});

test('generation is deterministic per seed and unknown fixtures are rejected', async () => {
  const generator = await generatorPromise;
  assert.equal(generator.generate('lbl/middle', createTrainerRandom(6)).setup, generator.generate('lbl/middle', createTrainerRandom(6)).setup);
  assert.throws(() => generator.generate('lbl/none', createTrainerRandom(1)), /desconhecida/);
});
