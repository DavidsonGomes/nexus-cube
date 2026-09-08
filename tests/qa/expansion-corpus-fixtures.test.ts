import test from 'node:test';
import assert from 'node:assert/strict';

const cmllFamilies = {
  O: 2,
  H: 4,
  Pi: 6,
  U: 6,
  T: 6,
  L: 6,
  S: 6,
  AS: 6,
} as const;

const exercisePlan = [
  ...Array.from({length: 4}, (_, i) => ({id: `cross-${i + 1}`, stage: 'cross', objective: 'cross'})),
  ...Array.from({length: 4}, (_, i) => ({id: `f2l-fundamentals-${i + 1}`, stage: 'f2l-fundamentals', objective: 'pair-slot-cross'})),
  ...Array.from({length: 4}, (_, i) => ({id: `roux-fb-${i + 1}`, stage: 'fb', objective: 'first-block-centers'})),
  ...Array.from({length: 4}, (_, i) => ({id: `roux-sb-${i + 1}`, stage: 'sb', objective: 'second-block-preserve-fb'})),
  ...Array.from({length: 8}, (_, i) => ({id: `roux-lse-${i + 1}`, stage: 'lse', objective: i < 2 ? 'edge-orientation' : i < 4 ? 'ul-ur' : 'edges-centers-solved'})),
] as const;

test('E1 corpus oracle fixes CMLL family counts without accepting resolved state', () => {
  assert.equal(Object.values(cmllFamilies).reduce((sum, count) => sum + count, 0), 42);
  assert.equal(Object.keys(cmllFamilies).length, 8);
  assert.equal(cmllFamilies.O + cmllFamilies.H + cmllFamilies.Pi, 12);
  assert.ok(!Object.keys(cmllFamilies).includes('resolved'), 'resolved is not a CMLL case');
});

test('E1 provisional corpus proposal records 24 exercise examples and distinct Roux objectives', () => {
  assert.equal(exercisePlan.length, 24);
  for (const stage of ['cross', 'f2l-fundamentals', 'fb', 'sb', 'lse']) {
    assert.equal(exercisePlan.filter(item => item.stage === stage).length, stage === 'lse' ? 8 : 4, stage);
  }
  assert.equal(new Set(exercisePlan.map(item => item.id)).size, 24);
  assert.ok(exercisePlan.some(item => item.objective === 'second-block-preserve-fb'));
  assert.equal(exercisePlan.filter(item => item.objective === 'edge-orientation').length, 2);
  assert.equal(exercisePlan.filter(item => item.objective === 'ul-ur').length, 2);
  assert.equal(exercisePlan.filter(item => item.objective === 'edges-centers-solved').length, 4);
});
