import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { createCrossSetupGenerator, createTrainerRandom } from '../../src/data/trainers/cross-generator';

const kpuzzle = await puzzles['3x3x3'].kpuzzle();
const MOVES = ['U', 'U2', "U'", 'R', 'R2', "R'", 'F', 'F2', "F'", 'D', 'D2', "D'", 'L', 'L2', "L'", 'B', 'B2', "B'"];
const CROSS_EDGE_INDICES = [4, 5, 6, 7];

interface EdgeMoveTable { dest: number[]; oriAdd: number[] }
function edgeMoveTable(move: string): EdgeMoveTable {
  const pattern = kpuzzle.defaultPattern().applyAlg(move).patternData.EDGES;
  const dest = new Array<number>(12), oriAdd = new Array<number>(12);
  for (let slot = 0; slot < 12; slot++) {
    dest[pattern.pieces[slot]] = slot;
    oriAdd[slot] = pattern.orientation[slot];
  }
  return { dest, oriAdd };
}
const TABLES = MOVES.map(edgeMoveTable);

type CrossConfig = number[];
function applyTable(config: CrossConfig, table: EdgeMoveTable): CrossConfig {
  const next = new Array<number>(8);
  for (let piece = 0; piece < 4; piece++) {
    const slot = config[piece * 2], ori = config[piece * 2 + 1];
    const target = table.dest[slot];
    next[piece * 2] = target;
    next[piece * 2 + 1] = (ori + table.oriAdd[target]) % 2;
  }
  return next;
}
function encode(config: CrossConfig): number {
  let code = 0;
  for (let piece = 3; piece >= 0; piece--) code = code * 24 + config[piece * 2] * 2 + config[piece * 2 + 1];
  return code;
}
function decode(code: number): CrossConfig {
  const config = new Array<number>(8);
  for (let piece = 0; piece < 4; piece++) {
    const part = code % 24; code = Math.floor(code / 24);
    config[piece * 2] = Math.floor(part / 2); config[piece * 2 + 1] = part % 2;
  }
  return config;
}
function configFromAlg(alg: string): CrossConfig {
  const pattern = kpuzzle.defaultPattern().applyAlg(alg).patternData.EDGES;
  const config = new Array<number>(8);
  for (const piece of CROSS_EDGE_INDICES) {
    const slot = pattern.pieces.indexOf(piece);
    config[(piece - 4) * 2] = slot;
    config[(piece - 4) * 2 + 1] = pattern.orientation[slot];
  }
  return config;
}
const SOLVED: CrossConfig = [4, 0, 5, 0, 6, 0, 7, 0];

function bfsDistances(): Int8Array {
  const distances = new Int8Array(331776).fill(-1);
  let frontier = [encode(SOLVED)];
  distances[frontier[0]] = 0;
  let depth = 0;
  while (frontier.length) {
    const next: number[] = [];
    for (const code of frontier) {
      const config = decode(code);
      for (const table of TABLES) {
        const neighbor = encode(applyTable(config, table));
        if (distances[neighbor] === -1) { distances[neighbor] = depth + 1; next.push(neighbor); }
      }
    }
    frontier = next; depth++;
  }
  return distances;
}
const DISTANCES = bfsDistances();

test('qa move tables compose exactly like kpuzzle on sequences', () => {
  for (const alg of ["R U R' U'", 'F2 D L B', "U' L2 F R D2 B'", 'R L U D F B R2']) {
    let config = SOLVED.slice();
    for (const move of alg.split(' ')) config = applyTable(config, TABLES[MOVES.indexOf(move)]);
    assert.deepEqual(config, configFromAlg(alg), alg);
  }
});

test('independent bfs re-proves the cross space size and the ceiling of 8', () => {
  let reachable = 0, max = 0;
  for (const distance of DISTANCES) { if (distance >= 0) { reachable++; if (distance > max) max = distance; } }
  assert.equal(reachable, 190080);
  assert.equal(max, 8);
});

test('generator ceiling matches the independent proof and announced minimum is exact on a sample', async () => {
  const generator = await createCrossSetupGenerator();
  assert.equal(generator.ceiling, 8);
  for (let target = 1; target <= 8; target++) {
    const seeds = target === 8 ? [1, 2, 3] : [101, 202, 303];
    for (const seed of seeds) {
      const setup = generator.generate(target, createTrainerRandom(seed * 100 + target));
      assert.equal(setup.provenMinimumMoves, target);
      const distance = DISTANCES[encode(configFromAlg(setup.setup))];
      assert.equal(distance, target, `alvo ${target} seed ${seed} setup ${setup.setup}`);
    }
  }
});

test('generator is deterministic per seed and rejects targets outside the proven range', async () => {
  const generator = await createCrossSetupGenerator();
  const a = generator.generate(5, createTrainerRandom(42));
  const b = generator.generate(5, createTrainerRandom(42));
  assert.equal(a.setup, b.setup);
  assert.throws(() => generator.generate(0, createTrainerRandom(1)), /1 a 8/);
  assert.throws(() => generator.generate(9, createTrainerRandom(1)), /1 a 8/);
  assert.throws(() => generator.generate(2.5, createTrainerRandom(1)), /1 a 8/);
});
