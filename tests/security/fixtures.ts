import type { AppData } from '../../src/domain/types';

export const QA_IDENTITIES = {
  a: { id: '11111111-1111-4111-8111-111111111111', email: 'qa-a@example.invalid' },
  b: { id: '22222222-2222-4222-8222-222222222222', email: 'qa-b@example.invalid' },
} as const;
export type FixtureIdentity = keyof typeof QA_IDENTITIES | 'guest';

/** Fixed external expectations, not derived from any product factory/validator. */
export function personalFixture(identity: FixtureIdentity): AppData {
  const marker = `synthetic-private-${identity}`;
  const mode = identity === 'b' ? 'one-handed' : 'two-handed';
  return {
    version: 3,
    sessions: [{ id: 'same-session-id', name: marker, createdAt: '2026-09-08T12:00:00.000Z', mode }],
    activeSessionId: 'same-session-id',
    solves: [{
      id: 'same-solve-id', sessionId: 'same-session-id', mode,
      rawMs: identity === 'a' ? 1111.5 : identity === 'b' ? 2222.5 : 3333.5,
      penalty: 'none', scramble: 'R U', createdAt: '2026-09-08T12:00:01.000Z',
      note: marker, source: 'manual',
    }],
    progress: { 'OLL-01': { caseId: 'OLL-01', favorite: true, status: 'learning', note: marker } },
    studyAttempts: [{
      id: 'same-attempt-id', caseId: 'OLL-01', createdAt: '2026-09-08T12:00:02.000Z',
      recognition: 'good', execution: 'again', durationMs: 123.5,
    }],
    settings: {
      theme: identity === 'b' ? 'light' : 'dark', inspection: false,
      inspectionSound: false, holdMs: 300, focus: false,
      hideRunningTime: false, animationSpeed: 1,
    },
  };
}

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
