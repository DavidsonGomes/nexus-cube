import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../../src/domain/cube';
import { assertFixtureIds, checkStageCondition, checkStageTransition } from '../../../../src/data/trainers';
import { ROUX_CONTINUE_BOUNDARIES, ROUX_P4_FIXTURES } from '../../../../src/solver/methods/roux/trainer-fixtures-p4';

test('p4 fixture ids are namespaced, unique and roux-scoped', () => {
  assertFixtureIds(ROUX_P4_FIXTURES);
  assert.equal(ROUX_P4_FIXTURES.length, 9);
  for (const fixture of ROUX_P4_FIXTURES) {
    assert.ok(fixture.id.startsWith('roux/'), fixture.id);
    assert.equal(fixture.methodId, 'roux');
    assert.ok(['continue-here', 'lookahead', 'inspection'].includes(fixture.trainerId), fixture.id);
  }
});

test('continue-here boundaries chain the planner stages in order', () => {
  const goals = ROUX_CONTINUE_BOUNDARIES.map(boundary => boundary.goal);
  assert.deepEqual(goals, ['fb', 'sb', 'cmll', 'eo', 'lr', 'finish']);
  for (let i = 1; i < ROUX_CONTINUE_BOUNDARIES.length; i++) {
    assert.equal(ROUX_CONTINUE_BOUNDARIES[i].precondition, ROUX_CONTINUE_BOUNDARIES[i - 1].goal);
  }
});

test('every p4 goal, precondition and transition holds on the solved cube', () => {
  const solved = solvedCube();
  for (const fixture of ROUX_P4_FIXTURES) {
    assert.ok(checkStageCondition(solved, fixture.goal), `goal ${fixture.id}`);
    if (fixture.precondition) assert.ok(checkStageCondition(solved, fixture.precondition), `precondition ${fixture.id}`);
    assert.ok(checkStageTransition(solved, solved, fixture), `transition ${fixture.id}`);
  }
});

test('p4 goals reject states that violate the stage', () => {
  const solved = solvedCube();
  const byId = new Map(ROUX_P4_FIXTURES.map(fixture => [fixture.id, fixture]));
  const broken = (id: string, sequence: string) =>
    checkStageCondition(applyAlgorithm(solved, sequence), byId.get(id)!.goal);
  assert.equal(broken('roux/continue/fb', 'L'), false);
  assert.equal(broken('roux/continue/sb', 'R'), false);
  assert.equal(broken('roux/continue/cmll', 'U'), false);
  assert.equal(broken('roux/continue/eo', 'M'), false);
  assert.equal(broken('roux/continue/finish', 'M2'), false);
  assert.equal(broken('roux/inspection/fb', "F D F'"), false);
});
