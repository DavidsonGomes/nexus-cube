import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import TrainerSession from '../../src/components/trainers/TrainerSession';
import {createTrainerStore} from '../../src/components/trainers/session-store';
import {programFor} from '../../src/components/trainers/programs';
import {assertTrainerAttempt} from '../../src/data/trainers';
import type {TrainerAttempt} from '../../src/data/trainers';

function memoryStorage(failing:{setItem?:boolean}={}){
  const map=new Map<string,string>();
  return {
    getItem:(key:string)=>map.get(key)??null,
    setItem:(key:string,value:string)=>{if(failing.setItem)throw new Error('quota');map.set(key,value);},
    dump:()=>map,
    fail:(value:boolean)=>{failing.setItem=value;},
  };
}

const attempt=(overrides:Partial<TrainerAttempt>):TrainerAttempt=>({
  id:'a1',trainerId:'roux',contentId:'roux/fb/pieces',alternativeId:null,hand:null,slot:null,
  timingMode:'timed',createdAt:'2026-09-09T00:00:00.000Z',outcome:'correct',assisted:false,
  rawMs:1234,inspectionMs:null,cycles:null,physicalCycles:null,...overrides,
});

test('store append survives a failing save and the same attempt retries without loss',()=>{
  const storage=memoryStorage();
  const store=createTrainerStore(storage);
  storage.fail(true);
  const failed=store.append(attempt({id:'r1'}));
  assert.equal(failed.kind,'storage-error');
  assert.equal(store.load().attempts.length,0);
  storage.fail(false);
  const saved=store.append(attempt({id:'r1'}));
  assert.equal(saved.kind,'saved');
  const reloaded=createTrainerStore(storage).load();
  assert.equal(reloaded.attempts.length,1);
  assert.equal(reloaded.attempts[0].id,'r1');
});

test('attempt shapes for every session mode satisfy the domain invariants',()=>{
  assertTrainerAttempt(attempt({timingMode:'free',rawMs:null}));
  assertTrainerAttempt(attempt({timingMode:'timed',rawMs:850}));
  assertTrainerAttempt(attempt({timingMode:'repetitions',rawMs:900,cycles:3}));
  assertTrainerAttempt(attempt({timingMode:'continuous-batch',rawMs:null,cycles:5}));
  assertTrainerAttempt(attempt({timingMode:'duration',rawMs:null,physicalCycles:12}));
  assert.throws(()=>assertTrainerAttempt(attempt({timingMode:'free',rawMs:100})));
  assert.throws(()=>assertTrainerAttempt(attempt({outcome:'consulted',assisted:false})));
});

test('roux program generates a validated setup and the session renders select, prepare and history from the store',async()=>{
  const load=programFor('roux-fb');
  assert.ok(load);
  const program=await load!();
  assert.ok(program.items.length>0);
  const prepared=await program.generate(program.items[0].id,{seed:42});
  assert.equal(prepared.itemId,program.items[0].id);
  assert.ok(prepared.setup.length>0);
  assert.equal(prepared.solution,null);
  const storage=memoryStorage();
  const store=createTrainerStore(storage);
  store.append(attempt({id:'h1',contentId:program.items[0].id,rawMs:2000}));
  store.append(attempt({id:'h2',contentId:program.items[0].id,rawMs:1500}));
  const html=renderToStaticMarkup(<TrainerSession nodeKey="roux-fb" trainerId="roux" title="Primeiro bloco (FB)" loadProgram={async()=>program} initialProgram={program} store={store} onBack={()=>{}}/>);
  assert.match(html,/Gerar preparo/);
  const source=readFileSync(new URL('../../src/components/trainers/TrainerSession.tsx',import.meta.url),'utf8');
  assert.match(source,/SolverPlayer initialState=\{solvedCube\(\)\} algorithm=\{phase\.prepared\.setup\}/);
  assert.match(source,/SolverPlayer initialState=\{phase\.prepared\.state\} algorithm=\{phase\.prepared\.solution\}/);
  assert.doesNotMatch(source,/CubeView/);
  assert.match(html,/Modo de cronometragem/);
  assert.doesNotMatch(html,/Reconhecimento/);
  assert.match(html,/2 tentativas/);assert.match(html,/Melhor tempo: 1,50s/);assert.match(html,/100%/);
});

test('lbl cross program carries the proven minimum through to the prepared setup',async()=>{
  const load=programFor('lbl-cross');
  assert.ok(load);
  const program=await load!();
  const item=program.items[0];
  const prepared=await program.generate(item.id,{seed:7});
  assert.ok(prepared.provenMinimumMoves===undefined||prepared.provenMinimumMoves>=1);
  assert.ok(prepared.state.length===54);
});
