import test from 'node:test';
import assert from 'node:assert/strict';
import { readAuthCallback } from '../../src/components/AppContext';

const origin = 'https://synthetic.example';

test('clean callback reload does not replay an Auth exchange', () => {
  for (const path of ['/auth/callback', '/auth/callback?view=recovery', '/auth/callback#help', '/']) {
    assert.equal(readAuthCallback(new URL(path, origin)), null, path);
  }
});

test('PKCE response is captured intact once and the visible URL is scrubbed', () => {
  const url = new URL('/auth/callback?view=recovery&code=synthetic-code&cloud_flow=synthetic-flow#access_token=synthetic-token', origin);
  const original = url.href;
  const callback = readAuthCallback(url);
  assert.ok(callback);
  assert.equal(callback.callbackUrl, original);
  assert.equal(callback.cleanPath, '/auth/callback?view=recovery');
  assert.equal(url.href, original, 'does not mutate the supplied URL');
  assert.equal(readAuthCallback(new URL(callback.cleanPath, origin)), null, 'clean reload has no response to consume');
});

test('malformed and error responses still reach the real Auth handler for rejection', () => {
  for (const query of ['?code=synthetic-without-flow', '?cloud_flow=synthetic-without-code', '?code=', '?error=access_denied&error_description=synthetic', '#error=access_denied&error_description=synthetic', '#token_hash=synthetic&type=recovery']) {
    const url = new URL('/auth/callback' + query, origin);
    const callback = readAuthCallback(url);
    assert.ok(callback, query);
    assert.equal(callback.callbackUrl, url.href);
    assert.equal(callback.cleanPath, '/auth/callback');
  }
});

