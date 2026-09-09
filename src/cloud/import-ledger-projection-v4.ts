import type { ImportPlanManifest, ImportIdMapping } from '../imports/plan-types';
import type { ImportSourceArchiveV4 } from '../data/imported-model';
import type { ImportReceiptV4 } from './import-commit-v4';

// Pure projector of a locally committed import into the private Sync V4 ledger
// shape (frame_batches / frame_sources / frame_references), matching exactly what
// the server's link_parser_ledger validates. NO dispatch, NO transport, NO target.
// The seam stays OFF until the RLS-two-owner gate and remote window. This is the
// consuming end of the triple co-signature: the manifest is authority-frozen and
// consumed verbatim; nothing here reparses or replans.

export interface LedgerSourceV4 { sourceId: string; rawSHA256: string; byteLength: number }
export interface LedgerBatchV4 {
  batchId: string; sourceId: string; parserVersion: string; canonicalVersion: 1;
  semanticSHA256: string; planSHA256: string; duplicateOf: string | null;
  completesBatchId: string | null; recordCount: number;
}
export type LedgerDisposition = 'included' | 'already-present' | 'pending' | 'excluded';
export interface LedgerReferenceV4 {
  entity: 'session' | 'solve' | 'study' | 'progress';
  sourceId: string; batchId: string; recordKey: string; ordinal: number;
  targetId: string | null; reason: string | null; disposition: LedgerDisposition;
}
export interface LedgerProjectionV4 {
  source: LedgerSourceV4; batch: LedgerBatchV4; references: LedgerReferenceV4[];
}
export type LedgerProjectionResult =
  | { kind: 'projected'; projection: LedgerProjectionV4 }
  | { kind: 'invalid'; reason: string };

// The frozen model's entity uses 'study-attempt'; the ledger uses 'study'.
const entityToLedger = (entity: ImportIdMapping['entity']): LedgerReferenceV4['entity'] =>
  entity === 'study-attempt' ? 'study' : entity;

/** Project a committed import (receipt + its frozen manifest) into the ledger
 * shape. Consumes the manifest verbatim; validates only that the receipt and
 * manifest agree and that dispositions carry their required fields, mirroring the
 * server checks so a divergence surfaces here rather than at the (future) upload. */
export function projectImportToLedgerV4(receipt: ImportReceiptV4, manifest: ImportPlanManifest, sources: readonly ImportSourceArchiveV4[]): LedgerProjectionResult {
  if (receipt.planId !== manifest.planId || receipt.planSHA256 !== manifest.planSHA256
    || receipt.rawSHA256 !== manifest.rawSHA256 || receipt.semanticSHA256 !== manifest.semanticSHA256) {
    return { kind: 'invalid', reason: 'receipt-manifest-mismatch' };
  }
  if (manifest.planId !== `imp_${manifest.planSHA256}`) return { kind: 'invalid', reason: 'batch-id-shape' };
  // Mirror the ledger's mutual-exclusion check locally: a manifest with both a
  // completion link and a duplicate marker would project fine here but blow the
  // server check(duplicate_of is null or completes_batch_id is null). Fail early.
  if (manifest.duplicateOf !== null && manifest.completesBatchId !== null) {
    return { kind: 'invalid', reason: 'duplicate-and-completes-exclusive' };
  }
  const sourceId = `src_${manifest.rawSHA256}`;
  // The real archived byte length (from the committed AppData4) must match what
  // frame_sources will hold; a placeholder 0 would diverge from the seam.
  const archive = sources.find(source => source.rawSHA256 === manifest.rawSHA256);
  if (!archive) return { kind: 'invalid', reason: 'source-archive-missing' };
  const byIndex = new Map(manifest.idMappings.map(mapping => [mapping.recordKey, mapping]));
  const references: LedgerReferenceV4[] = [];
  for (const record of manifest.records) {
    const disposition = record.disposition;
    const mapping = byIndex.get(record.key);
    let entity: LedgerReferenceV4['entity'];
    let targetId: string | null = null;
    let reason: string | null = null;
    if (disposition.kind === 'included' || disposition.kind === 'already-present') {
      entity = entityToLedger(disposition.entity);
      targetId = disposition.targetId;
      if (!targetId) return { kind: 'invalid', reason: 'target-missing' };
    } else if (disposition.kind === 'pending') {
      if (!mapping) return { kind: 'invalid', reason: 'pending-entity-unknown' };
      entity = entityToLedger(mapping.entity);
      reason = disposition.reason;
    } else if (disposition.kind === 'excluded') {
      if (disposition.reason !== 'user-confirmed') return { kind: 'invalid', reason: 'excluded-reason-invalid' };
      if (!mapping) return { kind: 'invalid', reason: 'excluded-entity-unknown' };
      entity = entityToLedger(mapping.entity);
      reason = disposition.reason;
    } else {
      return { kind: 'invalid', reason: 'disposition-unknown' };
    }
    references.push({ entity, sourceId, batchId: manifest.planId, recordKey: record.key, ordinal: record.ordinal, targetId, reason, disposition: disposition.kind });
  }
  const source: LedgerSourceV4 = { sourceId, rawSHA256: manifest.rawSHA256, byteLength: archive.byteLength };
  const batch: LedgerBatchV4 = {
    batchId: manifest.planId, sourceId, parserVersion: manifest.parserVersion, canonicalVersion: 1,
    semanticSHA256: manifest.semanticSHA256, planSHA256: manifest.planSHA256,
    duplicateOf: manifest.duplicateOf, completesBatchId: manifest.completesBatchId, recordCount: references.length,
  };
  return { kind: 'projected', projection: { source, batch, references } };
}
