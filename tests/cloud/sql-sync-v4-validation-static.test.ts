import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20260909013000_sync_v4_validation.sql', 'utf8');

test('V4 validation ledger is resumable, owner-scoped and never materializes the account stream', () => {
  assert.match(sql, /create table nexus_sync4_private\.frame_validation/);
  assert.match(sql, /create table nexus_sync4_private\.frame_sources/);
  assert.match(sql, /create table nexus_sync4_private\.frame_references/);
  assert.match(sql, /create table nexus_sync4_private\.frame_batches/);
  assert.match(sql, /create function nexus_sync4_private\.begin_validation/);
  assert.match(sql, /create function nexus_sync4_private\.finish_validation/);
  assert.match(sql, /create function nexus_sync4_private\.validate_semantic_units/);
  assert.match(sql, /where owner=who for update/);
  assert.match(sql, /transport-incomplete/);
  assert.match(sql, /head-changed/);
  assert.match(sql, /state='validated'/);
  assert.match(sql, /validation-terminal/);
  assert.match(sql, /state<>'references-valid'/);
  assert.match(sql, /finish_validation[\s\S]*syntax-incomplete/);
  assert.match(sql, /wire_sha256 text not null/);
  assert.doesNotMatch(sql, /projectionSha256'<>.*manifest/);
  assert.doesNotMatch(sql, /projection_sha256/);
  assert.doesNotMatch(sql, /projectionSha256/);
  assert.match(sql, /source_id = 'src_'\|\|raw_sha256/);
  assert.doesNotMatch(sql, /string_agg\s*\(/i);
  assert.doesNotMatch(sql, /jsonb_agg\s*\(/i);
  assert.doesNotMatch(sql, /convert_to\s*\([^)]*account/i);
});

test('validation rows cannot be reached by public roles and preserve source/reference multiplicity', () => {
  assert.match(sql, /foreach relation in array array\['frame_validation','frame_sources','frame_batches','frame_references'\]/);
  assert.match(sql, /revoke all on nexus_sync4_private\.%I from public,anon,authenticated,service_role/);
  assert.match(sql, /primary key\(owner,operation_id,source_id\)/);
  assert.match(sql, /primary key\(owner,operation_id,entity,source_id,batch_id,record_key,ordinal\)/);
  assert.match(sql, /target_id text/);
  assert.match(sql, /reason text/);
  assert.match(sql, /record-count-mismatch/);
  assert.match(sql, /pending-reason-invalid/);
  assert.match(sql, /check\(entity in \('session','solve','progress','study','settings','source','batch','decision'\)\)/);
});

test('disposition enum and completion link match the frozen import model (co-signed)', () => {
  // The four disposition kinds Prisma froze; recorded/imported are entity kinds, not here.
  assert.match(sql, /check\(disposition in \('included','already-present','pending','excluded'\)\)/);
  assert.doesNotMatch(sql, /disposition in \([^)]*'recorded'/);
  assert.doesNotMatch(sql, /disposition in \([^)]*'imported'/);
  // excluded always carries reason 'user-confirmed'.
  assert.match(sql, /disposition='excluded' and r\.reason is distinct from 'user-confirmed'/);
  assert.match(sql, /excluded-reason-invalid/);
  // Dedicated completion column, mutually exclusive with duplicate_of.
  assert.match(sql, /completes_batch_id text/);
  assert.match(sql, /check\(completes_batch_id is null or completes_batch_id ~ '\^imp_\[0-9a-f\]\{64\}\$'\)/);
  assert.match(sql, /check\(duplicate_of is null or completes_batch_id is null\)/);
});
