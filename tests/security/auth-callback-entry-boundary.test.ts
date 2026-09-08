import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Published clone/candidate runs from cwd; an explicit root override remains optional.
const root = process.env.NEXUS_SECURITY_RECOVERY_CANDIDATE || process.cwd();
const expected = '8ccb92d05e5d976191608ed215f54c6c0ef178dc81210b991553b631c7c85fed';
type CallbackReader = (url: URL) => { callbackUrl: string; cleanPath: string } | null;

for (const hasResponse of [false, true]) {
  test(`recovery entry security: module ${hasResponse ? 'scrubs response before effects' : 'leaves clean reload alone'}`, async t => {
    const file = resolve(root, 'src/components/AppContext.tsx');
    const hash = () => createHash('sha256').update(readFileSync(file)).digest('hex');
    assert.equal(hash(), expected);
    const oldLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
    const oldHistory = Object.getOwnPropertyDescriptor(globalThis, 'history');
    const query = hasResponse ? '?view=recovery&code=synthetic-only&code=second&cloud_flow=synthetic-flow#refresh_token=synthetic-only' : '?view=recovery#help';
    const original = `https://example.invalid/auth/callback${query}`;
    const changes: unknown[][] = [];
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { href: original } });
    Object.defineProperty(globalThis, 'history', { configurable: true, value: { replaceState: (...args: unknown[]) => { changes.push(args); } } });
    t.after(() => {
      if (oldLocation) Object.defineProperty(globalThis, 'location', oldLocation); else Reflect.deleteProperty(globalThis, 'location');
      if (oldHistory) Object.defineProperty(globalThis, 'history', oldHistory); else Reflect.deleteProperty(globalThis, 'history');
    });
    // Distinct module URL exercises the actual top-level capture/scrub wiring.
    const entry = await import(`${pathToFileURL(file).href}?security-entry=${hasResponse}`) as { readAuthCallback: CallbackReader };
    assert.equal(typeof entry.readAuthCallback, 'function');
    assert.deepEqual(changes, hasResponse ? [[null, '', '/auth/callback?view=recovery']] : []);
    assert.equal(entry.readAuthCallback(new URL('https://example.invalid/auth/callback?view=recovery#help')), null);
    if (hasResponse) {
      const supplied = new URL(original);
      const result = entry.readAuthCallback(supplied);
      assert.deepEqual(result, { callbackUrl: original, cleanPath: '/auth/callback?view=recovery' });
      assert.equal(supplied.href, original, 'The caller URL stays intact for explicit handler validation');
      assert.equal(entry.readAuthCallback(new URL(result!.cleanPath, supplied.origin)), null);
      for (const suffix of ['?code=', '?cloud_flow=only-flow', '#error=denied&error_description=synthetic', '#token_hash=synthetic&type=recovery']) {
        const url = new URL(`https://example.invalid/auth/callback${suffix}`);
        assert.deepEqual(entry.readAuthCallback(url), { callbackUrl: url.href, cleanPath: '/auth/callback' });
      }
    }
    assert.equal(hash(), expected);
  });
}
