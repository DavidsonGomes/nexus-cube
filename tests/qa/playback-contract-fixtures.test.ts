import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, selectCases } from '../../src/domain/catalog';
import { getAlgorithmPlayback } from '../../src/domain/playback';
import { applyAlgorithm, invertAlgorithm, isF2LSolved, isOLLOriented, isSolved, parseAlgorithm, solvedCube } from '../../src/domain/cube';

test('QA contract: real prepare and solve modes use the selected alternative', () => {
  for (const item of CATALOG) for (const selectedAlgorithm of [item.algorithm, ...item.alternatives]) {
    const prepare = getAlgorithmPlayback(item, selectedAlgorithm, 'prepare');
    const solve = getAlgorithmPlayback(item, selectedAlgorithm, 'solve');
    const expectedPreparation = invertAlgorithm(selectedAlgorithm);
    const expectedCaseState = applyAlgorithm(solvedCube(), expectedPreparation);
    assert.equal(prepare.setup, '');
    assert.equal(prepare.algorithm, expectedPreparation);
    assert.equal(prepare.preparation, expectedPreparation);
    assert.equal(solve.setup, expectedPreparation);
    assert.equal(solve.algorithm, parseAlgorithm(selectedAlgorithm).join(' '));
    assert.deepEqual(prepare.caseState, expectedCaseState);
    assert.deepEqual(solve.initialState, expectedCaseState);
    assert.ok(isSolved(prepare.initialState));
    if (item.family === 'OLL' || item.family === 'PLL') assert.ok(isF2LSolved(expectedCaseState));
    const solvedAfter = applyAlgorithm(expectedCaseState, selectedAlgorithm);
    assert.ok(item.family === 'OLL' ? isOLLOriented(solvedAfter) : isSolved(solvedAfter));
    assert.equal(parseAlgorithm(prepare.algorithm).length, parseAlgorithm(selectedAlgorithm).length);
  }
});

test('QA contract: aliases are resolved through real selectCases query semantics', () => {
  const expected: Record<string, string> = {'Awkward 1':'OLL-29','Awkward 2':'OLL-30','Awkward 3':'OLL-41','Awkward 4':'OLL-42'};
  for (const [alias, id] of Object.entries(expected)) assert.deepEqual(selectCases({query: alias}).map(item => item.id), [id]);
});
