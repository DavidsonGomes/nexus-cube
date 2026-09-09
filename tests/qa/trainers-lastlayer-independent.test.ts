import test from 'node:test';
import assert from 'node:assert/strict';
import { Alg } from 'cubing/alg';
import { puzzles } from 'cubing/puzzles';
import { createLastLayerSetupGenerator } from '../../src/data/trainers/last-layer-generator';
import { createTrainerRandom } from '../../src/data/trainers/cross-generator';
import { COMPILED_CASES } from '../../src/data/catalog-compiled';

const kpuzzle = await puzzles['3x3x3'].kpuzzle();
type Pattern = ReturnType<ReturnType<typeof kpuzzle.defaultPattern>['applyAlg']>;
const patternOf = (alg: string): Pattern => kpuzzle.defaultPattern().applyAlg(alg.trim() || "U U'");
const ROTATIONS = ['', 'y', 'y2', "y'"] as const;
const INVERT_ROTATION: Record<string, string> = { '': '', y: "y'", y2: 'y2', "y'": 'y' };
const AUF = ['', 'U', 'U2', "U'"] as const;

function f2lSolved(pattern: Pattern): boolean {
  const { EDGES, CORNERS, CENTERS } = pattern.patternData;
  return [4, 5, 6, 7, 8, 9, 10, 11].every(i => EDGES.pieces[i] === i && EDGES.orientation[i] === 0)
    && [4, 5, 6, 7].every(i => CORNERS.pieces[i] === i && CORNERS.orientation[i] === 0)
    && CENTERS.pieces.slice(0, 6).every((piece, i) => piece === i);
}
function lastLayerOriented(pattern: Pattern): boolean {
  const { EDGES, CORNERS } = pattern.patternData;
  return [0, 1, 2, 3].every(i => EDGES.pieces[i] < 4 && EDGES.orientation[i] === 0)
    && [0, 1, 2, 3].every(i => CORNERS.pieces[i] < 4 && CORNERS.orientation[i] === 0);
}
function allSolved(pattern: Pattern): boolean {
  const { EDGES, CORNERS, CENTERS } = pattern.patternData;
  return EDGES.pieces.every((piece, i) => piece === i && EDGES.orientation[i] === 0)
    && CORNERS.pieces.every((piece, i) => piece === i && CORNERS.orientation[i] === 0)
    && CENTERS.pieces.slice(0, 6).every((piece, i) => piece === i);
}
function topSignature(pattern: Pattern): string {
  const { EDGES, CORNERS } = pattern.patternData;
  const edges = [0, 1, 2, 3].map(i => `${EDGES.pieces[i]}.${EDGES.orientation[i]}`).join(',');
  const corners = [0, 1, 2, 3].map(i => `${CORNERS.pieces[i]}.${CORNERS.orientation[i]}`).join(',');
  return `${edges}|${corners}`;
}
function normalizedSignature(alg: string): string {
  const candidates: string[] = [];
  for (const rotation of ROTATIONS) {
    for (const auf of AUF) {
      candidates.push(topSignature(patternOf([INVERT_ROTATION[rotation], alg, rotation, auf].filter(Boolean).join(' '))));
    }
  }
  return candidates.sort()[0];
}

for (const family of ['OLL', 'PLL'] as const) {
  const generator = createLastLayerSetupGenerator(family);
  const expectedCount = family === 'OLL' ? 57 : 21;

  test(`${family}: catalogo completo com ids unicos e prefixo correto`, () => {
    assert.equal(generator.caseIds.length, expectedCount);
    assert.equal(new Set(generator.caseIds).size, expectedCount);
    assert.ok(generator.caseIds.every(id => id.startsWith(`${family}-`)));
    assert.throws(() => generator.generate(`${family}-inexistente`, createTrainerRandom(1)), /desconhecido/);
  });

  test(`${family}: preparo parte do estado exigido e solucao conclui, sob oraculo kpuzzle proprio`, () => {
    for (const caseId of generator.caseIds) {
      for (const seed of [5, 17]) {
        const item = generator.generate(caseId, createTrainerRandom(seed));
        const before = patternOf(item.setup);
        const after = patternOf(`${item.setup} ${item.solution}`);
        const label = `${caseId}/${seed}`;
        assert.ok(f2lSolved(before), `preparo sem F2L resolvido ${label}`);
        if (family === 'OLL') assert.ok(!lastLayerOriented(before), `preparo OLL ja orientado ${label}`);
        if (family === 'PLL') {
          assert.ok(lastLayerOriented(before), `preparo PLL sem orientacao ${label}`);
          assert.ok(!allSolved(before), `preparo PLL ja resolvido ${label}`);
        }
        assert.ok(allSolved(after), `solucao nao conclui ${label}`);
      }
    }
  });

  test(`${family}: identidade do caso preservada por rotacao/AUF e unica na familia`, () => {
    const signatures = new Map<string, string>();
    for (const caseId of generator.caseIds) {
      const reference = COMPILED_CASES.find(item => item.id === caseId)!;
      const baseSignature = normalizedSignature(new Alg(reference.algorithm).invert().toString());
      const generated = generator.generate(caseId, createTrainerRandom(23));
      assert.equal(normalizedSignature(generated.setup), baseSignature, `identidade divergente ${caseId}`);
      const varied = generator.generate(caseId, createTrainerRandom(77));
      assert.equal(normalizedSignature(varied.setup), baseSignature, `apresentacao variada mudou o caso ${caseId}`);
      signatures.set(caseId, baseSignature);
    }
    assert.equal(new Set(signatures.values()).size, expectedCount, `${family} com classes repetidas`);
  });

  test(`${family}: determinismo por semente`, () => {
    const first = generator.generate(generator.caseIds[0], createTrainerRandom(99));
    const second = generator.generate(generator.caseIds[0], createTrainerRandom(99));
    assert.equal(first.setup, second.setup);
    assert.equal(first.solution, second.solution);
  });
}
