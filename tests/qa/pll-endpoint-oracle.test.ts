import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { KPattern } from 'cubing/kpuzzle';
import { Alg } from 'cubing/alg';
import { CATALOG } from '../../src/domain/catalog';
import { getContentPlayback } from '../../src/domain/playback';
import { getPLLPermutation } from '../../src/domain/pll-permutation';
import { oracleStickers } from '../domain/oracle';

const kpuzzle = await puzzles['3x3x3'].kpuzzle();
const cornerCells = [8, 2, 0, 6], edgeCells = [7, 5, 1, 3];

function expectedEndpoints(pattern: any, kind: 'corner' | 'edge') {
  const slots = kind === 'corner' ? cornerCells : edgeCells;
  const pieces = kind === 'corner' ? pattern.CORNERS.pieces.slice(0, 4) : pattern.EDGES.pieces.slice(0, 4);
  return slots.map((_, origin) => ({origin: slots[origin], destination: slots[pieces[origin]]}));
}

function compare(item: (typeof CATALOG)[number], algorithm: string) {
  const inverseSetup = new Alg(algorithm).invert().toString();
  const pattern = kpuzzle.defaultPattern().applyAlg(inverseSetup).patternData;
  const expectedState = oracleStickers(new KPattern(kpuzzle, pattern));
  const expectedPermutation = getPLLPermutation(expectedState);
  const actualPermutation = getPLLPermutation(getContentPlayback(item, algorithm, 'solve').caseState);
  assert.deepEqual(actualPermutation, expectedPermutation, `${item.id} helper state matches inverse oracle`);
  const permutation = actualPermutation;
  assert.equal(permutation.status, 'ready', `${item.id} ${algorithm}`);
  if (permutation.status !== 'ready') return;
  const state = oracleStickers(new KPattern(kpuzzle, pattern));
  const identityAt = (index: number) => {
    const row = Math.floor(index / 3), col = index % 3, x = col - 1, z = row - 1;
    return state.filter(sticker => sticker.position[1] === 1 && sticker.position[0] === x && sticker.position[2] === z).map(sticker => sticker.color).sort().join('');
  };
  for (const kind of ['corner', 'edge'] as const) {
    const expected = expectedEndpoints(pattern, kind);
    const actual = permutation.mappings.filter(mapping => mapping.kind === kind).map(mapping => ({origin: mapping.from.index, destination: mapping.to.index}));
    assert.deepEqual(actual.sort((a, b) => a.origin - b.origin), expected.sort((a, b) => a.origin - b.origin), `${item.id} ${kind} endpoints`);
  }
  for (const mapping of permutation.mappings) assert.equal(mapping.piece, identityAt(mapping.from.index), `${item.id} piece identity ${mapping.from.index}`);
  const expectedMap = new Map(permutation.mappings.map(mapping => [mapping.from.index, mapping.to.index]));
  const mappingByFrom = new Map(permutation.mappings.map(mapping => [mapping.from.index, mapping]));
  for (const cycle of permutation.cycles) {
    assert.equal(cycle.kind, mappingByFrom.get(cycle.positions[0].index)?.kind, `${item.id} cycle kind`);
    for (let i = 0; i < cycle.positions.length; i++) {
      const from = cycle.positions[i].index, next = cycle.positions[(i + 1) % cycle.positions.length].index;
      assert.equal(expectedMap.get(from), next, `${item.id} cycle direction`);
      assert.equal(mappingByFrom.get(from)?.kind, cycle.kind, `${item.id} cycle slot kind`);
      assert.equal(mappingByFrom.get(from)?.piece, cycle.pieces[i], `${item.id} cycle piece identity`);
    }
    assert.equal(cycle.pieces.length, cycle.positions.length, `${item.id} cycle pieces`);
  }
  assert.deepEqual(permutation.fixed.map(mapping => [mapping.from.index, mapping.to.index, mapping.piece]), permutation.mappings.filter(mapping => mapping.from.index === mapping.to.index).map(mapping => [mapping.from.index, mapping.to.index, mapping.piece]), `${item.id} fixed mappings`);
  const directed = permutation.mappings.filter(mapping => mapping.from.index !== mapping.to.index).map(mapping => `${mapping.from.index}->${mapping.to.index}`).sort();
  const arrows = permutation.arrows.flatMap(arrow => arrow.bidirectional ? [`${arrow.from.index}->${arrow.to.index}`, `${arrow.to.index}->${arrow.from.index}`] : [`${arrow.from.index}->${arrow.to.index}`]).sort();
  assert.deepEqual(arrows, directed, `${item.id} directed arrows`);
  for (const cycle of permutation.cycles) {
    const matching = permutation.arrows.filter(arrow => arrow.cycleId === cycle.id);
    assert.equal(matching.length, cycle.positions.length === 2 ? 1 : cycle.positions.length, `${item.id} arrow count`);
    if (cycle.positions.length === 2) assert.equal(matching.filter(arrow => arrow.bidirectional).length, 1, `${item.id} bidirectional arrow`);
    for (const arrow of matching) { assert.equal(arrow.kind, cycle.kind, `${item.id} arrow kind`); assert.deepEqual(arrow.pieces, arrow.bidirectional ? cycle.pieces : [cycle.pieces[cycle.positions.findIndex(position => position.index === arrow.from.index)]], `${item.id} arrow pieces`); }
  }
  const nonFixed = permutation.mappings.filter(mapping => mapping.from.index !== mapping.to.index).map(mapping => mapping.from.index).sort((a, b) => a - b);
  const cycleSlots = permutation.cycles.flatMap(cycle => cycle.positions.map(position => position.index)).sort((a, b) => a - b);
  assert.deepEqual(cycleSlots, nonFixed, `${item.id} cycle partition`);
  assert.equal(permutation.fixed.length + permutation.cycles.flatMap(cycle => cycle.positions).length, 8, `${item.id} mappings complete`);
}

test('E4 PLL endpoint oracle compares directed identity mappings and fixed pieces', () => {
  for (const item of CATALOG.filter(candidate => candidate.family === 'PLL')) {
    compare(item, item.algorithm);
  }
});

// Raw helper output intentionally preserves the current center frame. Didactic
// AUF normalization and conventional diagrams (notably Z/Jb/Ra/Rb) remain a
// separate contract and are not asserted until Prisma publishes that mapping.

test('E4 PLL alternatives use their own content playback setup before endpoint comparison', () => {
  for (const item of CATALOG.filter(candidate => candidate.family === 'PLL')) for (const algorithm of item.alternatives) compare(item, algorithm);
});

test('E4 PLL solved state is explicit and has no arrows or cycles', () => {
  const solved = getPLLPermutation(oracleStickers(kpuzzle.defaultPattern()));
  assert.equal(solved.status, 'ready');
  if (solved.status === 'ready') { assert.equal(solved.fixed.length, 8); assert.equal(solved.cycles.length, 0); assert.equal(solved.arrows.length, 0); }
});
