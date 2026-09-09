import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createInitialData } from '../../src/data';
import { migrateDataToV4, MAX_V4_SNAPSHOT_BYTES } from '../../src/data/imported-model';
import { toSyncAccountDataV4 } from '../../src/data/sync-projection-v4';
import { createSyncFrameV4 } from '../../src/data/sync-framing-v4';
import { syncEnvelopeDigestV4, type SyncEnvelopeV4 } from '../../src/cloud/sync-protocol-v4';

const migration = readFileSync('supabase/migrations/20260909004516_sync_v4_staging.sql', 'utf8');
const owner = 'a1000000-0000-0000-0000-000000000001', other = 'b1000000-0000-0000-0000-000000000002';
const epoch = 'e1000000-0000-0000-0000-000000000001';
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const json = (value: unknown) => `${quote(JSON.stringify(value))}::jsonb`;
const claims = (id: string) => `select set_config('request.jwt.claims',${quote(JSON.stringify({ sub: id, role: 'authenticated', is_anonymous: false }))},true);select set_config('request.jwt.claim.sub',${quote(id)},true);`;
async function frame() {
  const value = await createSyncFrameV4(toSyncAccountDataV4(migrateDataToV4(createInitialData())));
  const parts = []; for await (const fragment of value.fragments) parts.push(fragment);
  const input: Omit<SyncEnvelopeV4, 'requestDigest'> = { protocolVersion: 4, operationId: 'c1000000-0000-0000-0000-000000000001', kind: 'upgrade-v3', base: { domainVersion: 3, epoch, revision: '0' }, manifest: value.manifest };
  const envelope: SyncEnvelopeV4 = { ...input, requestDigest: await syncEnvelopeDigestV4(input) };
  return { envelope, parts, key: { operationId: envelope.operationId, requestDigest: envelope.requestDigest } };
}
function sql(body: string) {
  // Local bootstrap lacks hosted service_role. Substitute that name ONLY with a
  // private QA role created and removed by this rollback. Not a fresh hosted run.
  const source = `begin; create role elo_qa_sync4_service nologin bypassrls;
    ${migration.replace(/^begin;$/m, '').replace(/^commit;$/m, '')}
    insert into nexus_private.accounts(owner,epoch) values('${owner}','${epoch}'),('${other}','${other}');
    ${claims(owner)} ${body} rollback;`.replaceAll('service_role','elo_qa_sync4_service');
  const result = spawnSync('/opt/homebrew/opt/libpq/bin/psql', ['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55432','-U','postgres','-d','nexus_sync_qa'], { input: source, encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
}

test('SQL4 stores exact framed ASCII once, isolated by owner, without changing the S1 head', async () => {
  const { envelope, parts, key } = await frame();
  assert.ok(parts.length > 0); assert.ok(migration.includes(String(MAX_V4_SNAPSHOT_BYTES * 64)));
  const chunks = parts.map(p => ({ ...key, index: p.index, offset: p.offset, text: new TextDecoder().decode(p.bytes), sha256: p.sha256 }));
  sql(`set local role authenticated;
    do $qa$ declare result jsonb; begin
      result:=public.nexus_sync4_status('{}');
      if result#>>'{head,domainVersion}'<>'3' or result#>>'{head,epoch}'<>'${epoch}' then raise exception 'head mismatch'; end if;
      result:=public.nexus_sync4_begin(${json(envelope)});
      if result->>'kind'<>'staged' or (result->>'expiresAt')::numeric<>trunc((result->>'expiresAt')::numeric) then raise exception 'stage mismatch'; end if;
      ${chunks.map(c => `if public.nexus_sync4_chunk(${json(c)})->>'kind'<>'chunk-stored' then raise exception 'chunk'; end if;`).join('\n')}
      if public.nexus_sync4_chunk(${json(chunks[0])})->>'kind'<>'chunk-stored' then raise exception 'retry'; end if;
    end $qa$;
    ${claims(other)}
    do $qa$ begin if public.nexus_sync4_cancel(${json(key)})->>'code'<>'not-found' then raise exception 'cross owner'; end if; end $qa$;
    reset role;
    do $qa$ begin
      if (select count(*) from nexus_sync4_private.fragments)<>${parts.length} then raise exception 'duplicate fragment'; end if;
      if (select revision from nexus_private.accounts where owner='${owner}')<>0 or (select history_bytes from nexus_private.accounts where owner='${owner}')<>0 then raise exception 'S1 changed'; end if;
    end $qa$;`);
});

test('SQL4 rejects malformed manifests, mismatched digest and corrupt chunks before persistence', async () => {
  const { envelope, parts, key } = await frame(); const p = parts[0];
  const invalid = { ...envelope, manifest: { ...envelope.manifest, totalBytes: null } };
  const badChunk = { ...key, index: 0, offset: 0, text: new TextDecoder().decode(p.bytes), sha256: '0'.repeat(64) };
  assert.notEqual(createHash('sha256').update(p.bytes).digest('hex'), badChunk.sha256);
  sql(`set local role authenticated; do $qa$ begin
    if public.nexus_sync4_begin(${json(invalid)})->>'code'<>'invalid' then raise exception 'null accepted'; end if;
    if public.nexus_sync4_begin(${json({ ...envelope, requestDigest: '0'.repeat(64) })})->>'code'<>'request-mismatch' then raise exception 'digest accepted'; end if;
    if public.nexus_sync4_begin(${json(envelope)})->>'kind'<>'staged' then raise exception 'stage'; end if;
    if public.nexus_sync4_chunk(${json(badChunk)})->>'code'<>'integrity-mismatch' then raise exception 'corrupt chunk'; end if;
  end $qa$; reset role;
  do $qa$ begin if exists(select 1 from nexus_sync4_private.fragments) then raise exception 'bad persisted'; end if; end $qa$;`);
});

test('SQL4 cancellation retains operation identity and expiry releases receiving slots without resurrection', async () => {
  const { envelope, key } = await frame();
  const next = async (suffix: string) => {
    const value = { ...envelope, operationId: `c1000000-0000-0000-0000-00000000000${suffix}` };
    value.requestDigest = await syncEnvelopeDigestV4(value); return value;
  };
  const second = await next('2'), third = await next('3');
  sql(`set local role authenticated; do $qa$ begin
    if public.nexus_sync4_begin(${json(envelope)})->>'kind'<>'staged' then raise exception 'stage'; end if;
    if public.nexus_sync4_begin(${json(second)})->>'kind'<>'staged' then raise exception 'second'; end if;
    if public.nexus_sync4_begin(${json(third)})->>'code'<>'stage-limit' then raise exception 'slot guard'; end if;
  end $qa$; reset role;
  update nexus_sync4_private.stages set expires_at=0 where operation_id='${second.operationId}';
  set local role authenticated; do $qa$ begin
    if public.nexus_sync4_begin(${json(third)})->>'kind'<>'staged' then raise exception 'expired slot retained'; end if;
    if public.nexus_sync4_begin(${json(second)})->>'code'<>'stage-expired' then raise exception 'expired resurrected'; end if;
    if public.nexus_sync4_cancel(${json(key)})->>'kind'<>'cancelled' then raise exception 'cancel'; end if;
    if public.nexus_sync4_cancel(${json(key)})->>'kind'<>'cancelled' then raise exception 'cancel retry'; end if;
    if public.nexus_sync4_begin(${json(envelope)})->>'code'<>'stage-expired' then raise exception 'resurrected'; end if;
  end $qa$; reset role;
  do $qa$ begin if (select count(*) from nexus_sync4_private.stages)<>3 then raise exception 'lost identity'; end if; end $qa$;`);
});

test('SQL4 closes table/helper ACL and leaves commit/read and account promotion unavailable', async () => {
  sql(`do $qa$ begin
    if has_table_privilege('authenticated','nexus_sync4_private.stages','SELECT') or has_table_privilege('anon','nexus_sync4_private.fragments','INSERT') then raise exception 'table exposed'; end if;
    if has_function_privilege('anon','public.nexus_sync4_begin(jsonb)','EXECUTE') or has_function_privilege('service_role','public.nexus_sync4_begin(jsonb)','EXECUTE') then raise exception 'RPC ACL'; end if;
    if has_function_privilege('authenticated','nexus_sync4_private.valid_manifest(jsonb)','EXECUTE') then raise exception 'helper exposed'; end if;
    if to_regprocedure('public.nexus_sync4_commit(jsonb)') is not null or to_regprocedure('public.nexus_sync4_read(jsonb)') is not null then raise exception 'unreviewed commit exists'; end if;
    if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='nexus_sync4_private' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)) then raise exception 'RLS absent'; end if;
  end $qa$;`);
});
