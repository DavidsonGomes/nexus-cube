import { CANONICAL_VERSION, canonicalText, digest } from '../cloud/codec';
import type { ContextHandle } from '../cloud/types';
import {
  DataV4LimitError, MAX_V4_BACKUP_BYTES, exportBackupV4, parseBackupV4,
  preflightDataV4, verifyImportSourcesV4,
} from '../data/imported-model';
import type { AppData4 } from '../data/imported-model';
import { assertUnambiguousJson, DuplicateImportJsonKeyError } from './json-guard';
import type {
  NexusRestoreCollectionDiff, NexusRestoreCounts, NexusRestoreFailure, NexusRestoreHandle,
  NexusRestoreManifest, NexusRestoreManifestInput, NexusRestorePreviewDetails, NexusRestoreService, NexusRestoreTarget,
} from './restore-types';

/** Hash helpers are evidence only; they do not validate consent or issue handles. */
export function nexusRestoreTargetDigest(target:NexusRestoreTarget):Promise<string> {
  return digest(['nexus-cube/restore-target/v1',CANONICAL_VERSION,target.context,target.localRevision,target.data]);
}
export function nexusRestoreCandidateDigest(data:AppData4):Promise<string> {
  return digest(['nexus-cube/restore-candidate/v1',CANONICAL_VERSION,data]);
}
export function nexusRestorePlanDigest(manifest:NexusRestoreManifestInput):Promise<string> {
  // Explicit fields allow Elo to recompute from a full manifest without hashing its own hash.
  return digest(['nexus-cube/restore-plan/v1',manifest.protocolVersion,manifest.domainVersion,
    manifest.canonicalVersion,manifest.parserVersion,manifest.strategy,manifest.context,
    manifest.expectedLocalRevision,manifest.rawSHA256,manifest.targetDigest,manifest.candidateDigest,
    manifest.preparedAt,manifest.nonce]);
}

function validContext(context:ContextHandle):boolean {
  return !!context && typeof context.projectRef==='string' && context.projectRef.length>0
    && (context.userId===null || (typeof context.userId==='string' && context.userId.length>0))
    && Number.isSafeInteger(context.generation) && context.generation>=0;
}
function sameContext(a:ContextHandle,b:ContextHandle):boolean {
  return a.projectRef===b.projectRef && a.userId===b.userId && a.generation===b.generation;
}
function failure(error:unknown):NexusRestoreFailure {
  if(error instanceof DataV4LimitError)return {kind:'limit-exceeded',resource:error.resource,limit:error.limit};
  if(error instanceof DuplicateImportJsonKeyError)return {kind:'duplicate-json-key'};
  return {kind:'invalid'};
}
function counts(data:AppData4):NexusRestoreCounts {
  const result:NexusRestoreCounts={sessions:data.sessions.length,solves:data.solves.length,
    recordedSessions:0,importedSessions:0,recordedSolves:0,importedSolves:0,
    studyAttempts:data.studyAttempts.length,progress:Object.keys(data.progress).length,
    sources:data.imports.sources.length,batches:data.imports.batches.length,
    included:0,alreadyPresent:0,pending:0,excluded:0};
  for(const row of data.sessions)result[row.kind==='recorded'?'recordedSessions':'importedSessions']++;
  for(const row of data.solves)result[row.kind==='recorded'?'recordedSolves':'importedSolves']++;
  for(const batch of data.imports.batches)for(const row of batch.records){
    const kind=row.disposition.kind;
    result[kind==='already-present'?'alreadyPresent':kind]++;
  }
  return result;
}
function diff(before:[string,unknown][],after:[string,unknown][]):NexusRestoreCollectionDiff {
  const previous=new Map(before),next=new Map(after);
  const result:NexusRestoreCollectionDiff={added:[],removed:[],changed:[],unchanged:[]};
  for(const [id,value] of after){
    if(!previous.has(id))result.added.push(id);
    else result[canonicalText(previous.get(id))===canonicalText(value)?'unchanged':'changed'].push(id);
  }
  for(const [id] of before)if(!next.has(id))result.removed.push(id);
  return result;
}
const keyed=(rows:{id:string}[]):[string,unknown][]=>rows.map(row=>[row.id,row]);
function collections(before:AppData4,after:AppData4):NexusRestorePreviewDetails['collections'] {
  return {
    sessions:diff(keyed(before.sessions),keyed(after.sessions)),solves:diff(keyed(before.solves),keyed(after.solves)),
    studyAttempts:diff(keyed(before.studyAttempts),keyed(after.studyAttempts)),
    progress:diff(Object.entries(before.progress),Object.entries(after.progress)),
    sources:diff(keyed(before.imports.sources),keyed(after.imports.sources)),
    batches:diff(keyed(before.imports.batches),keyed(after.imports.batches)),
  };
}
interface RestoreEntry {
  bytes:Uint8Array;beforeJSON:string;afterJSON:string;manifest:NexusRestoreManifest;
}

/** Independent substitute restore, without changing append or imposing its V3 source cap.
 * Only a ready private handle permits pure apply. Persistence, Auth and replay receipts
 * belong to Elo. Synchronous parsing/preflight cannot be interrupted mid-call.
 */
export function createNexusRestoreService(options:{now?:()=>string;nonce?:()=>string}={}):NexusRestoreService {
  const entries=new Map<NexusRestoreHandle,RestoreEntry>();
  const now=options.now??(()=>new Date().toISOString()),nonce=options.nonce??(()=>crypto.randomUUID());
  let generation=0,closed=false,retainedBytes=0;
  function clear(){for(const entry of entries.values())retainedBytes-=entry.bytes.byteLength;entries.clear();}
  return {
    async previewRestore(target,source,options={}) {
      if(closed)return {kind:'closed'};
      const signal=options.signal;
      if(signal?.aborted)return {kind:'cancelled'};
      const currentGeneration=++generation;clear();
      const interrupted=():NexusRestoreFailure|null=>closed?{kind:'closed'}:
        signal?.aborted?{kind:'cancelled'}:generation!==currentGeneration?{kind:'superseded'}:null;
      let bytes:Uint8Array<ArrayBuffer>|undefined,published=false;
      try {
        if(!(source instanceof Uint8Array)||source.byteLength===0
          || (typeof SharedArrayBuffer!=='undefined'&&source.buffer instanceof SharedArrayBuffer))return {kind:'invalid'};
        if(source.byteLength>MAX_V4_BACKUP_BYTES)throw new DataV4LimitError('restore-source-bytes',MAX_V4_BACKUP_BYTES);
        if(source.byteLength>MAX_V4_BACKUP_BYTES-retainedBytes)throw new DataV4LimitError('restore-retained-source-bytes',MAX_V4_BACKUP_BYTES);
        bytes=new Uint8Array(source);retainedBytes+=bytes.byteLength;
        // Caller mutations after invocation cannot change source, context or baseline.
        const captured=structuredClone(target);
        if(!validContext(captured.context)||!Number.isSafeInteger(captured.localRevision)||captured.localRevision<0)return {kind:'invalid'};
        const preparedAt=now(),technicalNonce=nonce();
        if(typeof preparedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(preparedAt)
          ||new Date(preparedAt).toISOString()!==preparedAt||typeof technicalNonce!=='string'||technicalNonce.length<1||technicalNonce.length>100)return {kind:'invalid'};
        const before=preflightDataV4(captured.data);
        const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
        // A JSON value consumes at least one source character. This node bound
        // follows the V4 byte budget instead of silently inheriting the V3 2M cap.
        assertUnambiguousJson(text,32,text.length);
        const after=preflightDataV4(parseBackupV4(text));
        await verifyImportSourcesV4(before.data);
        let stopped=interrupted();if(stopped)return stopped;
        await verifyImportSourcesV4(after.data);
        stopped=interrupted();if(stopped)return stopped;
        const hash=await crypto.subtle.digest('SHA-256',bytes);
        stopped=interrupted();if(stopped)return stopped;
        const rawSHA256=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
        const targetDigest=await nexusRestoreTargetDigest({...captured,data:before.data});
        stopped=interrupted();if(stopped)return stopped;
        const candidateDigest=await nexusRestoreCandidateDigest(after.data);
        stopped=interrupted();if(stopped)return stopped;
        const input:NexusRestoreManifestInput={protocolVersion:1,domainVersion:4,canonicalVersion:CANONICAL_VERSION,
          parserVersion:'nexus-restore/1',strategy:'replace-nexus',context:captured.context,
          expectedLocalRevision:captured.localRevision,rawSHA256,targetDigest,candidateDigest,preparedAt,nonce:technicalNonce};
        const planSHA256=await nexusRestorePlanDigest(input);
        stopped=interrupted();if(stopped)return stopped;
        const manifest:NexusRestoreManifest={...input,planSHA256,planId:'rst_'+planSHA256};
        const details:NexusRestorePreviewDetails={strategy:'replace-nexus',before:counts(before.data),after:counts(after.data),
          collections:collections(before.data,after.data),selection:{before:before.data.activeSessionId,after:after.data.activeSessionId},
          settings:{before:before.data.settings,after:after.data.settings},
          sizes:{sourceBytes:bytes.byteLength,beforeSnapshotBytes:before.snapshotBytes,afterSnapshotBytes:after.snapshotBytes,
            recoveryBackupBytes:before.backupBytes,restoredBackupBytes:after.backupBytes}};
        const handle=Object.freeze({}) as NexusRestoreHandle;
        entries.set(handle,{bytes,beforeJSON:before.snapshotJSON,afterJSON:after.snapshotJSON,manifest});published=true;
        return {kind:'ready',plan:handle,...details};
      }catch(error){return interrupted()??failure(error);}
      finally{if(bytes&&!published)retainedBytes-=bytes.byteLength;}
    },
    applyRestore(target,handle,confirmation) {
      const entry=entries.get(handle);
      if(closed)return {kind:'closed'};
      if(!entry)return {kind:'invalid'};
      if(confirmation?.confirmReplacement!==true)return {kind:'confirmation-required'};
      try {
        if(!validContext(target.context)||!Number.isSafeInteger(target.localRevision)||target.localRevision<0)return {kind:'invalid'};
        if(!sameContext(target.context,entry.manifest.context)||target.localRevision!==entry.manifest.expectedLocalRevision)return {kind:'stale'};
        const current=preflightDataV4(target.data);
        if(current.snapshotJSON!==entry.beforeJSON)return {kind:'stale'};
        return {kind:'applied',data:preflightDataV4(JSON.parse(entry.afterJSON)).data,planId:entry.manifest.planId};
      }catch(error){return failure(error);}
    },
    readRestoreManifest(handle){const entry=entries.get(handle);return entry?structuredClone(entry.manifest):null;},
    readPreviewData(handle){const entry=entries.get(handle);return entry?{before:JSON.parse(entry.beforeJSON) as AppData4,after:JSON.parse(entry.afterJSON) as AppData4}:null;},
    readSourceBytes(handle){const entry=entries.get(handle);return entry?new Uint8Array(entry.bytes):null;},
    readRecoveryBackup(handle){const entry=entries.get(handle);return entry?exportBackupV4(JSON.parse(entry.beforeJSON),entry.manifest.preparedAt):null;},
    readRestoredBackup(handle){const entry=entries.get(handle);return entry?exportBackupV4(JSON.parse(entry.afterJSON),entry.manifest.preparedAt):null;},
    releasePlan(handle){const entry=entries.get(handle);if(!entry)return false;entries.delete(handle);retainedBytes-=entry.bytes.byteLength;return true;},
    dispose(){closed=true;generation++;clear();},
  };
}
