import test from 'node:test';
import assert from 'node:assert/strict';
import { projectImportToLedgerV4 } from '../../src/cloud/import-ledger-projection-v4';
import type { ImportReceiptV4 } from '../../src/cloud/import-commit-v4';
import type { ImportPlanManifest, ImportIdMapping } from '../../src/imports/plan-types';
import type { ImportRecordDecisionV4, ImportSourceArchiveV4 } from '../../src/data/imported-model';

const HASH = (n: string) => n.repeat(64).slice(0, 64);
const RAW = HASH('a'), PLAN = HASH('b'), SEM = HASH('c');
const receipt: ImportReceiptV4 = { planId: `imp_${PLAN}`, planSHA256: PLAN, rawSHA256: RAW, semanticSHA256: SEM, committedRevision: 5 };
const SOURCE_BYTES = 4096;
const sources: ImportSourceArchiveV4[] = [{ id: `src_${RAW}`, format: 'nexus-backup', variant: 'v1', byteLength: SOURCE_BYTES, rawSHA256: RAW, bytesBase64: '' }];

const mapping = (recordKey: string, entity: ImportIdMapping['entity'], targetId: string): ImportIdMapping =>
  ({ entity, recordKey, sourceKey: recordKey, originalId: null, targetId, reason: 'generated' });

function manifest(records: ImportRecordDecisionV4[], idMappings: ImportIdMapping[], extra: Partial<ImportPlanManifest> = {}): ImportPlanManifest {
  return { protocolVersion: 1, domainVersion: 4, canonicalVersion: 1, parserVersion: 'nexus-1', planId: `imp_${PLAN}`,
    rawSHA256: RAW, semanticSHA256: SEM, targetDigest: HASH('d'), planSHA256: PLAN, expectedLocalRevision: 4,
    strategy: 'append', choices: [], duplicateOf: null, completesBatchId: null, importedAt: '2026-09-08T00:00:00.000Z',
    nonce: 'n', idMappings, records, ...extra };
}

test('projects a committed import into batch/source/references matching the ledger shape', () => {
  const records: ImportRecordDecisionV4[] = [
    { key: 'k1', ordinal: 0, disposition: { kind: 'included', entity: 'session', targetId: 't1' } },
    { key: 'k2', ordinal: 1, disposition: { kind: 'included', entity: 'solve', targetId: 't2' } },
    { key: 'k3', ordinal: 2, disposition: { kind: 'pending', reason: 'unknown-time' } },
    { key: 'k4', ordinal: 3, disposition: { kind: 'excluded', reason: 'user-confirmed' } },
  ];
  const idMappings = [mapping('k3', 'solve', 't3'), mapping('k4', 'study-attempt', 't4')];
  const result = projectImportToLedgerV4(receipt, manifest(records, idMappings), sources);
  assert.equal(result.kind, 'projected');
  if (result.kind !== 'projected') return;
  const { source, batch, references } = result.projection;
  assert.equal(source.sourceId, `src_${RAW}`);
  assert.equal(batch.batchId, `imp_${PLAN}`);
  assert.equal(batch.sourceId, `src_${RAW}`);
  assert.equal(batch.semanticSHA256, SEM);
  assert.equal(batch.recordCount, 4, 'record_count equals the reference count, as link_parser_ledger checks');
  assert.equal(references.length, 4);
  assert.deepEqual(references.map(r => r.disposition), ['included', 'included', 'pending', 'excluded']);
  assert.equal(references[3].entity, 'study', 'study-attempt maps to the ledger entity study');
  assert.equal(references[0].targetId, 't1');
  assert.equal(references[2].reason, 'unknown-time');
  assert.equal(references[3].reason, 'user-confirmed');
  assert.equal(source.byteLength, SOURCE_BYTES, 'the real archived byte length is carried, not a placeholder');
});

test('rejects a manifest that both duplicates and completes a batch (server mutex)', () => {
  const both = manifest([], [], { duplicateOf: `imp_${HASH('9')}`, completesBatchId: `imp_${HASH('e')}` });
  const result = projectImportToLedgerV4(receipt, both, sources);
  assert.equal(result.kind, 'invalid');
  if (result.kind === 'invalid') assert.equal(result.reason, 'duplicate-and-completes-exclusive');
});

test('rejects when the source archive for the manifest raw hash is absent', () => {
  const result = projectImportToLedgerV4(receipt, manifest([], []), []);
  assert.equal(result.kind, 'invalid');
  if (result.kind === 'invalid') assert.equal(result.reason, 'source-archive-missing');
});

test('rejects a receipt that disagrees with the manifest', () => {
  const bad: ImportReceiptV4 = { ...receipt, semanticSHA256: HASH('f') };
  const result = projectImportToLedgerV4(bad, manifest([], []), sources);
  assert.equal(result.kind, 'invalid');
  if (result.kind === 'invalid') assert.equal(result.reason, 'receipt-manifest-mismatch');
});

test('rejects an included record without a targetId', () => {
  const records: ImportRecordDecisionV4[] = [{ key: 'k1', ordinal: 0, disposition: { kind: 'included', entity: 'session', targetId: '' } }];
  const result = projectImportToLedgerV4(receipt, manifest(records, []), sources);
  assert.equal(result.kind, 'invalid');
  if (result.kind === 'invalid') assert.equal(result.reason, 'target-missing');
});

test('carries completesBatchId and duplicateOf through to the batch, never conflating them', () => {
  const withCompletion = manifest([], [], { completesBatchId: `imp_${HASH('e')}`, duplicateOf: null });
  const r1 = projectImportToLedgerV4(receipt, withCompletion, sources);
  assert.equal(r1.kind, 'projected');
  if (r1.kind === 'projected') { assert.equal(r1.projection.batch.completesBatchId, `imp_${HASH('e')}`); assert.equal(r1.projection.batch.duplicateOf, null); }
  const withDuplicate = manifest([], [], { duplicateOf: `imp_${HASH('9')}`, completesBatchId: null });
  const r2 = projectImportToLedgerV4(receipt, withDuplicate, sources);
  assert.equal(r2.kind, 'projected');
  if (r2.kind === 'projected') { assert.equal(r2.projection.batch.duplicateOf, `imp_${HASH('9')}`); assert.equal(r2.projection.batch.completesBatchId, null); }
});
