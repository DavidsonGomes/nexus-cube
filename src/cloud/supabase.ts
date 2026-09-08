import { createClient, isAuthApiError, isAuthSessionMissingError, type Session, type User } from '@supabase/supabase-js';
import type { AuthDriverFactory, CloudIdentity } from './types';
import { AuthSessionInvalidError } from './types';

export function classifyAuthError(error: unknown): unknown {
  if (isAuthSessionMissingError(error) || (isAuthApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 429 && ['session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used', 'bad_jwt', 'user_not_found', 'user_banned'].includes(error.code ?? ''))) return new AuthSessionInvalidError();
  return error;
}

const identity = (user: User): CloudIdentity => {
  if (user.is_anonymous) throw new Error('Conta anônima não suportada.');
  return { id: user.id, email: user.email ?? null };
};

/** Each generation/flow has its own SDK client and storage namespace. */
export function createSupabaseAuthFactory(url: string, publishableKey: string): AuthDriverFactory {
  return ({ storage, storageKey }) => {
    const client = createClient(url, publishableKey, { auth: { storage, storageKey, flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true } });
    let session: Session | null = null;
    const listeners = new Set<(event: string) => void>();
    const subscription = client.auth.onAuthStateChange((event, current) => { session = current; for (const listener of listeners) listener(event); }).data.subscription;
    async function verified(): Promise<CloudIdentity | null> {
      const { data, error } = await client.auth.getUser();
      if (error) throw classifyAuthError(error);
      if (!data.user) return null;
      const local = await client.auth.getSession();
      session = local.data.session;
      return identity(data.user);
    }
    return {
      signUp: async (email, password, redirectTo) => { const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } }); if (error) throw error; session = data.session; return data.session ? verified() : null; },
      signIn: async (email, password) => { const { data, error } = await client.auth.signInWithPassword({ email, password }); if (error) throw error; session = data.session; const user = await verified(); if (!user) throw new Error('Sessão indisponível.'); return user; },
      getUser: verified,
      resetPassword: async (email, redirectTo) => { const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo }); if (error) throw error; },
      exchangeCode: async code => { const { data, error } = await client.auth.exchangeCodeForSession(code); if (error) throw error; session = data.session; const user = await verified(); if (!user) throw new Error('Sessão indisponível.'); return user; },
      updatePassword: async password => { const { error } = await client.auth.updateUser({ password }); if (error) throw error; },
      // The local gate has already removed SDK storage. Revocation uses only the
      // captured access token of this instance, never another account's session.
      signOut: async () => {
        const token = session?.access_token;
        if (!token) throw new Error('Revogação remota não confirmada.');
        const response = await fetch(`${url}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: publishableKey, Authorization: `Bearer ${token}` }, cache: 'no-store' });
        session = null;
        if (!response.ok) throw new Error('Revogação remota não confirmada.');
      },
      refresh: async () => { const { data, error } = await client.auth.refreshSession(); if (error) throw classifyAuthError(error); session = data.session; return verified(); },
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      dispose: () => { subscription.unsubscribe(); void client.auth.stopAutoRefresh(); listeners.clear(); },
    };
  };
}
