import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = ['20260909004516_sync_v4_staging.sql','20260909012039_sync_v4_stream_validation.sql','20260909014500_sync_v4_parser.sql'];
const migrations = files.map(file => readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/^begin;$/m, '').replace(/^commit;$/m, '')).join('\n');
const owner = 'a4000000-0000-0000-0000-000000000001', epoch = 'e4000000-0000-0000-0000-000000000001';
const operation = 'c4000000-0000-0000-0000-000000000001', digest = 'a'.repeat(64), wire = '["object",[]]';
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const json = (value: unknown) => `${quote(JSON.stringify(value))}::jsonb`;
const sha = spawnSync('shasum', ['-a','256'], { input: wire, encoding: 'utf8' }).stdout.trim().split(' ')[0];
const claims = `select set_config('request.jwt.claim.sub',${quote(owner)},true);select set_config('request.jwt.claims',${quote(JSON.stringify({sub:owner,role:'authenticated',is_anonymous:false}))},true);`;

function run(payload: string, expected: string) {
  const payloadSha = spawnSync('shasum', ['-a','256'], { input: payload, encoding: 'utf8' }).stdout.trim().split(' ')[0];
  const source = `begin; create role elo_qa_parser_service nologin bypassrls; ${migrations}
    insert into nexus_private.accounts(owner,epoch) values(${quote(owner)},${quote(epoch)});
    insert into nexus_sync4_private.stages(owner,operation_id,request_digest,envelope,total_bytes,fragment_bytes,fragment_count,expires_at,state)
      values(${quote(owner)},${quote(operation)},${quote(digest)},${json({manifest:{sha256:sha}})},${Buffer.byteLength(payload)},32768,1,9999999999,'receiving');
    insert into nexus_sync4_private.fragments(owner,operation_id,index,byte_offset,payload,sha256)
      values(${quote(owner)},${quote(operation)},0,0,${quote(payload)},${quote(payloadSha)});
    ${claims} set local role nexus_sync_writer;
    select jsonb_build_object('result',nexus_sync4_private.advance_parser(${json({operationId:operation,requestDigest:digest})}))->>'result';
    reset role; rollback;`.replaceAll('service_role','elo_qa_parser_service');
  const result = spawnSync('/opt/homebrew/opt/libpq/bin/psql', ['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','55432','-U','postgres','-d','nexus_sync_qa'], { input: source, encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(expected));
}

test('local parser consumes a complete bounded wire and rejects a truncated stream', () => {
  run(wire, 'syntax-valid');
  run('["object",[', 'syntax-invalid');
});
