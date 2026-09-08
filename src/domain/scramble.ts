import { applyAlgorithm, parseAlgorithm, solvedCube } from './cube';
import type { Scramble } from './types';
let worker:Worker|undefined, sequence=0;
const pending=new Map<number,{resolve:(s:Scramble)=>void;reject:(e:Error)=>void;timeout:ReturnType<typeof setTimeout>}>();
function failAll(message: string) {const current=worker;worker=undefined;current?.terminate();for(const p of pending.values()){clearTimeout(p.timeout);p.reject(new Error(message));}pending.clear();}
export function disposeScrambleWorker(): void {failAll('Geracao cancelada.');}
export function generateScramble(): Promise<Scramble> {
  return new Promise((resolve,reject)=>{
    try {
      if(!worker){worker=new Worker(new URL('../workers/scramble.worker.ts',import.meta.url),{type:'module'});
        worker.onmessage=(event:MessageEvent<{id:number;algorithm?:string;error?:string}>)=>{const p=pending.get(event.data.id);if(!p)return;pending.delete(event.data.id);clearTimeout(p.timeout);try{if(event.data.error)throw new Error(event.data.error);const algorithm=event.data.algorithm;if(typeof algorithm!=='string'||!parseAlgorithm(algorithm).length)throw new Error('Gerador retornou scramble invalido.');p.resolve(Object.freeze({id:crypto.randomUUID(),algorithm,state:applyAlgorithm(solvedCube(),algorithm),generatedAt:new Date().toISOString(),kind:'random-state-333',orientation:'Amarelo em cima (U), verde na frente (F)'}));}catch(error){p.reject(error instanceof Error?error:new Error('Falha ao gerar scramble.'));}};
        worker.onerror=()=>failAll('Falha ao iniciar o gerador local. Tente novamente.');worker.onmessageerror=()=>failAll('Resposta invalida do gerador.');
      }
      const id=++sequence;const timeout=setTimeout(()=>failAll('O gerador demorou demais. Tente novamente.'),120000);pending.set(id,{resolve,reject,timeout});worker.postMessage({id});
    }catch(error){failAll('Gerador local indisponivel.');reject(error instanceof Error?error:new Error('Gerador local indisponivel.'));}
  });
}
