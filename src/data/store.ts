import { LEARNING_CONTENT } from '../domain/catalog';
import type { AppData, CaseProgress, CSVScope, Session, Settings, Solve, StudyAttempt } from '../domain/types';
import { parseAlgorithm } from '../domain/cube';
import { assertTime } from '../domain/timer';
import { assertStoredSolveMode, selectSolves } from '../domain/modes';
export interface StorageLike { getItem(key: string): string|null; setItem(key: string,value: string): void }
export const STORAGE_KEY='nexus-cube:v1';
export const MAX_LEGACY_SOURCE_BYTES=20*1024*1024;
const MAX_SESSION_COUNT=1000,MAX_SOLVE_COUNT=100000,MAX_STUDY_ATTEMPT_COUNT=100000;
// A raw UTF-16 lone surrogate costs 3 UTF-8 replacement bytes, but JSON escapes it
// into 6 ASCII bytes. Twice the source budget bounds string/structural growth.
// Nonnegative finite JSON numbers need at most 24 ASCII bytes: allow their ENTIRE
// output as additional growth for every rawMs/durationMs and two numeric settings.
// Adding ,"mode":null costs exactly 12 bytes per session/solve. Version stays 1 digit.
export const MIGRATION_NUMBER_ALLOWANCE_BYTES=24*(MAX_SOLVE_COUNT+MAX_STUDY_ATTEMPT_COUNT+2);
export const MIGRATION_MODE_ALLOWANCE_BYTES=12*(MAX_SESSION_COUNT+MAX_SOLVE_COUNT);
/** Historical R6 snapshot capacity. This anchor never grows on a round-trip. */
export const V3_COMPAT_SNAPSHOT_BYTES=2*MAX_LEGACY_SOURCE_BYTES+MIGRATION_NUMBER_ALLOWANCE_BYTES+MIGRATION_MODE_ALLOWANCE_BYTES;
// A historical one-character ID occupies 3 JSON bytes; null occupies 4.
export const MAX_ACCOUNT_SNAPSHOT_BYTES=V3_COMPAT_SNAPSHOT_BYTES+1;
// Any valid ASCII ID occupies at most 102 quoted bytes, versus null's 4.
export const MAX_SYNC_SELECTION_EXTRA_BYTES=98;
export const MAX_SNAPSHOT_BYTES=MAX_ACCOUNT_SNAPSHOT_BYTES+MAX_SYNC_SELECTION_EXTRA_BYTES;
export function utf8ByteLength(text:string):number {return new TextEncoder().encode(text).byteLength;}
function backupEnvelope(snapshotJSON:string,exportedAt:string):string {
  return '{"format":"nexus-cube","version":3,"exportedAt":'+JSON.stringify(exportedAt)+',"data":'+snapshotJSON+'}';
}
// Every accepted timestamp has exactly 24 ASCII bytes. Measure the actual wire format.
export const BACKUP_ENVELOPE_OVERHEAD_BYTES=utf8ByteLength(backupEnvelope('{}','2000-01-01T00:00:00.000Z'))-utf8ByteLength('{}');
export const MAX_BACKUP_BYTES=MAX_SNAPSHOT_BYTES+BACKUP_ENVELOPE_OVERHEAD_BYTES;
const fail=(message: string):never=>{throw new Error(`Dados invalidos: ${message}`);};
function object(value: unknown,keys: readonly string[]): Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)fail('objeto esperado.');const v=value as Record<string,unknown>;if(Object.keys(v).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(v,k)))fail('campos ausentes ou desconhecidos.');return v;}
function string(value: unknown,max=10000,nonempty=false): string {if(typeof value!=='string'||value.length>max||(nonempty&&!value.trim()))fail('texto invalido.');return value as string;}
function id(value: unknown): string {const v=string(value,100,true);if(!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(v)||['__proto__','constructor','prototype'].includes(v))fail('identificador invalido.');return v;}
function date(value: unknown): string {const v=string(value,30,true);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)fail('data invalida.');return v;}
function number(value: unknown,min: number,max: number): number {if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail('numero invalido.');return value as number;}
function time(value: unknown): number {if(typeof value!=='number')fail('tempo invalido.');assertTime(value as number);return value as number;}
function bool(value: unknown): boolean {if(typeof value!=='boolean')fail('booleano invalido.');return value as boolean;}
function choice<T extends string>(value: unknown,choices: readonly T[]): T {if(!choices.includes(value as T))fail('opcao invalida.');return value as T;}
function array(value: unknown,max: number): unknown[] {if(!Array.isArray(value)||value.length>max)fail('lista invalida ou excessiva.');return value as unknown[];}
function unique(items: readonly {id:string}[]): void {if(new Set(items.map(i=>i.id)).size!==items.length)fail('identificadores duplicados.');}
const legacyCaseId=(v:string)=>/^OLL-(0[1-9]|[1-4][0-9]|5[0-7])$/.test(v)||/^PLL-(Aa|Ab|E|F|Ga|Gb|Gc|Gd|H|Ja|Jb|Na|Nb|Ra|Rb|T|Ua|Ub|V|Y|Z)$/.test(v);
export function validCaseId(value:unknown,legacy=false):string {const v=string(value,100,true);if(legacy?!legacyCaseId(v):!LEARNING_CONTENT.some(c=>c.id===v))fail('conteudo desconhecido.');return v;}
export const DEFAULT_SETTINGS: Settings={theme:'system',inspection:false,inspectionSound:true,holdMs:300,focus:false,hideRunningTime:false,animationSpeed:1};
export function createInitialData(): AppData {return {version:3,sessions:[],activeSessionId:null,solves:[],progress:{},studyAttempts:[],settings:{...DEFAULT_SETTINGS}};}
export function validateData(value: unknown): AppData {
  const v=object(value,['version','sessions','activeSessionId','solves','progress','studyAttempts','settings']);if(v.version!==1&&v.version!==2&&v.version!==3)fail('versao nao suportada.');const legacy=v.version===1,hasModes=v.version===3;
  const sessions:Session[]=array(v.sessions,MAX_SESSION_COUNT).map(item=>{const s=object(item,hasModes?['id','name','createdAt','mode']:['id','name','createdAt']);const mode=hasModes?s.mode:null;assertStoredSolveMode(mode);return {id:id(s.id),name:string(s.name,100,true),createdAt:date(s.createdAt),mode};});if(!hasModes&&!sessions.length)fail('e necessaria uma sessao no formato legado.');unique(sessions);
  const sessionModes=new Map(sessions.map(s=>[s.id,s.mode]));const activeSessionId=hasModes&&v.activeSessionId===null?null:id(v.activeSessionId);if(activeSessionId!==null&&!sessionModes.has(activeSessionId))fail('sessao ativa desconhecida.');
  const solves:Solve[]=array(v.solves,MAX_SOLVE_COUNT).map(item=>{const s=object(item,hasModes?['id','sessionId','mode','rawMs','penalty','scramble','createdAt','note','source']:['id','sessionId','rawMs','penalty','scramble','createdAt','note','source']);const sessionId=id(s.sessionId);if(!sessionModes.has(sessionId))fail('sessao de solve desconhecida.');const mode=hasModes?s.mode:null;assertStoredSolveMode(mode);if(mode!==sessionModes.get(sessionId))fail('modalidade da resolucao difere da sessao.');const scramble=string(s.scramble,1000);parseAlgorithm(scramble);const source=choice(s.source,['timer','manual']);if(source==='timer'&&!scramble.trim())fail('solve de timer sem scramble.');return {id:id(s.id),sessionId,mode,rawMs:time(s.rawMs),penalty:choice(s.penalty,['none','+2','DNF']),scramble,createdAt:date(s.createdAt),note:string(s.note),source};});unique(solves);
  if(!v.progress||typeof v.progress!=='object'||Array.isArray(v.progress)||Object.getPrototypeOf(v.progress)!==Object.prototype)fail('progresso invalido.');const entries=Object.entries(v.progress as object);if(entries.length>(legacy?78:LEARNING_CONTENT.length))fail('progresso excessivo.');const progress:Record<string,CaseProgress>={};
  for(const [key,entry] of entries){const caseId=validCaseId(key,legacy);const p=object(entry,['caseId','favorite','status','note']);if(p.caseId!==caseId)fail('referencia de progresso incorreta.');progress[caseId]={caseId,favorite:bool(p.favorite),status:choice(p.status,['new','learning','mastered']),note:string(p.note)};}
  const studyAttempts:StudyAttempt[]=array(v.studyAttempts,MAX_STUDY_ATTEMPT_COUNT).map(entry=>{const s=object(entry,['id','caseId','createdAt','recognition','execution','durationMs']);return {id:id(s.id),caseId:validCaseId(s.caseId,legacy),createdAt:date(s.createdAt),recognition:choice(s.recognition,['again','good']),execution:choice(s.execution,['again','good']),durationMs:s.durationMs===null?null:time(s.durationMs)};});unique(studyAttempts);
  const s=object(v.settings,['theme','inspection','inspectionSound','holdMs','focus','hideRunningTime','animationSpeed']);const settings:Settings={theme:choice(s.theme,['light','dark','system']),inspection:bool(s.inspection),inspectionSound:bool(s.inspectionSound),holdMs:number(s.holdMs,0,2000),focus:bool(s.focus),hideRunningTime:bool(s.hideRunningTime),animationSpeed:number(s.animationSpeed,0.1,5)};
  return {version:3,sessions,activeSessionId,solves,progress,studyAttempts,settings};
}
function storageOrThrow(storage?: StorageLike): StorageLike {if(storage)return storage;if(typeof localStorage==='undefined')throw new Error('Armazenamento local indisponivel.');return localStorage;}
function limitedJSON(text: string,maxBytes:number): unknown {if(typeof text!=='string'||utf8ByteLength(text)>maxBytes)throw new Error(`Arquivo excede o limite de ${maxBytes} bytes UTF-8.`);try{return JSON.parse(text);}catch{throw new Error('JSON invalido.');}}
function assertLegacySourceSize(value:unknown,text:string):void {
  if(value&&typeof value==='object'&&[1,2].includes((value as {version:number}).version)&&utf8ByteLength(text)>MAX_LEGACY_SOURCE_BYTES)throw new Error('Fonte legada excede o limite histórico de 20 MiB em UTF-8.');
}
function snapshotJSON(data:AppData):string {
  const checked=validateData(data),text=JSON.stringify(checked);
  if(utf8ByteLength(JSON.stringify({...checked,activeSessionId:null}))>MAX_ACCOUNT_SNAPSHOT_BYTES)throw new Error(`Conteúdo da conta excede o limite fixo de ${MAX_ACCOUNT_SNAPSHOT_BYTES} bytes UTF-8. A seleção local não amplia esse orçamento.`);
  if(utf8ByteLength(text)>MAX_SNAPSHOT_BYTES)throw new Error(`Dados excedem o limite de ${MAX_SNAPSHOT_BYTES} bytes UTF-8. O conteúdo original foi preservado; baixe a cópia de recuperação antes de alterar os dados.`);
  return text;
}
export function loadData(storage?: StorageLike): {data:AppData;error:string|null} {try{const raw=storageOrThrow(storage).getItem(STORAGE_KEY);if(raw===null)return {data:createInitialData(),error:null};const parsed=limitedJSON(raw,MAX_SNAPSHOT_BYTES);assertLegacySourceSize(parsed,raw);const data=validateData(parsed);snapshotJSON(data);return {data,error:null};}catch(error){return {data:createInitialData(),error:error instanceof Error?error.message:'Falha ao carregar dados.'};}}
export function saveData(data: AppData,storage?: StorageLike): void {const text=snapshotJSON(data);try{storageOrThrow(storage).setItem(STORAGE_KEY,text);}catch(error){throw new Error(`Nao foi possivel salvar: ${error instanceof Error?error.message:'armazenamento indisponivel'}`);}}
export function exportBackup(data: AppData): string {
  const snapshot=snapshotJSON(data),exportedAt=new Date().toISOString();date(exportedAt);
  const text=backupEnvelope(snapshot,exportedAt);
  if(utf8ByteLength(text)>MAX_BACKUP_BYTES)throw new Error('Backup excede o limite do arquivo em bytes UTF-8.');
  return text;
}
export function parseBackup(text: string): AppData {const b=object(limitedJSON(text,MAX_BACKUP_BYTES),['format','version','exportedAt','data']);if(b.format!=='nexus-cube'||(b.version!==1&&b.version!==2&&b.version!==3))fail('formato ou versao de backup nao suportado.');assertLegacySourceSize(b,text);date(b.exportedAt);if(!b.data||typeof b.data!=='object'||(b.data as Record<string,unknown>).version!==b.version)fail('versoes de envelope e dados divergentes.');const data=validateData(b.data);snapshotJSON(data);return data;}
export function importBackup(text: string,storage?: StorageLike): AppData {const data=parseBackup(text);saveData(data,storage);return data;}
function csvCell(value: unknown): string {let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
export function exportCSV(data: AppData,scope:CSVScope): string {
  const v=validateData(data);
  if(!scope||typeof scope!=='object')throw new Error('Escolha o recorte da exportação.');
  if(scope.kind==='all'&&Object.keys(scope).some(key=>key!=='kind'))throw new Error('Recorte de exportação inválido.');
  const solves=scope.kind==='all'?v.solves:selectSolves(v,scope);
  const names=new Map(v.sessions.map(s=>[s.id,s.name]));
  const rows:unknown[][]=[['id','sessao','session_id','modalidade','data_utc','tempo_bruto_ms','penalidade','tempo_efetivo_ms','scramble','nota','origem']];
  for(const s of solves)rows.push([s.id,names.get(s.sessionId),s.sessionId,s.mode??'unclassified',s.createdAt,s.rawMs,s.penalty,s.penalty==='DNF'?'DNF':s.rawMs+(s.penalty==='+2'?2000:0),s.scramble,s.note,s.source]);
  return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
