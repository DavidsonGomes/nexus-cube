import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../../src/domain/cube';
import { assertFixtureIds, checkStageCondition, checkStageTransition } from '../../../../src/data/trainers';
import { LBL_STAGES } from '../../../../src/data/trainers/lbl-stages';
import { LBL_SLICE2_FIXTURES, LBL_TRAINER_FIXTURES } from '../../../../src/solver/methods/lbl/trainer-fixtures';

test('lbl fixtures mirror the shared stage table without redefining conditions', () => {
  assertFixtureIds(LBL_TRAINER_FIXTURES);
  assert.equal(LBL_TRAINER_FIXTURES.length, 7);
  for (const [index, fixture] of LBL_TRAINER_FIXTURES.entries()) {
    const stage = LBL_STAGES[index];
    assert.equal(fixture.id, stage.id);
    assert.equal(fixture.trainerId, 'lbl');
    assert.equal(fixture.methodId, 'lbl');
    assert.equal(fixture.precondition, stage.precondition);
    assert.equal(fixture.goal, stage.goal);
    assert.equal(fixture.preserve, stage.preserve);
    assert.ok(fixture.observe, fixture.id);
    assert.ok(fixture.provenance.some(entry => entry.url === 'docs/expansion-curation/lbl-pedagogia.md'), fixture.id);
  }
});

test('every lbl goal, precondition and transition holds on the solved cube', () => {
  const solved = solvedCube();
  for (const fixture of LBL_TRAINER_FIXTURES) {
    assert.ok(checkStageCondition(solved, fixture.goal), `goal ${fixture.id}`);
    if (fixture.precondition) assert.ok(checkStageCondition(solved, fixture.precondition), `precondition ${fixture.id}`);
    assert.ok(checkStageTransition(solved, solved, fixture), `transition ${fixture.id}`);
  }
});

test('lbl goals reject states that violate the stage', () => {
  const solved = solvedCube();
  const byId = new Map(LBL_TRAINER_FIXTURES.map(fixture => [fixture.id, fixture]));
  const broken = (id: string, sequence: string) =>
    checkStageCondition(applyAlgorithm(solved, sequence), byId.get(id)!.goal);
  assert.equal(broken('lbl/cross', 'D'), false);
  assert.equal(broken('lbl/corners', 'R'), false);
  assert.equal(broken('lbl/middle', 'F'), false);
  assert.equal(broken('lbl/top-cross', 'F'), false);
  assert.equal(broken('lbl/top-edges', 'U'), false);
  assert.equal(broken('lbl/top-corners-position', 'U'), false);
  assert.equal(broken('lbl/top-corners-orient', 'U'), false);
});

test('slice 2 fixtures reuse table conditions by reference and declare recognition contracts', () => {
  assertFixtureIds([...LBL_TRAINER_FIXTURES, ...LBL_SLICE2_FIXTURES]);
  assert.equal(LBL_SLICE2_FIXTURES.length, 8);
  const stages = new Map(LBL_STAGES.map(stage => [stage.id, stage]));
  for (const fixture of LBL_SLICE2_FIXTURES) {
    const stageId = fixture.id.split('/').slice(0, 2).join('/');
    const stage = stages.get(stageId);
    assert.ok(stage, fixture.id);
    if (fixture.precondition) assert.equal(fixture.precondition, stage!.precondition, fixture.id);
    assert.ok(fixture.observe, fixture.id);
    assert.ok(fixture.provenance.some(entry => entry.url === 'docs/expansion-curation/lbl-slice2-textos.md'), fixture.id);
  }
  const recognitions = new Map(
    LBL_SLICE2_FIXTURES.filter(fixture => fixture.recognition).map(fixture => [fixture.id, fixture.recognition!]),
  );
  assert.deepEqual([...recognitions.keys()].sort(), ['lbl/top-corners-position/spot', 'lbl/top-cross/pattern', 'lbl/top-edges/match']);
  assert.deepEqual(recognitions.get('lbl/top-cross/pattern'), { classifierId: 'll-edge-orientation-pattern', optionIds: ['dot', 'hook', 'line'] });
  assert.deepEqual(recognitions.get('lbl/top-edges/match'), { classifierId: 'u-edge-match-shape', optionIds: ['adjacent', 'opposite'] });
});

test('slice 2 goals and preconditions hold on the solved cube and reject violations', () => {
  const solved = solvedCube();
  for (const fixture of LBL_SLICE2_FIXTURES) {
    assert.ok(checkStageCondition(solved, fixture.goal), `goal ${fixture.id}`);
    if (fixture.precondition) assert.ok(checkStageCondition(solved, fixture.precondition), `precondition ${fixture.id}`);
    assert.ok(checkStageTransition(solved, solved, fixture), `transition ${fixture.id}`);
  }
  const byId = new Map(LBL_SLICE2_FIXTURES.map(fixture => [fixture.id, fixture]));
  assert.equal(checkStageCondition(applyAlgorithm(solved, 'R'), byId.get('lbl/corners/one')!.goal), false);
  assert.equal(checkStageCondition(applyAlgorithm(solved, 'F'), byId.get('lbl/middle/one')!.goal), false);
});

test('top-cross ignores corners and ll-corners-placed demands position', () => {
  const solved = solvedCube();
  const sune = "R U R' U R U2 R'";
  const afterSune = applyAlgorithm(solved, sune);
  assert.equal(checkStageCondition(afterSune, { predicate: 'oll-edges' }), true);
  assert.equal(checkStageCondition(afterSune, { predicate: 'll-corners-placed' }), false);
});
