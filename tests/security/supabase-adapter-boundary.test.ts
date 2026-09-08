import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import { classifyAuthError, createSupabaseAuthFactory } from '../../src/cloud/supabase';
import { AuthSessionInvalidError } from '../../src/cloud/types';
import { QA_IDENTITIES } from './fixtures';

// Independent matrix based on the SDK error types and published Auth error codes.
// https://supabase.com/docs/guides/auth/debugging/error-codes
test('SDK classification: specific invalid-session API codes and missing session are terminal', () => {
  for (const code of ['session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used', 'bad_jwt', 'user_not_found', 'user_banned']) {
    assert.ok(classifyAuthError(new AuthApiError('synthetic', 401, code)) instanceof AuthSessionInvalidError, code);
  }
  assert.ok(classifyAuthError(new AuthSessionMissingError()) instanceof AuthSessionInvalidError);
});

test('SDK classification: transport, rate limit, server failure and unrelated API errors are not invalid sessions', () => {
  for (const error of [
    new TypeError('Synthetic fetch failed'), new Error('session_not_found'),
    new AuthRetryableFetchError('synthetic', 503),
    new AuthApiError('synthetic', 429, 'over_request_rate_limit'),
    new AuthApiError('synthetic', 500, 'session_not_found'),
    new AuthApiError('synthetic', 400, 'invalid_credentials'),
    new AuthApiError('synthetic', 403, 'insufficient_aal'),
  ]) assert.equal(classifyAuthError(error), error);
});

test('SDK classification: a contradictory invalid-session code cannot override HTTP 429', () => {
  const error = new AuthApiError('synthetic', 429, 'session_not_found');
  assert.equal(classifyAuthError(error), error, '429 must remain retryable even with a contradictory body');
});

for (const status of [200, 403]) {
  test(`SDK logout: captured A token survives removed storage; HTTP ${status} determines confirmation`, async t => {
    const origin = 'https://synthetic-auth.example.invalid';
    const user = { ...QA_IDENTITIES.a, aud: 'authenticated', role: 'authenticated', created_at: '2026-09-08T12:00:00.000Z', app_metadata: {}, user_metadata: {} };
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800 })).toString('base64url'), 'synthetic-signature'].join('.');
    const requests: { pathname: string; method: string; authorization: string | null; cache: RequestCache | undefined }[] = [];
    t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      assert.equal(url.origin, origin, 'no real target or fallback network');
      requests.push({ pathname: url.pathname + url.search, method: init?.method ?? 'GET', authorization: new Headers(init?.headers).get('authorization'), cache: init?.cache });
      if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') return Response.json({ access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user });
      if (url.pathname === '/auth/v1/user') return Response.json(user);
      if (url.pathname === '/auth/v1/logout') return new Response(null, { status });
      assert.fail(`Unexpected synthetic SDK route ${url.pathname}`);
    });
    const persisted = new Map<string, string>();
    const driver = createSupabaseAuthFactory(origin, 'synthetic-publishable-key')({ storageKey: `security-logout-${status}`, storage: {
      getItem: async key => persisted.get(key) ?? null,
      setItem: async (key, value) => { persisted.set(key, value); },
      removeItem: async key => { persisted.delete(key); },
    } });
    t.after(() => driver.dispose());
    assert.deepEqual(await driver.signIn(user.email, 'synthetic-password'), QA_IDENTITIES.a);
    assert.ok(persisted.size > 0);
    persisted.clear(); // Model durable gate removing SDK storage before remote revocation.
    if (status === 200) await driver.signOut();
    else await assert.rejects(driver.signOut());
    assert.deepEqual(requests.filter(request => request.pathname.startsWith('/auth/v1/logout')), [{
      pathname: '/auth/v1/logout?scope=local', method: 'POST', authorization: `Bearer ${token}`, cache: 'no-store',
    }]);
    assert.equal(persisted.size, 0, 'logout cannot recreate the cleared token store');
  });
}

test('SDK logout: missing captured session cannot report remote confirmation', async t => {
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('No session means no revocation request'); });
  const driver = createSupabaseAuthFactory('https://synthetic-auth.example.invalid', 'synthetic-publishable-key')({
    storageKey: 'security-no-session', storage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
  });
  t.after(() => driver.dispose());
  await assert.rejects(driver.signOut());
});
