import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import { draftFromCube, validateDraft } from '../../../src/solver/validation';
import { planLBL } from '../../../src/solver/methods/lbl-plan';
import { methodStateKey, verifyMethodPlan } from '../../../src/solver/methods/plan';
import { LBL_STAGES } from '../../../src/data/trainers/lbl-stages';
import { checkStageCondition } from '../../../src/data/trainers/stage-validators';

function inputFor(scramble: string) {
  const input = validateDraft(draftFromCube(applyAlgorithm(solvedCube(), scramble)));
  assert.equal(input.kind, 'valid');
  if (input.kind !== 'valid') throw new Error('Fixture inválida');
  return input;
}

test('the Layers mode solves real scrambles through the seven verified beginner stages', { timeout: 600_000 }, async () => {
  for (const scramble of ["R U R' U' F2 D B' L2 U2 F R2 D' B2 L U'", "B2 L' D2 F U2 R F' L2 D R2 U B L F2 D'"]) {
    const input = inputFor(scramble);
    const plan = await planLBL(input);
    assert.deepEqual(plan.stages.map(stage => stage.id), ['lbl.cross', 'lbl.corners', 'lbl.middle', 'lbl.top-cross', 'lbl.top-edges', 'lbl.top-corners-position', 'lbl.top-corners-orient']);
    assert.ok(verifyMethodPlan(input, plan), 'plano verificado de ponta a ponta');
    for (const [index, stage] of plan.stages.entries()) {
      assert.equal(checkStageCondition(stage.finalState, LBL_STAGES[index].goal), true, `${stage.id} cumpre o objetivo da tabela LBL`);
      assert.ok(stage.title.length > 0 && stage.explanation.length > 0, `${stage.id} carrega os textos curados`);
      assert.equal(methodStateKey(applyAlgorithm(stage.initialState, stage.algorithm)), methodStateKey(stage.finalState), `${stage.id} estado consistente`);
    }
  }
});

test('the Layers plan of an already solved cube finishes with empty or aligning stages only', { timeout: 240_000 }, async () => {
  const plan = await planLBL(inputFor(''));
  assert.ok(verifyMethodPlan(inputFor(''), plan));
  assert.equal(plan.tokens.length, 0, 'cubo resolvido não recebe movimentos');
});
