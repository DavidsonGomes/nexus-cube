import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { applyAlgorithm, faceColors, solvedCube } from '../../src/domain/cube';
import { draftFromCube, solveValidatedInput, validateDraft, type ValidatedSolverInput } from '../../src/solver';
import { planCFOP } from '../../src/solver/methods/cfop/index';
import { planRoux } from '../../src/solver/methods/roux/index';
import { verifyMethodPlan } from '../../src/solver/methods/plan';
import type { MethodPlan, SolverMethod } from '../../src/solver/methods/types';

const kpuzzle = await puzzles['3x3x3'].kpuzzle();
const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
const vector = (state: ReturnType<typeof solvedCube>) => FACES.flatMap(face => faceColors(state, face));
const SOLVED = FACES.flatMap(face => Array(9).fill(face));

function seededScrambles(count: number, length: number): string[] {
  let seed = 0x5eed1234 >>> 0;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const moves = FACES.flatMap(face => [face, `${face}2`, `${face}'`]);
  return Array.from({ length: count }, () => {
    const tokens: string[] = [];
    while (tokens.length < length) {
      const move = moves[Math.floor(next() * moves.length)];
      if (tokens.length && tokens[tokens.length - 1][0] === move[0]) continue;
      tokens.push(move);
    }
    return tokens.join(' ');
  });
}
function kpuzzleSolvedBy(scramble: string, solution: string): boolean {
  const pattern = kpuzzle.defaultPattern().applyAlg([scramble, solution].filter(Boolean).join(' ')).patternData;
  return pattern.EDGES.pieces.every((piece, i) => piece === i && pattern.EDGES.orientation[i] === 0)
    && pattern.CORNERS.pieces.every((piece, i) => piece === i && pattern.CORNERS.orientation[i] === 0)
    && pattern.CENTERS.pieces.slice(0, 6).every((piece, i) => piece === i);
}
function validatedFor(scramble: string): ValidatedSolverInput {
  const validated = validateDraft(draftFromCube(applyAlgorithm(solvedCube(), scramble)));
  assert.equal(validated.kind, 'valid', scramble);
  return validated as ValidatedSolverInput;
}

const SCRAMBLES = seededScrambles(8, 20);

test('modo direto resolve todo estado aleatorio e o oraculo kpuzzle confirma', async () => {
  for (const scramble of SCRAMBLES) {
    const result = await solveValidatedInput(validatedFor(scramble));
    const finished = applyAlgorithm(applyAlgorithm(solvedCube(), scramble), result.algorithm);
    assert.deepEqual(vector(finished), SOLVED, `direto nao resolve: ${scramble}`);
    assert.ok(kpuzzleSolvedBy(scramble, result.algorithm), `kpuzzle discorda no direto: ${scramble}`);
  }
});

for (const [name, planner, stageCount] of [['cfop', planCFOP, 8], ['roux', planRoux, undefined]] as const) {
  test(`modo ${name} resolve todo estado aleatorio com cadeia de etapas continua`, async () => {
    for (const scramble of SCRAMBLES) {
      const plan = await planner(validatedFor(scramble));
      assert.equal(plan.method, name, scramble);
      if (stageCount !== undefined) assert.equal(plan.stages.length, stageCount, scramble);
      let state = applyAlgorithm(solvedCube(), scramble);
      assert.deepEqual(vector(plan.initialState), vector(state), `${name} initial ${scramble}`);
      for (const stage of plan.stages) {
        assert.deepEqual(vector(stage.initialState), vector(state), `${name}/${stage.id} inicio ${scramble}`);
        state = applyAlgorithm(state, stage.algorithm);
        assert.deepEqual(vector(stage.finalState), vector(state), `${name}/${stage.id} fim ${scramble}`);
      }
      assert.deepEqual(vector(state), SOLVED, `${name} nao resolve: ${scramble}`);
      assert.deepEqual(vector(plan.finalState), SOLVED, `${name} finalState: ${scramble}`);
      assert.ok(kpuzzleSolvedBy(scramble, plan.algorithm), `kpuzzle discorda no ${name}: ${scramble}`);
    }
  });
}

test('verifyMethodPlan pos-dedup ainda rejeita todo plano invalido que a condicao removida pegava', async () => {
  const inputA = validatedFor(SCRAMBLES[0]);
  const inputB = validatedFor(SCRAMBLES[1]);
  const cfopPlan = await planCFOP(inputA);
  const rouxPlan = await planRoux(inputA);
  assert.equal(verifyMethodPlan(inputA, cfopPlan), true, 'plano cfop valido rejeitado');
  assert.equal(verifyMethodPlan(inputA, rouxPlan), true, 'plano roux valido rejeitado');
  const tampered = (base: MethodPlan, patch: Partial<MethodPlan>) => ({ ...structuredClone(base), ...patch }) as MethodPlan;
  for (const [label, plan] of [
    ['metodo inexistente', tampered(cfopPlan, { method: 'nope' as SolverMethod })],
    ['cfop rotulado roux', tampered(cfopPlan, { method: 'roux' as SolverMethod })],
    ['cfop rotulado lbl', tampered(cfopPlan, { method: 'lbl' as SolverMethod })],
    ['roux rotulado cfop', tampered(rouxPlan, { method: 'cfop' as SolverMethod })],
    ['roux rotulado lbl', tampered(rouxPlan, { method: 'lbl' as SolverMethod })],
    ['versao adulterada', tampered(cfopPlan, { version: 2 as MethodPlan['version'] })],
    ['inputKey adulterada', tampered(cfopPlan, { inputKey: `${cfopPlan.inputKey}x` })],
    ['referenceFrame adulterado', tampered(cfopPlan, { referenceFrame: 'outro' as MethodPlan['referenceFrame'] })],
    ['estado inicial de outro embaralhamento', tampered(cfopPlan, { initialState: structuredClone(rouxPlan.stages[1].finalState) })],
    ['algoritmo adulterado', tampered(cfopPlan, { algorithm: `${cfopPlan.algorithm} U` })],
    ['etapas truncadas', tampered(cfopPlan, { stages: cfopPlan.stages.slice(0, -1) })],
  ] as const) {
    assert.equal(verifyMethodPlan(inputA, plan), false, `aceitou plano invalido: ${label}`);
  }
  const stageTampered = structuredClone(cfopPlan);
  stageTampered.stages[2] = { ...stageTampered.stages[2], finalState: structuredClone(stageTampered.stages[1].finalState) };
  assert.equal(verifyMethodPlan(inputA, stageTampered), false, 'aceitou etapa com estado final adulterado');
  assert.equal(verifyMethodPlan(inputB, cfopPlan), false, 'aceitou plano de outro input');
});
