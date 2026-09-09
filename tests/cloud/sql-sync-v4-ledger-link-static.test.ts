import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20260909021500_sync_v4_ledger_link.sql', 'utf8');

test('ledger link derives counts from tables and gates on journal completion', () => {
  assert.match(sql, /create function nexus_sync4_private\.link_parser_ledger/);
  assert.match(sql, /exact_fields\(request,array\['operationId','requestDigest','importBytes'\]\)/);
  assert.match(sql, /e\.event_kind='end'/);
  assert.match(sql, /end_offset<>stage\.total_bytes/);
  assert.match(sql, /transport-incomplete/);
  assert.match(sql, /'batch-order-invalid'/);
  assert.match(sql, /'batch-ledger-mismatch'/);
  assert.match(sql, /'source-ledger-mismatch'/);
  assert.match(sql, /'reference-ledger-mismatch'/);
  assert.match(sql, /select count\(\*\),coalesce\(sum\(byte_length\),0\) into source_total,source_bytes_total/);
  assert.match(sql, /record_parser_result\(jsonb_build_object\('operationId',op,'requestDigest',digest,/);
  assert.doesNotMatch(sql, /'sourceCount',\(request/);
  assert.doesNotMatch(sql, /'sourceBytes',\(request/);
  assert.doesNotMatch(sql, /string_agg\s*\(/i);
  assert.doesNotMatch(sql, /jsonb_agg\s*\(/i);
});

test('commit CAS anchors on the validated base and repeats the predicate in the update', () => {
  assert.match(sql, /create function nexus_sync4_private\.commit_validated_frame/);
  assert.match(sql, /if v\.state<>'validated' then return jsonb_build_object\('kind','error','code','validation-incomplete'\)/);
  assert.match(sql, /from nexus_sync4_private\.heads where owner=who for update/);
  assert.match(sql, /current4\.epoch<>v\.base_epoch or current4\.revision<>v\.base_revision/);
  assert.match(sql, /'head-changed'/);
  assert.match(sql, /update nexus_sync4_private\.heads set epoch=v\.base_epoch,revision=new_revision\s*\n\s*where owner=who and epoch=v\.base_epoch and revision=v\.base_revision/);
  assert.match(sql, /if not found then raise exception 'head changed during commit'/);
  assert.match(sql, /if copied<>stage\.fragment_count then raise exception 'fragment copy incomplete'/);
  assert.match(sql, /domainVersion'<>'4' then return jsonb_build_object\('kind','error','code','unsupported-version'\)/);
});

test('both entry points stay private to the sync writer with no new public RPC', () => {
  assert.match(sql, /revoke all on function nexus_sync4_private\.link_parser_ledger\(jsonb\),nexus_sync4_private\.commit_validated_frame\(jsonb\) from public,anon,authenticated,service_role/);
  assert.match(sql, /grant execute on function nexus_sync4_private\.link_parser_ledger\(jsonb\),nexus_sync4_private\.commit_validated_frame\(jsonb\) to nexus_sync_writer/);
  assert.doesNotMatch(sql, /create function public\./);
  assert.doesNotMatch(sql, /grant execute[^;]*to authenticated/);
  assert.doesNotMatch(sql, /security definer/);
});
