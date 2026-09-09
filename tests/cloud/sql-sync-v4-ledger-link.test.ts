import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = [
  '20260909004516_sync_v4_staging.sql',
  '20260909010714_sync_v4_read.sql',
  '20260909010922_sync_v4_upgrade.sql',
  '20260909012039_sync_v4_stream_validation.sql',
  '20260909013000_sync_v4_validation.sql',
  '20260909014500_sync_v4_parser.sql',
  '20260909015500_sync_v4_semantic_cursor.sql',
  '20260909021500_sync_v4_ledger_link.sql',
];
const migration = files.map(file => readFileSync(`supabase/migrations/${file}`, 'utf8')
  .replace(/^begin;$/m, '').replace(/^commit;$/m, '')).join('\n');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const A = 'a4000000-0000-0000-0000-000000000001';
const E1 = 'e4000000-0000-0000-0000-000000000001';
const OP0 = 'c4000000-0000-0000-0000-000000000000';
const OP1 = 'c4000000-0000-0000-0000-000000000001';
const OP2 = 'c4000000-0000-0000-0000-000000000002';
const D0 = '0'.repeat(64);
const D1 = '1'.repeat(64);
const D2 = '2'.repeat(64);
const SRC = sha('source-bytes');
const IMP = sha('batch-plan');
const PAYLOAD_SHA = sha('abc');
const MANIFEST = { protocolVersion: 4, domainVersion: 4, canonicalVersion: 1, wireVersion: 1,
  encoding: 'canonical-json-ascii', totalBytes: 3, fragmentBytes: 32768, fragmentCount: 1, sha256: PAYLOAD_SHA };
const claims = (id: string) => `select set_config('request.jwt.claims',${json({ sub: id, role: 'authenticated', is_anonymous: false })}::text,true);select set_config('request.jwt.claim.sub','${id}',true);`;

function run(body: string) {
  const sql = `begin; create role elo_qa_sync4_service nologin bypassrls; ${migration}
    set local statement_timeout='12s'; ${body} rollback;`.replaceAll('service_role', 'elo_qa_sync4_service');
  const result = spawnSync('/opt/homebrew/opt/libpq/bin/psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', '55432', '-U', 'postgres', '-d', 'nexus_sync_qa'],
    { input: sql, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function stagedOperation(op: string, digest: string, withLedger: boolean, withEnd: boolean) {
  const envelope = { kind: 'mutation', base: { domainVersion: 4, epoch: E1, revision: '1' }, manifest: MANIFEST };
  const ledger = withLedger ? `
    insert into nexus_sync4_private.frame_sources values('${A}','${op}','src_${SRC}','${SRC}',5,1,true);
    insert into nexus_sync4_private.frame_batches(owner,operation_id,batch_id,source_id,parser_version,canonical_version,semantic_sha256,plan_sha256,duplicate_of,completes_batch_id,record_count)
      values('${A}','${op}','imp_${IMP}','src_${SRC}','1',1,'${sha('semantic')}','${sha('plan')}',null,null,2);
    insert into nexus_sync4_private.frame_references(owner,operation_id,entity,source_id,batch_id,record_key,ordinal,disposition,target_id)
      values('${A}','${op}','session','src_${SRC}','imp_${IMP}','k1',0,'included','t1'),
            ('${A}','${op}','session','src_${SRC}','imp_${IMP}','k2',1,'included','t2');
    insert into nexus_sync4_private.parser_events(owner,operation_id,sequence_no,byte_offset,event_kind,source_id,batch_id,record_key,ordinal)
      values('${A}','${op}',0,0,'source-closed','src_${SRC}',null,null,null),
            ('${A}','${op}',1,0,'batch-begin','src_${SRC}','imp_${IMP}',null,null),
            ('${A}','${op}',2,1,'batch-record',null,'imp_${IMP}','k1',0),
            ('${A}','${op}',3,1,'batch-record',null,'imp_${IMP}','k2',1),
            ('${A}','${op}',4,2,'batch-closed',null,'imp_${IMP}',null,null),
            ('${A}','${op}',5,2,'projection-unit','src_${SRC}','imp_${IMP}','k1',0),
            ('${A}','${op}',6,2,'projection-unit','src_${SRC}','imp_${IMP}','k2',1);` : '';
  const end = withEnd ? `
    insert into nexus_sync4_private.parser_events(owner,operation_id,sequence_no,byte_offset,event_kind)
      values('${A}','${op}',7,3,'end');` : '';
  return `
    insert into nexus_sync4_private.stages values('${A}','${op}','${digest}',${json(envelope)},3,32768,1,
      floor(extract(epoch from clock_timestamp()))::bigint+3600,'receiving');
    insert into nexus_sync4_private.fragments values('${A}','${op}',0,0,'abc','${PAYLOAD_SHA}');
    insert into nexus_sync4_private.transport_validation(owner,operation_id,request_digest,next_index,received_bytes,verified)
      values('${A}','${op}','${digest}',1,3,true);
    insert into nexus_sync4_private.parser_state(owner,operation_id,request_digest,next_index,root_seen,syntax_valid)
      values('${A}','${op}','${digest}',1,true,true);
    insert into nexus_sync4_private.frame_validation(owner,operation_id,request_digest,base_epoch,base_revision,parser_version,canonical_version,state,wire_sha256)
      values('${A}','${op}','${digest}','${E1}',1,1,1,'receiving','${PAYLOAD_SHA}');
    ${ledger}${end}`;
}

const base = `
  insert into nexus_private.accounts(owner,epoch) values('${A}','${A}');
  insert into nexus_sync4_private.frames values('${A}','${E1}',1,'${OP0}','${D0}',${json(MANIFEST)});
  insert into nexus_sync4_private.heads values('${A}','${E1}',1,'${A}',0);`;

test('SQL ledger link records parser result and commit advances head by CAS with idempotent replay', () => {
  const output = run(`${base}${stagedOperation(OP1, D1, true, true)}
    ${claims(A)}set local role nexus_sync_writer;
    do $qa$ declare result jsonb; receipt jsonb; begin
      result:=nexus_sync4_private.link_parser_ledger(${json({ operationId: OP1, requestDigest: D1, importBytes: 3 })});
      if result->>'kind'<>'parser-recorded' then raise exception 'link: %',result; end if;
      result:=nexus_sync4_private.finish_validation(${json({ operationId: OP1, requestDigest: D1 })});
      if result->>'kind'<>'validated' or result->>'sourceCount'<>'1' or result->>'referenceCount'<>'2' then raise exception 'finish: %',result; end if;
      receipt:=nexus_sync4_private.commit_validated_frame(${json({ operationId: OP1, requestDigest: D1 })});
      if receipt->>'kind'<>'applied' or receipt->'head'->>'revision'<>'2' or receipt->'head'->>'epoch'<>'${E1}' then raise exception 'commit: %',receipt; end if;
      if nexus_sync4_private.commit_validated_frame(${json({ operationId: OP1, requestDigest: D1 })})<>receipt then raise exception 'replay changed'; end if;
    end $qa$;reset role;
    do $qa$ begin
      if (select revision from nexus_sync4_private.heads where owner='${A}')<>2 then raise exception 'head not advanced'; end if;
      if not exists(select 1 from nexus_sync4_private.frames where owner='${A}' and epoch='${E1}' and revision=2 and operation_id='${OP1}') then raise exception 'frame missing'; end if;
      if (select count(*) from nexus_sync4_private.frame_parts where owner='${A}' and revision=2)<>1 then raise exception 'parts missing'; end if;
      if (select state from nexus_sync4_private.stages where owner='${A}' and operation_id='${OP1}')<>'cancelled' then raise exception 'stage not terminal'; end if;
      if exists(select 1 from nexus_sync4_private.fragments where owner='${A}' and operation_id='${OP1}') then raise exception 'fragments retained'; end if;
      if (select revision from nexus_private.accounts where owner='${A}')<>0 then raise exception 'legacy revision moved'; end if;
    end $qa$;select 'ledger-link-e2e-ok';`);
  assert.ok(output.includes('ledger-link-e2e-ok'));
});

test('SQL commit CAS rejects a validated frame whose base head has moved', () => {
  const output = run(`${base}${stagedOperation(OP1, D1, true, true)}${stagedOperation(OP2, D2, true, true)}
    ${claims(A)}set local role nexus_sync_writer;
    do $qa$ declare result jsonb; begin
      perform nexus_sync4_private.link_parser_ledger(${json({ operationId: OP1, requestDigest: D1, importBytes: 3 })});
      perform nexus_sync4_private.finish_validation(${json({ operationId: OP1, requestDigest: D1 })});
      perform nexus_sync4_private.link_parser_ledger(${json({ operationId: OP2, requestDigest: D2, importBytes: 3 })});
      perform nexus_sync4_private.finish_validation(${json({ operationId: OP2, requestDigest: D2 })});
      if nexus_sync4_private.commit_validated_frame(${json({ operationId: OP1, requestDigest: D1 })})->>'kind'<>'applied' then raise exception 'first commit'; end if;
      result:=nexus_sync4_private.commit_validated_frame(${json({ operationId: OP2, requestDigest: D2 })});
      if result->>'kind'<>'conflict' or result->>'code'<>'head-changed' or result->'current'->>'revision'<>'2' then raise exception 'cas: %',result; end if;
      if (select revision from nexus_sync4_private.heads where owner='${A}')<>2 then raise exception 'conflict moved head'; end if;
      if exists(select 1 from nexus_sync4_private.frames where owner='${A}' and operation_id='${OP2}') then raise exception 'conflict stored frame'; end if;
    end $qa$;reset role;select 'cas-conflict-ok';`);
  assert.ok(output.includes('cas-conflict-ok'));
});

test('SQL ledger link refuses an incomplete journal and a ledger that disagrees with events', () => {
  const output = run(`${base}${stagedOperation(OP1, D1, true, false)}
    ${claims(A)}set local role nexus_sync_writer;
    do $qa$ declare result jsonb; begin
      result:=nexus_sync4_private.link_parser_ledger(${json({ operationId: OP1, requestDigest: D1, importBytes: 3 })});
      if result->>'code'<>'journal-incomplete' then raise exception 'end gate: %',result; end if;
    end $qa$;reset role;
    insert into nexus_sync4_private.parser_events(owner,operation_id,sequence_no,byte_offset,event_kind)
      values('${A}','${OP1}',7,3,'end');
    update nexus_sync4_private.frame_batches set record_count=1 where owner='${A}' and operation_id='${OP1}';
    ${claims(A)}set local role nexus_sync_writer;
    do $qa$ declare result jsonb; begin
      result:=nexus_sync4_private.link_parser_ledger(${json({ operationId: OP1, requestDigest: D1, importBytes: 3 })});
      if result->>'code'<>'batch-ledger-mismatch' then raise exception 'batch gate: %',result; end if;
      if (select state from nexus_sync4_private.frame_validation where owner='${A}' and operation_id='${OP1}')<>'receiving' then raise exception 'state moved'; end if;
    end $qa$;reset role;select 'journal-gates-ok';`);
  assert.ok(output.includes('journal-gates-ok'));
});
