import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAlgorithm, solvedCube } from '../../src/domain/cube';
import { createMethodPlanBuilder, METHOD_STAGE_PROFILES, verifyMethodPlan } from '../../src/solver/methods/plan';
import { draftFromCube, validateDraft } from '../../src/solver';

test('Roux plan builder chains all seven stages with half-open empty intervals on solved input', () => {
  const validated = validateDraft(draftFromCube(solvedCube()));
  assert.equal(validated.kind, 'valid');
  if (validated.kind !== 'valid') return;
  const builder = createMethodPlanBuilder('roux', validated);
  for (const profile of METHOD_STAGE_PROFILES.roux) {
    const stage = builder.addStage({
      id: profile.id,
      title: profile.id,
      explanation: 'synthetic solved-stage QA',
      goal: profile.goal,
      preservedPieces: profile.preservedPieces,
      centerPolicy: profile.centerPolicy,
    }, '');
    assert.equal(stage.startStep, stage.endStep, stage.id);
    assert.deepEqual(stage.initialState, stage.finalState, stage.id);
  }
  const plan = builder.finish();
  assert.equal(plan.stages.length, 7);
  assert.equal(plan.tokens.length, 0);
  assert.equal(verifyMethodPlan(validated, plan), true);
});

test('method plan rejects an adjustment whose local interval does not match its stage tokens', () => {
  const validated = validateDraft(draftFromCube(applyAlgorithm(solvedCube(), 'R')));
  assert.equal(validated.kind, 'valid');
  if (validated.kind !== 'valid') return;
  const builder = createMethodPlanBuilder('roux', validated);
  const profile = METHOD_STAGE_PROFILES.roux[0];
  assert.throws(() => builder.addStage({
    id: profile.id,
    title: profile.id,
    explanation: 'synthetic invalid interval',
    goal: profile.goal,
    preservedPieces: profile.preservedPieces,
    adjustments: [{ kind:'auf', algorithm:'U', explanation:'wrong local slice', startStep:0, endStep:0 }],
  }, 'R'));
});
