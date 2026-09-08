import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { offlinePlugin } from '../../scripts/pwa';

const APP_ORIGIN = 'https://app.example.invalid';
const AUTH_ORIGIN = 'https://auth.example.invalid';
const PUBLIC_BODY = '<main>Synthetic public app shell</main>';

/** Exercise the product generator only, without Vite/build, dist or network. */
async function generatedWorker(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'nexus-security-sw-'));
  try {
    await writeFile(join(directory, 'index.html'), PUBLIC_BODY);
    await writeFile(join(directory, 'asset.js'), '/* synthetic public asset */');
    const plugin = offlinePlugin();
    assert.equal(typeof plugin.configResolved, 'function');
    assert.equal(typeof plugin.closeBundle, 'function');
    Reflect.apply(plugin.configResolved as Function, {}, [{ root: directory, build: { outDir: '.' } }]);
    await Reflect.apply(plugin.closeBundle as Function, {}, []);
    return await readFile(join(directory, 'sw.js'), 'utf8');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

type FetchEvent = { request: Request; respondWith(response: Promise<Response>): void };
type InstallEvent = { waitUntil(work: Promise<void>): void };

async function workerHarness(source: string) {
  const listeners = new Map<string, Function>();
  const entries = new Map<string, string>();
  const cacheWrites: string[] = [];
  const networkRequests: string[] = [];
  let networkBody = 'synthetic-private-a';
  const key = (input: string | Request) => new URL(typeof input === 'string' ? input : input.url, APP_ORIGIN).href;
  const cache = {
    async addAll(urls: string[]) {
      for (const url of urls) {
        const normalized = key(url);
        assert.ok(['/index.html', '/asset.js'].includes(new URL(normalized).pathname), 'precache is only fixture assets');
        entries.set(normalized, new URL(normalized).pathname === '/index.html' ? PUBLIC_BODY : 'public-js');
        cacheWrites.push(normalized);
      }
    },
    async match(input: string | Request, options?: { ignoreSearch?: boolean }) {
      const url = new URL(key(input));
      if (options?.ignoreSearch) url.search = '';
      const body = entries.get(url.href);
      return body === undefined ? undefined : new Response(body);
    },
    async put(input: string | Request, response: Response) {
      cacheWrites.push(key(input));
      entries.set(key(input), await response.text());
    },
  };
  runInNewContext(source, {
    URL, Response,
    self: {
      location: { origin: APP_ORIGIN },
      addEventListener: (event: string, listener: Function) => listeners.set(event, listener),
      skipWaiting: async () => undefined,
      clients: { claim: async () => undefined },
    },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async (request: Request) => {
      networkRequests.push(request.url);
      return new Response(networkBody, { headers: { 'Cache-Control': 'no-store' } });
    },
  }, { timeout: 1000 });
  let installation: Promise<void> | undefined;
  const install = listeners.get('install');
  assert.ok(install);
  install({ waitUntil: work => { installation = work; } } satisfies InstallEvent);
  assert.ok(installation);
  await installation;
  const listener = listeners.get('fetch');
  assert.ok(listener);
  return {
    entries, cacheWrites, networkRequests,
    setNetworkBody(body: string) { networkBody = body; },
    async request(url: string, init: RequestInit = {}) {
      let response: Promise<Response> | undefined;
      listener({ request: new Request(url, init), respondWith: value => { response = value; } } satisfies FetchEvent);
      return response ? await response : undefined;
    },
  };
}

test('worker boundary: public assets keep an offline cache without personal content', async () => {
  const worker = await workerHarness(await generatedWorker());
  const result = await worker.request(`${APP_ORIGIN}/index.html`);
  assert.equal(await result?.text(), PUBLIC_BODY);
  assert.equal(worker.networkRequests.length, 0);
  assert.deepEqual([...worker.entries.keys()].sort(), [`${APP_ORIGIN}/asset.js`, `${APP_ORIGIN}/index.html`]);
});

test('worker boundary: foreign Auth/REST/recovery requests are not intercepted or cached', async () => {
  const worker = await workerHarness(await generatedWorker());
  for (const path of ['/auth/v1/user', '/auth/v1/token?grant_type=refresh_token', '/auth/v1/recover', '/rest/v1/private']) {
    assert.equal(await worker.request(`${AUTH_ORIGIN}${path}`, { headers: { Authorization: 'Bearer synthetic-only' } }), undefined);
  }
  assert.equal(worker.networkRequests.length, 0, 'worker performs no fetch for foreign requests');
  assert.equal(worker.cacheWrites.length, 2, 'only public precache writes');
});

test('worker boundary: same-origin personal requests bypass interception and leave public cache unchanged', async () => {
  const worker = await workerHarness(await generatedWorker());
  const publicEntries = [...worker.entries];
  for (const identity of ['a', 'b']) {
    worker.setNetworkBody(`synthetic-private-${identity}`);
    for (const path of ['/rest/v1/private', '/auth/v1/user', '/rpc/private', '/api/private', '/functions/private']) {
      assert.equal(await worker.request(`${APP_ORIGIN}${path}`, { headers: { Authorization: `Bearer synthetic-${identity}` } }), undefined, 'no respondWith: browser owns this request');
    }
  }
  assert.deepEqual(worker.networkRequests, [], 'worker must not fetch personal content');
  assert.equal(worker.cacheWrites.length, 2);
  assert.deepEqual([...worker.entries], publicEntries, 'cache keys AND bodies remain exactly the public precache');
  assert.equal(await (await worker.request(`${APP_ORIGIN}/index.html`))?.text(), PUBLIC_BODY);
});

test('worker boundary: callback query and POST bodies are not persisted in asset cache', async () => {
  const worker = await workerHarness(await generatedWorker());
  const publicEntries = [...worker.entries];
  for (const query of ['code=synthetic-code&state=synthetic-state', 'token_hash=synthetic-hash', 'access_token=synthetic-token']) {
    assert.equal(await worker.request(`${APP_ORIGIN}/index.html?${query}`), undefined, 'callback bypasses even an existing public cache entry');
  }
  assert.equal(await worker.request(`${APP_ORIGIN}/auth/v1/token`, { method: 'POST', body: 'synthetic-only' }), undefined);
  assert.deepEqual([...worker.entries], publicEntries, 'no callback URL, credential or response entered cache');
  assert.equal(await (await worker.request(`${APP_ORIGIN}/index.html`))?.text(), PUBLIC_BODY);
  assert.ok([...worker.entries.keys()].every(url => !new URL(url).search));
  assert.equal(worker.cacheWrites.length, 2);
  assert.equal(worker.networkRequests.length, 0);
});
