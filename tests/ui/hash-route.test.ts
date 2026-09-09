import test from 'node:test';
import assert from 'node:assert/strict';
import {areaFromHash,listenAreaHash,revertAreaHash,writeAreaHash} from '../../src/components/hashRoute';

const route={areas:['timer','history','trainers'] as const,fallback:'timer' as const};

function withBrowserStubs(run:(env:{setHash:(value:string)=>void;fireHashChange:()=>void;entries:string[];replaced:string[]})=>void){
  const prior={location:Object.getOwnPropertyDescriptor(globalThis,'location'),history:Object.getOwnPropertyDescriptor(globalThis,'history'),window:Object.getOwnPropertyDescriptor(globalThis,'window')};
  const entries:string[]=[],replaced:string[]=[];
  let hash='',listener:(()=>void)|null=null;
  try{
    Object.defineProperty(globalThis,'location',{configurable:true,value:{get hash(){return hash;},set hash(value:string){hash=value.startsWith('#')?value:`#${value}`;entries.push(hash);listener?.();}}});
    Object.defineProperty(globalThis,'history',{configurable:true,value:{replaceState:(_s:unknown,_t:string,url:string)=>{hash=url;replaced.push(url);}}});
    Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener:(type:string,handler:()=>void)=>{if(type==='hashchange')listener=handler;},removeEventListener:(type:string)=>{if(type==='hashchange')listener=null;}}});
    run({setHash:value=>{hash=value;},fireHashChange:()=>listener?.(),entries,replaced});
  }finally{
    for(const [key,descriptor] of Object.entries(prior)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
  }
}

test('unknown or empty hashes fall back to the default area',()=>{
  assert.equal(areaFromHash('#trainers',route),'trainers');
  assert.equal(areaFromHash('trainers',route),'trainers');
  for(const value of ['','#','#nope','#Timer','#admin '])assert.equal(areaFromHash(value,route),'timer');
});

test('navigation writes one history entry per area change and skips rewrites of the same area',()=>{
  withBrowserStubs(env=>{
    writeAreaHash('history');
    writeAreaHash('history');
    writeAreaHash('trainers');
    assert.deepEqual(env.entries,['#history','#trainers']);
  });
});

test('hashchange applies valid areas, falls back on invalid ones and a busy revert adds no entry',()=>{
  withBrowserStubs(env=>{
    const seen:string[]=[];
    const stop=listenAreaHash(route,area=>seen.push(area));
    env.setHash('#history');env.fireHashChange();
    env.setHash('#invalid');env.fireHashChange();
    assert.deepEqual(seen,['history','timer']);
    revertAreaHash('history');
    assert.deepEqual(env.replaced,['#history']);
    assert.deepEqual(env.entries,[]);
    stop();
    env.setHash('#trainers');env.fireHashChange();
    assert.deepEqual(seen,['history','timer']);
  });
});
