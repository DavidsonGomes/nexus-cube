import assert from 'node:assert/strict';
import test from 'node:test';
import { COLORS } from './solver-oracle-fixtures';
import { preservedInput, SOLVED_STAGE_INPUT, stageSourceSnapshot, stageSolved, STAGE_ORACLES } from './solver-stage-oracle';

test('stage oracle enumerates all three modes and preserves fixed-frame requirements', () => {
  assert.deepEqual(new Set(STAGE_ORACLES.map(stage => stage.mode)), new Set(['direct','cfop','roux']));
  assert.equal(new Set(STAGE_ORACLES.map(stage => stage.stage)).size, STAGE_ORACLES.length);
  for (const stage of STAGE_ORACLES) {
    assert.equal(stage.fixedCenters.length, 6, stage.stage);
    assert.ok(stage.fixedStickerIndices.every(index => Number.isInteger(index) && index >= 0 && index < 54), stage.stage);
    assert.equal(stage.preservesInput, true, stage.stage);
    if (stage.requiresSolved54) assert.equal(stage.fixedStickerIndices.length, 54, stage.stage);
  }
});

test('stage oracle uses an independent 54-sticker source and never mutates it', () => {
  const source = stageSourceSnapshot(SOLVED_STAGE_INPUT);
  assert.equal(stageSolved(source), true);
  assert.deepEqual(source, SOLVED_STAGE_INPUT);
  assert.equal(preservedInput(source, SOLVED_STAGE_INPUT), true);
  assert.deepEqual(COLORS, ['U','R','F','D','L','B']);
});
