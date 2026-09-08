import type { AppData } from '../../src/domain/types';

export const ON_SYNC_CONTEXTS = Object.freeze({
  a1: Object.freeze({ projectRef: 'qa-sync-v3', userId: 'qa-account-a', generation: 7 }),
  a2: Object.freeze({ projectRef: 'qa-sync-v3', userId: 'qa-account-a', generation: 7 }),
  b1: Object.freeze({ projectRef: 'qa-sync-v3', userId: 'qa-account-b', generation: 4 }),
  guest: Object.freeze({ projectRef: 'qa-sync-v3', userId: null, generation: 2 }),
});

const settings = (theme: 'light' | 'dark') => ({ theme, inspection: false, inspectionSound: false, holdMs: 500, focus: false, hideRunningTime: false, animationSpeed: 1 });

export function expectedAccountData(owner: 'a' | 'b' | 'guest', revision = 0): AppData {
  const sessionId = `qa-${owner}-session`, mode = owner === 'b' ? 'one-handed' : owner === 'guest' ? null : 'two-handed';
  return {
    version: 3,
    sessions: [{ id: sessionId, name: `QA ${owner} session`, createdAt: '2026-09-08T00:00:00.000Z', mode }],
    activeSessionId: sessionId,
    solves: [{ id: `qa-${owner}-solve-${revision}`, sessionId, mode, rawMs: 12340, penalty: 'none', scramble: "R U R'", createdAt: '2026-09-08T00:00:01.000Z', note: `${owner} sentinel`, source: 'manual' }],
    progress: { 'OLL-30': { caseId: 'OLL-30', favorite: true, status: 'learning', note: `${owner} progress` } },
    studyAttempts: [{ id: `qa-${owner}-study`, caseId: 'OLL-30', createdAt: '2026-09-08T00:00:02.000Z', recognition: 'good', execution: 'again', durationMs: 900 }],
    settings: settings(owner === 'b' ? 'dark' : 'light'),
  };
}

export const ON_SYNC_EXPECTED = Object.freeze({ a1: expectedAccountData('a'), a2: expectedAccountData('a'), b1: expectedAccountData('b'), guest: expectedAccountData('guest') });

export const ON_SYNC_INVARIANTS = Object.freeze({
  commitPropagation: 'A1 change becomes identical in A2; B1 and guest remain byte-identical.',
  retry: 'An offline operation reuses its operationId and one lost ack cannot append twice.',
  pullBeforeAck: 'A pull before ack correlates the same operation and preserves later queued changes.',
  context: 'A response from A is rejected after switching to B; B snapshot remains exactly expectedAccountData(b).',
  capture: 'In-flight sessionId, mode and scramble are immutable across pull and identity changes.',
});
