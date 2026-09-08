import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { KPattern } from 'cubing/kpuzzle';
import { solvedCube } from '../../../../src/domain/cube';
import { oracleStickers, stickerKey } from '../../oracle';
import { draftFromCube, validateDraft } from '../../../../src/solver/validation';
import { planRoux } from '../../../../src/solver/methods/roux';
import { verifyMethodPlan } from '../../../../src/solver/methods/plan';
import { projection, turns } from '../../../../src/solver/methods/roux/search';

const puzzle = await puzzles['3x3x3'].kpuzzle();
function inputFor(pattern: KPattern) {
  const input = validateDraft(draftFromCube(oracleStickers(pattern)));
  assert.equal(input.kind, 'valid');
  if (input.kind !== 'valid') throw new Error('Invalid fixture');
  return input;
}
test('projection transitions agree with independent KPuzzle on all supported moves', () => {
  const pieces = ['DL', 'FL', 'BL', 'DFL', 'DBL', 'U'];
  const p = projection(pieces, turns('URFDLBMr'));
  const original = oracleStickers(puzzle.defaultPattern()), geometry = solvedCube();
  const ids = new Map(original.map(s => [s.id, geometry.find(t => String(t.position) === String(s.position) && String(t.normal) === String(s.normal))!.id]));
  for (let m = 0; m < p.moves.length; m++) {
    const oracle = puzzle.defaultPattern().applyAlg(p.moves[m]);
    const tracked = oracleStickers(oracle).map(s => ({ ...s, id: ids.get(s.id)! }));
    assert.deepEqual(p.read(tracked), p.targets.map((v, i) => p.transitions[i][m][v]));
  }
});

test('Roux solves original arbitrary legal states with seven verified real stage boundaries', { timeout: 180_000 }, async () => {
  const arbitrary = structuredClone(puzzle.defaultPattern().patternData);
  [arbitrary.CORNERS.pieces[0], arbitrary.CORNERS.pieces[4]] = [4, 0];
  [arbitrary.EDGES.pieces[0], arbitrary.EDGES.pieces[8]] = [8, 0];
  arbitrary.CORNERS.orientation[0] = 1; arbitrary.CORNERS.orientation[4] = 2;
  arbitrary.EDGES.orientation[3] = 1; arbitrary.EDGES.orientation[9] = 1;
  const originals = [puzzle.defaultPattern(), puzzle.defaultPattern().applyAlg("R U R' U' F2 D B' L2 U2 F R2 D' B2 L U'"), new KPattern(puzzle, arbitrary)];
  for (const original of originals) {
    const input = inputFor(original), snapshot = JSON.stringify(input);
    const start = performance.now();
    const plan = await planRoux(input);
    console.info(`Roux fixture ${originals.indexOf(original)}: ${plan.tokens.length} moves, ${Math.round(performance.now() - start)} ms`);
    assert.equal(JSON.stringify(input), snapshot);
    assert.deepEqual(plan.stages.map(s => s.id), ['roux.fb', 'roux.sb', 'roux.cmll', 'roux.cmll-auf', 'roux.eo', 'roux.lr', 'roux.finish']);
    assert.ok(verifyMethodPlan(input, plan));
    for (const stage of plan.stages) {
      assert.equal(stickerKey(stage.initialState), stickerKey(oracleStickers(original.applyAlg(plan.tokens.slice(0, stage.startStep).join(' ')))));
      assert.equal(stickerKey(stage.finalState), stickerKey(oracleStickers(original.applyAlg(plan.tokens.slice(0, stage.endStep).join(' ')))));
    }
    assert.equal(stickerKey(oracleStickers(original.applyAlg(plan.algorithm))), stickerKey(oracleStickers(puzzle.defaultPattern())));
  }
});

test('cancellation before and during calculation rejects without a completed plan', async () => {
  const input = inputFor(puzzle.defaultPattern().applyAlg("R U F D L B R2 U' F2"));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(planRoux(input, { signal: controller.signal }), /cancelado/);
  const active = new AbortController();
  const pending = planRoux(input, { signal: active.signal });
  setTimeout(() => active.abort(), 5);
  await assert.rejects(pending, /cancelado/);
});
