import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20260909015500_sync_v4_semantic_cursor.sql', 'utf8');

test('semantic cursor state is private, resumable and bounded to parser units', () => {
  assert.match(sql, /add column if not exists semantic_path text\[\]/);
  assert.match(sql, /add column if not exists token_state text/);
  assert.match(sql, /add column if not exists previous_key_hex text/);
  assert.match(sql, /add column if not exists active_source_quartet text/);
  assert.match(sql, /add column if not exists active_source_pending_hex text/);
  assert.match(sql, /create table if not exists nexus_sync4_private\.parser_events/);
  assert.match(sql, /create table if not exists nexus_sync4_private\.parser_source_state/);
  assert.match(sql, /sha256_update\(state\.hash_state,bytes\)/);
  assert.match(sql, /sha256_final\(state\.hash_state\)/);
  assert.match(sql, /source-integrity-mismatch/);
  assert.match(sql, /insert into nexus_sync4_private\.frame_sources/);
  assert.match(sql, /event_kind text not null check\(event_kind in/);
  assert.match(sql, /primary key\(owner,operation_id,sequence_no\)/);
  assert.match(sql, /revoke all on nexus_sync4_private\.parser_events from public,anon,authenticated,service_role/);
  assert.doesNotMatch(sql, /jsonb_agg\s*\(/i);
  assert.doesNotMatch(sql, /string_agg\s*\(/i);
  assert.doesNotMatch(sql, /convert_to\s*\([^)]*account/i);
});

test('event append remains owner/op scoped and cannot advance past the stage bytes', () => {
  assert.match(sql, /p\.request_digest<>digest/);
  assert.match(sql, /request->>'byteOffset'\)::bigint > \(select total_bytes/);
  assert.match(sql, /p\.rejected/);
  assert.match(sql, /grant execute on function nexus_sync4_private\.append_parser_event/);
});
