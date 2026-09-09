import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { createLBLSetupGenerator } from '../../src/data/trainers/lbl-generator';
import { createTrainerRandom } from '../../src/data/trainers/cross-generator';
import { LBL_STAGES } from '../../src/data/trainers/lbl-stages';

const kpuzzle = await puzzles['3x3x3'].kpuzzle();
type Pattern = ReturnType<ReturnType<typeof kpuzzle.defaultPattern>['applyAlg']>;
const patternOf = (alg: string): Pattern => kpuzzle.defaultPattern().applyAlg(alg.trim() || "U U'");

const EDGE: Record<string, number> = { UF: 0, UR: 1, UB: 2, UL: 3, DF: 4, DR: 5, DB: 6, DL: 7, FR: 8, FL: 9, BR: 10, BL: 11 };
const CORNER: Record<string, number> = { UFR: 0, URB: 1, UBL: 2, ULF: 3, DFR: 4, DFL: 5, DBL: 6, DBR: 7 };
const CENTER: Record<string, number> = { U: 0, L: 1, F: 2, R: 3, B: 4, D: 5 };
function pieceSolved(pattern: Pattern, name: string): boolean {
  if (name in EDGE) { const i = EDGE[name]; const o = pattern.patternData.EDGES; return o.pieces[i] === i && o.orientation[i] === 0; }
  if (name in CORNER) { const i = CORNER[name]; const o = pattern.patternData.CORNERS; return o.pieces[i] === i && o.orientation[i] === 0; }
  if (name in CENTER) return pattern.patternData.CENTERS.pieces[CENTER[name]] === CENTER[name];
  throw new Error(`peca desconhecida: ${name}`);
}
const piecesSolved = (pattern: Pattern, names: readonly string[]) => names.every(name => pieceSolved(pattern, name));
const CROSS_NAMES = ['DF', 'DR', 'DB', 'DL'];
const FIRST_LAYER = [...CROSS_NAMES, 'DFR', 'DFL', 'DBR', 'DBL', 'D'];
const TWO_LAYERS = [...FIRST_LAYER, 'FR', 'FL', 'BR', 'BL'];
const U_EDGES = ['UF', 'UR', 'UB', 'UL'];
const centersHome = (pattern: Pattern) => pattern.patternData.CENTERS.pieces.slice(0, 6).every((piece, i) => piece === i);
const crossSolved = (pattern: Pattern) => piecesSolved(pattern, CROSS_NAMES) && centersHome(pattern);
const ollEdges = (pattern: Pattern) => [0, 1, 2, 3].every(i => pattern.patternData.EDGES.pieces[i] < 4 && pattern.patternData.EDGES.orientation[i] === 0);
const cornersPlaced = (pattern: Pattern) => [0, 1, 2, 3].every(i => pattern.patternData.CORNERS.pieces[i] === i);
const cornersOriented = (pattern: Pattern) => [0, 1, 2, 3].every(i => pattern.patternData.CORNERS.orientation[i] === 0);
const llCornersPlaced = (pattern: Pattern) => piecesSolved(pattern, [...TWO_LAYERS, ...U_EDGES]) && centersHome(pattern) && cornersPlaced(pattern);
const allSolved = (pattern: Pattern) => llCornersPlaced(pattern) && cornersOriented(pattern);

const MOVES = ['U', 'U2', "U'", 'R', 'R2', "R'", 'F', 'F2', "F'", 'D', 'D2', "D'", 'L', 'L2', "L'", 'B', 'B2', "B'"];
const TABLES = MOVES.map(move => {
  const layer = kpuzzle.defaultPattern().applyAlg(move).patternData.EDGES;
  const dest = new Array<number>(12), oriAdd = new Array<number>(12);
  for (let slot = 0; slot < 12; slot++) { dest[layer.pieces[slot]] = slot; oriAdd[slot] = layer.orientation[slot]; }
  return { dest, oriAdd };
});
function crossConfig(pattern: Pattern): number[] {
  const edges = pattern.patternData.EDGES;
  const config = new Array<number>(8);
  for (const piece of [4, 5, 6, 7]) {
    const slot = edges.pieces.indexOf(piece);
    config[(piece - 4) * 2] = slot; config[(piece - 4) * 2 + 1] = edges.orientation[slot];
  }
  return config;
}
const encode = (config: number[]) => config.reduceRight((code, _v, i) => i % 2 === 0 ? code * 24 + config[i] * 2 + config[i + 1] : code, 0);
const SOLVED_CODE = encode([4, 0, 5, 0, 6, 0, 7, 0]);
function crossDistance(start: number[]): number {
  const seen = new Set<number>([encode(start)]);
  let frontier = [start], depth = 0;
  while (frontier.length) {
    if (frontier.some(config => encode(config) === SOLVED_CODE)) return depth;
    const next: number[][] = [];
    for (const config of frontier) {
      for (const table of TABLES) {
        const moved = new Array<number>(8);
        for (let piece = 0; piece < 4; piece++) {
          const target = table.dest[config[piece * 2]];
          moved[piece * 2] = target; moved[piece * 2 + 1] = (config[piece * 2 + 1] + table.oriAdd[target]) % 2;
        }
        const code = encode(moved);
        if (!seen.has(code)) { seen.add(code); next.push(moved); }
      }
    }
    frontier = next; depth++;
  }
  throw new Error('espaco da cruz esgotado sem solucao');
}

const generator = await createLBLSetupGenerator();

test('inventario LBL: sete etapas na ordem da proposta conjunta', () => {
  assert.deepEqual([...generator.fixtureIds], LBL_STAGES.map(stage => stage.id));
  assert.equal(new Set(generator.fixtureIds).size, 7);
  assert.throws(() => generator.generate('lbl/inexistente', createTrainerRandom(1)), /desconhecida/);
});

test('cada etapa parte da precondicao com objetivo aberto e preservacao por construcao', () => {
  for (const seed of [13, 41]) {
    const checks: Record<string, (pattern: Pattern) => void> = {
      'lbl/cross': pattern => { assert.ok(!crossSolved(pattern), 'cruz ja resolvida'); },
      'lbl/corners': pattern => {
        assert.ok(crossSolved(pattern) && pieceSolved(pattern, 'D'), 'precondicao cruz');
        assert.ok(!piecesSolved(pattern, FIRST_LAYER), 'primeira camada ja fechada');
      },
      'lbl/middle': pattern => {
        assert.ok(piecesSolved(pattern, FIRST_LAYER) && centersHome(pattern), 'precondicao primeira camada');
        assert.ok(!piecesSolved(pattern, TWO_LAYERS), 'duas camadas ja fechadas');
      },
      'lbl/top-cross': pattern => {
        assert.ok(piecesSolved(pattern, TWO_LAYERS) && centersHome(pattern), 'precondicao f2l');
        assert.ok(!ollEdges(pattern), 'cruz do topo ja formada');
      },
      'lbl/top-edges': pattern => {
        assert.ok(piecesSolved(pattern, TWO_LAYERS) && ollEdges(pattern), 'precondicao cruz do topo');
        assert.ok(!piecesSolved(pattern, U_EDGES), 'arestas do topo ja alinhadas');
      },
      'lbl/top-corners-position': pattern => {
        assert.ok(piecesSolved(pattern, [...TWO_LAYERS, ...U_EDGES]), 'precondicao arestas alinhadas');
        assert.ok(!cornersPlaced(pattern), 'cantos ja posicionados');
      },
      'lbl/top-corners-orient': pattern => {
        assert.ok(llCornersPlaced(pattern), 'inicio nao esta placed');
        assert.ok(!cornersOriented(pattern), 'cantos ja orientados');
        const twist = [0, 1, 2, 3].reduce((sum, i) => sum + pattern.patternData.CORNERS.orientation[i], 0);
        assert.equal(twist % 3, 0, 'torcao ilegal');
        assert.ok(!allSolved(pattern));
      },
    };
    for (const fixtureId of generator.fixtureIds) {
      const item = generator.generate(fixtureId, createTrainerRandom(seed));
      checks[fixtureId](patternOf(item.setup));
    }
  }
});

test('minimo anunciado da cruz LBL re-provado por BFS proprio', () => {
  for (const seed of [5, 19, 27, 63]) {
    const item = generator.generate('lbl/cross', createTrainerRandom(seed));
    assert.ok(item.provenMinimumMoves !== undefined && item.provenMinimumMoves >= 2 && item.provenMinimumMoves <= 5);
    assert.equal(crossDistance(crossConfig(patternOf(item.setup))), item.provenMinimumMoves, `seed ${seed}`);
  }
});

test('etapa final placed-sem-oll: extremos preservados exatamente e torcao distribuida', () => {
  const seen = new Set<string>();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const item = generator.generate('lbl/top-corners-orient', createTrainerRandom(seed));
    const pattern = patternOf(item.setup);
    assert.ok(llCornersPlaced(pattern), `placed quebrado seed ${seed}`);
    assert.ok(!cornersOriented(pattern), `sem torcao seed ${seed}`);
    seen.add([0, 1, 2, 3].map(i => pattern.patternData.CORNERS.orientation[i]).join(''));
  }
  assert.ok(seen.size >= 3, `pouca variedade de torcao: ${[...seen].join(' ')}`);
});

test('determinismo por semente', () => {
  for (const fixtureId of ['lbl/cross', 'lbl/top-corners-orient']) {
    assert.equal(generator.generate(fixtureId, createTrainerRandom(88)).setup, generator.generate(fixtureId, createTrainerRandom(88)).setup);
  }
});
