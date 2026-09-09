import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import { METHODS, STAGES } from '../../../src/domain/learning';
import { methodStateKey } from '../../../src/solver/methods/plan';
import { planRoux } from '../../../src/solver/methods/roux';
import { draftFromCube, validateDraft } from '../../../src/solver/validation';
import { LBL_STAGES } from '../../../src/data/trainers/lbl-stages';
import { LBL_TRAINER_FIXTURES } from '../../../src/solver/methods/lbl/trainer-fixtures';
import { validateAlternativeById, validateCaseAlternative } from '../../../src/data/trainers/alternative-validation';
import { continueHereHint, planStageToExercise } from '../../../src/data/trainers/continue-here';
import { getContent } from '../../../src/domain/catalog';

test('alternative validation accepts equivalents of the case goal and rejects the rest with reasons', () => {
  const item = getContent('OLL-27');
  assert.equal(validateCaseAlternative(item, item.algorithm).valid, true);
  const withAlternatives = getContent('OLL-02');
  assert.ok(withAlternatives.alternatives.length > 0);
  for (const alternative of withAlternatives.alternatives) {
    assert.equal(validateCaseAlternative(withAlternatives, alternative).valid, true, `alternativa real cumpre o objetivo: ${alternative}`);
  }
  assert.deepEqual(validateAlternativeById('OLL-27', 'R U'), { valid: false, reason: 'goal-not-reached' });
  assert.deepEqual(validateAlternativeById('OLL-27', 'Q X9'), { valid: false, reason: 'invalid-notation' });
  assert.deepEqual(validateAlternativeById('OLL-27', Array.from({ length: 257 }, () => 'U').join(' ')), { valid: false, reason: 'too-long' });
});

test('continue-here turns any plan stage into a reproducible exercise with progressive hints', { timeout: 300_000 }, async () => {
  const input = validateDraft(draftFromCube(applyAlgorithm(solvedCube(), "R U R' U' F2 D B' L2 U2 F R2 D' B2 L U'")));
  assert.equal(input.kind, 'valid');
  if (input.kind !== 'valid') return;
  const plan = await planRoux(input);
  for (const stage of plan.stages) {
    const exercise = planStageToExercise(plan, stage.id);
    assert.equal(methodStateKey(applyAlgorithm(solvedCube(), exercise.setup)), methodStateKey(stage.initialState), stage.id);
    assert.equal(methodStateKey(applyAlgorithm(exercise.state, exercise.remainingTokens.join(' '))), methodStateKey(plan.finalState), `${stage.id} restante fecha o cubo`);
    assert.deepEqual(continueHereHint(exercise, 2), exercise.stageTokens.slice(0, 2), stage.id);
    assert.deepEqual(continueHereHint(exercise, 999), [...exercise.stageTokens], stage.id);
  }
  assert.throws(() => planStageToExercise(plan, 'cfop.oll'), /fora do plano/);
});

test('the library registers the LBL method with curated texts kept in sync with the fixtures', () => {
  const method = METHODS.find(item => item.id === 'lbl');
  assert.ok(method, 'método Camadas registrado');
  assert.deepEqual(method!.stageIds, LBL_STAGES.map(stage => stage.stageId), 'ordem das etapas igual à tabela');
  const lblStages = STAGES.filter(stage => stage.methodId === 'lbl');
  assert.equal(lblStages.length, 7);
  for (const [index, stage] of lblStages.entries()) {
    const fixture = LBL_TRAINER_FIXTURES[index];
    assert.equal(stage.id, LBL_STAGES[index].stageId);
    assert.equal(stage.name, fixture.name, `${stage.id} nome verbatim da curadoria`);
    assert.equal(stage.description, fixture.objective, `${stage.id} descrição verbatim da curadoria`);
    assert.equal(stage.order, index);
  }
  const crossStages = STAGES.filter(stage => stage.id === 'cross');
  assert.equal(crossStages.length, 1, 'cruz do CFOP sem ambiguidade com a cruz branca');
});
