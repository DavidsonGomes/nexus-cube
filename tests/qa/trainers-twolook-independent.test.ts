import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { createTwoLookSetupGenerator } from '../../src/data/trainers/two-look-generator';
import { createTrainerRandom } from '../../src/data/trainers/cross-generator';
import { CFOP_TWO_LOOK_FIXTURES } from '../../src/data/trainers/cfop-two-look-fixtures';

const kpuzzle = await puzzles['3x3x3'].kpuzzle();
type Pattern = ReturnType<ReturnType<typeof kpuzzle.defaultPattern>['applyAlg']>;
const patternOf = (alg: string): Pattern => kpuzzle.defaultPattern().applyAlg(alg.trim() || "U U'");

const f2lSolved = (pattern: Pattern) => {
  const { EDGES, CORNERS, CENTERS } = pattern.patternData;
  return [4, 5, 6, 7, 8, 9, 10, 11].every(i => EDGES.pieces[i] === i && EDGES.orientation[i] === 0)
    && [4, 5, 6, 7].every(i => CORNERS.pieces[i] === i && CORNERS.orientation[i] === 0)
    && CENTERS.pieces.slice(0, 6).every((piece, i) => piece === i);
};
const ollEdges = (pattern: Pattern) => [0, 1, 2, 3].every(i => pattern.patternData.EDGES.pieces[i] < 4 && pattern.patternData.EDGES.orientation[i] === 0);
const oll = (pattern: Pattern) => ollEdges(pattern) && [0, 1, 2, 3].every(i => pattern.patternData.CORNERS.pieces[i] < 4 && pattern.patternData.CORNERS.orientation[i] === 0);
const pllCorners = (pattern: Pattern) => ['', 'U', 'U2', "U'"].some(auf => {
  const turned = auf ? pattern.applyAlg(auf) : pattern;
  return turned.patternData.CORNERS.pieces.every((piece, i) => piece === i && turned.patternData.CORNERS.orientation[i] === 0);
});
const finish = (pattern: Pattern) => {
  const { EDGES, CORNERS, CENTERS } = pattern.patternData;
  return EDGES.pieces.every((piece, i) => piece === i && EDGES.orientation[i] === 0)
    && CORNERS.pieces.every((piece, i) => piece === i && CORNERS.orientation[i] === 0)
    && CENTERS.pieces.slice(0, 6).every((piece, i) => piece === i);
};
const PREDICATES: Record<string, (pattern: Pattern) => boolean> = {
  f2l: f2lSolved, 'oll-edges': ollEdges, oll, 'pll-corners': pllCorners, finish,
  'any-legal': () => true,
};
const holds = (pattern: Pattern, condition: { predicate: string } | null | undefined) =>
  !condition || PREDICATES[condition.predicate](pattern);

const generator = createTwoLookSetupGenerator();
const byId = new Map(CFOP_TWO_LOOK_FIXTURES.map(fixture => [fixture.id, fixture]));

test('inventario 2-look: seis fixtures unicas e falha controlada para id desconhecido', () => {
  assert.equal(generator.fixtureIds.length, 6);
  assert.equal(new Set(generator.fixtureIds).size, 6);
  assert.throws(() => generator.generate('cfop/ll-two-look/nada', createTrainerRandom(1)), /desconhecida/);
});

test('cada preparo cumpre precondicao, objetivo aberto, passos que fecham e checkpoint visivel', () => {
  for (const fixtureId of generator.fixtureIds) {
    const fixture = byId.get(fixtureId)! as typeof CFOP_TWO_LOOK_FIXTURES[number] & { checkpoints?: readonly { id: string; condition: { predicate: string } }[] };
    for (const seed of [2, 9, 21, 33]) {
      const item = generator.generate(fixtureId, createTrainerRandom(seed));
      const label = `${fixtureId}/${seed}`;
      let current = patternOf(item.setup);
      assert.ok(f2lSolved(current), `f2l preservado no inicio ${label}`);
      assert.ok(holds(current, fixture.precondition), `precondicao ${label}`);
      assert.ok(!holds(current, fixture.goal), `objetivo ja fechado ${label}`);
      assert.equal(item.solution, item.steps.map(step => step.algorithm).filter(Boolean).join(' '), `solucao nao e a concatenacao dos passos ${label}`);
      for (const step of item.steps) {
        current = step.algorithm ? current.applyAlg(step.algorithm) : current;
        if (step.checkpointId) {
          const checkpoint = fixture.checkpoints?.find(entry => entry.id === step.checkpointId);
          assert.ok(checkpoint, `checkpoint sem definicao na fixture ${label}`);
          assert.ok(holds(current, checkpoint!.condition), `checkpoint nao satisfeito ${label}/${step.checkpointId}`);
        }
        assert.ok(f2lSolved(current), `f2l quebrado apos passo ${label}`);
      }
      assert.ok(holds(current, fixture.goal), `objetivo nao fechado ${label}`);
    }
  }
});

test('cobertura construtiva: fluxos completos fecham para uma amostra ampla de casos do pool', () => {
  const ollCases = new Set<string>();
  for (let seed = 1; seed <= 25; seed++) ollCases.add(generator.generate('cfop/ll-two-look/oll-full', createTrainerRandom(seed)).caseId);
  assert.ok(ollCases.size >= 15, `amostra OLL pequena: ${ollCases.size}`);
  assert.ok([...ollCases].every(id => id.startsWith('OLL-')));
  const pllCases = new Set<string>();
  for (let seed = 1; seed <= 20; seed++) pllCases.add(generator.generate('cfop/ll-two-look/pll-full', createTrainerRandom(seed)).caseId);
  assert.ok(pllCases.size >= 10, `amostra PLL pequena: ${pllCases.size}`);
  assert.ok([...pllCases].every(id => id.startsWith('PLL-')));
});

test('determinismo por semente', () => {
  const first = generator.generate('cfop/ll-two-look/pll-full', createTrainerRandom(70));
  const second = generator.generate('cfop/ll-two-look/pll-full', createTrainerRandom(70));
  assert.equal(first.setup, second.setup);
  assert.equal(first.solution, second.solution);
});
