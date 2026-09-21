import { createInitialData, ensureFirstUseTraining, exportBackup, loadData, saveData, validateData, STORAGE_KEY } from '../data';
import { beginSolveCapture } from '../domain/modes';
import { assertTime } from '../domain/timer';
import type { AppData, Solve, SolveCapture } from '../domain/types';
import type { AuthResult, CaptureHandle, CaptureInputResult, CaptureResult, CloudFailureCode, CloudIdentity, CloudService, CloudSnapshot, CommitResult, ContextHandle, Failure, LogoutResult, RecoveryDraft } from './types';

const TOKEN_KEY = 'nexus-api-token-v1';
const DRAFTS_KEY = 'nexus-api-drafts-v1';
const FIRST_USE_SESSION = 'nexus-first-use-training-v1';
const PROJECT_REF = 'nexus-api';

interface StoredDraft { id: string; capabilityId: string; userId: string | null; generation: number; capture: SolveCapture; source: 'timer' | 'manual'; state: 'armed' | 'completed' | 'committed' | 'cancelled'; result: CaptureInputResult | null; solve: Solve | null }

class ApiError extends Error { constructor(readonly code: CloudFailureCode, message: string) { super(message); } }
const denied = (code: CloudFailureCode, message: string): never => { throw new ApiError(code, message); };
const failure = (error: unknown, fallback: CloudFailureCode = 'storage-error'): Failure => error instanceof ApiError
  ? { kind: 'error', code: error.code, message: error.message }
  : { kind: 'error', code: fallback, message: error instanceof Error ? error.message : 'Não foi possível concluir.' };
const unavailable = async (): Promise<Failure> => ({ kind: 'error', code: 'unavailable', message: 'Recurso indisponível nesta versão.' });

function checkedData(value: unknown): AppData {
  try { return validateData(structuredClone(value)); }
  catch (error) { return denied('invalid', error instanceof Error ? error.message : 'Dados em formato inválido.'); }
}

export function createApiCloudService(): CloudService {
  const listeners = new Set<() => void>();
  let generation = 0;
  let mode: 'guest' | 'active' = 'guest';
  let identity: CloudIdentity | null = null;
  let guest: { data: AppData; revision: number } = { data: createInitialData(), revision: 0 };
  let guestError: string | null = null;
  let guestFirstUseEligible = false;
  let account: { data: AppData; revision: number; serverRevision: number } | null = null;
  let sync: CloudSnapshot['sync'] = 'unavailable';
  let syncError: string | null = null;
  let initialization: Promise<void> | null = null;
  let ready = false;
  const pendingSolves = new Map<string, Solve>();

  const storage = typeof localStorage === 'undefined' ? null : localStorage;
  const readToken = () => { try { return storage?.getItem(TOKEN_KEY) ?? null; } catch { return null; } };
  const writeToken = (token: string | null) => { try { if (!storage) return; if (token) storage.setItem(TOKEN_KEY, token); else storage.removeItem(TOKEN_KEY); } catch { /* memória segue valendo nesta aba */ } };

  const readDrafts = (): Record<string, StoredDraft> => { try { const raw = storage?.getItem(DRAFTS_KEY); return raw ? JSON.parse(raw) as Record<string, StoredDraft> : {}; } catch { return {}; } };
  const writeDrafts = (drafts: Record<string, StoredDraft>) => { try { storage?.setItem(DRAFTS_KEY, JSON.stringify(drafts)); } catch { /* drafts são auxílio de recuperação, não fonte primária */ } };

  async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(path, { method, headers: { 'content-type': 'application/json', ...(readToken() ? { authorization: `Bearer ${readToken()}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch { throw new ApiError('offline', 'Sem conexão com o servidor. Nada foi gravado.'); }
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) { throw new ApiError('locked', (payload as { error?: string }).error ?? 'Sessão expirada. Entre novamente.'); }
    if (response.status === 409) { throw new ApiError('stale-local', (payload as { error?: string }).error ?? 'Os dados mudaram em outro dispositivo. Recarregue antes de gravar.'); }
    if (!response.ok) throw new ApiError('storage-error', (payload as { error?: string }).error ?? `Falha do servidor (${response.status}).`);
    return payload as T;
  }

  const handle = (): ContextHandle => ({ projectRef: PROJECT_REF, userId: mode === 'active' ? identity!.id : null, generation });
  const sameContext = (context: ContextHandle) => context.projectRef === PROJECT_REF && context.generation === generation && context.userId === (mode === 'active' ? identity!.id : null);
  const guardContext = (context: ContextHandle) => { if (!sameContext(context)) denied('identity-changed', 'Seu contexto mudou. Entre novamente antes de continuar.'); };

  let snapshot: CloudSnapshot;
  function publish() {
    const workspace = mode === 'active' ? account : guest;
    snapshot = {
      status: !ready ? 'initializing' : mode === 'active' ? 'authenticated' : 'guest',
      identity: mode === 'active' ? identity : null,
      context: handle(),
      data: workspace ? workspace.data : null,
      localRevision: workspace?.revision ?? 0,
      error: guestError && mode === 'guest' ? { kind: 'error', code: 'storage-error', message: guestError } : null,
      recoveryContextId: null,
      sync: mode === 'active' ? sync : 'unavailable',
      syncPendingCount: 0,
      syncError: mode === 'active' ? syncError : null,
      syncConfirmedRevision: account ? String(account.serverRevision) : null,
      syncHydrated: mode === 'active',
      accountImport: 'unavailable',
      storageLabel: 'Dados locais neste dispositivo',
    };
    for (const listener of listeners) listener();
  }
  publish();

  const workspace = () => { const current = mode === 'active' ? account : guest; if (!current) denied('locked', 'Abra seu espaço antes de continuar.'); return current!; };

  async function persistActive(next: AppData): Promise<void> {
    sync = 'syncing'; publish();
    try {
      const result = await api<{ revision: number }>('PUT', '/api/state', { data: next, expectedRevision: account!.serverRevision });
      account!.serverRevision = result.revision;
      sync = 'synced'; syncError = null;
    } catch (error) {
      sync = 'error'; syncError = error instanceof Error ? error.message : 'Falha ao gravar.';
      publish();
      throw error;
    }
  }

  async function commitData(context: ContextHandle, expectedLocalRevision: number, produce: (previous: AppData) => AppData): Promise<CommitResult> {
    guardContext(context);
    const current = workspace();
    if (current.revision !== expectedLocalRevision) denied('stale-local', 'Os dados mudaram em outra aba. Revise e tente novamente.');
    if (mode === 'guest' && guestError) denied('invalid', guestError);
    const next = checkedData(produce(structuredClone(current.data)));
    if (mode === 'active') await persistActive(next);
    else { try { saveData(next, storage ?? undefined); } catch (error) { denied('storage-error', error instanceof Error ? error.message : 'Não foi possível gravar neste dispositivo.'); } }
    current.data = next; current.revision++;
    if (!sameContext(context)) return { kind: 'error', code: 'identity-changed', message: 'A identidade mudou durante a gravação.' };
    publish();
    return { kind: 'committed', data: structuredClone(next), localRevision: current.revision, context: handle(), sync: snapshot.sync };
  }

  async function loadAccount(): Promise<AuthResult> {
    const session = await api<{ user: CloudIdentity; data: AppData | null; revision: number }>('GET', '/api/session');
    identity = session.user;
    const empty = session.data === null;
    account = { data: empty ? createInitialData() : checkedData(session.data), revision: 0, serverRevision: session.revision };
    mode = 'active'; generation++; sync = 'synced'; syncError = null;
    publish();
    if (empty) await service.ensureFirstUse(handle());
    return { kind: 'authenticated', identity: identity!, context: handle() };
  }

  async function authenticate(path: string, input: { email: string; password: string }): Promise<AuthResult> {
    try {
      const result = await api<{ token: string; user: CloudIdentity }>('POST', path, input);
      writeToken(result.token);
      return await loadAccount();
    } catch (error) { return failure(error, 'auth-error'); }
  }

  const eligibleDraft = (drafts: Record<string, StoredDraft>, capture: CaptureHandle): StoredDraft => {
    const draft = drafts[capture.id];
    if (!draft || draft.capabilityId !== capture.id + ':' + draft.generation || draft.userId !== capture.context.userId) denied('invalid', 'Captura antiga ou de outro espaço.');
    return draft;
  };
  const issueCapture = (draft: StoredDraft): CaptureHandle => ({ id: draft.id, context: handle() });
  const recoveryDraft = (draft: StoredDraft): RecoveryDraft => ({ id: draft.id, state: draft.state === 'completed' ? 'completed' : draft.state === 'armed' ? 'interrupted' : 'discard-only', capture: draft.capture, result: draft.result, solve: draft.solve });
  const id = () => crypto.randomUUID();

  async function initializeBody(): Promise<void> {
    let raw: string | null = null; let sourceRead = false;
    try { if (storage) { raw = storage.getItem(STORAGE_KEY); sourceRead = true; } } catch { /* loadData abaixo reporta erro recuperável */ }
    const loaded = loadData({ getItem: () => { if (!sourceRead) throw new Error('Não foi possível ler a fonte local.'); return raw; }, setItem: () => { throw new Error('Fonte somente leitura.'); } });
    guest = { data: loaded.data, revision: 0 };
    guestError = loaded.error ?? null;
    guestFirstUseEligible = sourceRead && raw === null && !loaded.error;
    publish();
    if (readToken()) {
      try { await loadAccount(); return; }
      catch (error) { if (error instanceof ApiError && error.code === 'locked') writeToken(null); syncError = error instanceof Error ? error.message : null; }
    }
    mode = 'guest'; publish();
    if (guestFirstUseEligible && !guestError) { ready = true; await service.ensureFirstUse(handle()); }
  }

  const service: CloudService = {
    listSyncConflicts: unavailable, resolveSyncConflict: unavailable, previewAccountReconciliation: unavailable, confirmAccountReconciliation: unavailable, previewGuestAdoption: unavailable, confirmGuestAdoption: unavailable,
    invokeAdmin: unavailable,
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    initialize: () => initialization ??= (async () => {
      try { await initializeBody(); } finally { ready = true; publish(); }
    })(),
    ensureFirstUse: async context => {
      try {
        guardContext(context);
        const current = workspace();
        const eligible = mode === 'active' ? current.data.sessions.length === 0 && current.data.solves.length === 0 : guestFirstUseEligible;
        const outcome = ensureFirstUseTraining(current.data, { eligibleFirstUse: eligible, sessionId: FIRST_USE_SESSION, createdAt: new Date().toISOString() });
        if (!outcome.created) return { kind: 'committed', data: structuredClone(current.data), localRevision: current.revision, context: handle(), sync: snapshot.sync };
        guestFirstUseEligible = false;
        return await commitData(context, current.revision, () => outcome.data);
      } catch (error) { return failure(error); }
    },
    signUp: input => authenticate('/api/auth/register', input),
    signIn: input => authenticate('/api/auth/login', input),
    requestPasswordReset: async () => ({ kind: 'error', code: 'unavailable', message: 'Recuperação de senha indisponível nesta versão. Fale com o suporte.' }),
    handleAuthCallback: async () => ({ kind: 'error', code: 'unavailable', message: 'Fluxo de link por email não é mais usado.' }),
    completePasswordReset: async () => ({ kind: 'error', code: 'unavailable', message: 'Recuperação de senha indisponível nesta versão.' }),
    signOut: async (): Promise<LogoutResult> => {
      writeToken(null);
      identity = null; account = null; mode = 'guest'; generation++; sync = 'unavailable'; syncError = null;
      publish();
      return { kind: 'logged-out', local: 'durable', remote: 'confirmed' };
    },
    refresh: async () => { try { if (!readToken()) denied('locked', 'Entre novamente.'); return await loadAccount(); } catch (error) { return failure(error, 'auth-error'); } },
    resumeOffline: async () => ({ kind: 'error', code: 'unavailable', message: 'O modo offline de conta foi descontinuado. Conecte-se para entrar.' }),
    openGuest: async () => { mode = 'guest'; generation++; identity = null; account = null; sync = 'unavailable'; publish(); return { kind: 'guest' }; },
    commit: async input => { try { return await commitData(input.context, input.expectedLocalRevision, previous => typeof input.change === 'function' ? input.change(previous) : input.change); } catch (error) { return failure(error); } },
    recover: async input => {
      if (input.context.userId !== null) return { kind: 'error', code: 'import-unavailable', message: 'A restauração de backup para contas ainda está indisponível.' };
      try { const result = await commitData(input.context, workspace().revision, () => checkedData(input.data)); if (result.kind === 'committed') guestError = null; return result; } catch (error) { return failure(error); }
    },
    exportBackup: async context => { try { guardContext(context); return { kind: 'exported', text: exportBackup(workspace().data) }; } catch (error) { return failure(error); } },
    beginCapture: async input => {
      try {
        guardContext(input.context);
        if (input.source !== 'timer' && input.source !== 'manual') denied('invalid', 'Informe a origem da captura.');
        if (mode === 'guest' && guestError) denied('invalid', guestError);
        const capture = beginSolveCapture(workspace().data, input.capture);
        const drafts = readDrafts();
        const draftId = id();
        drafts[draftId] = { id: draftId, capabilityId: draftId + ':' + generation, userId: input.context.userId, generation, capture, source: input.source, state: 'armed', result: null, solve: null };
        writeDrafts(drafts);
        return { kind: 'armed', capture: issueCapture(drafts[draftId]) };
      } catch (error) { return failure(error); }
    },
    completeCapture: async input => {
      try {
        assertTime(input.result.rawMs);
        if (!['none', '+2', 'DNF'].includes(input.result.penalty) || typeof input.result.note !== 'string' || input.result.note.length > 10000) denied('invalid', 'Resultado da captura inválido.');
        const drafts = readDrafts();
        const draft = eligibleDraft(drafts, input.capture);
        if ((draft.state === 'completed' || draft.state === 'committed') && draft.result?.rawMs === input.result.rawMs && draft.result.penalty === input.result.penalty && draft.result.note === input.result.note) return { kind: 'draft-saved', id: draft.id };
        if (draft.state !== 'armed') denied('invalid', 'Captura antiga, concluída ou cancelada.');
        const frozen = pendingSolves.get(draft.id) ?? { ...draft.capture, rawMs: input.result.rawMs, penalty: input.result.penalty, note: input.result.note, id: id(), createdAt: new Date().toISOString(), source: draft.source } as Solve;
        if (frozen.rawMs !== input.result.rawMs || frozen.penalty !== input.result.penalty || frozen.note !== input.result.note) denied('invalid', 'Resultado diferente da primeira tentativa.');
        pendingSolves.set(draft.id, frozen);
        draft.result = { ...input.result }; draft.solve = structuredClone(frozen); draft.state = 'completed';
        writeDrafts(drafts);
        return { kind: 'draft-saved', id: draft.id };
      } catch (error) { return failure(error); }
    },
    cancelCapture: async capture => { try { guardContext(capture.context); const drafts = readDrafts(); const draft = eligibleDraft(drafts, capture); if (draft.state === 'committed') denied('invalid', 'Captura já registrada.'); draft.state = 'cancelled'; writeDrafts(drafts); pendingSolves.delete(draft.id); return { kind: 'cancelled' }; } catch (error) { return failure(error); } },
    finishCapture: async input => {
      try {
        guardContext(input.capture.context);
        const drafts = readDrafts();
        const draft = eligibleDraft(drafts, input.capture);
        const current = workspace();
        if (draft.state === 'committed') return { kind: 'committed', data: structuredClone(current.data), localRevision: current.revision, context: handle(), sync: snapshot.sync };
        if (draft.state !== 'completed' || !draft.solve) denied('invalid', 'Resultado durável não disponível.');
        if (current.data.solves.some(solve => solve.id === draft.solve!.id)) denied('invalid', 'O identificador da captura já existe.');
        const result = await commitData(input.capture.context, input.expectedLocalRevision, previous => ({ ...previous, solves: [...previous.solves, draft.solve!] }));
        if (result.kind === 'committed') { draft.state = 'committed'; writeDrafts(drafts); pendingSolves.delete(draft.id); }
        return result;
      } catch (error) { return failure(error); }
    },
    listDrafts: async context => { try { guardContext(context); const drafts = readDrafts(); return { kind: 'drafts', drafts: Object.values(drafts).filter(draft => draft.userId === context.userId && (draft.state === 'armed' || draft.state === 'completed')).map(recoveryDraft) }; } catch (error) { return failure(error); } },
    resumeCapture: async input => { try { guardContext(input.context); const drafts = readDrafts(); const draft = drafts[input.draftId]; if (!draft || draft.userId !== input.context.userId || draft.state !== 'completed' || !draft.solve) denied('invalid', 'Captura interrompida ou antiga: somente descarte está disponível.'); draft.generation = generation; draft.capabilityId = draft.id + ':' + generation; writeDrafts(drafts); return { kind: 'resumed', capture: issueCapture(draft), draft: recoveryDraft(draft) }; } catch (error) { return failure(error); } },
    discardDraft: async input => { try { guardContext(input.context); const drafts = readDrafts(); const draft = drafts[input.draftId]; if (!draft || draft.userId !== input.context.userId || draft.state === 'committed') denied('invalid', 'Captura não disponível.'); draft.state = 'cancelled'; writeDrafts(drafts); pendingSolves.delete(draft.id); return { kind: 'cancelled' }; } catch (error) { return failure(error); } },
    dispose: () => { listeners.clear(); },
  };
  return service;
}
