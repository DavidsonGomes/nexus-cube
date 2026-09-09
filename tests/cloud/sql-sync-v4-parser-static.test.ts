import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20260909014500_sync_v4_parser.sql', 'utf8');
test('parser is incremental and does not claim semantic validation', () => {
  assert.match(sql, /create table nexus_sync4_private\.parser_state/);
  assert.match(sql, /create function nexus_sync4_private\.advance_parser/);
  assert.match(sql, /next_index bigint/);
  assert.match(sql, /depth integer/);
  assert.match(sql, /unicode_left integer/);
  assert.match(sql, /syntax-pending/);
  assert.match(sql, /syntax-valid/);
  assert.doesNotMatch(sql, /string_agg\s*\(/i);
  assert.doesNotMatch(sql, /jsonb_agg\s*\(/i);
  assert.doesNotMatch(sql, /projection_sha256/);
});
