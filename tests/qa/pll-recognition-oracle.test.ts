import test from 'node:test';
import assert from 'node:assert/strict';
import { Alg } from 'cubing/alg';
import { KPattern } from 'cubing/kpuzzle';
import { puzzles } from 'cubing/puzzles';
import { CATALOG } from '../../src/domain/catalog';
import { applyAlgorithm, isSolved, solvedCube } from '../../src/domain/cube';
import { getPLLRecognition, getPLLRecognitionPlayback } from '../../src/domain/pll-recognition';
import { getPLLPermutation } from '../../src/domain/pll-permutation';
import { stickerKey } from '../domain/oracle';
import { oracleStickers } from '../domain/oracle';

const profiles: Record<string, string> = {Ua:'edges-only',Ub:'edges-only',H:'edges-only',Z:'edges-only',Aa:'corners-only',Ab:'corners-only',E:'corners-only',F:'adjacent-swap',Ja:'adjacent-swap',Jb:'adjacent-swap',Ra:'adjacent-swap',Rb:'adjacent-swap',T:'adjacent-swap',V:'diagonal-swap',Y:'diagonal-swap',Na:'diagonal-swap',Nb:'diagonal-swap',Ga:'double-three-cycles',Gb:'double-three-cycles',Gc:'double-three-cycles',Gd:'double-three-cycles'};
const normalize = (algorithm: string) => new Alg(algorithm).toString();
const kpuzzle = await puzzles['3x3x3'].kpuzzle();
const cubingState = (algorithm: string) => stickerKey(oracleStickers(new KPattern(kpuzzle, kpuzzle.defaultPattern().applyAlg(algorithm).patternData)));
const endpointCells = {corner:[8,2,0,6],edge:[7,5,1,3]} as const;
const pieceNames = {corner:['UFR','URB','UBL','ULF'], edge:['UF','UR','UB','UL']} as const;

test('E4 normalized PLL recognition preserves raw state and nominal profile', () => {
  for (const item of CATALOG.filter(candidate => candidate.family === 'PLL')) for (const selected of [item.algorithm, ...item.alternatives]) {
    const recognition = getPLLRecognition(item, selected);
    const originalExpected = normalize(selected);
    const expectedPreparation = [new Alg(originalExpected).invert().toString(), recognition.adjustment].filter(Boolean).join(' ');
    const expectedSolution = [new Alg(recognition.adjustment).invert().toString(), originalExpected].filter(Boolean).join(' ');
    assert.equal(normalize(recognition.originalAlgorithm), originalExpected, `${item.id} original algorithm`);
    assert.ok(['', 'U', "U'", 'U2'].includes(recognition.adjustment), `${item.id} adjustment`);
    assert.equal(recognition.undoAdjustment, new Alg(recognition.adjustment).invert().toString(), `${item.id} undo adjustment`);
    assert.equal(stickerKey(recognition.rawState), cubingState(new Alg(originalExpected).invert().toString()), `${item.id} raw state`);
    const expectedRecognitionPattern = kpuzzle.defaultPattern().applyAlg(`${new Alg(originalExpected).invert().toString()} ${recognition.adjustment}`);
    assert.equal(stickerKey(recognition.recognitionState), stickerKey(oracleStickers(expectedRecognitionPattern)), `${item.id} recognition state`);
    verifyPermutation(recognition.recognitionPermutation, expectedRecognitionPattern.patternData, item.id);
    assert.equal(cubingState(recognition.preparation), cubingState(expectedPreparation), `${item.id} preparation`);
    assert.equal(cubingState(recognition.solution), cubingState(expectedSolution), `${item.id} solution formula`);
    assert.equal(recognition.criterion, profiles[item.id.slice(4)], `${item.id} profile`);
    const expectedCorners = cycleLengthsPattern(expectedRecognitionPattern.patternData.CORNERS.pieces.slice(0, 4));
    const expectedEdges = cycleLengthsPattern(expectedRecognitionPattern.patternData.EDGES.pieces.slice(0, 4));
    assert.deepEqual(recognition.recognitionPermutation.cycles.filter(cycle => cycle.kind === 'corner').map(cycle => cycle.positions.length).sort(), expectedCorners, `${item.id} recognition corner cycles`);
    assert.deepEqual(recognition.recognitionPermutation.cycles.filter(cycle => cycle.kind === 'edge').map(cycle => cycle.positions.length).sort(), expectedEdges, `${item.id} recognition edge cycles`);
    {
      const corners = expectedCorners.join(','), edges = expectedEdges.join(',');
      const criterion = profiles[item.id.slice(4)];
      if (criterion === 'edges-only') assert.equal(corners, '');
      if (criterion === 'corners-only') assert.equal(edges, '');
      if (criterion === 'double-three-cycles') { assert.equal(corners, '3'); assert.equal(edges, '3'); }
      if (criterion === 'edges-only') assert.equal(edges, item.id === 'PLL-H' || item.id === 'PLL-Z' ? '2,2' : '3');
      if (criterion === 'corners-only') assert.equal(corners, item.id === 'PLL-E' ? '2,2' : '3');
      if (criterion === 'adjacent-swap' || criterion === 'diagonal-swap') {
        assert.equal(corners, '2'); assert.equal(edges, '2');
        const moved = expectedRecognitionPattern.patternData.CORNERS.pieces.slice(0, 4).map((piece, index) => piece === index ? -1 : index).filter(index => index >= 0);
        const movedPositions = expectedRecognitionPattern.patternData.CORNERS.pieces.slice(0, 4).map((piece, index) => piece !== index ? index : -1).filter(index => index >= 0);
        const rawDistance = Math.abs(movedPositions[0] - movedPositions[1]);
        const distance = Math.min(rawDistance, Math.abs(4 - rawDistance));
        assert.equal(distance, criterion === 'adjacent-swap' ? 1 : 2, `${item.id} corner adjacency`);
      }
    }
    assert.equal(stickerKey(applyAlgorithm(recognition.rawState, recognition.adjustment)), stickerKey(recognition.recognitionState), `${item.id} adjustment state`);
    assert.equal(isSolved(applyAlgorithm(recognition.recognitionState, recognition.solution)), true, `${item.id} solved endpoint`);
    const solvedPattern = kpuzzle.defaultPattern().applyAlg(`${new Alg(originalExpected).invert().toString()} ${recognition.adjustment} ${recognition.solution}`).patternData;
    assert.deepEqual(solvedPattern.CORNERS.pieces, [0,1,2,3,4,5,6,7], `${item.id} KPuzzle solved corners`);
    assert.deepEqual(solvedPattern.EDGES.pieces, [0,1,2,3,4,5,6,7,8,9,10,11], `${item.id} KPuzzle solved edges`);
    assert.ok(solvedPattern.CORNERS.orientation.every(value => value === 0), `${item.id} KPuzzle corner orientation`);
    assert.ok(solvedPattern.EDGES.orientation.every(value => value === 0), `${item.id} KPuzzle edge orientation`);
    assert.deepEqual(solvedPattern.CENTERS.pieces, [0,1,2,3,4,5], `${item.id} KPuzzle centers`);
    assert.equal(cubingState(new Alg(recognition.solution).invert().toString()), cubingState(recognition.preparation), `${item.id} effective inverse`);
  }
});

function cycleLengthsPattern(pieces: readonly number[]) {
  const seen = new Set<number>(), out: number[] = [];
  for (let i = 0; i < pieces.length; i++) if (!seen.has(i)) { let cursor = i, n = 0; while (!seen.has(cursor)) { seen.add(cursor); cursor = pieces[cursor]; n++; } if (n > 1) out.push(n); }
  return out.sort((a, b) => a - b);
}

test('E4 normalized PLL playback exposes the same endpoints for prepare and solve modes', () => {
  for (const item of CATALOG.filter(candidate => candidate.family === 'PLL')) for (const selected of [item.algorithm, ...item.alternatives]) {
    const recognition = getPLLRecognition(item, selected);
    const prepare = getPLLRecognitionPlayback(item, selected, 'prepare');
    const solve = getPLLRecognitionPlayback(item, selected, 'solve');
    const expectedPreparation = [new Alg(normalize(selected)).invert().toString(), recognition.adjustment].filter(Boolean).join(' ');
    assert.equal(normalize(prepare.algorithm), normalize(recognition.preparation), `${item.id} prepare playback`);
    assert.equal(normalize(solve.algorithm), normalize(recognition.solution), `${item.id} solve playback`);
    assert.equal(prepare.setup, '', `${item.id} prepare setup`);
    assert.equal(normalize(solve.setup), normalize(recognition.preparation), `${item.id} solve setup`);
    assert.equal(stickerKey(prepare.initialState), cubingState(''), `${item.id} prepare initial`);
    assert.equal(stickerKey(solve.initialState), cubingState(expectedPreparation), `${item.id} solve initial`);
    assert.equal(stickerKey(prepare.caseState), cubingState(expectedPreparation), `${item.id} prepare case`);
    assert.equal(stickerKey(solve.caseState), cubingState(expectedPreparation), `${item.id} playback case state`);
  }
});

function verifyPermutation(actual: any, pattern: any, label: string) {
  assert.equal(actual.status, 'ready', `${label} normalized permutation ready`);
  for (const kind of ['corner', 'edge'] as const) {
    const cells = endpointCells[kind], pieces = kind === 'corner' ? pattern.CORNERS.pieces.slice(0, 4) : pattern.EDGES.pieces.slice(0, 4);
    const expected = cells.map((_, origin) => ({from: cells[origin], to: cells[pieces[origin]], piece: pieceNames[kind][pieces[origin]].split('').sort().join('')}));
    const mappings = actual.mappings.filter((mapping: any) => mapping.kind === kind).map((mapping: any) => ({from: mapping.from.index, to: mapping.to.index, piece: mapping.piece}));
    assert.deepEqual(mappings.sort((a: any, b: any) => a.from - b.from), expected.sort((a, b) => a.from - b.from), `${label} ${kind} mapping identity/endpoints`);
  }
  const directed = actual.mappings.filter((mapping: any) => mapping.from.index !== mapping.to.index).map((mapping: any) => `${mapping.from.index}->${mapping.to.index}`).sort();
  const arrows = actual.arrows.flatMap((arrow: any) => arrow.bidirectional ? [`${arrow.from.index}->${arrow.to.index}`, `${arrow.to.index}->${arrow.from.index}`] : [`${arrow.from.index}->${arrow.to.index}`]).sort();
  assert.deepEqual(arrows, directed, `${label} directed arrows`);
}
