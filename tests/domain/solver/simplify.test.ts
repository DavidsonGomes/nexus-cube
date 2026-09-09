import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import { simplifySolverAlgorithm } from '../../../src/solver/methods/simplify';
import { methodStateKey } from '../../../src/solver/methods/plan';
import { planCFOP } from '../../../src/solver/methods/cfop';
import { planRoux } from '../../../src/solver/methods/roux';
import { draftFromCube, validateDraft } from '../../../src/solver/validation';
import type { MethodPlan } from '../../../src/solver/methods/types';

const stateKey = (algorithm: string) => methodStateKey(applyAlgorithm(solvedCube(), algorithm));

function inputFor(scramble: string) {
  const input = validateDraft(draftFromCube(applyAlgorithm(solvedCube(), scramble)));
  assert.equal(input.kind, 'valid');
  if (input.kind !== 'valid') throw new Error('Fixture inválida');
  return input;
}

test('simplification merges same-layer neighbours, cancels inverses and drops redundant rotations', () => {
  const expectations: readonly [string, string][] = [
    ["y' y y2", 'y2'],
    ['U U', 'U2'],
    ["U U'", ''],
    ['y2 y2', ''],
    ["R U U' R'", ''],
    ['M M', 'M2'],
    ["r r' u2 u2", ''],
    ['Rw Rw', 'r2'],
    ["F2 F' F' R", 'R'],
    ['U D U', 'U D U'],
    ["x y x'", "x y x'"],
    ['', ''],
  ];
  for (const [original, expected] of expectations) {
    const simplified = simplifySolverAlgorithm(original);
    assert.equal(simplified, expected, original);
    assert.equal(simplifySolverAlgorithm(simplified), simplified, `idempotence of ${original}`);
  }
});

test('the simplified sequence reaches a final state identical to the original, including wide, slice and rotations', () => {
  const fixtures = [
    "y' y y2 R U R'",
    "R U2 R' r M' E2 S x z' l b2 f' u d' y",
    "M E S M' E' S' x x x x y2 y2 z' z",
    "u u' Rw Rw B2 B2 L L L L",
  ];
  const alphabet = 'URFDLBMESxyzurfdlb'.split('').flatMap(letter => [letter, `${letter}2`, `${letter}'`]);
  let seed = 987654321;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 60; i++) fixtures.push(Array.from({ length: 24 }, () => alphabet[Math.floor(next() * alphabet.length)]).join(' '));
  for (const original of fixtures) {
    const simplified = simplifySolverAlgorithm(original);
    assert.equal(stateKey(simplified), stateKey(original), original);
  }
});

function assertStagedPlanSimplified(plan: MethodPlan): void {
  assert.deepEqual(plan.stages.flatMap(stage => stage.tokens), [...plan.tokens]);
  for (const stage of plan.stages) {
    assert.equal(methodStateKey(applyAlgorithm(stage.initialState, stage.algorithm)), methodStateKey(stage.finalState), stage.id);
    const protectedJoints = new Set(stage.adjustments.filter(a => a.kind === 'auf').map(a => a.endStep - stage.startStep));
    for (let j = 1; j < stage.tokens.length; j++) {
      if (protectedJoints.has(j)) continue;
      assert.notEqual(stage.tokens[j - 1][0], stage.tokens[j][0], `redundância remanescente em ${stage.id}: ${stage.tokens[j - 1]} ${stage.tokens[j]}`);
    }
  }
  assert.equal(methodStateKey(applyAlgorithm(plan.initialState, plan.algorithm)), methodStateKey(plan.finalState));
}

test('CFOP plan stages come out simplified without breaking stage or AUF boundaries', { timeout: 300_000 }, async () => {
  const plan = await planCFOP(inputFor("R U R' U' F2 D B' L2 U2 F R2 D' B2 L U'"));
  assertStagedPlanSimplified(plan);
});

test('Roux plan stages come out simplified without breaking stage or AUF boundaries', { timeout: 300_000 }, async () => {
  const plan = await planRoux(inputFor("B2 L' D2 F U2 R F' L2 D R2 U B L F2 D'"));
  assertStagedPlanSimplified(plan);
});
