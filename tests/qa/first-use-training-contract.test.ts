import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialData } from '../../src/data/store';
import { DEFAULT_TRAINING_NAME, ensureFirstUseTraining } from '../../src/data/default-training';
import type { AppData } from '../../src/domain/types';

const input = { eligibleFirstUse: true, sessionId: 'qa-first-use-session', createdAt: '2026-09-08T00:00:00.000Z' } as const;

test('eligible empty V3 creates exactly one daily two-handed session and activates its supplied ID', () => {
  const before = createInitialData();
  const result = ensureFirstUseTraining(before, input);
  assert.equal(result.created, true);
  assert.deepEqual(result.data.sessions, [{ id: input.sessionId, name: DEFAULT_TRAINING_NAME, createdAt: input.createdAt, mode: 'two-handed' }]);
  assert.equal(result.data.activeSessionId, input.sessionId);
  assert.deepEqual(result.data.solves, before.solves);
  assert.deepEqual(result.data.progress, before.progress);
  assert.deepEqual(result.data.studyAttempts, before.studyAttempts);
});

test('ineligible, returning, and legacy-null data remain byte-equivalent in domain fields', () => {
  const returning: AppData = { ...createInitialData(), sessions: [{ id: 'existing', name: 'Histórico', createdAt: input.createdAt, mode: null }], activeSessionId: 'existing' };
  for (const data of [returning, { ...createInitialData(), settings: { ...createInitialData().settings, theme: 'dark' as const } }]) {
    const before = structuredClone(data);
    const result = ensureFirstUseTraining(data, { ...input, eligibleFirstUse: false });
    assert.equal(result.created, false);
    assert.deepEqual(result.data, before);
  }
});

test('any existing solve, progress, or study attempt blocks silent default creation', () => {
  const base = createInitialData();
  const cases: AppData[] = [
    { ...base, sessions: [{ id: 'existing', name: 'Histórico', createdAt: input.createdAt, mode: null }], solves: [{ id: 's', sessionId: 'existing', mode: null, rawMs: 1, penalty: 'none', scramble: 'R', createdAt: input.createdAt, note: '', source: 'manual' }] },
    { ...base, progress: { 'OLL-30': { caseId: 'OLL-30', favorite: false, status: 'new', note: '' } } },
    { ...base, studyAttempts: [{ id: 'study', caseId: 'OLL-30', createdAt: input.createdAt, recognition: 'again', execution: 'again', durationMs: null }] },
  ];
  for (const data of cases) { const result = ensureFirstUseTraining(data, input); assert.equal(result.created, false); assert.deepEqual(result.data, data); }
});

test('invalid V3/input is rejected instead of falling back to a default', () => {
  assert.throws(() => ensureFirstUseTraining({ ...createInitialData(), version: 2 } as never, input));
  assert.throws(() => ensureFirstUseTraining(createInitialData(), { ...input, sessionId: '' }));
  assert.throws(() => ensureFirstUseTraining(createInitialData(), { ...input, createdAt: 7 } as never));
});
