import type { AppData, Session, Solve } from '../../src/domain/types';

export const QA_SETTINGS = Object.freeze({ theme: 'light', inspection: false, inspectionSound: false, holdMs: 0, focus: false, hideRunningTime: false, animationSpeed: 1 } as const);

export function qaSession(index: number): Session {
  return { id: `qa-ses-${index}`, name: `QA Sessao ${index}`, createdAt: `2026-09-09T00:0${index}:00.000Z`, mode: null };
}
export function qaSolve(index: number, sessionId: string): Solve {
  return {
    id: `qa-slv-${String(index).padStart(3, '0')}`, sessionId, mode: null, rawMs: 10000 + index * 111,
    penalty: index % 5 === 4 ? '+2' : 'none', scramble: "R U R' U'", createdAt: `2026-09-09T01:00:${String(index % 60).padStart(2, '0')}.000Z`,
    note: '', source: 'manual',
  };
}
export function qaAppData(input: { sessions: number; solvesPerSession: number; solveOffset?: number }): AppData {
  const sessions = Array.from({ length: input.sessions }, (_, i) => qaSession(i + 1));
  const offset = input.solveOffset ?? 0;
  const solves = sessions.flatMap((session, s) =>
    Array.from({ length: input.solvesPerSession }, (_, i) => qaSolve(offset + s * input.solvesPerSession + i + 1, session.id)));
  return { version: 3, sessions, activeSessionId: sessions[0]?.id ?? null, solves, progress: {}, studyAttempts: [], settings: { ...QA_SETTINGS } };
}

export const LARGE_LOCAL: AppData = Object.freeze(qaAppData({ sessions: 2, solvesPerSession: 5 }));
export const SMALL_REMOTE: AppData = Object.freeze({ ...qaAppData({ sessions: 1, solvesPerSession: 3 }), activeSessionId: 'qa-ses-1' });
export const DIVERGENT_SMALL_B: AppData = Object.freeze(qaAppData({ sessions: 1, solvesPerSession: 2, solveOffset: 900 }));

export function solveIds(data: AppData): ReadonlySet<string> { return new Set(data.solves.map(solve => solve.id)); }
export function sessionIds(data: AppData): ReadonlySet<string> { return new Set(data.sessions.map(session => session.id)); }
export function isIdSuperset(view: AppData, mustContain: AppData): { ok: boolean; missing: string[] } {
  const solvesInView = solveIds(view), sessionsInView = sessionIds(view);
  const missing = [
    ...[...solveIds(mustContain)].filter(id => !solvesInView.has(id)).map(id => `solve:${id}`),
    ...[...sessionIds(mustContain)].filter(id => !sessionsInView.has(id)).map(id => `session:${id}`),
  ];
  return { ok: missing.length === 0, missing };
}
export function unionSolveCount(...datasets: readonly AppData[]): number {
  return new Set(datasets.flatMap(data => [...solveIds(data)])).size;
}

export interface AdoptionScenario { id: string; summary: string; invariant: string }
export const ADOPTION_SCENARIOS: readonly AdoptionScenario[] = Object.freeze([
  {
    id: 'larger-local-never-shrinks',
    summary: 'Base remota menor (SMALL_REMOTE) com outbox local carregando o estado maior (LARGE_LOCAL); projetar a visao.',
    invariant: 'A visao projetada e um superset de LARGE_LOCAL; nunca regride para SMALL_REMOTE.',
  },
  {
    id: 'missing-before-does-not-hide-followers',
    summary: 'Primeira entrada da outbox com before divergente/ausente marca conflito; entradas seguintes independentes continuam na fila e na visao.',
    invariant: 'Conflito na entrada 1 nao suprime os afters das entradas 2..n sem sobreposicao de chaves; nada some da visao nem da fila.',
  },
  {
    id: 'adoption-preserves-both',
    summary: 'Operacao kind adoption enviada com estado local menor divergente (DIVERGENT_SMALL_B) sobre servidor maior.',
    invariant: 'Depois da adocao o servidor contem a uniao (unionSolveCount) e nenhum tombstone sobre registros pre-existentes; contagens nunca diminuem.',
  },
  {
    id: 'remote-choice-preserves-afters',
    summary: 'Conflito resolvido com escolha remote em uma entrada especifica.',
    invariant: 'Somente a entrada escolhida e descartada; afters das demais entradas pendentes sobrevivem e voltam a fila; a visao nunca perde registros ja confirmados.',
  },
  {
    id: 'retry-reconciliation-no-discard',
    summary: 'Falha transitoria de push seguida de retry, e ciclo preview/confirm de reconciliation com merge.',
    invariant: 'Nenhuma entrada da outbox e descartada silenciosamente; operationIds permanecem estaveis no retry; o snapshot da fila do preview e restaurado ou aplicado, jamais perdido.',
  },
]);
