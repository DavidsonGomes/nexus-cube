import test from 'node:test';
import assert from 'node:assert/strict';
import { KPattern } from 'cubing/kpuzzle';
import { puzzles } from 'cubing/puzzles';
import { CMLL_SOURCES } from '../../src/data/expansion-sources/cmll';

const kpuzzle = await puzzles['3x3x3'].kpuzzle();
const permutations = (values: number[]): number[][] => values.length ? values.flatMap((v, i) => permutations(values.filter((_, j) => j !== i)).map(rest => [v, ...rest])) : [[]];
const parity = (values: number[]) => values.reduce((sum, value, i) => sum + values.slice(i + 1).filter(other => value > other).length, 0) % 2;
const rotate = (values: readonly number[], n: number) => values.map((_, i) => values[(i + n) % values.length]);
const canonical = (pieces: readonly number[], orientation: readonly number[]) => Array.from({length: 4}, (_, positionShift) => Array.from({length: 4}, (_, pieceShift) => {
  const relabeled = rotate(pieces, positionShift).map(piece => (piece + pieceShift) % 4);
  return `${relabeled.join('')}/${rotate(orientation, positionShift).join('')}`;
})).flat().sort()[0];
const freeEdgePermutations = permutations([0, 1, 2, 3, 4, 6]);

function directPattern(pieces: readonly number[], orientation: readonly number[], freeEdges: readonly number[] = [0, 1, 2, 3, 4, 6], edgeFlips: readonly number[] = [0, 0, 0, 0, 0, 0], topEdges: readonly number[] = [0, 1, 2, 3]) {
  const data = structuredClone(kpuzzle.defaultPattern().patternData);
  data.CORNERS.pieces = [...pieces, 4, 5, 6, 7];
  data.CORNERS.orientation = [...orientation, 0, 0, 0, 0];
  data.EDGES.pieces = [...topEdges, freeEdges[4], 5, freeEdges[5], 7, 8, 9, 10, 11];
  data.EDGES.orientation = [edgeFlips[0], edgeFlips[1], edgeFlips[2], edgeFlips[3], edgeFlips[4], 0, edgeFlips[5], 0, 0, 0, 0, 0];
  return new KPattern(kpuzzle, data);
}

test('E1 CMLL oracle independently enumerates 24 cp permutations × 27 co twists = 648', () => {
  const states = new Map<string, {pieces: number[]; orientation: number[]}>();
  for (const pieces of permutations([0, 1, 2, 3])) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
    const orientation = [a, b, c, (3 - a - b - c) % 3];
    const normalized = orientation.map(value => (value + 3) % 3);
    states.set(`${pieces.join('')}/${normalized.join('')}`, {pieces, orientation: normalized});
  }
  assert.equal(states.size, 648);
  const classes = new Set([...states.values()].map(state => canonical(state.pieces, state.orientation)));
  assert.equal(classes.size, 43, '42 nontrivial classes plus solved skip under AUF relabeling');
  const solvedClass = canonical([0, 1, 2, 3], [0, 0, 0, 0]);
  const nontrivial = new Set([...classes].filter(signature => signature !== solvedClass));
  const catalogClasses = new Set(CMLL_SOURCES.map(item => canonical(item.recognition.pieces, item.recognition.orientation)));
  assert.equal(CMLL_SOURCES.length, 42);
  assert.equal(new Set(CMLL_SOURCES.map(item => item.id)).size, 42);
  assert.deepEqual(catalogClasses, nontrivial, 'catalog identities must equal independent enumeration minus solved skip');
});

test('E1 CMLL direct cp/co fixtures preserve bottom corners and tolerate varied free-edge parity', () => {
  for (const [index, item] of CMLL_SOURCES.entries()) for (const variant of [0, 1, 2]) {
    const freeEdges = freeEdgePermutations[(index * 17 + variant * 31) % freeEdgePermutations.length].slice();
    const flips = Array.from({length: 6}, (_, i) => i === (variant % 3) || i === ((variant % 3) + 3) ? 1 : 0);
    if (parity(item.recognition.pieces) !== parity(freeEdges)) [freeEdges[0], freeEdges[1]] = [freeEdges[1], freeEdges[0]];
    const result = directPattern(item.recognition.pieces, item.recognition.orientation, freeEdges, flips, freeEdges.slice(0, 4)).applyAlg(item.algorithm).patternData;
    assert.deepEqual(result.CORNERS.pieces.slice(0, 4), [0, 1, 2, 3], `${item.id} top cp variant ${variant}`);
    assert.deepEqual(result.CORNERS.orientation.slice(0, 4), [0, 0, 0, 0], `${item.id} top co variant ${variant}`);
    assert.deepEqual(result.CORNERS.pieces.slice(4), [4, 5, 6, 7], `${item.id} bottom cp variant ${variant}`);
    assert.deepEqual(result.CORNERS.orientation.slice(4), [0, 0, 0, 0], `${item.id} bottom co variant ${variant}`);
    for (const blockIndex of [5, 7, 8, 9, 10, 11]) {
      assert.equal(result.EDGES.pieces[blockIndex], blockIndex, `${item.id} block edge ${blockIndex} variant ${variant}`);
      assert.equal(result.EDGES.orientation[blockIndex], 0, `${item.id} block edge orientation ${blockIndex} variant ${variant}`);
    }
    assert.equal(flips.reduce((sum, value) => sum + value, 0) % 2, 0, `${item.id} legal flip parity`);
  }
});
