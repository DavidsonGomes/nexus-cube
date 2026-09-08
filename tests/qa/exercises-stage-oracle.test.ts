import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_SOURCES } from '../../src/data/expansion-sources/exercises';
import { applyAlgorithm, solvedCube } from '../../src/domain/cube';
import { validateStage } from '../../src/domain/stage-validation';

test('E1 exercise corpus has 24 unique sourced records with explicit goals and preservation', () => {
  assert.equal(EXERCISE_SOURCES.length, 24);
  assert.equal(new Set(EXERCISE_SOURCES.map(item => item.id)).size, 24);
  for (const item of EXERCISE_SOURCES) {
    assert.ok(item.id.includes('/'), item.id);
    assert.ok(item.setup.trim(), `${item.id} setup`);
    assert.ok(item.solution.trim(), `${item.id} solution`);
    assert.ok(item.objective.trim(), `${item.id} objective`);
    assert.ok(item.validation.goal, `${item.id} goal`);
    assert.ok(item.provenance.length > 0, `${item.id} source`);
    assert.ok(item.milestones.length > 0, `${item.id} milestones`);
  }
});

test('E1 integration check: each exercise satisfies its declared product stage goal', () => {
  for (const item of EXERCISE_SOURCES) {
    const initial = applyAlgorithm(solvedCube(), item.setup);
    const final = applyAlgorithm(initial, item.solution);
    assert.equal(validateStage(final, item.validation), true, `${item.id} ${item.validation.goal}`);
  }
});
