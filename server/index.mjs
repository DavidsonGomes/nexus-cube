import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const PORT = Number(process.env.PORT ?? 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
if (!DATABASE_URL || !JWT_SECRET) { console.error('DATABASE_URL e JWT_SECRET sao obrigatorios.'); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 10 });

const SCHEMA = `
create table if not exists users(
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists account_state(
  user_id uuid primary key references users(id) on delete cascade,
  data jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
create table if not exists solves(
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  session_id text not null,
  mode text,
  raw_ms integer not null,
  penalty text not null,
  scramble text not null,
  note text not null default '',
  source text not null,
  created_at timestamptz not null
);
create index if not exists solves_user_created_idx on solves(user_id, created_at);
`;

const app = express();
app.use(express.json({ limit: '4mb' }));

const sign = user => jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '90d' });
const publicUser = row => ({ id: row.id, email: row.email });

function authenticated(request, response, next) {
  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return response.status(401).json({ error: 'Sessão ausente. Entre novamente.' });
  try { request.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { response.status(401).json({ error: 'Sessão expirada. Entre novamente.' }); }
}

const normalizedEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validCredentials = (email, password) => /.+@.+\..+/.test(email) && typeof password === 'string' && password.length >= 8 && password.length <= 200;

function validState(data) {
  return data && data.version === 3 && Array.isArray(data.sessions) && Array.isArray(data.solves)
    && Array.isArray(data.studyAttempts) && typeof data.settings === 'object' && data.solves.length <= 200000
    && Buffer.byteLength(JSON.stringify(data)) <= 3 * 1024 * 1024;
}

async function replaceSolves(client, userId, solves) {
  const ids = solves.map(solve => String(solve.id));
  await client.query('delete from solves where user_id=$1 and not (id = any($2::text[]))', [userId, ids]);
  for (const solve of solves) {
    await client.query(
      `insert into solves(id,user_id,session_id,mode,raw_ms,penalty,scramble,note,source,created_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict(id) do update set session_id=excluded.session_id,mode=excluded.mode,raw_ms=excluded.raw_ms,penalty=excluded.penalty,scramble=excluded.scramble,note=excluded.note,source=excluded.source,created_at=excluded.created_at`,
      [String(solve.id), userId, String(solve.sessionId), solve.mode ?? null, Math.trunc(solve.rawMs), String(solve.penalty), String(solve.scramble), String(solve.note ?? ''), String(solve.source), new Date(solve.createdAt)]
    );
  }
}

app.post('/api/auth/register', async (request, response) => {
  const email = normalizedEmail(request.body?.email);
  const password = request.body?.password;
  if (!validCredentials(email, password)) return response.status(400).json({ error: 'Informe um email válido e uma senha com pelo menos 8 caracteres.' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query('insert into users(email,password_hash) values($1,$2) returning id,email', [email, hash]);
    const user = result.rows[0];
    response.json({ token: sign(user), user: publicUser(user) });
  } catch (error) {
    if (error.code === '23505') return response.status(400).json({ error: 'Este email já tem conta. Entre com sua senha.' });
    throw error;
  }
});

app.post('/api/auth/login', async (request, response) => {
  const email = normalizedEmail(request.body?.email);
  const result = await pool.query('select id,email,password_hash from users where email=$1', [email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(String(request.body?.password ?? ''), user.password_hash))) return response.status(401).json({ error: 'Email ou senha incorretos.' });
  response.json({ token: sign(user), user: publicUser(user) });
});

app.get('/api/session', authenticated, async (request, response) => {
  const user = await pool.query('select id,email from users where id=$1', [request.user.sub]);
  if (!user.rows[0]) return response.status(401).json({ error: 'Conta não encontrada. Entre novamente.' });
  const state = await pool.query('select data,revision from account_state where user_id=$1', [request.user.sub]);
  response.json({ user: publicUser(user.rows[0]), data: state.rows[0]?.data ?? null, revision: Number(state.rows[0]?.revision ?? 0) });
});

app.put('/api/state', authenticated, async (request, response) => {
  const { data, expectedRevision } = request.body ?? {};
  if (!validState(data) || !Number.isInteger(expectedRevision)) return response.status(400).json({ error: 'Estado inválido.' });
  const client = await pool.connect();
  try {
    await client.query('begin');
    const current = await client.query('select revision from account_state where user_id=$1 for update', [request.user.sub]);
    const revision = Number(current.rows[0]?.revision ?? 0);
    if (revision !== expectedRevision) { await client.query('rollback'); return response.status(409).json({ error: 'Os dados mudaram em outro dispositivo. Recarregue antes de gravar.', revision }); }
    const next = revision + 1;
    await client.query(
      'insert into account_state(user_id,data,revision,updated_at) values($1,$2,$3,now()) on conflict(user_id) do update set data=$2,revision=$3,updated_at=now()',
      [request.user.sub, data, next]
    );
    await replaceSolves(client, request.user.sub, data.solves);
    await client.query('commit');
    response.json({ revision: next });
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally { client.release(); }
});

app.get('/api/health', async (_request, response) => {
  await pool.query('select 1');
  response.json({ ok: true });
});

app.use((error, _request, response, _next) => {
  console.error(new Date().toISOString(), error.message);
  response.status(500).json({ error: 'Falha do servidor. Tente novamente.' });
});

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
app.use(express.static(distDir));
app.get(/^(?!\/api\/).*/, (_request, response) => response.sendFile(join(distDir, 'index.html')));

await pool.query(SCHEMA);
app.listen(PORT, '0.0.0.0', () => console.log(`nexus-cube api on :${PORT}`));
