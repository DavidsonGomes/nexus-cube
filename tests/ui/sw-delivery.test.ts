import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {swSource} from '../../scripts/pwa';

type Handler=(event:unknown)=>void;

function bootServiceWorker(source:string,network:(url:string)=>Promise<{ok:boolean;clone:()=>unknown}>){
  const handlers=new Map<string,Handler>();
  const store=new Map<string,unknown>();
  const cache={
    addAll:async()=>{},
    put:async(key:string,value:unknown)=>{store.set(typeof key==='string'?key:String(key),value);},
    match:async(request:{url?:string}|string)=>{const key=typeof request==='string'?request:new URL(request.url!).pathname;return store.get(key);},
  };
  const scope={
    self:{addEventListener:(type:string,handler:Handler)=>handlers.set(type,handler),skipWaiting:async()=>{},clients:{claim:async()=>{}},location:{origin:'https://app.local'}},
    caches:{open:async()=>cache,keys:async()=>[]},
    fetch:(request:{url:string})=>network(request.url),
    URL,Response:{error:()=>({error:true})},
  };
  const factory=new Function('self','caches','fetch','URL','Response',source);
  factory(scope.self,scope.caches,scope.fetch,scope.URL,scope.Response);
  async function request(url:string,mode:'navigate'|'no-cors'='no-cors'){
    let result:unknown;
    handlers.get('fetch')!({request:{url,method:'GET',mode},respondWith:(value:Promise<unknown>)=>{result=value;}});
    return await result;
  }
  return {request,store};
}

test('app shell and sw.js are network-first while versioned assets stay cache-first',async()=>{
  const source=swSource('testversion',['/index.html','/assets/app-abc.js']);
  const calls:string[]=[];
  const sw=bootServiceWorker(source,async url=>{calls.push(new URL(url).pathname);return {ok:true,clone:()=>({fresh:new URL(url).pathname})};});
  sw.store.set('/index.html',{cached:'index'});
  sw.store.set('/assets/app-abc.js',{cached:'asset'});
  const navigation=await sw.request('https://app.local/','navigate');
  assert.equal((navigation as {ok:boolean}).ok,true);
  assert.deepEqual(calls,['/']);
  assert.deepEqual(sw.store.get('/index.html'),{fresh:'/'});
  const worker=await sw.request('https://app.local/sw.js');
  assert.equal((worker as {ok:boolean}).ok,true);
  assert.deepEqual(calls,['/','/sw.js']);
  assert.notDeepEqual(sw.store.get('/index.html'),{fresh:'/sw.js'});
  const asset=await sw.request('https://app.local/assets/app-abc.js');
  assert.deepEqual(asset,{cached:'asset'});
  assert.deepEqual(calls,['/','/sw.js']);
});

test('offline navigation falls back to the cached shell and auth endpoints are never intercepted',async()=>{
  const source=swSource('testversion',['/index.html']);
  const sw=bootServiceWorker(source,async()=>{throw new Error('offline');});
  sw.store.set('/index.html',{cached:'index'});
  assert.deepEqual(await sw.request('https://app.local/','navigate'),{cached:'index'});
  assert.equal(await sw.request('https://app.local/auth/v1/token'),undefined);
});

test('production registration bypasses the browser http cache for sw.js updates',()=>{
  const source=readFileSync(new URL('../../src/main.tsx',import.meta.url),'utf8');
  assert.match(source,/register\('\/sw\.js',\{updateViaCache:'none'\}\)/);
});
