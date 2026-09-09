/// <reference path="./sqljs-browser.d.ts" />
import initialize from 'sql.js/dist/sql-wasm-browser.js';
import { readCubeTimerSQLite, validSQLiteReadLimits } from './sqlite-reader';
import type { SQLiteReadLimits } from './sqlite-reader';

const scope=self as unknown as DedicatedWorkerGlobalScope;
let used=false;
scope.onmessage=async(event:MessageEvent<unknown>)=>{
  if(used)return;used=true;
  const request=event.data as {requestId?:unknown;rawSHA256?:unknown;bytes?:unknown;limits?:SQLiteReadLimits};
  if(!request||typeof request.requestId!=='string'||request.requestId.length>100||typeof request.rawSHA256!=='string'||!/^[0-9a-f]{64}$/.test(request.rawSHA256)||!(request.bytes instanceof Uint8Array)||!request.limits||!validSQLiteReadLimits(request.limits)){scope.close();return;}
  const {requestId,rawSHA256,bytes,limits}=request;
  const send=(message:unknown)=>scope.postMessage({requestId,rawSHA256,...message as object});
  try{
    const hash=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
    if(Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')!==rawSHA256)throw new Error('Source mismatch');
    send({kind:'phase',phase:'loading-engine'});
    const runtime=await initialize({locateFile:name=>{
      if(name!=='sql-wasm-browser.wasm'&&name!=='sql-wasm.wasm')throw new Error('Unexpected asset');
      return '/vendor/sqljs/1.14.1/sql-wasm.wasm';
    }});
    const result=readCubeTimerSQLite(runtime,bytes,limits,phase=>send({kind:'phase',phase}));
    send({kind:'result',result});
  }catch{send({kind:'result',result:{kind:'worker-error'}});}
  finally{scope.close();}
};
