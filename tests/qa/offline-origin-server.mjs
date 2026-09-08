// Harness QA. Iniciar somente quando Mestre/Infra autorizar a fase de producao.
import http from 'node:http';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const root = resolve(repoRoot, 'dist');
const flag = resolve(repoRoot, 'tests/qa/origin-unavailable.flag');
const port = Number(process.env.QA_ORIGIN_PORT ?? 3101);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const log = (event, fields = {}) => process.stdout.write(JSON.stringify({ at: new Date().toISOString(), event, pid: process.pid, ...fields }) + '\n');
const unavailable = () => existsSync(flag);
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Build dist/index.html ausente. Aguardar build sob trava.');

const server = http.createServer(async (req, res) => {
  if (unavailable()) { log('refused-request', { method: req.method, url: req.url }); req.socket.destroy(); return; }
  try {
    if (!['GET', 'HEAD'].includes(req.method ?? '')) { res.writeHead(405); res.end(); return; }
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    if (pathname.includes('\0')) { res.writeHead(400); res.end(); return; }
    let path = resolve(root, '.' + pathname);
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    if (existsSync(path) && statSync(path).isDirectory()) path = resolve(path, 'index.html');
    if (!existsSync(path)) {
      // Rotas SPA sem extensao podem usar shell; asset faltante sempre 404.
      if (!extname(pathname) && req.headers.accept?.includes('text/html')) path = resolve(root, 'index.html');
      else { if (unavailable()) { req.socket.destroy(); return; } res.writeHead(404, { 'Cache-Control': 'no-store' }); res.end(); log('not-found', { url: req.url }); return; }
    }
    const body = await readFile(path);
    // Rechecar apos IO para flag ativada durante leitura; nenhuma resposta HTTP em falha.
    if (unavailable()) { log('refused-after-read', { url: req.url }); req.socket.destroy(); return; }
    res.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Content-Length': body.byteLength, 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' });
    res.end(req.method === 'HEAD' ? undefined : body); log('served', { method: req.method, url: req.url, bytes: body.byteLength });
  } catch (error) {
    if (unavailable()) { req.socket.destroy(); return; }
    if (!res.headersSent) res.writeHead(500, { 'Cache-Control': 'no-store' });
    res.end(); log('error', { message: String(error), url: req.url });
  }
});
server.on('connection', socket => {
  if (unavailable()) { log('refused-connection'); socket.destroy(); }
});
server.on('error', error => { log('server-error', { message: String(error) }); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => log('listening', { origin: `http://127.0.0.1:${port}`, root, flag, unavailable: unavailable() }));
