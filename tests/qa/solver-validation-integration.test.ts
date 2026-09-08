import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDraft, type DraftFacelets } from '../../src/solver/index';
import { COLORS, SOLVER_FIXTURES, type Facelets54, type Sticker } from './solver-oracle-fixtures';

function asDraft(facelets: Facelets54): DraftFacelets {
  return Object.fromEntries(COLORS.map((face, offset) => [face, facelets.slice(offset * 9, offset * 9 + 9)])) as DraftFacelets;
}

test('solver validator consumes independent URFDLB row-major vectors without mutating input', () => {
  for (const fixture of SOLVER_FIXTURES) {
    const source = asDraft(fixture.state);
    const before = JSON.stringify(source);
    const result = validateDraft(source);
    assert.equal(JSON.stringify(source), before, fixture.id);
    assert.equal(result.kind === 'valid', fixture.expected.legal, fixture.id);
    if (fixture.expected.legal) {
      assert.equal(result.kind, 'valid');
      if (result.kind === 'valid') {
        assert.deepEqual(result.facelets, source, fixture.id);
        assert.equal(result.state.length, 54, fixture.id);
      }
    } else {
      assert.notEqual(result.kind, 'valid', fixture.id);
      assert.ok(result.issues.length > 0, fixture.id);
    }
  }
});

test('solver validation reports a stable issue family for each independent malformed vector', () => {
  const expected: Record<string, string> = {
    'bad-color-count': 'color-count',
    'bad-center': 'center-mismatch',
    'missing-sticker': 'invalid-shape',
  };
  for (const fixture of SOLVER_FIXTURES.filter(item => !item.expected.legal)) {
    const result = validateDraft(asDraft(fixture.state));
    assert.notEqual(result.kind, 'valid', fixture.id);
    if (result.kind !== 'valid' && expected[fixture.id]) assert.ok(result.issues.some(issue => issue.code === expected[fixture.id]), fixture.id);
  }
});
