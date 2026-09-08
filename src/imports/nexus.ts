import { parseBackup } from '../data/store';
import type { ImportParseResult, JsonValue, ParsedImport } from './types';
import { copy, invalid, parseJson, record } from './shared';

export function parseNexusText(text:string):ImportParseResult {
  let root:JsonValue;
  try{root=parseJson(text);}catch{return invalid('invalid-json','Não foi possível ler o JSON dentro dos limites.');}
  if(!record(root)||root.format!=='nexus-cube')return {kind:'unrecognized',reason:'Envelope Nexus não identificado.'};
  try{
    // Validate the original envelope, including its source-version byte budget.
    const data=parseBackup(text),source=record(root.data)?root.data:null;
    if(!source||!Array.isArray(source.sessions)||!Array.isArray(source.solves))return invalid('invalid-nexus','Estrutura Nexus inválida.');
    const variant=`nexus-v${root.version}`;
    const result:ParsedImport={kind:'parsed',format:'nexus-backup',variant,metadata:copy(root),nexusData:data,issues:[],sessions:[],solves:[],auxiliary:[]};
    result.sessions=data.sessions.map((session,index)=>({sourceKey:session.id,sourceOrder:index,name:session.name,createdAt:session.createdAt,mode:session.mode,modeEvidence:root.version===3?'source-explicit':'absent',original:copy((source.sessions as JsonValue[])[index])}));
    result.solves=data.solves.map((solve,index)=>({sourceKey:solve.id,sourceSessionKey:solve.sessionId,sourceOrder:index,rawMs:solve.rawMs,penalty:solve.penalty,scramble:solve.scramble,note:solve.note,createdAt:solve.createdAt,mode:solve.mode,puzzle:'333',origin:{kind:'imported',format:'nexus-backup',variant,captureSource:solve.source},original:copy((source.solves as JsonValue[])[index])}));
    if(Array.isArray(source.studyAttempts))source.studyAttempts.forEach((original,index)=>result.auxiliary.push({sourceKey:`studyAttempts/${index}`,table:'studyAttempts',original:copy(original)}));
    if(record(source.progress))Object.entries(source.progress).forEach(([key,original])=>result.auxiliary.push({sourceKey:`progress/${key}`,table:'progress',original:copy(original)}));
    return result;
  }catch{return invalid('invalid-nexus','Backup Nexus inválido para sua versão ou limite de origem.');}
}
