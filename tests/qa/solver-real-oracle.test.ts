import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAlgorithm, faceColors, solvedCube } from '../../src/domain/cube';
import { draftFromCube, solveValidatedInput, validateDraft, type ValidatedSolverInput } from '../../src/solver';
import { COLORS, sourceSnapshot, solved54, type Facelets54 } from './solver-oracle-fixtures';

function vector(state: ReturnType<typeof solvedCube>): Facelets54 {
  return COLORS.flatMap(face => faceColors(state, face));
}

test('real solver applies its returned solution to the original legal input', async () => {
  for (const scramble of ['R U', 'F2 L D']) {
    const original = applyAlgorithm(solvedCube(), scramble);
    const source = sourceSnapshot(vector(original));
    const draft = draftFromCube(original);
    const validated = validateDraft(draft);
    assert.equal(validated.kind, 'valid', scramble);
    if (validated.kind !== 'valid') continue;
    const result = await solveValidatedInput(validated as ValidatedSolverInput);
    assert.deepEqual(vector(result.initialState), source, `${scramble}: solver preserved original input`);
    const solved = applyAlgorithm(original, result.algorithm);
    assert.deepEqual(vector(solved), solved54(), `${scramble}: returned algorithm solves original`);
  }
});

test('real solver keeps the solved case empty', async () => {
  const validated = validateDraft(draftFromCube(solvedCube()));
  assert.equal(validated.kind, 'valid');
  if (validated.kind !== 'valid') return;
  const result = await solveValidatedInput(validated);
  assert.equal(result.algorithm, '');
  assert.deepEqual(vector(result.initialState), solved54());
});
