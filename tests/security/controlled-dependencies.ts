import type { AuthDriver, AuthDriverFactory, AuthStorage, CloudIdentity } from '../../src/cloud/types';
import type { CloudAtomicStore, CloudState } from '../../src/cloud/storage';
import { QA_IDENTITIES } from './fixtures';

/** Independent transactional mock: abort never publishes the mutable draft. */
export class ControlledStore implements CloudAtomicStore {
  private state: CloudState = {
    version: 1, generation: 0, gate: 'guest', user: null, authInstance: null,
    allowedAuth: [], auth: {}, flow: null, accounts: {}, guest: null, guestError: null, drafts: {},
  };
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  failNextCommit = false;
  holdNextResult: Promise<void> | undefined;
  holdNextRead: { captured: () => void; release: Promise<void> } | undefined;
  writes = 0;
  constructor(seed?: CloudState) { if (seed) this.state = structuredClone(seed); }
  peek() { return structuredClone(this.state); }
  async read(): Promise<CloudState> {
    const hold = this.holdNextRead;
    this.holdNextRead = undefined;
    await this.queue;
    const observed = this.peek();
    if (hold) { hold.captured(); await hold.release; }
    return observed;
  }
  transact<T>(change: (state: CloudState) => T): Promise<T> {
    const held = this.holdNextResult;
    this.holdNextResult = undefined;
    const pending = this.queue.then(() => {
      const draft = this.peek();
      const result = change(draft);
      if (this.failNextCommit) {
        this.failNextCommit = false;
        throw new Error('Synthetic storage abort before commit');
      }
      this.state = draft;
      this.writes++;
      for (const listener of this.listeners) listener();
      return result;
    });
    this.queue = pending.catch(() => undefined);
    return held ? pending.then(async result => { await held; return result; }) : pending;
  }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  close() { this.listeners.clear(); }
}

/** Fakes only SDK responses. Identity/gate decisions remain in the product SUT. */
export class ControlledAuthDriver implements AuthDriver {
  identity: CloudIdentity | null = null;
  nextSignIn: Promise<CloudIdentity> | undefined;
  nextSignUp: Promise<CloudIdentity | null> | undefined;
  nextGetUser: Promise<CloudIdentity | null> | undefined;
  nextRefresh: Promise<CloudIdentity | null> | undefined;
  nextExchange: Promise<CloudIdentity> | undefined;
  nextPasswordUpdate: Promise<void> | undefined;
  failLogout = false;
  disposed = false;
  passwordUpdateIdentities: (string | null)[] = [];
  calls: string[] = [];
  private listeners = new Set<(event: string) => void>();
  constructor(readonly storage: AuthStorage, readonly storageKey: string) {}
  async signUp(email: string, _password: string, _redirect: string) {
    this.calls.push('signUp');
    this.identity = this.nextSignUp ? await this.nextSignUp : this.fromEmail(email);
    return this.identity;
  }
  async signIn(email: string, _password: string) {
    this.calls.push('signIn');
    this.identity = this.nextSignIn ? await this.nextSignIn : this.fromEmail(email);
    this.nextSignIn = undefined;
    return this.identity;
  }
  async getUser() { this.calls.push('getUser'); return this.nextGetUser ? await this.nextGetUser : this.identity; }
  async resetPassword(_email: string, _redirect: string) { this.calls.push('resetPassword'); }
  async exchangeCode(_code: string) {
    this.calls.push('exchangeCode');
    this.identity = this.nextExchange ? await this.nextExchange : { ...QA_IDENTITIES.a };
    return this.identity;
  }
  async updatePassword(_password: string) {
    this.calls.push('updatePassword');
    this.passwordUpdateIdentities.push(this.identity?.id ?? null);
    await this.nextPasswordUpdate;
  }
  async signOut() {
    this.calls.push('signOut');
    if (this.failLogout) throw new Error('Synthetic revocation unavailable');
    this.identity = null;
  }
  async refresh() { this.calls.push('refresh'); return this.nextRefresh ? await this.nextRefresh : this.identity; }
  subscribe(listener: (event: string) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(event: string) { for (const listener of this.listeners) listener(event); }
  dispose() { this.disposed = true; this.listeners.clear(); }
  private fromEmail(email: string): CloudIdentity {
    if (email === QA_IDENTITIES.a.email) return { ...QA_IDENTITIES.a };
    if (email === QA_IDENTITIES.b.email) return { ...QA_IDENTITIES.b };
    throw new Error('Unknown synthetic QA identity');
  }
}

export function controlledAuthFactory(configure?: (driver: ControlledAuthDriver, index: number) => void) {
  const drivers: ControlledAuthDriver[] = [];
  const factory: AuthDriverFactory = options => {
    const driver = new ControlledAuthDriver(options.storage, options.storageKey);
    configure?.(driver, drivers.length);
    drivers.push(driver);
    return driver;
  };
  return { factory, drivers };
}
