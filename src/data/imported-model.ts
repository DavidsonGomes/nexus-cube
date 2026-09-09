import type { AppData, Penalty, Session, Solve, StoredSolveMode } from '../domain/types';
import { parseAlgorithm } from '../domain/cube';
import { assertTime } from '../domain/timer';
import { assertStoredSolveMode } from '../domain/modes';
import { BACKUP_ENVELOPE_OVERHEAD_BYTES, MAX_ACCOUNT_SNAPSHOT_BYTES, MAX_BACKUP_BYTES, MAX_SYNC_SELECTION_EXTRA_BYTES, MIGRATION_NUMBER_ALLOWANCE_BYTES, parseBackup, saveData, utf8ByteLength, validateData, validCaseId } from './store';

export type RecordedSessionV4=Session & {kind:'recorded'};
export type RecordedSolveV4=Solve & {kind:'recorded'};
export interface ImportRefV4 {batchId:string;recordKey:string}
export interface ImportedSessionV4 {kind:'imported';id:string;name:string|null;createdAt:string|null;mode:StoredSolveMode;importRef:ImportRefV4}
export interface ImportedSolveV4 {
  kind:'imported';id:string;sessionId:string;mode:StoredSolveMode;puzzle:'333';rawMs:number;penalty:Penalty;
  createdAt:string|null;note:string|null;scramble:string|null;scrambleNotation:'nexus'|'external-unverified'|'absent';
  source:'imported';captureSource:'timer'|'manual'|'unknown';importRef:ImportRefV4;
}
export type SessionV4=RecordedSessionV4|ImportedSessionV4;
export type SolveV4=RecordedSolveV4|ImportedSolveV4;
export type ImportFormatV4='nexus-backup'|'cstimer-json'|'cube-timer-sqlite';
export interface ImportSourceArchiveV4 {id:string;format:ImportFormatV4;variant:string;byteLength:number;rawSHA256:string;bytesBase64:string}
export type ImportRecordDispositionV4=
  | {kind:'included'|'already-present';entity:'session'|'solve'|'study-attempt'|'progress';targetId:string}
  | {kind:'pending';reason:'unknown-time'|'unknown-penalty'|'unknown-puzzle'|'unsupported-puzzle'|'unmapped-fields'|'unresolved-parent'}
  | {kind:'excluded';reason:'user-confirmed'};
export interface ImportRecordDecisionV4 {key:string;ordinal:number;disposition:ImportRecordDispositionV4}
export interface ImportBatchV4 {id:string;sourceId:string;parserVersion:string;canonicalVersion:1;semanticSHA256:string;planSHA256:string;importedAt:string;duplicateOf:string|null;records:ImportRecordDecisionV4[]}
export interface AppData4 extends Omit<AppData,'version'|'sessions'|'solves'> {version:4;sessions:SessionV4[];solves:SolveV4[];imports:{sources:ImportSourceArchiveV4[];batches:ImportBatchV4[]}}
export interface DataV4Preflight {data:AppData4;snapshotJSON:string;accountBytes:number;snapshotBytes:number;backupBytes:number;sourceBytes:number;importsBytes:number}
export class DataV4LimitError extends Error {
  readonly code='limit-exceeded' as const;
  constructor(readonly resource:string,readonly limit:number){super(`O limite V4 de ${resource} foi excedido (${limit}). Nenhum dado foi descartado.`);this.name='DataV4LimitError';}
}
const limit=(resource:string,max:number):never=>{throw new DataV4LimitError(resource,max);};

export const MAX_V4_SESSIONS=1000,MAX_V4_SOLVES=100000,MAX_V4_SOURCES=1000,MAX_V4_BATCHES=1000,MAX_V4_RECORDS=202000;
export const MAX_V4_SOURCE_BYTES=MAX_BACKUP_BYTES;
export const V4_RECORDED_KIND_BYTES=utf8ByteLength(',"kind":"recorded"');
export const V4_EMPTY_IMPORTS_BYTES=utf8ByteLength(',"imports":{"sources":[],"batches":[]}');
// Conservative canonicalization envelope, anchored to V3, never to a V4 round-trip.
// R6/D2 already covers legacy source conversion. This also exceeds every canonical
// V3 account plus 18 bytes per discriminant and the empty imports field.
export const MAX_V4_ACCOUNT_BYTES=2*MAX_BACKUP_BYTES+MIGRATION_NUMBER_ALLOWANCE_BYTES+V4_RECORDED_KIND_BYTES*(MAX_V4_SESSIONS+MAX_V4_SOLVES)+V4_EMPTY_IMPORTS_BYTES;
export const MAX_V4_RECORD_JSON_BYTES=1023;
export const MAX_V4_METADATA_BYTES=4096*MAX_V4_BATCHES;
// Per-source padding: sum ceil(n_i/3) <= ceil(sum n_i/3) + sourceCount-1.
export const MAX_V4_BASE64_BYTES=4*Math.ceil(MAX_V4_SOURCE_BYTES/3)+4*(MAX_V4_SOURCES-1);
export const MAX_V4_IMPORTS_BYTES=MAX_V4_BASE64_BYTES+(MAX_V4_RECORD_JSON_BYTES+1)*MAX_V4_RECORDS+MAX_V4_METADATA_BYTES;
export const MAX_V4_SNAPSHOT_BYTES=MAX_V4_ACCOUNT_BYTES+MAX_SYNC_SELECTION_EXTRA_BYTES+MAX_V4_IMPORTS_BYTES;
export const MAX_V4_BACKUP_BYTES=MAX_V4_SNAPSHOT_BYTES+BACKUP_ENVELOPE_OVERHEAD_BYTES;

const fail=(message:string):never=>{throw new Error('Dados V4 inválidos: '+message);};
function obj(value:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)fail('objeto esperado.');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(v,k)))fail('campos ausentes ou desconhecidos.');return v;
}
function str(v:unknown,max=10000,nonempty=false):string{if(typeof v!=='string'||v.length>max||(nonempty&&!v.trim()))fail('texto inválido.');return v as string;}
function id(v:unknown):string{const s=str(v,100,true);if(!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(s)||['__proto__','constructor','prototype'].includes(s))fail('ID inválido.');return s;}
function key(v:unknown):string{const s=str(v,128,true);if(!/^[A-Za-z0-9][A-Za-z0-9_:./-]*$/.test(s)||['__proto__','constructor','prototype'].includes(s))fail('localizador inválido.');return s;}
function date(v:unknown):string{const s=str(v,24,true);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString()!==s)fail('data inválida.');return s;}
function hash(v:unknown):string{const s=str(v,64);if(!/^[a-f0-9]{64}$/.test(s))fail('digest inválido.');return s;}
function choice<T extends string>(v:unknown,values:readonly T[]):T{if(!values.includes(v as T))fail('opção inválida.');return v as T;}
function list(v:unknown,max:number,resource:string):unknown[]{if(!Array.isArray(v))fail('lista inválida.');if((v as unknown[]).length>max)limit(resource,max);return v as unknown[];}
function unique(items:readonly {id:string}[]):void{if(new Set(items.map(v=>v.id)).size!==items.length)fail('IDs duplicados.');}
function integer(v:unknown,max:number):number{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>max)fail('inteiro inválido.');return v as number;}
function time(v:unknown):number{if(typeof v!=='number')fail('tempo inválido.');assertTime(v as number);return v as number;}
function mode(v:unknown):StoredSolveMode{assertStoredSolveMode(v);return v;}
function ref(v:unknown):ImportRefV4{const r=obj(v,['batchId','recordKey']);return {batchId:id(r.batchId),recordKey:key(r.recordKey)};}
function canonicalBase64(value:unknown,bytes:number):string{
  const s=str(value,4*Math.ceil(MAX_V4_SOURCE_BYTES/3));
  if(s.length!==4*Math.ceil(bytes/3))fail('comprimento base64 divergente.');
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding=bytes%3===0?0:3-bytes%3;
  for(let i=0;i<s.length;i++)if(i<s.length-padding?!alphabet.includes(s[i]):s[i]!=='=')fail('base64 inválido.');
  if(padding&&s.length){const n=alphabet.indexOf(s[s.length-padding-1]);if(n<0||(padding===2?n%16:n%4)!==0)fail('base64 não canônico.');}
  return s;
}
/** Structural/canonical validation; verifyImportSourcesV4 additionally proves SHA-256 bytes. */
export function validateDataV4(value:unknown):AppData4 {
  const v=obj(value,['version','sessions','activeSessionId','solves','progress','studyAttempts','settings','imports']);if(v.version!==4)fail('versão não suportada.');
  // Reuse the V3 authority for unchanged settings/progress/study, without fictitious solves.
  const shared=validateData({version:3,sessions:[],activeSessionId:null,solves:[],progress:v.progress,studyAttempts:v.studyAttempts,settings:v.settings});
  const sessions:SessionV4[]=list(v.sessions,MAX_V4_SESSIONS,'sessions').map(value=>{
    const imported=(value as {kind?:unknown})?.kind==='imported';
    const s=obj(value,imported?['kind','id','name','createdAt','mode','importRef']:['kind','id','name','createdAt','mode']);
    if(imported)return {kind:'imported',id:id(s.id),name:s.name===null?null:str(s.name,100),createdAt:s.createdAt===null?null:date(s.createdAt),mode:mode(s.mode),importRef:ref(s.importRef)};
    if(s.kind!=='recorded')fail('variante de sessão inválida.');
    return {kind:'recorded',id:id(s.id),name:str(s.name,100,true),createdAt:date(s.createdAt),mode:mode(s.mode)};
  });unique(sessions);
  const parents=new Map(sessions.map(s=>[s.id,s.mode]));
  const activeSessionId=v.activeSessionId===null?null:id(v.activeSessionId);if(activeSessionId!==null&&!parents.has(activeSessionId))fail('sessão ativa desconhecida.');
  const solves:SolveV4[]=list(v.solves,MAX_V4_SOLVES,'solves').map(value=>{
    const imported=(value as {kind?:unknown})?.kind==='imported';
    const s=obj(value,imported?['kind','id','sessionId','mode','puzzle','rawMs','penalty','createdAt','note','scramble','scrambleNotation','source','captureSource','importRef']:['kind','id','sessionId','mode','rawMs','penalty','scramble','createdAt','note','source']);
    const sessionId=id(s.sessionId),m=mode(s.mode);if(!parents.has(sessionId)||parents.get(sessionId)!==m)fail('pai ou modalidade divergente.');
    const common={id:id(s.id),sessionId,mode:m,rawMs:time(s.rawMs),penalty:choice(s.penalty,['none','+2','DNF'] as const)};
    if(imported){
      const scramble=s.scramble===null?null:str(s.scramble,1000),scrambleNotation=choice(s.scrambleNotation,['nexus','external-unverified','absent'] as const);
      if((scrambleNotation==='absent')!==(scramble===null))fail('ausência de scramble divergente.');
      if(scrambleNotation==='nexus')parseAlgorithm(scramble!);
      return {...common,kind:'imported',puzzle:choice(s.puzzle,['333']),createdAt:s.createdAt===null?null:date(s.createdAt),note:s.note===null?null:str(s.note),scramble,scrambleNotation,source:choice(s.source,['imported']),captureSource:choice(s.captureSource,['timer','manual','unknown']),importRef:ref(s.importRef)};
    }
    if(s.kind!=='recorded')fail('variante de solve inválida.');
    const scramble=str(s.scramble,1000),source=choice(s.source,['timer','manual'] as const);parseAlgorithm(scramble);if(source==='timer'&&!scramble.trim())fail('timer sem scramble.');
    return {...common,kind:'recorded',scramble,source,createdAt:date(s.createdAt),note:str(s.note)};
  });unique(solves);
  const im=obj(v.imports,['sources','batches']);let sourceBytes=0;
  const sources:ImportSourceArchiveV4[]=list(im.sources,MAX_V4_SOURCES,'sources').map(value=>{
    const s=obj(value,['id','format','variant','byteLength','rawSHA256','bytesBase64']),digest=hash(s.rawSHA256),sourceId=id(s.id),byteLength=integer(s.byteLength,Number.MAX_SAFE_INTEGER);
    if(sourceId!=='src_'+digest)fail('ID da fonte diverge do digest.');sourceBytes+=byteLength;if(sourceBytes>MAX_V4_SOURCE_BYTES)limit('source-bytes',MAX_V4_SOURCE_BYTES);
    return {id:sourceId,format:choice(s.format,['nexus-backup','cstimer-json','cube-timer-sqlite']),variant:str(s.variant,100,true),byteLength,rawSHA256:digest,bytesBase64:canonicalBase64(s.bytesBase64,byteLength)};
  });unique(sources);
  const sourceIds=new Set(sources.map(s=>s.id)),priorBatchIds=new Set<string>();let recordCount=0;
  const batches:ImportBatchV4[]=list(im.batches,MAX_V4_BATCHES,'batches').map(value=>{
    const b=obj(value,['id','sourceId','parserVersion','canonicalVersion','semanticSHA256','planSHA256','importedAt','duplicateOf','records']);
    const batchId=id(b.id),sourceId=id(b.sourceId),planSHA256=hash(b.planSHA256);if(batchId!=='imp_'+planSHA256||!sourceIds.has(sourceId)||b.canonicalVersion!==1)fail('lote/fonte/versão canônica divergente.');
    const duplicateOf=b.duplicateOf===null?null:id(b.duplicateOf);if(duplicateOf!==null&&!priorBatchIds.has(duplicateOf))fail('lote duplicado exige referência anterior.');
    const keys=new Set<string>(),ordinals=new Set<number>();
    const records:ImportRecordDecisionV4[]=list(b.records,MAX_V4_RECORDS,'records').map(value=>{
      if(++recordCount>MAX_V4_RECORDS)limit('records',MAX_V4_RECORDS);const r=obj(value,['key','ordinal','disposition']),recordKey=key(r.key),ordinal=integer(r.ordinal,Number.MAX_SAFE_INTEGER);
      if(keys.has(recordKey)||ordinals.has(ordinal))fail('linha ou ordinal duplicado.');keys.add(recordKey);ordinals.add(ordinal);
      const raw=r.disposition as {kind?:unknown};let disposition:ImportRecordDispositionV4;
      if(raw?.kind==='included'||raw?.kind==='already-present'){
        const d=obj(raw,['kind','entity','targetId']),entity=choice(d.entity,['session','solve','study-attempt','progress'] as const);
        disposition={kind:raw.kind,entity,targetId:entity==='progress'?validCaseId(d.targetId):id(d.targetId)};
      }else if(raw?.kind==='pending'){
        const d=obj(raw,['kind','reason']);disposition={kind:'pending',reason:choice(d.reason,['unknown-time','unknown-penalty','unknown-puzzle','unsupported-puzzle','unmapped-fields','unresolved-parent'])};
      }else{const d=obj(raw,['kind','reason']);if(d.kind!=='excluded'||d.reason!=='user-confirmed')fail('disposição inválida.');disposition={kind:'excluded',reason:'user-confirmed'};}
      const result={key:recordKey,ordinal,disposition};if(utf8ByteLength(JSON.stringify(result))>MAX_V4_RECORD_JSON_BYTES)limit('record-bytes',MAX_V4_RECORD_JSON_BYTES);return result;
    });
    priorBatchIds.add(batchId);
    return {id:batchId,sourceId,parserVersion:str(b.parserVersion,100,true),canonicalVersion:1,semanticSHA256:hash(b.semanticSHA256),planSHA256,importedAt:date(b.importedAt),duplicateOf,records};
  });unique(batches);
  const decisions=new Map(batches.map(b=>[b.id,new Map(b.records.map(r=>[r.key,r.disposition]))]));
  for(const [entity,items] of [['session',sessions],['solve',solves]] as const)for(const item of items)if(item.kind==='imported'){
    const d=decisions.get(item.importRef.batchId)?.get(item.importRef.recordKey);
    if(d?.kind!=='included'||d.entity!==entity||d.targetId!==item.id)fail('proveniência ativa sem decisão included correspondente.');
  }
  return {version:4,sessions,activeSessionId,solves,progress:shared.progress,studyAttempts:shared.studyAttempts,settings:shared.settings,imports:{sources,batches}};
}
export function migrateDataToV4(value:unknown):AppData4 {
  if((value as {version?:unknown})?.version===4)return preflightDataV4(value).data;
  const v3=validateData(value);saveData(v3,{getItem:()=>null,setItem:()=>{}});
  return preflightDataV4({...v3,version:4,sessions:v3.sessions.map(s=>({...s,kind:'recorded'})),solves:v3.solves.map(s=>({...s,kind:'recorded'})),imports:{sources:[],batches:[]}}).data;
}
export function downgradeDataV4ToV3(value:AppData4):{kind:'compatible';data:AppData}|{kind:'incompatible';reasons:string[]} {
  const data=validateDataV4(value);
  if(data.imports.sources.length||data.imports.batches.length||data.sessions.some(s=>s.kind==='imported')||data.solves.some(s=>s.kind==='imported'))return {kind:'incompatible',reasons:['O formato V3 não representa proveniência, arquivos ou pendências importadas.']};
  const {imports:_,...rest}=data;
  try{
    const v3=validateData({...rest,version:3,sessions:data.sessions.map(({kind:__,...s})=>s),solves:data.solves.map(({kind:__,...s})=>s)});saveData(v3,{getItem:()=>null,setItem:()=>{}});return {kind:'compatible',data:v3};
  }catch{return {kind:'incompatible',reasons:['O conteúdo não cabe nas regras e orçamento V3.']};}
}
export function preflightDataV4(value:unknown):DataV4Preflight {
  const data=validateDataV4(value),accountBytes=utf8ByteLength(JSON.stringify({...data,activeSessionId:null,imports:{sources:[],batches:[]}}));
  if(accountBytes>MAX_V4_ACCOUNT_BYTES)limit('account-bytes',MAX_V4_ACCOUNT_BYTES);
  const metadata={sources:data.imports.sources.map(s=>({...s,bytesBase64:''})),batches:data.imports.batches.map(b=>({...b,records:[]}))};
  if(utf8ByteLength(JSON.stringify(metadata))>MAX_V4_METADATA_BYTES)limit('metadata-bytes',MAX_V4_METADATA_BYTES);
  const importsBytes=utf8ByteLength(JSON.stringify(data.imports));if(importsBytes>MAX_V4_IMPORTS_BYTES)limit('imports-bytes',MAX_V4_IMPORTS_BYTES);
  const snapshotJSON=JSON.stringify(data),snapshotBytes=utf8ByteLength(snapshotJSON),backupBytes=snapshotBytes+BACKUP_ENVELOPE_OVERHEAD_BYTES;
  if(snapshotBytes>MAX_V4_SNAPSHOT_BYTES)limit('snapshot-bytes',MAX_V4_SNAPSHOT_BYTES);
  if(backupBytes>MAX_V4_BACKUP_BYTES)limit('backup-bytes',MAX_V4_BACKUP_BYTES);
  return {data,snapshotJSON,accountBytes,snapshotBytes,backupBytes,sourceBytes:data.imports.sources.reduce((n,s)=>n+s.byteLength,0),importsBytes};
}
export function exportBackupV4(data:AppData4,exportedAt=new Date().toISOString()):string {
  date(exportedAt);const p=preflightDataV4(data);
  return '{"format":"nexus-cube","version":4,"exportedAt":'+JSON.stringify(exportedAt)+',"data":'+p.snapshotJSON+'}';
}
export function parseBackupV4(text:string):AppData4 {
  if(typeof text!=='string')fail('arquivo inválido.');
  if(utf8ByteLength(text)>MAX_V4_BACKUP_BYTES)limit('backup-bytes',MAX_V4_BACKUP_BYTES);
  const root:unknown=JSON.parse(text);
  if((root as {version?:unknown})?.version!==4)return migrateDataToV4(parseBackup(text));
  const b=obj(root,['format','version','exportedAt','data']);if(b.format!=='nexus-cube'||(b.data as {version?:unknown})?.version!==4)fail('envelope divergente.');date(b.exportedAt);
  return preflightDataV4(b.data).data;
}
/** Required before accepting archived bytes into a persistent transaction. No writes. */
export async function verifyImportSourcesV4(value:AppData4):Promise<void> {
  const data=preflightDataV4(value).data;
  for(const source of data.imports.sources){
    const binary=atob(source.bytesBase64),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    const actual=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    if(actual!==source.rawSHA256)fail('SHA-256 não corresponde aos bytes da fonte.');
  }
}
/** Lower bound check for independent consumers deriving migration budgets. */
export const V4_CANONICAL_V3_MIGRATION_BOUND=MAX_ACCOUNT_SNAPSHOT_BYTES+V4_RECORDED_KIND_BYTES*(MAX_V4_SESSIONS+MAX_V4_SOLVES)+V4_EMPTY_IMPORTS_BYTES;
