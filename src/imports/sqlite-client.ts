import { validSQLiteReadLimits } from './sqlite-reader';
import type { SQLiteReadLimits, SQLiteReadPhase, SQLiteReadResult } from './sqlite-reader';

export interface SQLiteWorkerPort {
  onmessage:((event:MessageEvent)=>void)|null;onerror:((event:ErrorEvent)=>void)|null;
  postMessage(message:unknown,transfer:Transferable[]):void;terminate():void;
}
export interface SQLiteReader {
  read(source:Uint8Array,options:{limits:SQLiteReadLimits;signal?:AbortSignal;onPhase?:(phase:SQLiteReadPhase)=>void}):Promise<SQLiteReadResult>;
  dispose():void;
}
export function createSQLiteReader(options:{workerFactory?:()=>SQLiteWorkerPort}={}):SQLiteReader {
  const factory=options.workerFactory??(()=>new Worker(new URL('./sqlite.worker.ts',import.meta.url),{type:'module'}));
  let generation=0,closed=false,cancelActive:(()=>void)|null=null;
  return {
    read(source,input){
      cancelActive?.();const requestId=String(++generation),signal=input.signal,limits={...input.limits},onPhase=input.onPhase;
      if(closed||signal?.aborted)return Promise.resolve({kind:'cancelled'});
      if(!validSQLiteReadLimits(limits)||!(source instanceof Uint8Array)||!source.length||source.length>limits.maxSourceBytes)return Promise.resolve({kind:'resource-limit'});
      if(typeof SharedArrayBuffer!=='undefined'&&source.buffer instanceof SharedArrayBuffer)return Promise.resolve({kind:'invalid-sqlite'});
      const bytes=new Uint8Array(source),sourceByteLength=bytes.byteLength;
      return new Promise(resolve=>{
        let done=false,worker:SQLiteWorkerPort|undefined,timer:ReturnType<typeof setTimeout>|undefined;
        const finish=(result:SQLiteReadResult)=>{
          if(done)return;done=true;
          if(timer!==undefined)clearTimeout(timer);signal?.removeEventListener('abort',cancel);
          if(worker){worker.onmessage=null;worker.onerror=null;worker.terminate();}
          if(cancelActive===cancel)cancelActive=null;
          resolve(result);
        };
        const cancel=()=>finish({kind:'cancelled'});cancelActive=cancel;
        signal?.addEventListener('abort',cancel,{once:true});
        timer=setTimeout(()=>finish({kind:'timeout'}),limits.timeoutMs);
        void (async()=>{
          try{
            const hash=await crypto.subtle.digest('SHA-256',bytes);
            if(done||closed||generation!==Number(requestId))return;
            const rawSHA256=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
            worker=factory();
            worker.onerror=()=>finish({kind:'worker-error'});
            worker.onmessage=(event:MessageEvent)=>{
              if(done||closed||generation!==Number(requestId))return;
              const message=event.data;
              if(!message||message.requestId!==requestId||message.rawSHA256!==rawSHA256)return;
              if(message.kind==='phase'&&['loading-engine','opening','schema','reading','complete'].includes(message.phase)){try{onPhase?.(message.phase);}catch{finish({kind:'worker-error'});}return;}
              if(message.kind==='result'){
                const result=message.result;
                if(!result||!['projection','invalid-sqlite','unsupported-schema','resource-limit','cancelled','timeout','worker-error'].includes(result.kind))return finish({kind:'worker-error'});
                if(result.kind==='projection'&&(!result.projection||!result.metrics||result.metrics.sourceBytes!==sourceByteLength||!Number.isSafeInteger(result.metrics.rows)||result.metrics.rows<0||result.metrics.rows>limits.maxRows||!Number.isSafeInteger(result.metrics.projectionBytes)||result.metrics.projectionBytes<0||result.metrics.projectionBytes>limits.maxProjectionBytes))return finish({kind:'worker-error'});
                finish(result);
              }
            };
            worker.postMessage({requestId,rawSHA256,bytes,limits},[bytes.buffer]);
          }catch{finish({kind:'worker-error'});}
        })();
      });
    },
    dispose(){closed=true;generation++;cancelActive?.();},
  };
}
