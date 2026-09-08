export type * from './types';
export { parseCsTimerText } from './cstimer';
export { parseNexusText } from './nexus';
export { parseCubeTimerProjection } from './cube-timer';
export { MAX_IMPORT_SOURCE_BYTES, MAX_IMPORT_JSON_DEPTH, MAX_IMPORT_JSON_NODES, MAX_IMPORT_ROWS } from './shared';
import type { ImportParseResult } from './types';
import { parseCsTimerText } from './cstimer';
import { parseNexusText } from './nexus';
import { invalid, MAX_IMPORT_SOURCE_BYTES, parseJson, record } from './shared';

export function inspectImportBytes(bytes:Uint8Array):ImportParseResult {
  if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_IMPORT_SOURCE_BYTES)return invalid('source-limit','Entrada inválida ou acima do orçamento de bytes.');
  const signature='SQLite format 3\0';
  if(bytes.length>=signature.length&&Array.from(signature).every((char,index)=>bytes[index]===char.charCodeAt(0)))return {kind:'requires-sqlite-reader',format:'cube-timer-sqlite',reason:'Assinatura SQLite detectada; identificação de schema exige leitor local ainda não integrado.'};
  let text:string;
  try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{return invalid('invalid-utf8','Arquivo não é texto UTF-8 válido nem SQLite reconhecido.');}
  let root;
  try{root=parseJson(text);}catch{return invalid('invalid-json','Arquivo não contém JSON válido dentro dos limites.');}
  if(record(root)&&root.format==='nexus-cube')return parseNexusText(text);
  return parseCsTimerText(text);
}
