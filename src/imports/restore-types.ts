import type { ContextHandle } from '../cloud/types';
import type { AppData4 } from '../data/imported-model';

declare const restoreBrand:unique symbol;
/** Instance-local capability. A manifest or UI object cannot recreate it. */
export interface NexusRestoreHandle {readonly [restoreBrand]:true}
export interface NexusRestoreTarget {context:ContextHandle;localRevision:number;data:AppData4}
export interface NexusRestoreManifestInput {
  protocolVersion:1;domainVersion:4;canonicalVersion:1;parserVersion:'nexus-restore/1';
  strategy:'replace-nexus';context:ContextHandle;expectedLocalRevision:number;
  rawSHA256:string;targetDigest:string;candidateDigest:string;
  preparedAt:string;nonce:string;
}
export interface NexusRestoreManifest extends NexusRestoreManifestInput {planId:string;planSHA256:string}
export interface NexusRestoreCollectionDiff {added:string[];removed:string[];changed:string[];unchanged:string[]}
export interface NexusRestoreCounts {
  sessions:number;solves:number;recordedSessions:number;importedSessions:number;
  recordedSolves:number;importedSolves:number;studyAttempts:number;progress:number;
  sources:number;batches:number;included:number;alreadyPresent:number;pending:number;excluded:number;
}
export interface NexusRestorePreviewDetails {
  strategy:'replace-nexus';before:NexusRestoreCounts;after:NexusRestoreCounts;
  collections:Record<'sessions'|'solves'|'studyAttempts'|'progress'|'sources'|'batches',NexusRestoreCollectionDiff>;
  selection:{before:string|null;after:string|null};
  settings:{before:AppData4['settings'];after:AppData4['settings']};
  sizes:{sourceBytes:number;beforeSnapshotBytes:number;afterSnapshotBytes:number;recoveryBackupBytes:number;restoredBackupBytes:number};
}
export type NexusRestoreFailure =
  | {kind:'invalid'|'duplicate-json-key'|'cancelled'|'closed'|'superseded'|'stale'|'confirmation-required'}
  | {kind:'limit-exceeded';resource:string;limit:number};
export type NexusRestorePreview = (NexusRestorePreviewDetails & {kind:'ready';plan:NexusRestoreHandle}) | NexusRestoreFailure;
export type NexusRestoreApplyResult = {kind:'applied';data:AppData4;planId:string} | NexusRestoreFailure;
export interface NexusRestoreService {
  previewRestore(target:NexusRestoreTarget,source:Uint8Array,options?:{signal?:AbortSignal}):Promise<NexusRestorePreview>;
  applyRestore(target:NexusRestoreTarget,plan:NexusRestoreHandle,confirmation:{confirmReplacement:true}):NexusRestoreApplyResult;
  readRestoreManifest(plan:NexusRestoreHandle):NexusRestoreManifest|null;
  /** Complete snapshots for inspection, including nullable fields, ledgers and archived originals. */
  readPreviewData(plan:NexusRestoreHandle):{before:AppData4;after:AppData4}|null;
  readSourceBytes(plan:NexusRestoreHandle):Uint8Array|null;
  readRecoveryBackup(plan:NexusRestoreHandle):string|null;
  readRestoredBackup(plan:NexusRestoreHandle):string|null;
  releasePlan(plan:NexusRestoreHandle):boolean;
  dispose():void;
}
