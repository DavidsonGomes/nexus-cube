import type { AppData, Session, Solve, SolveCapture, SolveMode, SolveScope, StoredSolveMode } from './types';
import { parseAlgorithm } from './cube';

export const MODE_OPTIONS: readonly { value: SolveMode; label: string }[] = Object.freeze([
  Object.freeze({ value: 'two-handed' as const, label: 'Duas mãos' }),
  Object.freeze({ value: 'one-handed' as const, label: 'Uma mão' }),
]);
export const UNCLASSIFIED_MODE_LABEL = 'Não classificados';

export function assertSolveMode(mode: unknown): asserts mode is SolveMode {
  if (mode !== 'two-handed' && mode !== 'one-handed') throw new Error('Escolha a modalidade: duas mãos ou uma mão.');
}
export function assertStoredSolveMode(mode: unknown): asserts mode is StoredSolveMode {
  if (mode !== null) assertSolveMode(mode);
}
export function selectSessions(data: AppData, mode: StoredSolveMode): Session[] {
  assertStoredSolveMode(mode);
  return data.sessions.filter(session => session.mode === mode);
}
export function selectSolves(data: AppData, scope: SolveScope): Solve[] {
  if (!scope || typeof scope !== 'object' || (scope.kind !== 'session' && scope.kind !== 'mode')) throw new Error('Recorte de modalidade inválido.');
  assertStoredSolveMode(scope.mode);
  const allowed = scope.kind === 'session' ? ['kind', 'mode', 'sessionId'] : ['kind', 'mode'];
  if (Object.keys(scope).some(key => !allowed.includes(key))) throw new Error('Campos de recorte inválidos.');
  if (scope.kind === 'session') {
    const session = data.sessions.find(item => item.id === scope.sessionId);
    if (!session) throw new Error('Sessão não encontrada.');
    if (session.mode !== scope.mode) throw new Error('Modalidade incompatível com a sessão.');
  }
  const sessions = new Map(data.sessions.map(session => [session.id, session]));
  // Validate before filtering: malformed records cannot disappear into another scope.
  for (const solve of data.solves) {
    assertStoredSolveMode(solve.mode);
    const session = sessions.get(solve.sessionId);
    if (!session || session.mode !== solve.mode) throw new Error('Modalidade ou sessão da resolução incompatível.');
  }
  return data.solves.filter(solve => solve.mode === scope.mode && (scope.kind === 'mode' || solve.sessionId === scope.sessionId));
}
export function beginSolveCapture(data: AppData, input: SolveCapture): Readonly<SolveCapture> {
  assertSolveMode(input.mode);
  selectSolves(data, { kind: 'session', sessionId: input.sessionId, mode: input.mode });
  if (typeof input.scramble !== 'string' || !input.scramble.trim() || input.scramble.length > 1000) throw new Error('Embaralhamento inválido para iniciar.');
  parseAlgorithm(input.scramble);
  return Object.freeze({ sessionId: input.sessionId, mode: input.mode, scramble: input.scramble });
}
