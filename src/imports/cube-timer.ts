import type { CubeTimerProjection, ImportParseResult, JsonValue, ParsedImport } from './types';
import { assertJsonBudget, copy, invalid, issue, MAX_IMPORT_ROWS, MAX_IMPORT_SOURCE_BYTES, record, stringOrNull } from './shared';
import { utf8ByteLength } from '../data/store';

// This is only a structural projection. A column name does not prove units or flags.
function identity(value:JsonValue|undefined):string|null {
  if(typeof value==='number')return Number.isSafeInteger(value)?String(value):null;
  return typeof value==='string'&&/^-?(0|[1-9]\d*)$/.test(value)?value:null;
}
export function parseCubeTimerProjection(projection:CubeTimerProjection):ImportParseResult {
  try{assertJsonBudget(projection);if(utf8ByteLength(JSON.stringify(projection))>MAX_IMPORT_SOURCE_BYTES)return invalid('projection-limit','Projeção excede o limite de bytes.');}
  catch{return invalid('invalid-projection','Projeção precisa conter somente valores JSON dentro dos limites.');}
  if(!record(projection)||!record(projection.tables))return invalid('invalid-projection','Tabelas ausentes ou inválidas.');
  if(projection.userVersion!==1)return {kind:'unrecognized',reason:'Versão da projeção SQLite ainda não reconhecida.'};
  const tables=projection.tables;
  if(!['cube','record','pattern3x3x3'].every(name=>Object.hasOwn(tables,name)))return {kind:'unrecognized',reason:'Conjunto de tabelas Cube Timer não identificado.'};
  let count=0;
  for(const rows of Object.values(tables)){
    if(!Array.isArray(rows)||rows.some(row=>!record(row)))return invalid('invalid-table','Tabela precisa conter linhas de objetos.');
    count+=rows.length;if(count>MAX_IMPORT_ROWS)return invalid('record-limit','Quantidade de linhas excede o orçamento de leitura.');
  }
  const variant='cube-timer-projection-v1';
  const result:ParsedImport={kind:'parsed',format:'cube-timer-sqlite',variant,sessions:[],solves:[],auxiliary:[],metadata:copy(projection),issues:[]};
  const sessionKeys=new Map<string,string[]>();
  tables.cube.forEach((row,index)=>{
    const key=`cube/${index}`,id=identity(row.id);
    if(id!==null)sessionKeys.set(id,[...(sessionKeys.get(id)??[]),key]);
    result.sessions.push({sourceKey:key,sourceOrder:index,name:stringOrNull(row.CUBE),createdAt:null,mode:null,modeEvidence:'absent',original:copy(row)});
    result.issues.push(issue('session-relation-unconfirmed','Agrupamento por cube é candidato; semântica de sessão e modalidade não comprovada.',key));
    if(id===null)result.issues.push(issue('identifier-unmapped','Identificador ausente ou não representável exatamente.',key));
  });
  tables.record.forEach((row,index)=>{
    const key=`record/${index}`,parent=identity(row.CUBE_ID),matches=parent===null?[]:sessionKeys.get(parent)??[];
    result.solves.push({sourceKey:key,sourceSessionKey:matches.length===1?matches[0]:null,sourceOrder:index,rawMs:null,penalty:null,scramble:null,note:null,createdAt:null,mode:null,puzzle:'unknown',origin:{kind:'imported',format:'cube-timer-sqlite',variant,captureSource:'unknown'},original:copy(row)});
    result.issues.push(issue('time-semantics-unconfirmed','Unidade, tempo bruto/efetivo e data permanecem sem interpretação confirmada.',key),issue('flags-unconfirmed','Flags DNF/PLUS2 preservadas sem interpretação confirmada.',key),issue('pattern-unconfirmed','Padrão e puzzle não foram convertidos em scramble 3x3.',key));
    if(matches.length!==1)result.issues.push(issue('session-reference-unresolved','Referência de agrupamento ausente, duplicada ou desconhecida.',key));
    if(identity(row.id)===null)result.issues.push(issue('identifier-unmapped','Identificador ausente ou não representável exatamente.',key));
  });
  for(const [table,rows] of Object.entries(tables)){
    if(table==='cube'||table==='record')continue;
    rows.forEach((original,index)=>result.auxiliary.push({sourceKey:`${table}/${index}`,table,original:copy(original)}));
    if(rows.length)result.issues.push(issue('auxiliary-unmapped','Tabela auxiliar preservada; nenhuma conversão automática em solve ou estudo.',table));
  }
  return result;
}
