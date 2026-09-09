import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { KPattern } from 'cubing/kpuzzle';
import { invertAlgorithm, solvedCube } from '../../../src/domain/cube';
import { oracleStickers } from '../oracle';
import { CMLL_SOURCES } from '../../../src/data/expansion-sources/cmll';
import { CMLL_INTRO_CASES } from '../../../src/solver/methods/roux/trainer-fixtures';
import { checkStageCondition } from '../../../src/data/trainers/stage-validators';

const puzzle = await puzzles['3x3x3'].kpuzzle();
const original = oracleStickers(puzzle.defaultPattern()), geometry = solvedCube();
const ids = new Map(original.map(s => [s.id, geometry.find(t => String(t.position) === String(s.position) && String(t.normal) === String(s.normal))!.id]));
const labelled = (pattern: KPattern) => oracleStickers(pattern).map(s => ({ ...s, id: ids.get(s.id)! }));
const perms = (a: number[]): number[][] => a.length ? a.flatMap((n, i) => perms(a.filter((_, j) => i !== j)).map(p => [n, ...p])) : [[]];
const parity = (a: number[]) => a.reduce((sum, n, i) => sum + a.slice(i + 1).filter(v => v < n).length, 0) % 2;
const algorithms = new Map(CMLL_SOURCES.map(source => [source.id, source.algorithm]));

test('each intro-set case orients every permutation variant of its group with both blocks preserved', { timeout: 240_000 }, () => {
  for (const { fixtureId, caseId, group } of CMLL_INTRO_CASES) {
    const algorithm = algorithms.get(caseId);
    assert.ok(algorithm, `${fixtureId} referencia ${caseId} no corpus`);
    const base = puzzle.defaultPattern().applyAlg(invertAlgorithm(algorithm)).patternData;
    const orientation = base.CORNERS.orientation.slice(0, 4);
    assert.equal(checkStageCondition(labelled(new KPattern(puzzle, base)), { predicate: 'cmll-oriented' }), false, `${group} nasce desorientado`);
    for (const permutation of perms([0, 1, 2, 3])) {
      const data = structuredClone(puzzle.defaultPattern().patternData);
      data.CORNERS.pieces.splice(0, 4, ...permutation);
      data.CORNERS.orientation.splice(0, 4, ...orientation);
      if (parity(permutation)) [data.EDGES.pieces[0], data.EDGES.pieces[1]] = [data.EDGES.pieces[1], data.EDGES.pieces[0]];
      const after = new KPattern(puzzle, data).applyAlg(algorithm);
      assert.equal(checkStageCondition(labelled(after), { predicate: 'cmll-oriented' }), true, `${group}: variante ${permutation.join('')} termina orientada com blocos intactos`);
    }
  }
});
