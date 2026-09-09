import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../../src/domain/cube';
import { assertFixtureIds, checkStageCondition, checkStageTransition } from '../../../../src/data/trainers';
import { CMLL_SOURCES } from '../../../../src/data/expansion-sources/cmll';
import { CMLL_INTRO_CASES, ROUX_TRAINER_FIXTURES } from '../../../../src/solver/methods/roux/trainer-fixtures';

test('fixture ids are namespaced, unique and roux-scoped', () => {
  assertFixtureIds(ROUX_TRAINER_FIXTURES);
  assert.equal(ROUX_TRAINER_FIXTURES.length, 25);
  for (const fixture of ROUX_TRAINER_FIXTURES) {
    assert.ok(fixture.id.startsWith('roux/'), fixture.id);
    assert.equal(fixture.trainerId, 'roux');
    assert.equal(fixture.methodId, 'roux');
  }
});

test('every fixture cites the curation source in provenance', () => {
  for (const fixture of ROUX_TRAINER_FIXTURES) {
    assert.ok(
      fixture.provenance.some(entry => entry.url === 'docs/expansion-curation/roux-trainer-names.md'),
      fixture.id,
    );
  }
});

test('observe texts from the curation cover exactly the agreed fixtures', () => {
  const withObserve = ROUX_TRAINER_FIXTURES.filter(fixture => fixture.observe !== undefined).map(fixture => fixture.id).sort();
  const expected = [
    'roux/fb/square', 'roux/sb/edge-dr', 'roux/lse/eo', 'roux/cmll/two-look',
    ...CMLL_INTRO_CASES.map(entry => entry.fixtureId),
  ].sort();
  assert.deepEqual(withObserve, expected);
});

test('every declared goal and precondition holds on the solved cube', () => {
  const solved = solvedCube();
  for (const fixture of ROUX_TRAINER_FIXTURES) {
    assert.ok(checkStageCondition(solved, fixture.goal), `goal ${fixture.id}`);
    if (fixture.precondition) assert.ok(checkStageCondition(solved, fixture.precondition), `precondition ${fixture.id}`);
    for (const checkpoint of fixture.checkpoints ?? []) {
      assert.ok(checkStageCondition(solved, checkpoint.condition), `checkpoint ${fixture.id}/${checkpoint.id}`);
    }
    assert.ok(checkStageTransition(solved, solved, fixture), `transition ${fixture.id}`);
  }
});

test('goals reject states that violate the stage', () => {
  const solved = solvedCube();
  const byId = new Map(ROUX_TRAINER_FIXTURES.map(fixture => [fixture.id, fixture]));
  const broken = (id: string, sequence: string) =>
    checkStageCondition(applyAlgorithm(solved, sequence), byId.get(id)!.goal);
  assert.equal(broken('roux/fb/edge-dl', 'D'), false);
  assert.equal(broken('roux/fb/block', 'L'), false);
  assert.equal(broken('roux/sb/block', 'R'), false);
  assert.equal(broken('roux/cmll/intro-h', "R U R' U'"), false);
  assert.equal(broken('roux/lse/eo', 'M'), false);
  assert.equal(broken('roux/lse/finish', 'M2'), false);
});

test('cmll-oriented admits permutation but not disorientation', () => {
  const solved = solvedCube();
  const orientedGoal = { predicate: 'cmll-oriented' } as const;
  assert.equal(checkStageCondition(applyAlgorithm(solved, 'U'), orientedGoal), true);
  assert.equal(checkStageCondition(applyAlgorithm(solved, "R U R' U R U2 R'"), orientedGoal), false);
});

test('intro-set references existing corpus cases with matching groups', () => {
  const corpus = new Map(CMLL_SOURCES.map(source => [source.id, source]));
  for (const { fixtureId, caseId, group } of CMLL_INTRO_CASES) {
    const source = corpus.get(caseId);
    assert.ok(source, caseId);
    assert.equal(source!.groupId, group, caseId);
    const fixture = ROUX_TRAINER_FIXTURES.find(candidate => candidate.id === fixtureId);
    assert.ok(fixture, fixtureId);
    assert.ok(fixture!.provenance.some(entry => entry.notes?.includes(caseId)), fixtureId);
  }
  for (const caseId of ['roux/cmll/01', 'roux/cmll/02']) {
    assert.equal(corpus.get(caseId)?.groupId, 'O', caseId);
  }
});
