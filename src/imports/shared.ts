import { MAX_BACKUP_BYTES, utf8ByteLength } from '../data/store';
import type { ImportIssue, ImportParseResult, JsonValue } from './types';

export const MAX_IMPORT_SOURCE_BYTES=MAX_BACKUP_BYTES;
export const MAX_IMPORT_JSON_DEPTH=32;
export const MAX_IMPORT_JSON_NODES=2000000;
export const MAX_IMPORT_ROWS=200000;

export function record(value:unknown):value is Record<string,JsonValue> {
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
}
export function issue(code:string,message:string,sourceKey:string|null=null,severity:ImportIssue['severity']='decision'):ImportIssue {
  return {code,message,sourceKey,severity};
}
export function invalid(code:string,message:string):ImportParseResult {return {kind:'invalid',issues:[issue(code,message,null,'blocking')]};}
export function assertJsonBudget(value:unknown):asserts value is JsonValue {
  const stack:{value:unknown;depth:number}[]=[{value,depth:0}];let nodes=0;
  while(stack.length){
    const item=stack.pop()!;
    if(++nodes>MAX_IMPORT_JSON_NODES||item.depth>MAX_IMPORT_JSON_DEPTH)throw new Error('Estrutura excede o orçamento de leitura.');
    if(item.value===null||typeof item.value==='string'||typeof item.value==='boolean')continue;
    if(typeof item.value==='number'){if(!Number.isFinite(item.value))throw new Error('Número não finito na origem.');continue;}
    if(!Array.isArray(item.value)&&!record(item.value))throw new Error('Valor incompatível com JSON.');
    if(record(item.value)&&Object.keys(item.value).some(key=>['__proto__','constructor','prototype'].includes(key)))throw new Error('Chave reservada na origem.');
    for(const child of Object.values(item.value))stack.push({value:child,depth:item.depth+1});
  }
}
export function parseJson(text:string):JsonValue {
  if(typeof text!=='string'||utf8ByteLength(text)>MAX_IMPORT_SOURCE_BYTES)throw new Error('Arquivo excede o orçamento de bytes.');
  const parsed:unknown=JSON.parse(text.charCodeAt(0)===0xfeff?text.slice(1):text);assertJsonBudget(parsed);return parsed;
}
export function embedded(value:JsonValue):JsonValue {return typeof value==='string'?parseJson(value):value;}
export function copy<T extends JsonValue>(value:T):T {return structuredClone(value);}
export function has(value:Record<string,JsonValue>,key:string):boolean {return Object.hasOwn(value,key);}
export function stringOrNull(value:unknown):string|null {return typeof value==='string'?value:null;}
