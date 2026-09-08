import { createCloudServiceWithPorts } from './service';
import { createIndexedDBCloudStore } from './storage';
import { createSupabaseAuthFactory } from './supabase';
import type { StorageLike } from '../data';
export * from './types';
export * from './sync-types';
export { createCloudServiceWithPorts, type CloudServicePorts } from './service';
export { createIndexedDBCloudStore, createMemoryCloudStore, initialCloudState, type CloudAtomicStore, type CloudState } from './storage';

export interface CloudOptions { url?: string; publishableKey?: string; redirectTo?: string; guestStorage?: StorageLike; syncEnabled?: boolean }
export function createCloudService(options: CloudOptions = {}) {
  let configured = false;
  const projectRef = 'xckxvxpiqgwqwoywtnqs';
  let url = '';
  try {
    const parsed = new URL(options.url ?? '');
    configured = parsed.protocol === 'https:' && parsed.hostname === 'xckxvxpiqgwqwoywtnqs.supabase.co' && !!options.publishableKey && !options.publishableKey.startsWith('sb_secret_');
    if (configured) url = parsed.origin;
  } catch { /* Missing configuration keeps guest usable. */ }
  return createCloudServiceWithPorts({ projectRef, configured, syncEnabled: options.syncEnabled === true, authFactory: configured ? createSupabaseAuthFactory(url, options.publishableKey!) : () => { throw new Error('Autenticação indisponível.'); }, store: createIndexedDBCloudStore(projectRef), guestStorage: options.guestStorage, redirectTo: options.redirectTo ?? (typeof location === 'undefined' ? 'http://localhost:3000/' : `${location.origin}${location.pathname}`) });
}
