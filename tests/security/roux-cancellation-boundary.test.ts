import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { planRoux } from '../../src/solver/methods/roux/index';
import { searchBlock, searchContext, turns } from '../../src/solver/methods/roux/search';
import { validateDraft } from '../../src/solver/validation';
import { applyAlgorithm } from '../../src/domain/cube';

const hashes = {
  'search.ts': '6a176f7db658f27a2ee4fe7eb55d4a403b9e5b39e185e1774f9a77119ea165fb',
  'index.ts': '23fd2f6b05efe93dac37bf0a024729dadf02531d9984dadbf3b1c03e48556c1d',
  'cmll.ts': '8ffa3804ccaa3a1a9aadcebcb2e39fd2bf2907ee15fea933f9e588e2832440e1',
};
function pinned() { for (const [file, hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(readFileSync(`src/solver/methods/roux/${file}`)).digest('hex'), hash); }
function input() {
  // Validator is used only to construct the public input, never as the oracle
  // for cancellation, observer isolation or failure semantics.
  const draft = Object.fromEntries(['U', 'R', 'F', 'D', 'L', 'B'].map(face => [face, Array(9).fill(face)]));
  const result = validateDraft(draft);
  if (result.kind !== 'valid') throw new Error('Synthetic solved fixture rejected');
  return result;
}
const pieces = ['DL', 'FL', 'BL', 'DFL', 'DBL'];
const stageIds = ['roux.fb', 'roux.sb', 'roux.cmll', 'roux.cmll-auf', 'roux.eo', 'roux.lr', 'roux.finish'];

test('Roux security: pre-abort and abort during first yield reject without publishing a stage', async () => {
  pinned();
  for (const before of [true, false]) {
    const fixture = input(), original = structuredClone(fixture), controller = new AbortController(); let stages = 0;
    if (before) controller.abort();
    const pending = planRoux(fixture, { signal: controller.signal, onStage: () => { stages++; } });
    if (!before) queueMicrotask(() => controller.abort());
    await assert.rejects(pending, /cancelado/i);
    assert.equal(stages, 0); assert.deepEqual(fixture, original);
  }
});

test('Roux security: cancellation from first or final progress callback never returns a completed plan', async () => {
  for (const stopAt of ['roux.fb', 'roux.finish']) {
    const controller = new AbortController(); const stages: string[] = []; let completed = false;
    const pending = planRoux(input(), { signal: controller.signal, onStage: stage => { stages.push(stage.id); if (stage.id === stopAt) controller.abort(); } }).then(plan => { completed = true; return plan; });
    await assert.rejects(pending, /cancelado/i);
    assert.equal(completed, false); assert.deepEqual(stages, stageIds.slice(0, stageIds.indexOf(stopAt) + 1));
  }
});

test('Roux security: observer mutation and exceptions cannot modify the positive completed plan or input', async () => {
  const fixture = input(), original = structuredClone(fixture); const seen: string[] = [];
  const plan = await planRoux(fixture, { onStage: stage => {
    seen.push(stage.id); Reflect.set(stage.finalState, 'length', 0); Reflect.set(stage.initialState, 'length', 0); stage.algorithm = 'untrusted observer';
    throw new Error('Synthetic observer error');
  } });
  assert.deepEqual(seen, stageIds); assert.deepEqual(plan.stages.map(s => s.id), stageIds);
  assert.equal(plan.algorithm, ''); assert.deepEqual(plan.tokens, []);
  assert.deepEqual(plan.initialState, original.state); assert.deepEqual(plan.finalState, original.state);
  assert.ok(plan.stages.every(s => s.initialState.length === 54 && s.finalState.length === 54 && s.algorithm === ''));
  assert.deepEqual(fixture, original);
});

test('Roux security: real block search counts PDB work and rejects exhausted budget without a partial algorithm', async () => {
  const state = applyAlgorithm(input().state, 'L'), original = structuredClone(state), context = searchContext({});
  context.limit = 0;
  await assert.rejects(searchBlock(state, pieces, turns('URFDLB'), context), error => {
    assert.ok(error instanceof Error); assert.equal(error.name, 'RouxSearchLimit'); assert.match(error.message, /estado informado continua válido/i); return true;
  });
  assert.ok(context.nodes > 0, 'PDB expansions consume the shared budget'); assert.deepEqual(state, original);
});

test('Roux security: expired cooperative deadline rejects a real block search', async () => {
  const context = searchContext({}); context.deadline = performance.now() - 1;
  await assert.rejects(searchBlock(applyAlgorithm(input().state, 'L'), pieces, turns('URFDLB'), context), { name: 'RouxSearchLimit' });
});

test('Roux security: abort after observed PDB work is handled at a cooperative checkpoint', { timeout: 5000 }, async () => {
  const controller = new AbortController(), context = searchContext({ signal: controller.signal });
  let timer: ReturnType<typeof setTimeout> | undefined; let observedWork = false;
  const poll = () => { if (context.nodes > 0) { observedWork = true; controller.abort(); } else timer = setTimeout(poll, 0); };
  timer = setTimeout(poll, 0);
  try {
    await assert.rejects(searchBlock(applyAlgorithm(input().state, 'L'), pieces, turns('URFDLB'), context), /cancelado/i);
    assert.equal(observedWork, true);
  } finally { if (timer) clearTimeout(timer); }
  pinned();
});
