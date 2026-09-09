import { MAX_TIME_MS } from '../domain/timer';
import type { ImportParseResult, JsonValue, ParsedImport } from './types';
import { copy, embedded, has, invalid, issue, jsonFailure, MAX_IMPORT_ROWS, parseJson, record, stringOrNull } from './shared';

const variant='cstimer-session-tuples-v1';
function epochISO(value:JsonValue|undefined):string|null {
  if(typeof value!=='number'||!Number.isFinite(value))return null;
  const milliseconds=value*1000;
  if(!Number.isSafeInteger(milliseconds))return null;
  const date=new Date(milliseconds);if(!Number.isFinite(date.getTime()))return null;
  const iso=date.toISOString();return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(iso)?iso:null;
}
export function parseCsTimerText(text:string):ImportParseResult {
  let root:JsonValue;
  try{root=parseJson(text);}catch(error){return jsonFailure(error,'invalid-json','Não foi possível ler o JSON dentro dos limites.');}
  if(!record(root)||!Object.keys(root).some(key=>/^session[1-9]\d*$/.test(key)))return {kind:'unrecognized',reason:'Não há sessões no formato csTimer conhecido.'};
  const result:ParsedImport={kind:'parsed',format:'cstimer-json',variant,sessions:[],solves:[],auxiliary:[],metadata:copy(root),issues:[]};
  let properties:Record<string,JsonValue>={},sessionData:Record<string,JsonValue>={};
  try{
    if(has(root,'properties')){const parsed=embedded(root.properties);if(!record(parsed))return invalid('invalid-properties','Metadados properties precisam ser um objeto ou JSON de objeto.');properties=parsed;}
    if(has(properties,'sessionData')){const parsed=embedded(properties.sessionData);if(!record(parsed))return invalid('invalid-session-data','Metadados de sessão precisam ser um objeto ou JSON de objeto.');sessionData=parsed;}
  }catch(error){return jsonFailure(error,'invalid-metadata-json','Metadados serializados não são JSON válido.');}
  const entries=Object.entries(root).filter(([key])=>/^session[1-9]\d*$/.test(key));
  if(entries.length>1000)return invalid('session-limit','Quantidade de sessões excede o limite.');
  for(const [sessionKey,serialized] of entries){
    let rows:JsonValue;try{rows=embedded(serialized);}catch(error){return jsonFailure(error,'invalid-session-json','Sessão serializada inválida.');}
    if(!Array.isArray(rows))return invalid('invalid-session-rows','Sessão precisa conter uma lista de registros.');
    if(result.solves.length+rows.length>MAX_IMPORT_ROWS)return invalid('record-limit','Quantidade de registros excede o orçamento de leitura.');
    const metadata=has(sessionData,sessionKey.slice(7))?sessionData[sessionKey.slice(7)]:null;
    if(metadata!==null&&!record(metadata))return invalid('invalid-session-metadata','Metadados de sessão inválidos.');
    const meta=record(metadata)?metadata:{};
    result.sessions.push({sourceKey:sessionKey,sourceOrder:result.sessions.length,name:stringOrNull(meta.name),createdAt:null,mode:null,modeEvidence:'absent',original:copy(metadata)});
    result.issues.push(issue('mode-not-recorded','A modalidade histórica não está comprovada; permanece não classificada.',sessionKey));
    if(typeof meta.name!=='string')result.issues.push(issue('session-name-unmapped','Nome de sessão ausente ou sem representação textual confirmada.',sessionKey));
    const opt=record(meta.opt)?meta.opt:{};
    if(has(opt,'scrType')||has(meta,'scr'))result.issues.push(issue('scrambler-is-a-hint','Configuração de scrambler preservada como pista, sem classificar modalidade ou puzzle passados.',sessionKey,'informational'));
    for(let rowIndex=0;rowIndex<rows.length;rowIndex++){
      const original=rows[rowIndex],key=`${sessionKey}/${rowIndex}`;
      const row=Array.isArray(original)?original:[],timing=Array.isArray(row[0])?row[0]:[];
      const raw=timing[1],rawMs=typeof raw==='number'&&Number.isFinite(raw)&&raw>=0&&raw<=MAX_TIME_MS?raw:null;
      const penalty=timing[0]===0?'none':timing[0]===2000?'+2':timing[0]===-1?'DNF':null;
      const createdAt=epochISO(row[3]);
      const extension=row[4],puzzleCode=Array.isArray(extension)?extension[1]:undefined;
      // The extension's puzzle code describes this record, unlike a mutable session option.
      const puzzle=puzzleCode==='333'?'333':typeof puzzleCode==='string'?'other':'unknown';
      result.solves.push({sourceKey:key,sourceSessionKey:sessionKey,sourceOrder:rowIndex,rawMs,penalty,scramble:stringOrNull(row[1]),note:stringOrNull(row[2]),createdAt,mode:null,puzzle,
        origin:{kind:'imported',format:'cstimer-json',variant,captureSource:'unknown'},original:copy(original)});
      if(!Array.isArray(original)||row.length<4)result.issues.push(issue('sparse-tuple','Linha incompleta; campos ausentes foram preservados como ausentes.',key));
      if(rawMs===null)result.issues.push(issue('raw-time-unmapped','Tempo bruto ausente, inválido ou fora do intervalo suportado.',key));
      if(penalty===null)result.issues.push(issue('penalty-unmapped','Penalidade não pertence aos códigos confirmados 0, 2000 ou -1.',key));
      if(createdAt===null)result.issues.push(issue('timestamp-unmapped','Data ausente ou não representável sem perder precisão.',key));
      if(typeof row[1]!=='string')result.issues.push(issue('scramble-absent','Embaralhamento textual ausente.',key));
      if(typeof row[2]!=='string')result.issues.push(issue('note-absent','Comentário textual ausente.',key));
      if(timing.length>2)result.issues.push(issue('phases-preserved','Fases preservadas na origem; não viram resoluções adicionais.',key,'informational'));
      if(row.length>4)result.issues.push(issue('extension-preserved','Extensões preservadas para mapeamento posterior.',key,'informational'));
      if(puzzle==='other')result.issues.push(issue('unsupported-puzzle','Registro de outro puzzle preservado, sem conversão para 3x3.',key));
      else if(puzzle==='unknown')result.issues.push(issue('puzzle-unconfirmed','Puzzle do registro não foi comprovado.',key));
    }
  }
  return result;
}
