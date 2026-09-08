import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { EXERCISE_SOURCES } from '../../src/data/expansion-sources/exercises';

const kpuzzle = await puzzles['3x3x3'].kpuzzle();
const edgeIndex: Record<string, number> = {UF: 0, UR: 1, UB: 2, UL: 3, DF: 4, DR: 5, DB: 6, DL: 7, FR: 8, FL: 9, BR: 10, BL: 11};
const cornerIndex: Record<string, number> = {UFR: 0, URB: 1, UBL: 2, ULF: 3, DFR: 4, DFL: 5, DBL: 6, DBR: 7};
const freeEdges = [0, 1, 2, 3, 4, 6], blockEdges = [5, 7, 8, 9, 10, 11];

test('E1 independent KPuzzle oracle checks exercise preservation without validateStage', () => {
  for (const item of EXERCISE_SOURCES) {
    const initial = kpuzzle.defaultPattern().applyAlg(item.setup).patternData;
    const pattern = kpuzzle.defaultPattern().applyAlg(`${item.setup} ${item.solution}`).patternData;
    const edges = pattern.EDGES, corners = pattern.CORNERS, centers = pattern.CENTERS;
    const edgeExact = (indices: number[]) => indices.every(index => edges.pieces[index] === index && edges.orientation[index] === 0);
    const cornerExact = (indices: number[]) => indices.every(index => corners.pieces[index] === index && corners.orientation[index] === 0);
    const centerExact = (indices: number[]) => indices.every(index => centers.pieces[index] === index);
    const initialEdges = initial.EDGES, initialCorners = initial.CORNERS;
    for (const piece of item.validation.preserve ?? []) {
      const index = edgeIndex[piece] ?? cornerIndex[piece];
      const orbit = edgeIndex[piece] !== undefined ? initialEdges : initialCorners;
      assert.equal(orbit.pieces[index], index, `${item.id} initial preserve ${piece}`);
      assert.equal(orbit.orientation[index], 0, `${item.id} initial preserve orientation ${piece}`);
    }
    if (item.validation.goal === 'cross' || item.validation.goal === 'f2l-pair' || item.validation.goal === 'first-block' || item.validation.goal === 'second-block') assert.ok([0, 1, 2, 3, 4, 5].every(index => initial.CENTERS.pieces[index] === index), `${item.id} initial centers`);
    if (item.validation.goal === 'f2l-pair') assert.ok([4, 5, 6, 7].every(index => initialEdges.pieces[index] === index && initialEdges.orientation[index] === 0), `${item.id} initial cross`);
    if (item.validation.goal === 'second-block') assert.ok([7, 9, 11].every(index => initialEdges.pieces[index] === index), `${item.id} initial first block`);
    if (item.validation.goal === 'lse-eo' || item.validation.goal === 'lse-lr' || item.validation.goal === 'solved') {
      assert.ok(initial.CORNERS.pieces.every((piece, index) => piece === index && initial.CORNERS.orientation[index] === 0), `${item.id} initial corners`);
      assert.ok(blockEdges.every(index => initialEdges.pieces[index] === index && initialEdges.orientation[index] === 0), `${item.id} initial blocks`);
      assert.equal(initial.CENTERS.pieces[1], 1, `${item.id} initial L center`);
      assert.equal(initial.CENTERS.pieces[3], 3, `${item.id} initial R center`);
      if (item.validation.goal === 'lse-lr' || item.validation.goal === 'solved') assert.ok(oracleEO({patternData: initial}), `${item.id} initial EO`);
      const expected = item.id.includes('eo-duas') ? 2 : item.id.includes('eo-quatro') ? 4 : item.id.includes('eo-seis') ? 6 : null;
      if (expected !== null) assert.equal(freeEdges.filter(index => initialEdges.orientation[index] === 1).length, expected, `${item.id} initial EO count`);
      if (expected !== null) assert.deepEqual(new Set([initial.CENTERS.pieces[0], initial.CENTERS.pieces[5]]), new Set([0, 5]), `${item.id} initial U/D centers`);
      if (item.validation.goal === 'solved') assert.ok(initialEdges.pieces[1] === 1 && initialEdges.pieces[3] === 3 && initialEdges.orientation[1] === 0 && initialEdges.orientation[3] === 0, `${item.id} initial UL/UR`);
      if (item.id === 'roux/lse/referencia-centros') assert.ok(!(new Set([initial.CENTERS.pieces[0], initial.CENTERS.pieces[5]]).has(0) && new Set([initial.CENTERS.pieces[0], initial.CENTERS.pieces[5]]).has(5)), `${item.id} initial centers require odd M normalization`);
    }
    switch (item.validation.goal) {
      case 'cross': assert.ok(edgeExact([4, 5, 6, 7]) && centerExact([0, 1, 2, 3, 4, 5]), `${item.id} explicit cross`); break;
      case 'f2l-pair': {
        const slot = item.validation.targetSlot === 'FL' ? [9, 5] : item.validation.targetSlot === 'BR' ? [10, 7] : item.validation.targetSlot === 'BL' ? [11, 6] : [8, 4];
        assert.ok(edgeExact([4, 5, 6, 7]) && edgeExact([slot[0]]) && cornerExact([slot[1]]) && centerExact([0, 1, 2, 3, 4, 5]), `${item.id} explicit F2L pair`); break;
      }
      case 'first-block': assert.ok(edgeExact([7, 9, 11]) && cornerExact([5, 6]) && centerExact([1]), `${item.id} explicit FB`); break;
      case 'second-block': assert.ok(edgeExact([7, 9, 11, 5, 8, 10]) && cornerExact([5, 6, 4, 7]) && centerExact([1, 3]), `${item.id} explicit SB`); break;
      case 'lse-eo': assert.ok(oracleEO({patternData: pattern}), `${item.id} explicit EO`); break;
      case 'lse-lr': assert.ok(oracleEO({patternData: pattern}) && edgeExact([1, 3]), `${item.id} explicit LR`); break;
      case 'solved': assert.ok(edges.pieces.every((piece, index) => piece === index) && corners.pieces.every((piece, index) => piece === index) && centers.pieces.every((piece, index) => piece === index), `${item.id} explicit solved`); break;
      default: throw new Error(`${item.id} unsupported objective ${item.validation.goal}`);
    }
    for (const piece of item.validation.preserve ?? []) {
      const index = edgeIndex[piece] ?? cornerIndex[piece];
      assert.notEqual(index, undefined, `${item.id} unknown preserve piece ${piece}`);
      const orbit = edgeIndex[piece] !== undefined ? pattern.EDGES : pattern.CORNERS;
      assert.equal(orbit.pieces[index], index, `${item.id} preserve ${piece} permutation`);
      assert.equal(orbit.orientation[index], 0, `${item.id} preserve ${piece} orientation`);
    }
    if (item.validation.goal === 'solved') {
      assert.deepEqual(pattern.EDGES.pieces, Array.from({length: 12}, (_, i) => i), `${item.id} edges solved`);
      assert.deepEqual(pattern.CORNERS.pieces, Array.from({length: 8}, (_, i) => i), `${item.id} corners solved`);
      assert.deepEqual(pattern.CENTERS.pieces, Array.from({length: 6}, (_, i) => i), `${item.id} centers solved`);
      assert.ok(pattern.EDGES.orientation.every(value => value === 0), `${item.id} edge orientation`);
      assert.ok(pattern.CORNERS.orientation.every(value => value === 0), `${item.id} corner orientation`);
    }
  }
});

function oracleEO(pattern: {patternData: any}) {
  const {EDGES, CORNERS, CENTERS} = pattern.patternData;
  return CORNERS.pieces.every((piece, index) => piece === index) && CORNERS.orientation.every(value => value === 0)
    && blockEdges.every(index => EDGES.pieces[index] === index && EDGES.orientation[index] === 0)
    && freeEdges.every(index => EDGES.orientation[index] === 0)
    && CENTERS.pieces[1] === 1 && CENTERS.pieces[3] === 3
    && new Set([CENTERS.pieces[0], CENTERS.pieces[5]]).size === 2
    && new Set([CENTERS.pieces[0], CENTERS.pieces[5]]).has(0)
    && new Set([CENTERS.pieces[0], CENTERS.pieces[5]]).has(5);
}

test('E1 EO/LR oracle accepts M2, rejects M, and does not call solved', () => {
  const m2 = kpuzzle.defaultPattern().applyAlg('M2');
  const m = kpuzzle.defaultPattern().applyAlg('M');
  assert.equal(oracleEO(m2), true);
  assert.equal(m2.patternData.EDGES.pieces[1] === 1 && m2.patternData.EDGES.pieces[3] === 3, true);
  assert.equal(oracleEO(m), false);
  assert.notDeepEqual(m2.patternData.EDGES.pieces, Array.from({length: 12}, (_, i) => i));
});
