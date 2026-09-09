import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { createRouxSetupGenerator } from '../../src/data/trainers/roux-generator';
import { createTrainerRandom } from '../../src/data/trainers/cross-generator';
import { ROUX_TRAINER_FIXTURES } from '../../src/solver/methods/roux/trainer-fixtures';
import { CMLL_SOURCES } from '../../src/data/expansion-sources/cmll';

const kpuzzle = await puzzles['3x3x3'].kpuzzle();
type Pattern = ReturnType<ReturnType<typeof kpuzzle.defaultPattern>['applyAlg']>;
const patternOf = (alg: string): Pattern => kpuzzle.defaultPattern().applyAlg(alg.trim() || "U U'");

const EDGE: Record<string, number> = { UF: 0, UR: 1, UB: 2, UL: 3, DF: 4, DR: 5, DB: 6, DL: 7, FR: 8, FL: 9, BR: 10, BL: 11 };
const CORNER: Record<string, number> = { UFR: 0, URB: 1, UBL: 2, ULF: 3, DFR: 4, DFL: 5, DBL: 6, DBR: 7 };
const CENTER: Record<string, number> = { U: 0, L: 1, F: 2, R: 3, B: 4, D: 5 };
const FB_NAMES = ['DL', 'FL', 'BL', 'DFL', 'DBL', 'L'];
const SB_NAMES = ['DR', 'FR', 'BR', 'DFR', 'DBR', 'R'];

function pieceSolved(pattern: Pattern, name: string): boolean {
  if (name in EDGE) { const i = EDGE[name]; const orbit = pattern.patternData.EDGES; return orbit.pieces[i] === i && orbit.orientation[i] === 0; }
  if (name in CORNER) { const i = CORNER[name]; const orbit = pattern.patternData.CORNERS; return orbit.pieces[i] === i && orbit.orientation[i] === 0; }
  if (name in CENTER) { const i = CENTER[name]; return pattern.patternData.CENTERS.pieces[i] === i; }
  throw new Error(`peca desconhecida no oraculo: ${name}`);
}
const piecesSolved = (pattern: Pattern, names: readonly string[]) => names.every(name => pieceSolved(pattern, name));
const fbSolved = (pattern: Pattern) => piecesSolved(pattern, FB_NAMES);
const sbSolved = (pattern: Pattern) => fbSolved(pattern) && piecesSolved(pattern, SB_NAMES);
const topCornersOriented = (pattern: Pattern) => [0, 1, 2, 3].every(i => pattern.patternData.CORNERS.pieces[i] < 4 && pattern.patternData.CORNERS.orientation[i] === 0);
const cornersSolvedUpToAUF = (pattern: Pattern) => ['', 'U', 'U2', "U'"].some(auf => {
  const turned = auf ? pattern.applyAlg(auf) : pattern;
  return [0, 1, 2, 3, 4, 5, 6, 7].every(i => turned.patternData.CORNERS.pieces[i] === i && turned.patternData.CORNERS.orientation[i] === 0);
});
const FREE_EDGES = [0, 1, 2, 3, 4, 6];
const BLOCK_EDGES = [5, 7, 8, 9, 10, 11];
function eoSolved(pattern: Pattern): boolean {
  const { EDGES, CORNERS, CENTERS } = pattern.patternData;
  const axis = new Set([CENTERS.pieces[0], CENTERS.pieces[5]]);
  return CORNERS.pieces.every((piece, i) => piece === i && CORNERS.orientation[i] === 0)
    && BLOCK_EDGES.every(i => EDGES.pieces[i] === i && EDGES.orientation[i] === 0)
    && FREE_EDGES.every(i => EDGES.orientation[i] === 0)
    && CENTERS.pieces[1] === 1 && CENTERS.pieces[3] === 3
    && axis.size === 2 && axis.has(0) && axis.has(5);
}
function lrSolved(pattern: Pattern): boolean {
  const { EDGES } = pattern.patternData;
  return eoSolved(pattern) && [1, 3].every(i => EDGES.pieces[i] === i && EDGES.orientation[i] === 0);
}
function finishSolved(pattern: Pattern): boolean {
  const { EDGES, CORNERS, CENTERS } = pattern.patternData;
  return EDGES.pieces.every((piece, i) => piece === i && EDGES.orientation[i] === 0)
    && CORNERS.pieces.every((piece, i) => piece === i && CORNERS.orientation[i] === 0)
    && CENTERS.pieces.slice(0, 6).every((piece, i) => piece === i);
}
function conditionHolds(pattern: Pattern, condition: { predicate: string; preserve?: readonly string[] } | null): boolean {
  if (!condition) return true;
  if (condition.preserve && !piecesSolved(pattern, condition.preserve)) return false;
  switch (condition.predicate) {
    case 'any-legal': return true;
    case 'fb': return fbSolved(pattern);
    case 'sb': return sbSolved(pattern);
    case 'cmll-oriented': return sbSolved(pattern) && topCornersOriented(pattern);
    case 'cmll': return sbSolved(pattern) && cornersSolvedUpToAUF(pattern);
    case 'eo': return eoSolved(pattern);
    case 'lr': return lrSolved(pattern);
    case 'finish': return finishSolved(pattern);
    default: throw new Error(`predicado sem oraculo QA: ${condition.predicate}`);
  }
}

const generator = createRouxSetupGenerator();
const byId = new Map(ROUX_TRAINER_FIXTURES.map(fixture => [fixture.id, fixture]));
const CMLL_ALGORITHM = new Map(CMLL_SOURCES.map(source => [source.id, source.algorithm]));

test('inventario das fixtures Roux: ids unicos e namespaced, contrato exposto integral', () => {
  assert.equal(generator.fixtureIds.length, ROUX_TRAINER_FIXTURES.length);
  assert.equal(new Set(generator.fixtureIds).size, generator.fixtureIds.length);
  assert.ok(generator.fixtureIds.every(id => id.startsWith('roux/')));
  assert.ok(generator.fixtureIds.length >= 24, `apenas ${generator.fixtureIds.length} fixtures`);
});

test('todo preparo gerado cumpre precondicao, preservacao e objetivo aberto sob oraculo proprio', async () => {
  for (const fixtureId of generator.fixtureIds) {
    const fixture = byId.get(fixtureId)!;
    for (const seed of [3, 7]) {
      const item = await generator.generate(fixtureId, createTrainerRandom(seed));
      const start = patternOf(item.setup);
      const label = `${fixtureId}/${seed}`;
      assert.ok(conditionHolds(start, fixture.precondition), `precondicao ${label}`);
      if (fixture.preserve.length) assert.ok(piecesSolved(start, fixture.preserve), `preservacao ${label}`);
      if (fixture.kind === 'execution') assert.ok(!conditionHolds(start, fixture.goal), `objetivo ja fechado ${label}`);
    }
  }
});

test('preparos CMLL sao resolvidos pelo caso do corpus preservando os dois blocos', async () => {
  for (const fixtureId of generator.fixtureIds.filter(id => id.startsWith('roux/cmll/'))) {
    for (const seed of [11, 29]) {
      const item = await generator.generate(fixtureId, createTrainerRandom(seed));
      if (!item.caseId) continue;
      const algorithm = CMLL_ALGORITHM.get(item.caseId);
      assert.ok(algorithm, `caso fora do corpus: ${item.caseId}`);
      const after = patternOf(`${item.setup} ${algorithm}`);
      const label = `${fixtureId}/${seed}/${item.caseId}`;
      assert.ok(fbSolved(after) && piecesSolved(after, ['DR', 'FR', 'BR', 'DFR', 'DBR']), `blocos quebrados apos o caso ${label}`);
      assert.ok(cornersSolvedUpToAUF(after), `cantos nao resolvidos ${label}`);
    }
  }
});

test('semente determina o preparo e nivel desconhecido falha controlado', async () => {
  const first = await generator.generate('roux/fb/block', createTrainerRandom(55));
  const second = await generator.generate('roux/fb/block', createTrainerRandom(55));
  assert.equal(first.setup, second.setup);
  await assert.rejects(() => generator.generate('roux/inexistente', createTrainerRandom(1)), /desconhecida/);
  await assert.rejects(() => generator.generate('roux/fb/block', createTrainerRandom(1), { levelId: 'nivel-fantasma' }), /Nível desconhecido|Nivel desconhecido/);
});
