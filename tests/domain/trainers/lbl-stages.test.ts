import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, invertAlgorithm, solvedCube } from '../../../src/domain/cube';
import { COMPILED_CASES } from '../../../src/data/catalog-compiled';
import { LBL_STAGES } from '../../../src/data/trainers/lbl-stages';
import { isNamespacedTrainerId } from '../../../src/data/trainers/registry';
import { checkStageCondition, isLLCornersPlaced, isLLEdgesOriented } from '../../../src/data/trainers/stage-validators';

const solved = solvedCube();
const caseState = (id: string) => {
  const item = COMPILED_CASES.find(entry => entry.id === id);
  assert.ok(item, id);
  return applyAlgorithm(solved, invertAlgorithm(item!.algorithm));
};

test('ll-corners-placed accepts placement without orientation and rejects displaced corners', () => {
  assert.equal(isLLCornersPlaced(solved), true);
  assert.equal(isLLCornersPlaced(applyAlgorithm(solved, 'U')), false, 'AUF desloca os cantos');
  assert.equal(isLLCornersPlaced(applyAlgorithm(solved, 'L')), false);
  assert.equal(isLLCornersPlaced(caseState('PLL-Ua')), true, 'permutação só de arestas mantém cantos no lugar');
  const twistOnly = ['OLL-21', 'OLL-22', 'OLL-23', 'OLL-24', 'OLL-25', 'OLL-26', 'OLL-27']
    .map(caseState).filter(state => isLLCornersPlaced(state) && !checkStageCondition(state, { predicate: 'oll' }));
  assert.ok(twistOnly.length >= 1, 'existe caso de cantos torcidos no lugar, provando posição sem orientação');
});

test('the seven LBL stages chain: each goal on the solved cube, valid namespaced ids and linked preconditions', () => {
  assert.equal(LBL_STAGES.length, 7);
  assert.deepEqual(LBL_STAGES.map(stage => stage.id), ['lbl/cross', 'lbl/corners', 'lbl/middle', 'lbl/top-cross', 'lbl/top-edges', 'lbl/top-corners-position', 'lbl/top-corners-orient']);
  for (const stage of LBL_STAGES) {
    assert.equal(isNamespacedTrainerId(stage.id), true, stage.id);
    assert.equal(checkStageCondition(solved, stage.goal), true, `${stage.id} objetivo satisfeito no cubo resolvido`);
    if (stage.precondition) assert.equal(checkStageCondition(solved, stage.precondition), true, `${stage.id} precondição satisfeita no cubo resolvido`);
  }
  for (let i = 1; i < LBL_STAGES.length; i++) {
    assert.deepEqual(LBL_STAGES[i].precondition, LBL_STAGES[i - 1].goal, `${LBL_STAGES[i].id} parte exatamente do objetivo anterior`);
  }
});

test('top-cross reuses the exact oll-edges predicate published for the CFOP two-look', () => {
  const topCross = LBL_STAGES.find(stage => stage.id === 'lbl/top-cross');
  assert.deepEqual(topCross?.goal, { predicate: 'oll-edges' });
  const dot = caseState('OLL-01');
  assert.equal(checkStageCondition(dot, topCross!.goal), isLLEdgesOriented(dot));
  assert.equal(checkStageCondition(solved, topCross!.goal), isLLEdgesOriented(solved));
});
