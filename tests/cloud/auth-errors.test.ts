import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthApiError, AuthSessionMissingError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { classifyAuthError } from '../../src/cloud/supabase';
import { AuthSessionInvalidError } from '../../src/cloud/types';

test('SDK codes distinguish proven invalid sessions from transport and rate limits', () => {
  for (const code of ['session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used', 'bad_jwt', 'user_not_found', 'user_banned'] as const) {
    assert.ok(classifyAuthError(new AuthApiError('synthetic', 400, code)) instanceof AuthSessionInvalidError);
  }
  assert.ok(classifyAuthError(new AuthSessionMissingError()) instanceof AuthSessionInvalidError);
  for (const error of [new Error('refresh_token_not_found'), new AuthRetryableFetchError('network', 503), new AuthApiError('limited', 429, 'over_request_rate_limit'), new AuthApiError('contradictory', 429, 'session_not_found'), new AuthApiError('unavailable', 503, 'unexpected_failure'), new AuthApiError('login', 400, 'invalid_credentials')]) {
    assert.equal(classifyAuthError(error), error);
  }
});
