import type { AppData4, ImportRecordDecisionV4 } from '../data/imported-model';
import type { CaseProgress, SolveMode } from '../domain/types';
import type { ImportIssue, ImportSourceHandle } from './types';

declare const planBrand:unique symbol;
export interface ImportPlanHandle {readonly [planBrand]:true}
export interface ImportTarget {data:AppData4;localRevision:number}
export type ImportChoice =
  | {kind:'retain-pending'|'exclude';recordKey:string}
  | {kind:'include-pending';recordKey:string}
  | {kind:'classify-session';sessionKey:string;mode:SolveMode;homogeneous:true}
  | {kind:'collision';recordKey:string;action:'keep-existing'|'create-copy'}
  | {kind:'progress-field';caseId:string;field:'favorite'|'status'|'note';take:'current'|'incoming'};
export interface ImportAppendInput {choices:ImportChoice[];duplicateOf?:string}
/** Explicit operation over one committed batch. include-pending is only valid here. */
export interface ImportCompletionInput {batchId:string;choices:ImportChoice[]}
export interface ImportIdMapping {
  entity:'session'|'solve'|'study-attempt'|'progress';recordKey:string;
  sourceKey:string;originalId:string|null;targetId:string;
  reason:'preserved'|'generated'|'collision-remap';
}
export interface ImportPreviewRow extends ImportRecordDecisionV4 {sourceKey:string}
/** Display evidence only. Submit the existing ImportChoice selector, never this DTO as authority. */
export type ImportProgressDecision = {
  [Field in 'favorite'|'status'|'note']: {
    kind:'progress-field';recordKey:string;sourceKey:string;caseId:string;field:Field;
    current:CaseProgress[Field];incoming:CaseProgress[Field];selected:'current'|'incoming'|null;
  }
}['favorite'|'status'|'note'];
export interface ImportSessionDecision {
  kind:'classify-session';recordKey:string;sourceKey:string;sessionKey:string;name:string|null;
  currentMode:null;selectedMode:SolveMode|null;
}
export type ImportPreviewDecision=ImportProgressDecision|ImportSessionDecision;
/** Serializable evidence for Elo staging; never reconstructs a live handle.
 * completesBatchId is evidence outside planSHA256: records and targetDigest already
 * bind the completed batch, and the commit protocol recomputes only the fields below.
 */
export interface ImportPlanManifest {
  protocolVersion:1;domainVersion:4;canonicalVersion:1;parserVersion:string;
  planId:string;rawSHA256:string;semanticSHA256:string;targetDigest:string;planSHA256:string;
  expectedLocalRevision:number;strategy:'append';choices:ImportChoice[];duplicateOf:string|null;
  completesBatchId:string|null;
  importedAt:string;nonce:string;idMappings:ImportIdMapping[];records:ImportRecordDecisionV4[];
}
export interface ImportPreviewDetails {
  strategy:'append';sourceDigest:string;targetDigest:string;planDigest:string|null;
  rows:ImportPreviewRow[];idMappings:ImportIdMapping[];issues:ImportIssue[];decisions:ImportPreviewDecision[];
  counts:{included:number;alreadyPresent:number;pending:number;excluded:number;sessions:number;solves:number;study:number;plus2:number;dnf:number;twoHanded:number;oneHanded:number;unclassified:number;missingDate:number};
  sizes:{snapshotBytes:number;backupBytes:number;sourceBytes:number;archiveBytes:number}|null;
}
export type ImportAppendPreview =
  | (ImportPreviewDetails & {kind:'ready';plan:ImportPlanHandle})
  | (ImportPreviewDetails & {kind:'needs-decisions';plan:null})
  | {kind:'already-imported';batchId:string;sourceDigest:string}
  | {kind:'invalid'|'source-unavailable'|'limit-exceeded';issues:ImportIssue[]};
export type ImportApplyResult =
  | {kind:'applied'|'already-applied';data:AppData4;planId:string}
  | {kind:'stale'|'invalid'|'limit-exceeded';issues:ImportIssue[]};
export interface ImportPlanningService {
  previewAppend(target:ImportTarget,source:ImportSourceHandle,input:ImportAppendInput):Promise<ImportAppendPreview>;
  previewCompletePending(target:ImportTarget,source:ImportSourceHandle,input:ImportCompletionInput):Promise<ImportAppendPreview>;
  applyPlan(target:ImportTarget,plan:ImportPlanHandle):ImportApplyResult;
  readPlanManifest(plan:ImportPlanHandle):ImportPlanManifest|null;
  releasePlan(plan:ImportPlanHandle):boolean;
}
