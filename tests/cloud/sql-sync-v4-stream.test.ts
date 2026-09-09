import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { syncEnvelopeDigestV4, type SyncEnvelopeV4 } from '../../src/cloud/sync-protocol-v4';

const files = ['20260909004516_sync_v4_staging.sql', '20260909012039_sync_v4_stream_validation.sql'];
const migration = files.map(file => readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^begin;$/m, '').replace(/^commit;$/m, '')).join('\n');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const raw = (bytes: Uint8Array) => `decode('${Buffer.from(bytes).toString('hex')}','hex')`;
const json = (value: unknown) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const A = 'a4000000-0000-0000-0000-000000000001', B = 'b4000000-0000-0000-0000-000000000002';
const claims = (id: string) => `select set_config('request.jwt.claims',${json({ sub: id, role: 'authenticated', is_anonymous: false })}::text,true);select set_config('request.jwt.claim.sub','${id}',true);`;

function run(body: string) {
  const sql = `begin; create role elo_qa_sync4_service nologin bypassrls; ${migration}
    set local statement_timeout='12s'; ${body} rollback;`.replaceAll('service_role', 'elo_qa_sync4_service');
  const result = spawnSync('/opt/homebrew/opt/libpq/bin/psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '55432', '-U', 'postgres', '-d', 'nexus_sync_qa'],
    { input: sql, encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('SQL incremental SHA matches independent Node vectors across padding and chunk boundaries', () => {
  const vectors = [Buffer.alloc(0), Buffer.from('abc'), Buffer.from('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')];
  for (let n = 0; n <= 192; n++) vectors.push(Buffer.from(Array.from({ length: n }, (_, i) => (i * 71 + n) & 255)));
  const checks = vectors.map((bytes, index) => `
    payload:=${raw(bytes)};
    foreach step in array array[1,55,56,63,64,65,32768] loop
      state:=nexus_sync4_private.sha256_init();pos:=1;
      while pos<=octet_length(payload) loop
        state:=nexus_sync4_private.sha256_update(state,substring(payload from pos for step));pos:=pos+step;
      end loop;
      if nexus_sync4_private.sha256_final(state)<>'${sha(bytes)}' or state.total_bytes<>${bytes.length}
        or octet_length(state.tail)>=64 then raise exception 'vector ${index}, step %',step;end if;
      if nexus_sync4_private.sha256_final(state)<>nexus_sync4_private.sha256_final(state) then raise exception 'final mutates';end if;
    end loop;`).join('\n');
  run(`do $qa$ declare state nexus_sync4_private.sha256_state;payload bytea;pos integer;step integer;begin ${checks} end $qa$;`);
});

test('SQL incremental SHA bounds state/input and keeps helpers unavailable to API roles', () => {
  run(`do $qa$ declare state nexus_sync4_private.sha256_state;begin
    state:=nexus_sync4_private.sha256_init();
    begin perform nexus_sync4_private.sha256_update(state,decode(repeat('00',32769),'hex'));raise exception 'oversize accepted';exception when invalid_parameter_value then null;end;
    begin perform nexus_sync4_private.sha256_update(state,null);raise exception 'null accepted';exception when invalid_parameter_value then null;end;
    state.tail:=decode(repeat('00',64),'hex');
    begin perform nexus_sync4_private.sha256_final(state);raise exception 'tail accepted';exception when invalid_parameter_value then null;end;
    state:=nexus_sync4_private.sha256_init();state.total_bytes:=1;
    begin perform nexus_sync4_private.sha256_update(state,''::bytea);raise exception 'unaligned accepted';exception when invalid_parameter_value then null;end;
    state:=nexus_sync4_private.sha256_init();state.words[1]:=null;
    begin perform nexus_sync4_private.sha256_final(state);raise exception 'word accepted';exception when invalid_parameter_value then null;end;
    state:=nexus_sync4_private.sha256_init();state.total_bytes:=9007199254740991;state.tail:=decode(repeat('00',63),'hex');
    begin perform nexus_sync4_private.sha256_update(state,decode('00','hex'));raise exception 'overflow accepted';exception when invalid_parameter_value then null;end;
    if has_function_privilege('authenticated','nexus_sync4_private.sha256_init()','execute')
      or has_function_privilege('anon','nexus_sync4_private.sha256_init()','execute')
      or has_function_privilege('elo_qa_sync4_service','nexus_sync4_private.sha256_init()','execute')
      or not has_function_privilege('nexus_sync_writer','nexus_sync4_private.sha256_init()','execute') then raise exception 'ACL';end if;
  end $qa$;`);
});

test('SQL incremental SHA measures a 200 KiB stream without a whole-stream accumulator', () => {
  const part = Buffer.from(Array.from({ length: 32768 }, (_, i) => (i * 131 + 11) & 255));
  const bytes = Buffer.concat([...Array.from({ length: 6 }, () => part), part.subarray(0, 8192)]);
  assert.equal(bytes.length, 204800);
  const output = run(`do $qa$ declare state nexus_sync4_private.sha256_state:=nexus_sync4_private.sha256_init();part bytea:=${raw(part)};i integer;begin
    for i in 1..6 loop state:=nexus_sync4_private.sha256_update(state,part);end loop;
    state:=nexus_sync4_private.sha256_update(state,substring(part from 1 for 8192));
    if state.total_bytes<>204800 or nexus_sync4_private.sha256_final(state)<>'${sha(bytes)}' then raise exception 'stream digest';end if;
  end $qa$;select 'bounded-200KiB-ok';`);
  assert.ok(output.includes('bounded-200KiB-ok'));
});

async function stagedFixture(wrongManifestHash = false) {
  // Deliberately not a domain4 JSON document: transport integrity must never be
  // confused with a schema/refs/commit result.
  const bytes = Buffer.from('abcdef0123456789'.repeat(12800));
  const manifest = { protocolVersion: 4 as const, domainVersion: 4 as const, canonicalVersion: 1 as const, wireVersion: 1 as const,
    encoding: 'canonical-json-ascii' as const, totalBytes: bytes.length, fragmentBytes: 32768, fragmentCount: 7, sha256: wrongManifestHash ? '0'.repeat(64) : sha(bytes) };
  const input: Omit<SyncEnvelopeV4, 'requestDigest'> = { protocolVersion: 4, operationId: 'c4000000-0000-0000-0000-000000000001', kind: 'upgrade-v3', base: { domainVersion: 3, epoch: A, revision: '0' }, manifest };
  const envelope = { ...input, requestDigest: await syncEnvelopeDigestV4(input) };
  const key = { operationId: envelope.operationId, requestDigest: envelope.requestDigest };
  const chunks = Array.from({ length: 7 }, (_, index) => {
    const part = bytes.subarray(index * 32768, (index + 1) * 32768);
    return `select public.nexus_sync4_chunk(${json({ ...key, index, offset: index * 32768, text: part.toString('ascii'), sha256: sha(part) })});`;
  });
  const setup = `insert into nexus_private.accounts(owner,epoch) values('${A}','${A}'),('${B}','${B}');${claims(A)}
    set local role authenticated;select public.nexus_sync4_begin(${json(envelope)});reset role;`;
  return { setup, key, chunks };
}

test('SQL transport cursor pauses at gaps, resumes bounded steps and replays without hashing twice', async () => {
  const f = await stagedFixture();
  run(`${f.setup} set local role authenticated;${f.chunks.slice(1).join('\n')}reset role;set local role nexus_sync_writer;
    do $qa$ declare result jsonb;begin
      result:=nexus_sync4_private.advance_transport(${json(f.key)});
      if result->>'kind'<>'transport-pending' or result->>'nextIndex'<>'0' then raise exception 'gap';end if;
      if nexus_sync4_private.advance_transport(${json({ ...f.key, nextIndex: 6 })})->>'code'<>'invalid' then raise exception 'client cursor';end if;
    end $qa$;reset role;set local role authenticated;${f.chunks[0]}reset role;set local role nexus_sync_writer;
    do $qa$ declare result jsonb;begin
      result:=nexus_sync4_private.advance_transport(${json(f.key)});
      if result->>'kind'<>'transport-pending' or result->>'nextIndex'<>'4' or result->>'receivedBytes'<>'131072' then raise exception 'quantum';end if;
    end $qa$;reset role;set local role authenticated;${f.chunks[0]}reset role;set local role nexus_sync_writer;
    do $qa$ declare result jsonb;begin
      result:=nexus_sync4_private.advance_transport(${json(f.key)});
      if result->>'kind'<>'transport-verified' or result->>'nextIndex'<>'7' or result->>'receivedBytes'<>'204800' then raise exception 'complete';end if;
      if nexus_sync4_private.advance_transport(${json(f.key)})<>result then raise exception 'replay';end if;
      if (select count(*) from nexus_sync4_private.fragments where owner='${A}')<>7
        or (select revision from nexus_private.accounts where owner='${A}')<>0 then raise exception 'domain or stage changed';end if;
    end $qa$;reset role;`);
});

test('SQL transport mismatch and owner swap cannot advance or attest another staged operation', async () => {
  const f = await stagedFixture(true);
  run(`${f.setup} set local role authenticated;${f.chunks.join('\n')}reset role;set local role nexus_sync_writer;
    do $qa$ begin
      if nexus_sync4_private.advance_transport(${json({ ...f.key, requestDigest: 'f'.repeat(64) })})->>'code'<>'request-mismatch' then raise exception 'digest';end if;
    end $qa$;reset role;${claims(B)}set local role nexus_sync_writer;
    do $qa$ begin if nexus_sync4_private.advance_transport(${json(f.key)})->>'code'<>'not-found' then raise exception 'owner';end if;end $qa$;
    reset role;${claims(A)}set local role nexus_sync_writer;
    do $qa$ begin
      if nexus_sync4_private.advance_transport(${json(f.key)})->>'nextIndex'<>'4' then raise exception 'initial';end if;
      if nexus_sync4_private.advance_transport(${json(f.key)})->>'code'<>'integrity-mismatch' then raise exception 'whole hash';end if;
      if (select next_index from nexus_sync4_private.transport_validation where owner='${A}')<>4
        or (select verified from nexus_sync4_private.transport_validation where owner='${A}')
        or (select count(*) from nexus_sync4_private.fragments where owner='${A}')<>7 then raise exception 'failed step changed checkpoint';end if;
    end $qa$;reset role;`);
});

test('SQL transport expiry and cancel reject later advance while preserving operation identity', async () => {
  const f = await stagedFixture();
  run(`${f.setup} set local role authenticated;${f.chunks.join('\n')}reset role;set local role nexus_sync_writer;
    select nexus_sync4_private.advance_transport(${json(f.key)});reset role;
    update nexus_sync4_private.stages set expires_at=0 where owner='${A}';set local role nexus_sync_writer;
    do $qa$ begin
      if nexus_sync4_private.advance_transport(${json(f.key)})->>'code'<>'stage-expired' then raise exception 'expiry';end if;
      if (select next_index from nexus_sync4_private.transport_validation where owner='${A}')<>4 then raise exception 'expired advance';end if;
    end $qa$;reset role;set local role authenticated;select public.nexus_sync4_cancel(${json(f.key)});reset role;set local role nexus_sync_writer;
    do $qa$ begin
      if nexus_sync4_private.advance_transport(${json(f.key)})->>'code'<>'stage-expired' then raise exception 'cancel';end if;
      if not exists(select 1 from nexus_sync4_private.stages where owner='${A}' and operation_id='${f.key.operationId}') then raise exception 'lost op';end if;
      if exists(select 1 from nexus_sync4_private.transport_validation where owner='${A}') then raise exception 'terminal hash retained';end if;
    end $qa$;reset role;`);
});

test('SQL transport crossing expiry during hashing never persists that progress or a verified flag', async () => {
  const f = await stagedFixture();
  run(`${f.setup} set local role authenticated;${f.chunks.join('\n')}reset role;
    alter function nexus_sync4_private.sha256_update(nexus_sync4_private.sha256_state,bytea) rename to qa_original_sha256_update;
    create function nexus_sync4_private.sha256_update(value nexus_sync4_private.sha256_state,payload bytea)
      returns nexus_sync4_private.sha256_state language plpgsql set search_path='' as $slow$
      begin
        if current_setting('elo_qa.hash_entered',true) is distinct from 'true' then
          perform set_config('elo_qa.hash_entered','true',true);perform pg_sleep(2.1);
        end if;
        return nexus_sync4_private.qa_original_sha256_update(value,payload);
      end $slow$;
    revoke all on function nexus_sync4_private.sha256_update(nexus_sync4_private.sha256_state,bytea) from public;
    grant execute on function nexus_sync4_private.sha256_update(nexus_sync4_private.sha256_state,bytea) to nexus_sync_writer;
    update nexus_sync4_private.stages set expires_at=floor(extract(epoch from clock_timestamp()))::bigint+2 where owner='${A}';
    set local role nexus_sync_writer;
    do $qa$ begin
      if nexus_sync4_private.advance_transport(${json(f.key)})->>'code'<>'stage-expired' then raise exception 'late progress accepted';end if;
      if current_setting('elo_qa.hash_entered',true) is distinct from 'true' then raise exception 'fixture did not enter hashing';end if;
      if exists(select 1 from nexus_sync4_private.transport_validation where owner='${A}' and (next_index<>0 or received_bytes<>0 or verified))
        or (select count(*) from nexus_sync4_private.fragments where owner='${A}')<>7 then raise exception 'expired step mutated';end if;
    end $qa$;reset role;
    update nexus_sync4_private.stages set state='expired' where owner='${A}';
    do $qa$ begin if exists(select 1 from nexus_sync4_private.transport_validation where owner='${A}') then raise exception 'expiry cleanup retained hash';end if;end $qa$;`);
});
