import type { AppData, Solve, SolveCapture } from '../domain/types';
import type { CloudSyncAPI, SyncStatus } from './sync-types';

export interface CloudIdentity { id: string; email: string | null }
/** Trusted AuthDriver classification, never inferred from an arbitrary Error message. */
export class AuthSessionInvalidError extends Error { readonly kind = 'auth-session-invalid'; constructor() { super('Sessão inválida. Entre novamente.'); this.name = 'AuthSessionInvalidError'; } }
export interface ContextHandle { projectRef: string; userId: string | null; generation: number }
export type CloudFailureCode = 'unavailable' | 'offline' | 'auth-error' | 'identity-changed' | 'locked' | 'busy-capture' | 'stale-local' | 'invalid' | 'storage-error' | 'recovery-invalid' | 'outcome-unknown' | 'import-unavailable';
export type Failure = { kind: 'error'; code: CloudFailureCode; message: string };
export type AuthResult = { kind: 'authenticated'; identity: CloudIdentity; context: ContextHandle } | { kind: 'confirmation-required' } | { kind: 'email-requested' } | { kind: 'recovery-required'; recoveryContextId: string; identity: CloudIdentity } | { kind: 'password-updated' } | Failure;
export type LogoutResult = { kind: 'logged-out'; local: 'durable'; remote: 'confirmed' | 'unconfirmed' } | { kind: 'logout-storage-error'; local: 'memory-only'; message: string } | Failure;
export interface CloudSnapshot {
  status: 'initializing' | 'guest' | 'authenticated' | 'offline-account' | 'locked' | 'recovery' | 'unavailable';
  identity: CloudIdentity | null;
  context: ContextHandle | null;
  data: AppData | null;
  localRevision: number;
  error: Failure | null;
  recoveryContextId: string | null;
  sync: SyncStatus;
  syncPendingCount: number;
  syncError: string | null;
  syncConfirmedRevision: string | null;
  syncHydrated: boolean;
  accountImport: 'unavailable' | 'available';
  storageLabel: 'Dados locais neste dispositivo';
}
export type CommitResult = { kind: 'committed'; data: AppData; localRevision: number; context: ContextHandle; sync: SyncStatus } | Failure;
export interface CaptureHandle { readonly id: string; readonly context: ContextHandle }
export type CaptureResult = { kind: 'armed'; capture: CaptureHandle } | { kind: 'resumed'; capture: CaptureHandle; draft: RecoveryDraft } | { kind: 'draft-saved'; id: string } | { kind: 'cancelled' } | Failure;
export interface CaptureInputResult { rawMs: number; penalty: 'none' | '+2' | 'DNF'; note: string }
export interface RecoveryDraft { id: string; state: 'interrupted' | 'completed' | 'discard-only'; capture: SolveCapture; result: CaptureInputResult | null; solve: Solve | null }

/** Small SDK seam. Test doubles implement this without real credentials or network. */
export interface AuthDriver {
  rpc?(name: string, args: Record<string, unknown>): Promise<unknown>;
  signUp(email: string, password: string, redirectTo: string): Promise<CloudIdentity | null>;
  signIn(email: string, password: string): Promise<CloudIdentity>;
  getUser(): Promise<CloudIdentity | null>;
  resetPassword(email: string, redirectTo: string): Promise<void>;
  exchangeCode(code: string): Promise<CloudIdentity>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<CloudIdentity | null>;
  subscribe(listener: (event: string) => void): () => void;
  dispose(): void;
}
export interface AuthStorage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }
export type AuthDriverFactory = (options: { storage: AuthStorage; storageKey: string }) => AuthDriver;

export interface CloudService extends CloudSyncAPI {
  getSnapshot(): CloudSnapshot;
  subscribe(listener: () => void): () => void;
  initialize(): Promise<void>;
  ensureFirstUse(context: ContextHandle): Promise<CommitResult>;
  signUp(input: { email: string; password: string }): Promise<AuthResult>;
  signIn(input: { email: string; password: string }): Promise<AuthResult>;
  requestPasswordReset(email: string): Promise<AuthResult>;
  handleAuthCallback(url?: string): Promise<AuthResult>;
  completePasswordReset(input: { recoveryContextId: string; password: string }): Promise<AuthResult>;
  signOut(): Promise<LogoutResult>;
  refresh(): Promise<AuthResult>;
  resumeOffline(): Promise<AuthResult>;
  openGuest(): Promise<AuthResult | { kind: 'guest' }>;
  commit(input: { context: ContextHandle; expectedLocalRevision: number; change: AppData | ((previous: AppData) => AppData) }): Promise<CommitResult>;
  recover(input: { context: ContextHandle; data: AppData }): Promise<CommitResult>;
  exportBackup(context: ContextHandle): Promise<{ kind: 'exported'; text: string } | Failure>;
  beginCapture(input: { context: ContextHandle; capture: SolveCapture; source: 'timer' | 'manual' }): Promise<CaptureResult>;
  completeCapture(input: { capture: CaptureHandle; result: CaptureInputResult }): Promise<CaptureResult>;
  cancelCapture(capture: CaptureHandle): Promise<CaptureResult>;
  finishCapture(input: { capture: CaptureHandle; expectedLocalRevision: number }): Promise<CommitResult>;
  listDrafts(context: ContextHandle): Promise<{ kind: 'drafts'; drafts: RecoveryDraft[] } | Failure>;
  resumeCapture(input: { context: ContextHandle; draftId: string }): Promise<CaptureResult>;
  discardDraft(input: { context: ContextHandle; draftId: string }): Promise<CaptureResult>;
  dispose(): void;
}
