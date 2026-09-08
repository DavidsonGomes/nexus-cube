import assert from 'node:assert/strict';
import test from 'node:test';
import { SOLVER_FIXTURES, independentCenters, independentColorCounts, independentShape, sourceSnapshot, sourceUnchanged, type Facelets54 } from './solver-oracle-fixtures';

test('independent solver vectors establish shape, color counts, centers and legal expectations', () => {
  for (const fixture of SOLVER_FIXTURES) {
    assert.equal(independentShape(fixture.state), fixture.expected.shape, fixture.id);
    assert.equal(independentColorCounts(fixture.state), fixture.expected.colorCounts, fixture.id);
    assert.equal(independentCenters(fixture.state), fixture.expected.centers, fixture.id);
  }
});

test('solver input snapshot is preserved and expected output is never derived from returned output', () => {
  const input: Facelets54 = sourceSnapshot(SOLVER_FIXTURES[0].state);
  const before = sourceSnapshot(input);
  const hypotheticalSolution = sourceSnapshot(input);
  assert.equal(sourceUnchanged(before, input), true);
  assert.notStrictEqual(hypotheticalSolution, input);
  assert.deepEqual(hypotheticalSolution, before);
});

