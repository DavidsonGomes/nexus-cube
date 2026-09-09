import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import { arePiecesSolved, f2lSignature, validateStage } from '../../../src/domain/stage-validation';
import { methodStateKey } from '../../../src/solver/methods/plan';
import { createTrainerRandom } from '../../../src/data/trainers/cross-generator';
import { createF2LSetupGenerator } from '../../../src/data/trainers/f2l-generator';
import type { TargetSlot } from '../../../src/data/trainers/types';

const SLOTS: readonly TargetSlot[] = ['FR', 'FL', 'BR', 'BL'];
const CROSS = ['DF', 'DR', 'DB', 'DL'];
const generator = createF2LSetupGenerator();

test('all 41 Cube Coach cases present a validated setup in every slot', { timeout: 240_000 }, () => {
  assert.equal(generator.caseIds.length, 41);
  for (const caseId of generator.caseIds) for (const slot of SLOTS) {
    const setup = generator.generate(caseId, slot, createTrainerRandom(11));
    assert.equal(methodStateKey(applyAlgorithm(solvedCube(), setup.setup)), methodStateKey(setup.state), `${caseId}/${slot} setup`);
    assert.equal(validateStage(setup.state, { goal: 'f2l-pair', targetSlot: slot }), false, `${caseId}/${slot} nasce com o par aberto`);
    const others = [...CROSS, ...SLOTS.filter(s => s !== slot).flatMap(s => [s, `D${s}`])];
    assert.equal(arePiecesSolved(setup.state, others), true, `${caseId}/${slot} preserva no início`);
    const after = applyAlgorithm(setup.state, setup.solution);
    assert.equal(validateStage(after, { goal: 'f2l-pair', targetSlot: slot }), true, `${caseId}/${slot} solução conclui`);
    assert.equal(arePiecesSolved(after, others), true, `${caseId}/${slot} preserva no fim`);
  }
});

test('AUF presentation varies the state but never the case identity at the slot', () => {
  for (const caseId of [generator.caseIds[0], generator.caseIds[20], generator.caseIds[40]]) {
    const signatures = new Set<string>(), aufs = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const setup = generator.generate(caseId, 'FR', createTrainerRandom(seed));
      signatures.add(f2lSignature(setup.state, 'FR'));
      aufs.add(setup.auf);
    }
    assert.equal(signatures.size, 1, `${caseId} identidade estável`);
    assert.ok(aufs.size > 1, `${caseId} apresentação variada`);
  }
});

test('generation is deterministic per seed and unknown cases or slots are rejected', () => {
  const first = generator.generate('cfop/f2l/07', 'BL', createTrainerRandom(99));
  const second = generator.generate('cfop/f2l/07', 'BL', createTrainerRandom(99));
  assert.deepEqual([first.setup, first.solution, first.auf], [second.setup, second.solution, second.auf]);
  assert.throws(() => generator.generate('cfop/f2l/99', 'FR', createTrainerRandom(1)), /sem apresentação validada/);
});
