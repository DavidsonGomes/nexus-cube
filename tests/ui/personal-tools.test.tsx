import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import AlgorithmLab from '../../src/components/trainers/AlgorithmLab';
import CaseEditor from '../../src/components/trainers/CaseEditor';
import {createTrainerStore} from '../../src/components/trainers/session-store';
import {buildTrainerCatalog} from '../../src/components/trainers/catalog';
import {LEARNING_CONTENT} from '../../src/domain';

function memoryStorage(){
  const map=new Map<string,string>();
  let failing=false;
  return {
    getItem:(key:string)=>map.get(key)??null,
    setItem:(key:string,value:string)=>{if(failing)throw new Error('quota');map.set(key,value);},
    fail:(value:boolean)=>{failing=value;},
  };
}

test('personal algorithms persist through domain validation, survive reload and reject invalid shapes',()=>{
  const storage=memoryStorage();
  const store=createTrainerStore(storage);
  const saved=store.savePersonalAlgorithm({id:'personal/p1',contentId:null,name:'Meu sexy duplo',moves:"R U R' U' R U R' U'",createdAt:'2026-09-09T00:00:00.000Z'});
  assert.equal(saved.kind,'saved');
  const invalid=store.savePersonalAlgorithm({id:'personal/p1',contentId:null,name:'Duplicado',moves:'R U',createdAt:'2026-09-09T00:00:00.000Z'});
  assert.equal(invalid.kind,'invalid');
  const reloaded=createTrainerStore(storage).load();
  assert.equal(reloaded.personalAlgorithms.length,1);
  assert.equal(reloaded.personalAlgorithms[0].name,'Meu sexy duplo');
  storage.fail(true);
  const failedExercise=store.savePersonalExercise({id:'personal/e1',name:'Cruz torta',objective:'Refazer a cruz',note:'',setup:"F R U",solution:null,createdAt:'2026-09-09T00:00:00.000Z'});
  assert.equal(failedExercise.kind,'storage-error');
  storage.fail(false);
  const okExercise=store.savePersonalExercise({id:'personal/e1',name:'Cruz torta',objective:'Refazer a cruz',note:'',setup:"F R U",solution:null,createdAt:'2026-09-09T00:00:00.000Z'});
  assert.equal(okExercise.kind,'saved');
  const removed=store.removePersonal('personal/p1');
  assert.equal(removed.kind,'saved');
  assert.equal(removed.kind==='saved'?removed.data.personalAlgorithms.length:1,0);
});

test('lab renders real playback tools and the saved list from the store',()=>{
  const storage=memoryStorage();
  const store=createTrainerStore(storage);
  store.savePersonalAlgorithm({id:'personal/p2',contentId:null,name:'Sledge duplo',moves:"R' F R F' R' F R F'",createdAt:'2026-09-09T00:00:00.000Z'});
  const html=renderToStaticMarkup(<AlgorithmLab store={store} initial="R U R' U'"/>);
  assert.match(html,/Laboratório de algoritmos/);
  assert.match(html,/Inverter/);assert.match(html,/Repetir 2×/);assert.match(html,/Usar trecho/);
  assert.match(html,/solver-player/);
  assert.match(html,/Sledge duplo/);
  assert.match(html,/Mostrar finger tricks/);
});

test('editor validates physically via the solver validation and gates saving on a derived setup',()=>{
  const prior=Object.getOwnPropertyDescriptor(globalThis,'matchMedia');
  Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});
  try{
  const html=renderToStaticMarkup(<CaseEditor store={createTrainerStore(memoryStorage())}/>);
  assert.match(html,/Editor visual de casos/);
  assert.match(html,/mesma do solucionador/);
  assert.match(html,/Gere a sequência de preparo antes de salvar/);
  assert.doesNotMatch(html,/Posição fisicamente possível/);
  }finally{if(prior)Object.defineProperty(globalThis,'matchMedia',prior);else Reflect.deleteProperty(globalThis,'matchMedia');}
});

test('the personal tools return to the technique group as always-open tools',()=>{
  const groups=buildTrainerCatalog({studyCounts:(methodId,stageId)=>LEARNING_CONTENT.filter(item=>item.methodId===methodId&&item.stageId===stageId).length});
  const technique=groups.find(group=>group.id==='technique')!;
  assert.equal(technique.nodes.length,6);
  const lab=technique.nodes.find(node=>node.key==='algorithm-lab')!;
  const editor=technique.nodes.find(node=>node.key==='case-editor')!;
  assert.equal(lab.tool,true);assert.equal(editor.tool,true);
  const stillHidden=groups.flatMap(group=>group.nodes.map(node=>node.key));
  assert.ok(!stillHidden.includes('one-handed' as never));
});
