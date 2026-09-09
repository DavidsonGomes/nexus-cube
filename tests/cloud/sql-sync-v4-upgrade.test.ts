import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInitialData, toSyncRecords } from '../../src/data';
import { migrateDataToV4 } from '../../src/data/imported-model';
import { toSyncAccountDataV4 } from '../../src/data/sync-projection-v4';
import { createSyncFrameV4 } from '../../src/data/sync-framing-v4';
import { encodeWire } from '../../src/cloud/codec';
import { syncEnvelopeDigestV4, type SyncEnvelopeV4 } from '../../src/cloud/sync-protocol-v4';

const migrations = ['20260909004516_sync_v4_staging.sql','20260909010714_sync_v4_read.sql','20260909010922_sync_v4_upgrade.sql'].map(file => readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^begin;$/m, '').replace(/^commit;$/m, '')).join('\n');
const A = 'a1000000-0000-0000-0000-000000000001', B = 'b1000000-0000-0000-0000-000000000002', epoch = 'e1000000-0000-0000-0000-000000000001';
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const json = (v: unknown) => quote(JSON.stringify(v)) + '::jsonb';
const claims = (id: string) => `select set_config('request.jwt.claims',${quote(JSON.stringify({ sub: id, role: 'authenticated', is_anonymous: false }))},true);select set_config('request.jwt.claim.sub','${id}',true);`;
async function fixture(altered = false) {
  const data = createInitialData();
  data.sessions = [{ id: 's', name: 'NUL\u0000\ud800', createdAt: '2026-09-08T00:00:00.000Z', mode: null }]; data.activeSessionId = 's';
  data.solves = [{ id: 'x', sessionId: 's', mode: null, rawMs: Number.MIN_VALUE, penalty: '+2', scramble: '', source: 'manual', createdAt: '2026-09-08T00:00:01.000Z', note: '😀\u0000\ud800' + 'x'.repeat(9400) }];
  const records = toSyncRecords(data);
  const after = migrateDataToV4(data); if (altered) after.settings.holdMs = 1999;
  const frame = await createSyncFrameV4(toSyncAccountDataV4(after));
  const input: Omit<SyncEnvelopeV4,'requestDigest'> = { protocolVersion: 4, operationId: 'c1000000-0000-0000-0000-000000000001', kind: 'upgrade-v3', base: { domainVersion: 3, epoch, revision: '0' }, manifest: frame.manifest };
  const envelope: SyncEnvelopeV4 = { ...input, requestDigest: await syncEnvelopeDigestV4(input) }, key = { operationId: envelope.operationId, requestDigest: envelope.requestDigest };
  const chunks = [];
  for await (const p of frame.fragments) chunks.push({ ...key, index: p.index, offset: p.offset, text: new TextDecoder().decode(p.bytes), sha256: p.sha256 });
  const setup = `insert into nexus_private.accounts(owner,epoch) values('${A}','${epoch}'),('${B}','${B}');\n` + records.map(r => `insert into nexus_private.records(owner,entity,id,revision,tombstone,record,position,parent_id) values('${A}',${quote(r.entity)},${quote(r.id)},1,false,${json(encodeWire(r))},${r.listPosition === null ? 'null' : quote(r.listPosition)},${r.entity === 'solve' ? quote(r.value.sessionId) : 'null'});`).join('\n');
  const receive = `set local role authenticated; do $qa$ begin if public.nexus_sync4_begin(${json(envelope)})->>'kind'<>'staged' then raise exception 'stage'; end if;
    ${chunks.map(c => `if public.nexus_sync4_chunk(${json(c)})->>'kind'<>'chunk-stored' then raise exception 'chunk'; end if;`).join('\n')} end $qa$; reset role;`;
  return { setup, receive, key, envelope, chunks };
}
function sql(setup: string, body: string) {
  const source = `begin; create role elo_qa_sync4_service nologin bypassrls; ${migrations} ${setup} ${claims(A)} ${body} rollback;`.replaceAll('service_role','elo_qa_sync4_service');
  const result = spawnSync('/opt/homebrew/opt/libpq/bin/psql', ['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55432','-U','postgres','-d','nexus_sync_qa'], { input: source, encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
}
test('SQL upgrade exact S1 migration commits once, reads bounded immutable parts and blocks only promoted S1 account', async () => {
  const f = await fixture(); assert.ok(f.chunks.length > 1);
  sql(f.setup, `${f.receive} set local role authenticated;
    do $qa$ declare r jsonb; page jsonb; begin
      r:=public.nexus_sync4_commit(${json(f.key)});
      if r->>'kind'<>'applied' then raise exception 'commit: %',r; end if;
      if public.nexus_sync4_commit(${json(f.key)})<>r or public.nexus_sync4_begin(${json(f.envelope)})<>r then raise exception 'receipt replay'; end if;
      ${f.chunks.map(c => `page:=public.nexus_sync4_read(jsonb_build_object('head',r->'head','operationId',r->'operationId','requestDigest',r->'requestDigest','index',${c.index}));
        if page->>'kind'<>'fragment' or page#>>'{fragment,text}'<>${quote(c.text)} or (page->>'complete')::boolean<>${c.index + 1 === f.chunks.length} then raise exception 'read'; end if;`).join('\n')}
      if public.nexus_sync4_status('{}')#>>'{head,domainVersion}'<>'4' then raise exception 'status'; end if;
      begin perform public.nexus_sync_status(); raise exception 'S1 accepted promoted'; exception when feature_not_supported then null; end;
    end $qa$; ${claims(B)} do $qa$ begin if public.nexus_sync_status()->>'revision'<>'0' then raise exception 'B changed'; end if; end $qa$;
    reset role; ${claims(A)}
    do $qa$ begin
      if (select count(*) from nexus_sync4_private.frames)<>1 or (select count(*) from nexus_sync4_private.heads)<>1 then raise exception 'duplicate commit'; end if;
      begin update nexus_private.accounts set revision=revision+1 where owner='${A}'; raise exception 'S1 revision accepted'; exception when feature_not_supported then null; end;
      if (select revision from nexus_private.accounts where owner='${A}')<>0 then raise exception 'S1 source changed'; end if;
    end $qa$;`);
});
test('SQL upgrade CAS rejects a changed S1 cut without promoting or discarding staged bytes', async () => {
  const f = await fixture(); sql(f.setup, `${f.receive}
    update nexus_private.accounts set revision=1 where owner='${A}'; set local role authenticated;
    do $qa$ begin if public.nexus_sync4_commit(${json(f.key)})->>'kind'<>'conflict' then raise exception 'CAS'; end if; end $qa$;
    reset role; do $qa$ begin if exists(select 1 from nexus_sync4_private.heads) or (select count(*) from nexus_sync4_private.fragments)<>${f.chunks.length} then raise exception 'changed state'; end if; end $qa$;`);
});
test('SQL upgrade rejects validly framed client changes instead of treating migration as adoption', async () => {
  const f = await fixture(true); sql(f.setup, `${f.receive} set local role authenticated;
    do $qa$ begin if public.nexus_sync4_commit(${json(f.key)})->>'code'<>'integrity-mismatch' then raise exception 'client edit accepted'; end if; end $qa$;
    reset role; do $qa$ begin if exists(select 1 from nexus_sync4_private.frames) then raise exception 'frame persisted'; end if; end $qa$;`);
});
