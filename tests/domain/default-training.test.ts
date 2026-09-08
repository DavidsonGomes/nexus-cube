import test from 'node:test';
import assert from 'node:assert/strict';
import type { AppData } from '../../src/domain/types';
import { ensureFirstUseTraining } from '../../src/data/default-training';
import { createInitialData, saveData } from '../../src/data/store';

const stamp='2026-09-08T12:00:00.000Z';
const input={eligibleFirstUse:true,sessionId:'first_training',createdAt:stamp};
function empty():AppData {
  return {version:3,sessions:[],activeSessionId:null,solves:[],progress:{},studyAttempts:[],
    settings:{theme:'dark',inspection:true,inspectionSound:false,holdMs:123.5,focus:true,hideRunningTime:true,animationSpeed:0.5}};
}
function legacy():AppData {
  return {...empty(),sessions:[{id:'legacy',name:'Treino diário',createdAt:stamp,mode:null}],activeSessionId:'legacy',
    solves:[{id:'old',sessionId:'legacy',mode:null,rawMs:1234.5,penalty:'+2',scramble:'R U',createdAt:stamp,note:'\0\ud800🧊',source:'timer'}]};
}

test('known new empty workspace gets exactly one explicit preset and preserves settings',()=>{
  const data=empty(),before=structuredClone(data),result=ensureFirstUseTraining(data,input);
  assert.deepEqual(result,{created:true,data:{...before,sessions:[{id:'first_training',name:'Treino diário',createdAt:stamp,mode:'two-handed'}],activeSessionId:'first_training'}});
  assert.deepEqual(data,before);assert.deepEqual(createInitialData().sessions,[]);assert.equal(createInitialData().activeSessionId,null);
  result.data.settings.theme='light';assert.equal(data.settings.theme,'dark');
});

test('ineligible technical empty remains empty; flags and frozen metadata make retries idempotent',()=>{
  const data=empty();assert.deepEqual(ensureFirstUseTraining(data,{...input,eligibleFirstUse:false}),{data,created:false});
  const first=ensureFirstUseTraining(data,input),retry=ensureFirstUseTraining(data,input);
  assert.deepEqual(retry,first);
  assert.deepEqual(ensureFirstUseTraining(first.data,{...input,sessionId:'must_not_create',createdAt:'2026-09-09T12:00:00.000Z'}),{data:first.data,created:false});
});

test('existing sessions and legacy modes/active selection remain exact, including existing null selection',()=>{
  for(const mode of [null,'two-handed','one-handed'] as const)for(const active of [null,'legacy']){
    const data=legacy();data.sessions[0].mode=mode;data.solves[0].mode=mode;data.activeSessionId=active;
    const original=structuredClone(data);assert.deepEqual(ensureFirstUseTraining(data,input),{data:original,created:false});assert.deepEqual(data,original);
  }
  const sessionOnly=legacy();sessionOnly.solves=[];assert.equal(ensureFirstUseTraining(sessionOnly,input).created,false);
});

test('study/progress alone are existing history and never authorize a default',()=>{
  const progressOnly=empty();progressOnly.progress={'OLL-01':{caseId:'OLL-01',favorite:true,status:'learning',note:'existing'}};
  assert.deepEqual(ensureFirstUseTraining(progressOnly,input),{data:progressOnly,created:false});
  const studyOnly=empty();studyOnly.studyAttempts=[{id:'study',caseId:'PLL-Z',createdAt:stamp,recognition:'good',execution:'again',durationMs:null}];
  assert.deepEqual(ensureFirstUseTraining(studyOnly,input),{data:studyOnly,created:false});
});

test('invalid origin, selection or metadata fails without silently creating/migrating/repairing',()=>{
  const data=empty();data.activeSessionId='missing';assert.throws(()=>ensureFirstUseTraining(data,input));assert.equal(data.activeSessionId,'missing');assert.equal(data.sessions.length,0);
  const broken=legacy();broken.solves[0].mode='one-handed';assert.throws(()=>ensureFirstUseTraining(broken,input));
  const oversized=legacy();oversized.solves[0].note='x'.repeat(10001);assert.throws(()=>ensureFirstUseTraining(oversized,{...input,eligibleFirstUse:false}));
  assert.throws(()=>ensureFirstUseTraining(empty(),{...input,sessionId:'__proto__'}));
  assert.throws(()=>ensureFirstUseTraining(empty(),{...input,createdAt:'not-a-date'}));
  // Runtime source validation must reject legacy input before trying to migrate it.
  assert.throws(()=>Reflect.apply(ensureFirstUseTraining,undefined,[{...empty(),version:2},input]),/V3/);
  assert.throws(()=>Reflect.apply(ensureFirstUseTraining,undefined,[empty(),{...input,eligibleFirstUse:'yes'}]));
});

test('failed external persistence leaves original intact; caller can retry identical pure proposal',()=>{
  const original=empty(),raw=JSON.stringify(original),proposal=ensureFirstUseTraining(original,input);let attempts=0;
  const storage={getItem:()=>raw,setItem:()=>{attempts++;throw new Error('quota');}};
  assert.throws(()=>saveData(proposal.data,storage),/quota/);assert.equal(attempts,1);assert.equal(storage.getItem(),raw);
  assert.deepEqual(ensureFirstUseTraining(original,input),proposal);assert.deepEqual(original,JSON.parse(raw));
});
