import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { KPattern } from 'cubing/kpuzzle';
import { solvedCube } from '../../../../src/domain/cube';
import { oracleStickers, stickerKey } from '../../oracle';
import { draftFromCube, validateDraft } from '../../../../src/solver/validation';
import { matchCMLL } from '../../../../src/solver/methods/roux/cmll';
import { searchContext, searchLSE, checkpoint, RouxSearchLimit } from '../../../../src/solver/methods/roux/search';

const puzzle = await puzzles['3x3x3'].kpuzzle();
const original = oracleStickers(puzzle.defaultPattern()), geometry = solvedCube();
const ids = new Map(original.map(s => [s.id, geometry.find(t => String(t.position) === String(s.position) && String(t.normal) === String(s.normal))!.id]));
const labelled = (pattern: KPattern) => oracleStickers(pattern).map(s => ({ ...s, id: ids.get(s.id)! }));
const perms = (a: number[]): number[][] => a.length ? a.flatMap((n, i) => perms(a.filter((_, j) => i !== j)).map(p => [n, ...p])) : [[]];
const parity = (a: number[]) => a.reduce((sum, n, i) => sum + a.slice(i + 1).filter(v => v < n).length, 0) % 2;

test('CMLL matches all 648 legal corner coordinates with independent blocks/corners verification', { timeout: 90_000 }, async () => {
  const matched = new Set<string>();
  for (const permutation of perms([0, 1, 2, 3])) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
    const data = structuredClone(puzzle.defaultPattern().patternData);
    data.CORNERS.pieces.splice(0, 4, ...permutation);
    data.CORNERS.orientation.splice(0, 4, a, b, c, (6 - a - b - c) % 3);
    if (parity(permutation)) [data.EDGES.pieces[0], data.EDGES.pieces[1]] = [1, 0];
    const pattern = new KPattern(puzzle, data);
    const match = await matchCMLL(labelled(pattern), searchContext({}));
    if (match.matchedCaseId) matched.add(match.matchedCaseId);
    const result = pattern.applyAlg(match.algorithm);
    assert.ok(['', 'U', "U'", 'U2'].some(u => {
      const p = result.applyAlg(u).patternData;
      return p.CORNERS.pieces.every((v, i) => v === i) && p.CORNERS.orientation.every(v => v === 0);
    }));
    for (const i of [5, 7, 8, 9, 10, 11]) {
      assert.equal(result.patternData.EDGES.pieces[i], i);
      assert.equal(result.patternData.EDGES.orientation[i], 0);
    }
    assert.deepEqual(result.patternData.CENTERS.pieces, puzzle.defaultPattern().patternData.CENTERS.pieces);
  }
  assert.equal(matched.size, 42);
});

test('LSE treats M2 as partial, odd M as unoriented and finishes all centers exactly', async () => {
  for (const algorithm of ['M2', 'M', "M U M' U2 M U' M' U2"]) {
    let pattern = puzzle.defaultPattern().applyAlg(algorithm);
    const initial = stickerKey(oracleStickers(pattern));
    const eo = await searchLSE(labelled(pattern), 'eo', searchContext({}));
    if (algorithm === 'M2') assert.equal(eo, '');
    if (algorithm === 'M') assert.notEqual(eo, '');
    pattern = pattern.applyAlg(eo);
    for (const s of oracleStickers(pattern).filter(s => ['U', 'D'].includes(s.color) && s.position.filter(n => n !== 0).length === 2)) assert.equal(Math.abs(s.normal[1]), 1);
    const lr = await searchLSE(labelled(pattern), 'lr', searchContext({}));
    pattern = pattern.applyAlg(lr);
    for (const i of [1, 3]) { assert.equal(pattern.patternData.EDGES.pieces[i], i); assert.equal(pattern.patternData.EDGES.orientation[i], 0); }
    const finish = await searchLSE(labelled(pattern), 'finish', searchContext({}));
    pattern = pattern.applyAlg(finish);
    assert.equal(stickerKey(oracleStickers(pattern)), stickerKey(original));
    if (algorithm === 'M2') { assert.notEqual(initial, stickerKey(original)); assert.notEqual(finish, ''); }
  }
});

test('search budget reports a calculation limit rather than impossible input', async () => {
  const context = searchContext({}); context.limit = -1;
  await assert.rejects(checkpoint(context), error => error instanceof RouxSearchLimit && /continua válido/.test(error.message));
  const input = validateDraft(draftFromCube(original)); assert.equal(input.kind, 'valid');
});
