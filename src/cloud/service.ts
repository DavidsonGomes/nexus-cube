import { createInitialData, ensureFirstUseTraining, exportBackup, loadData, saveData, STORAGE_KEY, type StorageLike } from '../data';
import { beginSolveCapture } from '../domain/modes';
import { assertTime } from '../domain/timer';
import type { AppData, Solve, SolveCapture } from '../domain/types';
import { AuthSessionInvalidError } from './types';
import type { AuthDriver, AuthDriverFactory, AuthResult, CaptureHandle, CloudFailureCode, CloudIdentity, CloudService, CloudSnapshot, CommitResult, ContextHandle, Failure, RecoveryDraft } from './types';
import type { CloudAtomicStore, CloudState, StoredDraft } from './storage';
import { createSyncEngine } from './sync-engine';
import { createSyncActions, autoAdoptSubsetReconciliation } from './sync-actions';
import { enqueueChange, initialSyncState } from './sync-state';
import { createRPCSyncTransport } from './sync-transport';
import type { CloudSyncAPI, SyncTransportFactory } from './sync-types';

export interface CloudServicePorts { projectRef: string; configured?: boolean; authFactory: AuthDriverFactory; store: CloudAtomicStore; guestStorage?: StorageLike; online?: () => boolean; redirectTo: string; now?: () => number; randomId?: () => string; syncTransportFactory?: SyncTransportFactory; syncIntervalMs?: number; syncEnabled?: boolean }
class CloudError extends Error { constructor(readonly code: CloudFailureCode, message: string) { super(message); } }
const failure = (error: unknown, fallback: CloudFailureCode = 'storage-error'): Failure => ({ kind: 'error', code: error instanceof CloudError ? error.code : fallback, message: error instanceof CloudError ? error.message : fallback === 'auth-error' ? 'Não foi possível concluir a autenticação. Confira os dados e tente novamente.' : 'Não foi possível gravar ou acessar os dados locais. Tente novamente.' });
function denied(code: CloudFailureCode, message: string): never { throw new CloudError(code, message); }
function checked(data: AppData): AppData { let text = ''; saveData(data, { getItem: () => null, setItem: (_key, value) => { text = value; } }); return JSON.parse(text) as AppData; }
const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

export function createCloudServiceWithPorts(ports: CloudServicePorts): CloudService {
  const { store, projectRef } = ports;
  const syncEnabled = ports.syncEnabled === true;
  const online = ports.online ?? (() => typeof navigator === 'undefined' || navigator.onLine);
  const now = ports.now ?? Date.now;
  const id = ports.randomId ?? (() => crypto.randomUUID());
  const listeners = new Set<() => void>();
  const drivers = new Map<string, AuthDriver>();
  const unsubscribers = new Map<string, () => void>();
  const capabilities = new WeakMap<CaptureHandle, { id: string; capabilityId: string; userId: string | null; generation: number; source?: 'timer' | 'manual'; captured: SolveCapture; pendingSolve?: Solve }>();
  let disposed = false;
  let memoryLocked = false;
  let initialization: Promise<void> | null = null;
  let verifiedUserId: string | null = null;
  let observedGeneration = -1;
  let snapshot: CloudSnapshot = { status: 'initializing', identity: null, context: null, data: null, localRevision: 0, error: null, recoveryContextId: null, sync: 'unavailable', syncPendingCount: 0, syncError: null, syncConfirmedRevision: null, syncHydrated: false, accountImport: 'unavailable', storageLabel: 'Dados locais neste dispositivo' };
  const handle = (state: CloudState): ContextHandle => ({ projectRef, userId: state.gate === 'guest' ? null : state.user?.id ?? null, generation: state.generation });
  const same = (a: ContextHandle, state: CloudState) => a.projectRef === projectRef && a.generation === state.generation && a.userId === (state.gate === 'guest' ? null : state.user?.id ?? null);
  function emit(patch: Partial<CloudSnapshot>) { if (disposed) return; snapshot = { ...snapshot, ...patch }; for (const listener of listeners) listener(); }
  function hide(error: Failure | null = null) { emit({ status: 'locked', identity: null, context: null, data: null, localRevision: 0, recoveryContextId: null, error, sync: 'unavailable', syncPendingCount: 0, syncError: null, syncConfirmedRevision: null, syncHydrated: false, accountImport: 'unavailable' }); }
  async function returnForContext<T>(context: ContextHandle, result: T, updateView = false): Promise<T | Failure> {
    const state = await store.read();
    const visible = snapshot.context;
    if (memoryLocked || state.generation < observedGeneration || !visible || visible.projectRef !== context.projectRef || visible.userId !== context.userId || visible.generation !== context.generation || !same(context, state) || (state.gate !== 'active' && state.gate !== 'guest')) return { kind: 'error', code: 'identity-changed', message: 'A identidade mudou. O resultado anterior não foi exibido.' };
    if (updateView) publish(state, snapshot.status === 'offline-account');
    return result;
  }
  function guard(state: CloudState, context: ContextHandle): void {
    if (memoryLocked || disposed) denied('locked', 'O contexto está bloqueado.');
    if (!same(context, state)) denied('identity-changed', 'A identidade mudou. Os dados anteriores permanecem separados.');
    if (state.gate !== 'active' && state.gate !== 'guest') denied('locked', 'Autentique novamente para acessar estes dados.');
  }
  function workspace(state: CloudState) { const result = state.gate === 'guest' ? state.guest : state.user && state.accounts[state.user.id]; if (!result) denied('locked', 'Dados locais indisponíveis neste contexto.'); return result; }
  function busy(state: CloudState) { return Object.values(state.drafts).some(draft => draft.generation === state.generation && draft.userId === (state.user?.id ?? null) && (draft.state === 'armed' || draft.state === 'completed')); }
  function assertIdle(state: CloudState) { if (busy(state)) denied('busy-capture', 'Conclua ou cancele a captura antes de trocar de conta ou sair.'); }
  function publish(state: CloudState, offline = false) {
    if (state.generation < observedGeneration) return;
    observedGeneration = state.generation;
    if (memoryLocked) { hide(); return; }
    if (state.gate === 'active' || state.gate === 'guest') {
      const data = workspace(state);
      const sync = syncEnabled && state.gate === 'active' ? state.accounts[state.user!.id].sync : undefined;
      emit({ sync: sync?.status ?? 'unavailable', syncPendingCount: sync?.outbox.length ?? 0, syncError: sync?.error ?? null, syncConfirmedRevision: sync?.revision ?? null, syncHydrated: sync?.hydrated ?? false, accountImport: sync ? 'available' : 'unavailable' });
      emit({ status: state.gate === 'guest' ? 'guest' : offline ? 'offline-account' : 'authenticated', context: handle(state), identity: state.gate === 'guest' ? null : state.user, data: structuredClone(data.data), localRevision: data.revision, error: state.gate === 'guest' && state.guestError ? { kind: 'error', code: 'invalid', message: state.guestError } : null, recoveryContextId: null });
    } else if (state.gate === 'recovery') emit({ status: 'recovery', identity: state.user, context: null, data: null, recoveryContextId: state.flow?.id ?? null, error: null });
    else hide();
  }
  function removeAuth(state: CloudState) { state.auth = {}; state.allowedAuth = []; state.authInstance = null; state.flow = null; }
  function disposeDrivers() { for (const off of unsubscribers.values()) off(); for (const driver of drivers.values()) driver.dispose(); drivers.clear(); unsubscribers.clear(); }
  function driver(instance: string): AuthDriver {
    const existing = drivers.get(instance); if (existing) return existing;
    const prefix = `${instance}:`;
    const created = ports.authFactory({ storageKey: `nexus-auth-${projectRef}-${instance}`, storage: {
      getItem: async key => { const state = await store.read(); return state.allowedAuth.includes(instance) ? state.auth[prefix + key] ?? null : null; },
      setItem: async (key, value) => { await store.transact(state => { if (!state.allowedAuth.includes(instance)) denied('identity-changed', 'Instância de autenticação encerrada.'); state.auth[prefix + key] = value; }); },
      removeItem: async key => { await store.transact(state => { delete state.auth[prefix + key]; }); },
    } });
    drivers.set(instance, created);
    unsubscribers.set(instance, created.subscribe(event => { queueMicrotask(() => { void onAuthEvent(instance, event); }); }));
    return created;
  }
  async function onAuthEvent(instance: string, event: string) {
    if (disposed) return;
    let eventGeneration: number | null = null;
    try {
      const state = await store.read();
      if (state.authInstance !== instance || state.gate !== 'active' || state.generation < observedGeneration) return;
      eventGeneration = state.generation;
      if (event === 'SIGNED_OUT') {
        await invalidate(instance, state.generation);
        unsubscribers.get(instance)?.(); unsubscribers.delete(instance);
        drivers.get(instance)?.dispose(); drivers.delete(instance); return;
      }
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        const user = await driver(instance).getUser();
        const current = await store.read();
        if (current.generation !== state.generation || current.authInstance !== instance || current.generation < observedGeneration) return;
        if (!user || user.id !== current.user?.id) { await invalidate(instance, state.generation); return; }
        publish(current);
      }
    } catch (error) {
      if (eventGeneration === null || eventGeneration < observedGeneration) return;
      if (error instanceof AuthSessionInvalidError) { try { await invalidate(instance, eventGeneration); } catch { /* Failure keeps this instance locked in memory. */ } }
      else emit({ error: failure(error, 'auth-error') });
    }
  }
  const unsubscribeStore = store.subscribe(() => { void store.read().then(state => {
    if (disposed) return;
    if (state.generation < observedGeneration) return;
    observedGeneration = state.generation;
    if (snapshot.context && !same(snapshot.context, state)) { hide(); return; }
    if (snapshot.context && (state.gate === 'active' || state.gate === 'guest') && !memoryLocked) publish(state, snapshot.status === 'offline-account');
  }).catch(() => { memoryLocked = true; hide(failure(new Error())); }); });
  async function startAuth(kind?: 'signup' | 'recovery') {
    if (ports.configured === false) denied('unavailable', 'Autenticação ainda não configurada. Continue como visitante.');
    if (!online()) denied('offline', 'Conecte-se à internet para autenticar.');
    const instance = id(); const flowId = id();
    const state = await store.transact(current => {
      assertIdle(current); current.generation++; current.gate = 'locked'; current.user = null; removeAuth(current); current.allowedAuth = [instance];
      current.authInstance = instance;
      if (kind) current.flow = { id: flowId, instance, generation: current.generation, kind, expiresAt: now() + 60 * 60 * 1000, user: null, consumed: false };
      return structuredClone(current);
    });
    disposeDrivers(); memoryLocked = false; hide();
    return { instance, generation: state.generation, flowId, auth: driver(instance) };
  }
  async function activate(instance: string, generation: number, user: CloudIdentity): Promise<AuthResult> {
    if (!user.id || ['__proto__', 'constructor', 'prototype'].includes(user.id)) denied('auth-error', 'Identidade inválida.');
    const state = await store.transact(current => {
      if (current.generation !== generation || current.authInstance !== instance || !current.allowedAuth.includes(instance)) denied('identity-changed', 'A identidade mudou durante a autenticação.');
      if (!hasOwn(current.accounts, user.id)) current.accounts[user.id] = { data: createInitialData(), revision: 0, firstUse: { eligible: true, initialized: false, sessionId: 'nexus-first-use-training-v1', createdAt: new Date(now()).toISOString() } };
      if (syncEnabled) { const account = current.accounts[user.id]; account.sync ??= initialSyncState(account.revision > 0); if (account.syncNeedsReconciliation) account.sync.reconciliation = true; account.sync.status = account.sync.reconciliation ? 'reconciliation-required' : 'pending'; account.sync.hydrated = false; account.sync.error = null; }
      current.user = user; current.gate = 'active'; current.flow = null;
      return structuredClone(current);
    });
    const current = await store.read();
    if (current.generation !== generation || current.authInstance !== instance || current.user?.id !== user.id || generation < observedGeneration) denied('identity-changed', 'A identidade mudou durante a autenticação.');
    memoryLocked = false; verifiedUserId = user.id; publish(current); syncEngine.trigger(); return { kind: 'authenticated', identity: user, context: handle(current) };
  }
  function redirect(flowId: string) { const target = new URL(ports.redirectTo); target.searchParams.set('cloud_flow', flowId); return target.toString(); }
  async function authFailure(error: unknown): Promise<Failure> { const result = failure(error, online() ? 'auth-error' : 'offline'); emit({ error: result }); return result; }
  function captureProof(capture: CaptureHandle) { const proof = capabilities.get(capture); if (!proof || proof.id !== capture.id || capture.context.projectRef !== projectRef || proof.generation !== capture.context.generation || proof.userId !== capture.context.userId) denied('invalid', 'Captura desconhecida ou alterada.'); return proof; }
  function eligibleDraft(state: CloudState, capture: CaptureHandle): StoredDraft { const proof = captureProof(capture); const draft = state.drafts[proof.id]; if (!draft || draft.userId !== proof.userId || draft.generation !== proof.generation || draft.capabilityId !== proof.capabilityId) denied('invalid', 'Captura desconhecida ou retomada em outro contexto.'); return draft; }
  function issueCapture(draft: StoredDraft, context: ContextHandle): CaptureHandle { const capture = Object.freeze({ id: draft.id, context: Object.freeze({ ...context }) }); capabilities.set(capture, { id: draft.id, capabilityId: draft.capabilityId, userId: draft.userId, generation: draft.generation, source: draft.source, captured: structuredClone(draft.capture), pendingSolve: draft.solve ?? undefined }); return capture; }
  function recoveryDraft(draft: StoredDraft): RecoveryDraft {
    const valid = (draft.source === 'timer' || draft.source === 'manual') && (draft.state !== 'completed' || !!draft.solve);
    return structuredClone({ id: draft.id, state: !valid ? 'discard-only' : draft.state === 'completed' ? 'completed' : 'interrupted', capture: draft.capture, result: valid ? draft.result : null, solve: valid ? draft.solve ?? null : null });
  }
  async function invalidate(instance: string, generation: number) {
    const current = await store.read();
    if (current.generation !== generation || current.authInstance !== instance || generation < observedGeneration) return;
    memoryLocked = true; verifiedUserId = null; hide();
    await store.transact(state => { if (state.generation === generation && state.authInstance === instance) { state.generation++; state.gate = 'locked'; removeAuth(state); } });
  }

  const isCurrentSync = (context: ContextHandle) => !disposed && !memoryLocked && snapshot.context?.userId === context.userId && snapshot.context?.generation === context.generation && context.generation >= observedGeneration && (snapshot.status === 'authenticated' || snapshot.status === 'offline-account');
  async function syncTransport(context: ContextHandle) {
    if (!syncEnabled) return null;
    const state = await store.read(); guard(state, context);
    if (!isCurrentSync(context) || !state.authInstance || !context.userId) return null;
    const auth = driver(state.authInstance);
    if (!auth.rpc && !ports.syncTransportFactory) return null;
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const current = await store.read(); guard(current, context);
      if (!isCurrentSync(context) || current.authInstance !== state.authInstance) denied('identity-changed', 'A identidade mudou antes do envio.');
      if (!auth.rpc) denied('unavailable', 'Transporte indisponível.');
      const value = await auth.rpc(name, args);
      if (!isCurrentSync(context)) denied('identity-changed', 'A identidade mudou durante o envio.');
      return value;
    };
    return ports.syncTransportFactory ? ports.syncTransportFactory({ context, rpc }) : createRPCSyncTransport(rpc);
  }
  async function ensureFirstUse(context: ContextHandle): Promise<CommitResult> {
    const operationId = id();
    try {
      const result = await store.transact(state => {
        guard(state, context); assertIdle(state); const current = workspace(state); const firstUse = current.firstUse;
        if (state.gate === 'guest' && state.guestError) denied('invalid', state.guestError);
        const sync = syncEnabled && state.gate === 'active' ? state.accounts[state.user!.id].sync : undefined;
        if (context.userId && (!sync?.hydrated || sync.reconciliation)) denied('unavailable', 'Aguarde a hidratação da conta antes do primeiro treino.');
        if (firstUse?.eligible && !firstUse.initialized) {
          const eligibleFirstUse = !context.userId || (sync!.revision === '0' && sync!.outbox.length === 0);
          const result = ensureFirstUseTraining(current.data, { eligibleFirstUse, sessionId: firstUse.sessionId, createdAt: firstUse.createdAt });
          if (result.created) {
            if (state.gate === 'active') {
              enqueueChange(state.accounts[state.user!.id], current.data, result.data, operationId);
              const entry = sync!.outbox.find(item => item.id === operationId); if (entry) entry.bootstrap = true;
            }
            current.data = result.data; current.revision++;
          }
          firstUse.initialized = true; firstUse.eligible = false;
        }
        return { kind: 'committed' as const, data: current.data, localRevision: current.revision, context: handle(state), sync: sync?.status ?? 'unavailable' as const };
      });
      return await returnForContext(context, result, true);
    } catch (error) { const result = failure(error); if (snapshot.context && snapshot.context.generation === context.generation && snapshot.context.userId === context.userId) emit({ error: result }); return result; }
  }
  const syncEngine = syncEnabled ? createSyncEngine({ store, context: () => snapshot.context, isCurrent: isCurrentSync, guard, transport: syncTransport, online, intervalMs: ports.syncIntervalMs, autoAdopt: async context => { await store.transact(state => { guard(state, context); const account = state.accounts[context.userId!]; if (account?.sync) autoAdoptSubsetReconciliation(account, id); }); }, onHydrated: async context => { const state = await store.read(); if (same(context, state) && state.accounts[context.userId!]?.firstUse?.eligible && !state.accounts[context.userId!]?.sync?.reconciliation) await ensureFirstUse(context); }, onError: async (error, context) => { if (error instanceof AuthSessionInvalidError) { const state = await store.read(); if (same(context, state) && state.authInstance) await invalidate(state.authInstance, context.generation); } } }) : { trigger() {}, async drain() {}, dispose() {} };
  const syncUnavailable = async (): Promise<Failure> => ({ kind: 'error', code: 'unavailable', message: 'Sincronização ainda indisponível. Seus dados continuam locais neste dispositivo.' });
  const syncActions: CloudSyncAPI = syncEnabled ? createSyncActions({ store, guard, after: returnForContext, idle: assertIdle, randomId: id, drain: syncEngine.drain, trigger: syncEngine.trigger, transport: syncTransport }) : { listSyncConflicts: syncUnavailable, resolveSyncConflict: syncUnavailable, previewAccountReconciliation: syncUnavailable, confirmAccountReconciliation: syncUnavailable, previewGuestAdoption: syncUnavailable, confirmGuestAdoption: syncUnavailable };
  const service: CloudService = {
    ...syncActions,
    invokeAdmin: async input => {
      const context = { ...input.context };
      let dispatched = false;
      try {
        const body = structuredClone(input.body);
        if (!online()) denied('offline', 'Conecte-se para acessar a administração.');
        const state = await store.read(); guard(state, context);
        if (!context.userId || state.gate !== 'active' || !state.authInstance || !isCurrentSync(context)) denied('locked', 'Autentique uma conta para continuar.');
        const auth = driver(state.authInstance);
        if (!auth.invokeAdmin) denied('unavailable', 'Administração indisponível.');
        const current = await store.read(); guard(current, context);
        if (current.authInstance !== state.authInstance || !isCurrentSync(context)) denied('identity-changed', 'A identidade mudou antes do envio.');
        dispatched = true;
        const data = await auth.invokeAdmin(body);
        return await returnForContext(context, { kind: 'admin-response' as const, context: { ...context }, data });
      } catch (error) {
        if (!isCurrentSync(context)) return { kind: 'error', code: 'identity-changed', message: 'A identidade mudou. O resultado anterior não foi exibido.' };
        return failure(error, dispatched ? 'outcome-unknown' : 'auth-error');
      }
    },
    ensureFirstUse,
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    initialize: () => initialization ??= (async () => {
      let initializingAuth: { instance: string; generation: number } | null = null;
      try {
        let state = await store.read();
        if (!state.guest) {
          let raw: string | null = null; let sourceRead = false;
          try { const source = ports.guestStorage ?? (typeof localStorage === 'undefined' ? null : localStorage); if (source) { raw = source.getItem(STORAGE_KEY); sourceRead = true; } } catch { /* loadData below reports a recoverable read error. */ }
          const guest = loadData({ getItem: () => { if (!sourceRead) throw new Error('Não foi possível ler a fonte local.'); return raw; }, setItem: () => { throw new Error('Fonte somente leitura.'); } });
          const firstUse = { eligible: sourceRead && raw === null && !guest.error, initialized: false, sessionId: 'nexus-first-use-training-v1', createdAt: new Date(now()).toISOString() };
          state = await store.transact(current => { if (!current.guest) { current.guest = { data: checked(guest.data), revision: 0, firstUse }; current.guestError = guest.error; } return structuredClone(current); });
        }
        if (state.gate === 'guest') { publish(state); if (state.guest?.firstUse?.eligible && !state.guestError) await ensureFirstUse(handle(state)); }
        else if (state.gate === 'recovery' && state.flow && !state.flow.consumed && state.flow.expiresAt > now() && online()) {
          initializingAuth = { instance: state.flow.instance, generation: state.generation };
          const user = await driver(state.flow.instance).getUser();
          if (user?.id !== state.flow.user?.id) { await invalidate(state.flow.instance, state.generation); return; }
          const current = await store.read();
          if (current.generation === state.generation && current.flow?.id === state.flow.id && current.generation >= observedGeneration) publish(current);
        }
        else if (state.gate === 'active' && state.authInstance && online()) {
          initializingAuth = { instance: state.authInstance, generation: state.generation };
          const user = await driver(state.authInstance).getUser();
          if (user?.id === state.user?.id) { if (syncEnabled) await store.transact(next => { if (next.generation === state.generation) { const account = next.accounts[user!.id]; account.sync ??= initialSyncState(account.revision > 0); if (account.syncNeedsReconciliation) account.sync.reconciliation = true; account.sync.status = account.sync.reconciliation ? 'reconciliation-required' : 'pending'; account.sync.hydrated = false; account.sync.error = null; } }); const current = await store.read(); if (current.generation === state.generation) { verifiedUserId = user!.id; publish(current); syncEngine.trigger(); } }
          else { await store.transact(current => { if (current.generation === state.generation) { current.generation++; current.gate = 'locked'; removeAuth(current); } }); hide({ kind: 'error', code: 'locked', message: 'Entre novamente para acessar sua conta.' }); }
        } else hide();
      } catch (error) { if (error instanceof AuthSessionInvalidError && initializingAuth) { try { await invalidate(initializingAuth.instance, initializingAuth.generation); } catch { memoryLocked = true; } } hide(failure(error, initializingAuth ? 'auth-error' : 'storage-error')); }
    })(),
    signUp: async input => { try { const ctx = await startAuth('signup'); const user = await ctx.auth.signUp(input.email, input.password, redirect(ctx.flowId)); if (user) return await activate(ctx.instance, ctx.generation, user); return { kind: 'confirmation-required' }; } catch (error) { return authFailure(error); } },
    signIn: async input => { try { const ctx = await startAuth(); const user = await ctx.auth.signIn(input.email, input.password); return await activate(ctx.instance, ctx.generation, user); } catch (error) { return authFailure(error); } },
    requestPasswordReset: async email => { try { const ctx = await startAuth('recovery'); await ctx.auth.resetPassword(email, redirect(ctx.flowId)); return { kind: 'email-requested' }; } catch (error) { return authFailure(error); } },
    handleAuthCallback: async (url = typeof location === 'undefined' ? '' : location.href) => {
      try {
        const parsed = new URL(url); const code = parsed.searchParams.get('code'); const flowId = parsed.searchParams.get('cloud_flow');
        const state = await store.read(); const flow = state.flow;
        if (!code || !flowId || !flow || flow.id !== flowId || flow.consumed || flow.generation !== state.generation || flow.expiresAt <= now() || state.gate !== 'locked') denied('recovery-invalid', 'Link expirado, já usado ou iniciado em outro navegador. Solicite um novo link.');
        assertIdle(state);
        const auth = driver(flow.instance); const user = await auth.exchangeCode(code);
        if (flow.kind === 'signup') return await activate(flow.instance, flow.generation, user);
        const next = await store.transact(current => { if (current.generation !== flow.generation || current.flow?.id !== flow.id || current.gate !== 'locked') denied('identity-changed', 'A identidade mudou. Solicite um novo link.'); current.flow.user = user; current.user = user; current.gate = 'recovery'; return structuredClone(current); });
        const latest = await store.read();
        if (latest.generation !== flow.generation || latest.flow?.id !== flow.id || latest.generation < observedGeneration || latest.gate !== 'recovery') denied('identity-changed', 'A identidade mudou durante a recuperação.');
        publish(latest); return { kind: 'recovery-required', recoveryContextId: flow.id, identity: user };
      } catch (error) { return authFailure(error); }
    },
    completePasswordReset: async input => {
      try {
        const flow = await store.transact(state => { const current = state.flow; if (memoryLocked || state.gate !== 'recovery' || !current || current.id !== input.recoveryContextId || current.consumed || current.expiresAt <= now() || !current.user || current.user.id !== state.user?.id || current.generation !== state.generation) denied('recovery-invalid', 'Fluxo de recuperação inválido. Solicite novo link.'); current.consumed = true; return structuredClone(current); });
        const auth = driver(flow.instance); const verified = await auth.getUser(); if (verified?.id !== flow.user?.id) denied('identity-changed', 'A identidade de recuperação mudou.');
        const before = await store.read(); if (before.generation !== flow.generation || before.flow?.id !== flow.id) denied('identity-changed', 'A identidade mudou.');
        await auth.updatePassword(input.password);
        const current = await store.read(); if (current.generation !== flow.generation || current.flow?.id !== flow.id) denied('identity-changed', 'A identidade mudou durante a recuperação.');
        await store.transact(state => { if (state.generation !== flow.generation) denied('identity-changed', 'A identidade mudou.'); state.generation++; state.gate = 'locked'; state.user = null; removeAuth(state); });
        disposeDrivers(); hide(); return { kind: 'password-updated' };
      } catch (error) { return authFailure(error instanceof CloudError ? error : new CloudError('outcome-unknown', 'Não foi possível confirmar a alteração. Tente entrar ou solicite novo link.')); }
    },
    signOut: async () => {
      let auth: AuthDriver | null = null;
      try { const state = await store.read(); assertIdle(state); if (state.authInstance) auth = driver(state.authInstance); } catch (error) { if (error instanceof CloudError) return failure(error); memoryLocked = true; hide(); return { kind: 'logout-storage-error', local: 'memory-only', message: 'Saída não concluída. Esta aba foi bloqueada; tente novamente.' }; }
      memoryLocked = true; hide();
      try { await store.transact(state => { assertIdle(state); state.generation++; state.gate = 'locked'; state.user = null; removeAuth(state); }); }
      catch { return { kind: 'logout-storage-error', local: 'memory-only', message: 'Saída não concluída. Esta aba foi bloqueada; tente novamente.' }; }
      let remote: 'confirmed' | 'unconfirmed' = 'unconfirmed';
      try { if (online() && auth) { await auth.signOut(); remote = 'confirmed'; } } catch { /* Durable local lock is independent of remote revocation. */ }
      disposeDrivers(); return { kind: 'logged-out', local: 'durable', remote };
    },
    refresh: async () => { let attempt: { instance: string; generation: number } | null = null; try { const state = await store.read(); if (!state.authInstance || state.gate !== 'active' || memoryLocked) denied('locked', 'Entre novamente.'); attempt = { instance: state.authInstance, generation: state.generation }; if (!online()) denied('offline', 'Sem conexão. Os dados continuam locais.'); const user = await driver(state.authInstance).refresh(); if (!user || user.id !== state.user?.id) { await invalidate(state.authInstance, state.generation); denied('identity-changed', 'A sessão deixou de ser válida. Entre novamente.'); } const current = await store.read(); if (current.generation !== state.generation || current.authInstance !== state.authInstance || current.generation < observedGeneration) denied('identity-changed', 'A identidade mudou.'); publish(current); return { kind: 'authenticated', identity: user, context: handle(current) }; } catch (error) { if (error instanceof AuthSessionInvalidError && attempt) { try { await invalidate(attempt.instance, attempt.generation); } catch { /* This instance is already locked in memory. */ } return authFailure(new CloudError('identity-changed', 'A sessão deixou de ser válida. Entre novamente.')); } return authFailure(error); } },
    resumeOffline: async () => { try { const state = await store.read(); if (state.generation < observedGeneration) denied('identity-changed', 'A identidade mudou durante a retomada.'); if (memoryLocked || state.gate !== 'active' || !state.user || !state.accounts[state.user.id]) denied('locked', 'Autentique esta conta online antes de retomar seus dados.'); publish(state, true); return { kind: 'authenticated', identity: state.user, context: handle(state) }; } catch (error) { return failure(error); } },
    openGuest: async () => { try { const state = await store.transact(current => { assertIdle(current); current.generation++; current.gate = 'guest'; current.user = null; removeAuth(current); if (!current.guest) current.guest = { data: createInitialData(), revision: 0 }; return structuredClone(current); }); if (state.generation < observedGeneration) denied('identity-changed', 'A identidade mudou.'); disposeDrivers(); memoryLocked = false; publish(state); return { kind: 'guest' }; } catch (error) { return failure(error); } },
    commit: async input => {
      try { const operationId = id(); const result = await store.transact(state => { guard(state, input.context); assertIdle(state); if (state.gate === 'guest' && state.guestError) denied('invalid', state.guestError); const current = workspace(state); if (current.revision !== input.expectedLocalRevision) denied('stale-local', 'Os dados mudaram em outra aba. Revise e tente novamente.'); const next = checked(typeof input.change === 'function' ? input.change(structuredClone(current.data)) : input.change); if (state.gate === 'active') { if (syncEnabled) enqueueChange(state.accounts[state.user!.id], current.data, next, operationId); else state.accounts[state.user!.id].syncNeedsReconciliation = true; } current.data = next; current.revision++; return { kind: 'committed' as const, data: next, localRevision: current.revision, context: handle(state), sync: syncEnabled && state.gate === 'active' ? state.accounts[state.user!.id].sync?.status ?? 'unavailable' : 'unavailable' }; }); syncEngine.trigger(); return await returnForContext(input.context, result, true); } catch (error) { return failure(error); }
    },
    recover: async input => { if (input.context.userId !== null) return { kind: 'error', code: 'import-unavailable', message: 'A importação para contas ainda está indisponível. Seus dados de visitante continuam separados.' }; try { const result = await store.transact(state => { guard(state, input.context); assertIdle(state); const current = workspace(state); current.data = checked(input.data); current.revision++; state.guestError = null; return { kind: 'committed' as const, data: current.data, localRevision: current.revision, context: handle(state), sync: 'unavailable' as const }; }); return await returnForContext(input.context, result, true); } catch (error) { return failure(error); } },
    exportBackup: async context => { try { const result = await store.transact(state => { guard(state, context); return { kind: 'exported' as const, text: exportBackup(workspace(state).data) }; }); return await returnForContext(context, result); } catch (error) { return failure(error); } },
    beginCapture: async input => { try { if (input.source !== 'timer' && input.source !== 'manual') denied('invalid', 'Informe a origem da captura.'); const draftId = id(); const draft = await store.transact(state => { guard(state, input.context); assertIdle(state); if (state.gate === 'guest' && state.guestError) denied('invalid', state.guestError); const capture = beginSolveCapture(workspace(state).data, input.capture); const draft: StoredDraft = { id: draftId, capabilityId: id(), userId: input.context.userId, generation: input.context.generation, capture, source: input.source, state: 'armed', result: null, solve: null }; state.drafts[draftId] = draft; return draft; }); return await returnForContext(input.context, { kind: 'armed' as const, capture: issueCapture(draft, input.context) }); } catch (error) { return failure(error); } },
    completeCapture: async input => { try {
      assertTime(input.result.rawMs);
      if (!['none', '+2', 'DNF'].includes(input.result.penalty) || typeof input.result.note !== 'string' || input.result.note.length > 10000) denied('invalid', 'Resultado da captura inválido.');
      const result = { rawMs: input.result.rawMs === 0 ? 0 : input.result.rawMs, penalty: input.result.penalty, note: input.result.note };
      const proof = captureProof(input.capture);
      if (!proof.source) denied('invalid', 'Captura antiga sem origem: descarte explicitamente.');
      const frozen = proof.pendingSolve ??= { ...proof.captured, ...result, id: id(), createdAt: new Date(now()).toISOString(), source: proof.source };
      if (frozen.rawMs !== result.rawMs || frozen.penalty !== result.penalty || frozen.note !== result.note) denied('invalid', 'Resultado diferente da primeira tentativa.');
      await store.transact(state => {
        const draft = eligibleDraft(state, input.capture);
        if ((draft.state === 'completed' || draft.state === 'committed') && draft.solve && draft.result?.rawMs === result.rawMs && draft.result.penalty === result.penalty && draft.result.note === result.note) return;
        if (draft.state !== 'armed' || (draft.source !== 'timer' && draft.source !== 'manual')) denied('invalid', 'Captura antiga, concluída ou cancelada. Não é possível inferir seus metadados.');
        draft.result = result;
        draft.solve = structuredClone(frozen);
        draft.state = 'completed';
      });
      return { kind: 'draft-saved', id: input.capture.id };
    } catch (error) { return failure(error); } },
    cancelCapture: async capture => { try { await store.transact(state => { guard(state, capture.context); const draft = eligibleDraft(state, capture); if (draft.state === 'committed') denied('invalid', 'Captura já registrada.'); draft.state = 'cancelled'; }); return { kind: 'cancelled' }; } catch (error) { return failure(error); } },
    finishCapture: async input => { try { const operationId = id(); const result: CommitResult = await store.transact(state => { guard(state, input.capture.context); const draft = eligibleDraft(state, input.capture); const current = workspace(state); if (draft.state === 'committed') return { kind: 'committed', data: current.data, localRevision: current.revision, context: handle(state), sync: syncEnabled && state.gate === 'active' ? state.accounts[state.user!.id].sync?.status ?? 'unavailable' : 'unavailable' }; if (draft.state !== 'completed' || !draft.solve || !draft.source) denied('invalid', 'Resultado durável com metadados completos não disponível.'); if (current.revision !== input.expectedLocalRevision) denied('stale-local', 'Os dados mudaram. Revise a captura antes de tentar novamente.'); if (current.data.solves.some(solve => solve.id === draft.solve!.id)) denied('invalid', 'O identificador da captura já existe. O draft foi preservado.'); const next = checked({ ...current.data, solves: [...current.data.solves, draft.solve] }); if (state.gate === 'active') { if (syncEnabled) enqueueChange(state.accounts[state.user!.id], current.data, next, operationId); else state.accounts[state.user!.id].syncNeedsReconciliation = true; } current.data = next; current.revision++; draft.state = 'committed'; return { kind: 'committed', data: next, localRevision: current.revision, context: handle(state), sync: syncEnabled && state.gate === 'active' ? state.accounts[state.user!.id].sync?.status ?? 'unavailable' : 'unavailable' }; }); syncEngine.trigger(); return await returnForContext(input.capture.context, result, true); } catch (error) { return failure(error); } },
    listDrafts: async context => { try { const result = await store.transact(state => { guard(state, context); if (context.userId && verifiedUserId !== context.userId) denied('locked', 'Autentique esta conta para recuperar capturas.'); return { kind: 'drafts' as const, drafts: Object.values(state.drafts).filter(draft => draft.userId === context.userId && (draft.state === 'armed' || draft.state === 'completed')).map(recoveryDraft) }; }); return await returnForContext(context, result); } catch (error) { return failure(error); } },
    resumeCapture: async input => { try { const draft = await store.transact(state => { guard(state, input.context); if (input.context.userId && verifiedUserId !== input.context.userId) denied('locked', 'Autentique esta conta para recuperar capturas.'); const draft = state.drafts[input.draftId]; if (!draft || draft.userId !== input.context.userId || draft.state !== 'completed' || !draft.solve || !draft.source) denied('invalid', 'Captura interrompida ou antiga: somente descarte está disponível.'); draft.generation = state.generation; draft.capabilityId = id(); return structuredClone(draft); }); return await returnForContext(input.context, { kind: 'resumed' as const, capture: issueCapture(draft, input.context), draft: recoveryDraft(draft) }); } catch (error) { return failure(error); } },
    discardDraft: async input => { try { await store.transact(state => { guard(state, input.context); if (input.context.userId && verifiedUserId !== input.context.userId) denied('locked', 'Autentique esta conta para descartar capturas.'); const draft = state.drafts[input.draftId]; if (!draft || draft.userId !== input.context.userId || draft.state === 'committed') denied('invalid', 'Captura não disponível.'); draft.state = 'cancelled'; draft.capabilityId = id(); }); return { kind: 'cancelled' }; } catch (error) { return failure(error); } },
    dispose: () => { disposed = true; syncEngine.dispose(); unsubscribeStore(); disposeDrivers(); listeners.clear(); store.close(); },
  };
  return service;
}
