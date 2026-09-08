import type { AppData, Solve, SolveCapture } from '../domain/types';
import type { CaptureInputResult, CloudIdentity } from './types';

export interface StoredDraft { id: string; capabilityId: string; userId: string | null; generation: number; capture: SolveCapture; source?: 'timer' | 'manual'; state: 'armed' | 'completed' | 'committed' | 'cancelled'; result: CaptureInputResult | null; solve?: Solve | null }
export interface CloudState {
  version: 1;
  generation: number;
  gate: 'guest' | 'locked' | 'active' | 'recovery';
  user: CloudIdentity | null;
  authInstance: string | null;
  allowedAuth: string[];
  auth: Record<string, string>;
  flow: { id: string; instance: string; generation: number; kind: 'signup' | 'recovery'; expiresAt: number; user: CloudIdentity | null; consumed: boolean } | null;
  accounts: Record<string, { data: AppData; revision: number }>;
  guest: { data: AppData; revision: number } | null;
  guestError: string | null;
  drafts: Record<string, StoredDraft>;
}
export const initialCloudState = (): CloudState => ({ version: 1, generation: 0, gate: 'guest', user: null, authInstance: null, allowedAuth: [], auth: {}, flow: null, accounts: {}, guest: null, guestError: null, drafts: {} });
export interface CloudAtomicStore {
  read(): Promise<CloudState>;
  /** Callback is synchronous. Success resolves only after transaction completion. */
  transact<T>(change: (state: CloudState) => T): Promise<T>;
  subscribe(listener: () => void): () => void;
  close(): void;
}

export function createIndexedDBCloudStore(projectRef: string): CloudAtomicStore {
  const listeners = new Set<() => void>();
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`nexus-cloud:${projectRef}`);
  let dbPromise: Promise<IDBDatabase> | null = null;
  let closed = false;
  const notify = () => { for (const listener of listeners) listener(); };
  if (channel) channel.onmessage = notify;
  function db(): Promise<IDBDatabase> {
    if (closed) return Promise.reject(new Error('Armazenamento fechado.'));
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponível.')); return; }
      const request = indexedDB.open(`nexus-cloud:${projectRef}`, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onerror = () => { dbPromise = null; reject(request.error); };
      request.onblocked = () => { reject(new Error('Feche a outra aba para atualizar o armazenamento.')); };
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    });
    return dbPromise;
  }
  async function run<T>(mode: IDBTransactionMode, change: (state: CloudState) => T): Promise<T> {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('state', mode);
      const objectStore = tx.objectStore('state');
      const request = objectStore.get('root');
      let result: T;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const state = (request.result ?? initialCloudState()) as CloudState;
          if (state.version !== 1) throw new Error('Versão de armazenamento não suportada.');
          result = change(state);
          if (mode === 'readwrite') objectStore.put(state, 'root');
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Gravação cancelada.'));
      tx.onerror = () => { /* onabort reports the transaction failure. */ };
      tx.oncomplete = () => { if (mode === 'readwrite') { notify(); channel?.postMessage('changed'); } resolve(result!); };
    });
  }
  return { read: () => run('readonly', state => state), transact: change => run('readwrite', change), subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, close: () => { closed = true; channel?.close(); void dbPromise?.then(database => database.close()); listeners.clear(); } };
}

/** Test seam, never the browser persistence fallback. */
export function createMemoryCloudStore(seed: CloudState = initialCloudState()): CloudAtomicStore {
  let state = structuredClone(seed);
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  return {
    read: async () => { await queue; return structuredClone(state); },
    transact: <T>(change: (draft: CloudState) => T): Promise<T> => {
      const pending = queue.then(() => { const draft = structuredClone(state); const result = change(draft); state = draft; for (const listener of listeners) listener(); return result; });
      queue = pending.catch(() => undefined); return pending;
    },
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    close: () => listeners.clear(),
  };
}
