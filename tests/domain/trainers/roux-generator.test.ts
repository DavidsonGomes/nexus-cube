import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import { arePiecesSolved } from '../../../src/domain/stage-validation';
import { methodStateKey } from '../../../src/solver/methods/plan';
import { ROUX_TRAINER_FIXTURES } from '../../../src/solver/methods/roux/trainer-fixtures';
import { createTrainerRandom } from '../../../src/data/trainers/cross-generator';
import { createRouxSetupGenerator } from '../../../src/data/trainers/roux-generator';
import { checkStageCondition } from '../../../src/data/trainers/stage-validators';

const generator = createRouxSetupGenerator();

test('every one of the 25 Roux fixtures generates a start that honors precondition, preservation and open goal', { timeout: 600_000 }, async () => {
  assert.equal(generator.fixtureIds.length, 25);
  for (const fixture of ROUX_TRAINER_FIXTURES) {
    const setup = await generator.generate(fixture.id, createTrainerRandom(77));
    assert.equal(methodStateKey(applyAlgorithm(solvedCube(), setup.setup)), methodStateKey(setup.state), `${fixture.id} setup`);
    if (fixture.precondition) assert.equal(checkStageCondition(setup.state, fixture.precondition), true, `${fixture.id} precondição`);
    if (fixture.preserve.length) assert.equal(arePiecesSolved(setup.state, fixture.preserve, fixture.referenceFrame), true, `${fixture.id} preservação no início`);
    if (fixture.kind === 'execution') assert.equal(checkStageCondition(setup.state, fixture.goal), false, `${fixture.id} objetivo em aberto`);
  }
});

test('CMLL fixtures keep the corner case while varying free edges', { timeout: 120_000 }, async () => {
  const keys = new Set<string>();
  for (let seed = 1; seed <= 6; seed++) {
    const setup = await generator.generate('roux/cmll/intro-h', createTrainerRandom(seed));
    assert.equal(setup.caseId, 'roux/cmll/03');
    assert.equal(checkStageCondition(setup.state, { predicate: 'sb' }), true);
    assert.equal(checkStageCondition(setup.state, { predicate: 'cmll-oriented' }), false, 'grupo H nasce desorientado');
    keys.add(methodStateKey(setup.state));
  }
  assert.ok(keys.size > 1, 'arestas variadas entre sementes');
});

test('difficulty levels drive the walk size and unknown fixtures or levels are rejected', { timeout: 120_000 }, async () => {
  const short = await generator.generate('roux/fb/full', createTrainerRandom(3), { levelId: 'short' });
  const long = await generator.generate('roux/fb/full', createTrainerRandom(3), { levelId: 'long' });
  assert.ok(short.setup.split(' ').length <= 8, 'nível curto respeita o teto');
  assert.ok(long.setup.split(' ').length <= 16, 'nível longo respeita o teto');
  await assert.rejects(() => generator.generate('roux/xx/none', createTrainerRandom(1)), /desconhecida/);
  await assert.rejects(() => generator.generate('roux/fb/full', createTrainerRandom(1), { levelId: 'extreme' }), /Nível desconhecido/);
});

test('two-look draws permutation variants from the whole corpus, not only the intro-set', { timeout: 120_000 }, async () => {
  const introCases = new Set(['roux/cmll/01', 'roux/cmll/02', 'roux/cmll/03', 'roux/cmll/07', 'roux/cmll/18', 'roux/cmll/21', 'roux/cmll/25', 'roux/cmll/31', 'roux/cmll/38']);
  const drawn = new Set<string>();
  for (let seed = 1; seed <= 10; seed++) drawn.add((await generator.generate('roux/cmll/two-look', createTrainerRandom(seed * 13))).caseId!);
  assert.ok([...drawn].some(caseId => !introCases.has(caseId)), `sorteio saiu do intro-set: ${[...drawn].join(', ')}`);
});

test('generation is deterministic per seed', { timeout: 120_000 }, async () => {
  const first = await generator.generate('roux/lse/eo', createTrainerRandom(9));
  const second = await generator.generate('roux/lse/eo', createTrainerRandom(9));
  assert.equal(first.setup, second.setup);
});
