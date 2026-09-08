import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AppData, Solve, StoredSolveMode } from '../../src/domain/types';
import { beginSolveCapture, selectSessions, selectSolves } from '../../src/domain/modes';
import { average, chartData, globalRecords, globalStatistics, scopedChartData, scopedStatistics, statistics } from '../../src/domain/statistics';
import { addSolve, applySessionClassification, createSession, deleteSession, previewSessionClassification, restoreSolve, setActiveSession, updateSolve } from '../../src/data/mutations';
import { createInitialData, exportBackup, exportCSV, importBackup, loadData, parseBackup, saveData, STORAGE_KEY, validateData } from '../../src/data/store';

const date=(i=0)=>new Date(Date.UTC(2026,8,8,12,0,i)).toISOString();
function fixture():AppData {
  const sessions=[{id:'two',mode:'two-handed' as const},{id:'oh',mode:'one-handed' as const},{id:'old',mode:null},{id:'short',mode:'two-handed' as const}].map(s=>({...s,name:s.id,createdAt:date()}));
  const solves:Solve[]=[];
  function add(sessionId:string,mode:StoredSolveMode,rawMs:number,i:number,penalty:Solve['penalty']='none') {solves.push({id:`${sessionId}-${i}`,sessionId,mode,rawMs,penalty,scramble:"R U R'",createdAt:date(i),note:`${sessionId} original`,source:'timer'});}
  for(let i=0;i<5;i++){add('two','two-handed',10000+i*1000,i*2,i===4?'+2':'none');add('oh','one-handed',1000+i*100,i*2+1,i===4?'DNF':'none');}
  add('old',null,200,12,'+2');add('old',null,300,13,'DNF');
  for(let i=0;i<4;i++)add('short','two-handed',1,15+i);
  return {...createInitialData(),sessions,solves,activeSessionId:'old'};
}
function memory(initial:string) {let raw=initial,writes=0;return {get raw(){return raw;},get writes(){return writes;},getItem:(key:string)=>{assert.equal(key,STORAGE_KEY);return raw;},setItem:(key:string,next:string)=>{assert.equal(key,STORAGE_KEY);raw=next;writes++;}};}

test('v1/v2 source schemas migrate without guessing modes, touching IDs or writing during load',()=>{
  for(const version of [1,2]) {
    const envelope=JSON.parse(readFileSync(`tests/domain/fixtures/backup-v${version}.json`,'utf8'));
    const original=structuredClone(envelope.data);
    const expected={...original,version:3,sessions:original.sessions.map((s:object)=>({...s,mode:null})),solves:original.solves.map((s:object)=>({...s,mode:null}))};
    const store=memory(JSON.stringify(original));
    assert.deepEqual(loadData(store),{data:expected,error:null});assert.equal(store.writes,0);assert.equal(store.raw,JSON.stringify(original));
    assert.deepEqual(importBackup(JSON.stringify(envelope),store),expected);assert.equal(store.writes,1);
    assert.deepEqual(envelope.data,original);
    for(const mutate of [
      (b:any)=>{b.data.sessions[0].mode='two-handed';},
      (b:any)=>{b.data.solves[0].mode=null;},
      (b:any)=>{b.data.sessions=[];b.data.solves=[];b.data.activeSessionId=null;},
      (b:any)=>{b.data.version=3;},
    ]) {const bad=structuredClone(envelope);mutate(bad);const before=store.raw;assert.throws(()=>importBackup(JSON.stringify(bad),store));assert.equal(store.raw,before);assert.equal(store.writes,1);}
  }
});

test('scoped records, windows and charts separate 2H/OH/null and never bridge sessions',()=>{
  const data=fixture();assert.deepEqual(validateData(data),data);
  assert.deepEqual(selectSessions(data,null).map(s=>s.id),['old']);
  assert.equal(selectSolves(data,{kind:'mode',mode:'two-handed'}).length,9);
  const two=globalStatistics(data,'two-handed'),oh=globalStatistics(data,'one-handed');
  assert.equal(two.count,9);assert.equal(two.totalRawMs,60004);assert.equal(two.dnfCount,0);
  assert.deepEqual(two.bestAverages[5],{kind:'value',ms:12000});assert.deepEqual(two.best,{kind:'value',ms:1});
  assert.deepEqual(two.averages[5],{kind:'insufficient'});
  assert.equal(oh.count,5);assert.equal(oh.totalRawMs,6000);assert.equal(oh.dnfCount,1);assert.deepEqual(oh.mean,{kind:'dnf'});assert.deepEqual(oh.bestAverages[5],{kind:'value',ms:1200});
  assert.equal(globalStatistics(data,null).count,2);assert.deepEqual(globalRecords(data,'one-handed').bestSingle,{kind:'value',ms:1000});assert.throws(()=>globalRecords(data,null as never));
  assert.deepEqual(scopedStatistics(data,{kind:'session',sessionId:'two',mode:'two-handed'}).averages[5],{kind:'value',ms:12000});
  const chart=scopedChartData(data,{kind:'mode',mode:'two-handed'});
  assert.deepEqual(chart.series.map(s=>[s.sessionId,s.points.length]),[['two',5],['short',4]]);
  assert.equal(chart.series[0].points.at(-1)?.ao5,12000);assert.ok(chart.series[1].points.every(p=>p.ao5===null));assert.deepEqual(chart.series[1].points.map(p=>p.index),[1,2,3,4]);
  assert.ok(chart.series.every(s=>s.mode==='two-handed'));
  for(const f of [statistics,chartData,(s:Solve[])=>average(s,5)])assert.throws(()=>f(data.solves),/misture/);
  for(const scope of [{kind:'mode'},{kind:'all'},{kind:'mode',mode:undefined},{kind:'session',mode:'two-handed',sessionId:'oh'},{kind:'session',mode:null,sessionId:'missing'},{kind:'mode',mode:'two-handed',extra:true}])assert.throws(()=>selectSolves(data,scope as never));
  assert.throws(()=>globalStatistics(data,undefined as never));
  const incoherent=structuredClone(data);incoherent.solves[0].mode='one-handed';assert.throws(()=>validateData(incoherent));assert.throws(()=>selectSolves(incoherent,{kind:'mode',mode:null}));
});

test('new sessions require an explicit mode and immutable capture survives selection changes',()=>{
  const empty=createInitialData();assert.deepEqual(empty.sessions,[]);assert.equal(empty.activeSessionId,null);assert.deepEqual(validateData(empty),empty);
  assert.throws(()=>createSession(empty,'Invalid',null as never));
  let data=createSession(empty,'2H','two-handed');const first=data.activeSessionId!;
  const input={sessionId:first,mode:'two-handed' as const,scramble:"R U R'"};const capture=beginSolveCapture(data,input);input.scramble='F';assert.equal(capture.scramble,"R U R'");assert.ok(Object.isFrozen(capture));
  data=createSession(data,'OH','one-handed');const oh=data.activeSessionId!;
  data=addSolve(data,{...capture,rawMs:1111,penalty:'+2',source:'timer'});
  assert.equal(data.solves[0].sessionId,first);assert.equal(data.solves[0].mode,'two-handed');assert.equal(data.activeSessionId,oh);
  assert.throws(()=>beginSolveCapture(data,{...capture,sessionId:oh}));assert.throws(()=>addSolve(data,{...capture,mode:null as never,rawMs:1,penalty:'none',source:'manual'}));
  assert.throws(()=>updateSolve(data,data.solves[0].id,{mode:'one-handed'} as never));
  const lost=deleteSession(data,first);assert.throws(()=>addSolve(lost,{...capture,rawMs:1,penalty:'none',source:'timer'}));
  const removed=deleteSession(data,oh);assert.equal(removed.activeSessionId,null);assert.equal(removed.sessions.length,1);
  const same=createSession(data,'OH again','one-handed');assert.equal(deleteSession(same,same.activeSessionId!).activeSessionId,oh);
  const only=createSession(empty,'Only','two-handed');const noSessions=deleteSession(only,only.activeSessionId!);assert.equal(noSessions.activeSessionId,null);assert.deepEqual(noSessions.sessions,[]);
});

test('classification affects the complete legacy session only, rejects stale previews and commits atomically',()=>{
  const data=fixture(),before=structuredClone(data),preview=previewSessionClassification(data,'old','one-handed');
  assert.equal(preview.solveCount,2);assert.equal(preview.plus2Count,1);assert.equal(preview.dnfCount,1);assert.equal(preview.fromMode,null);assert.equal(preview.isActiveSession,true);
  const next=applySessionClassification(data,preview);
  const expected=structuredClone(before);expected.sessions.find(s=>s.id==='old')!.mode='one-handed';for(const s of expected.solves)if(s.sessionId==='old')s.mode='one-handed';
  assert.deepEqual(next,expected);assert.deepEqual(data,before);assert.deepEqual(next.progress,before.progress);assert.deepEqual(next.studyAttempts,before.studyAttempts);
  assert.equal(applySessionClassification(setActiveSession(data,'two'),preview).activeSessionId,'two');
  assert.throws(()=>applySessionClassification(next,preview));assert.throws(()=>previewSessionClassification(data,'two','one-handed'));
  for(const change of [(d:AppData)=>{d.solves.find(s=>s.sessionId==='old')!.note='Changed';},(d:AppData)=>{d.solves.find(s=>s.sessionId==='old')!.rawMs++;},(d:AppData)=>{d.solves.find(s=>s.sessionId==='old')!.penalty='none';},(d:AppData)=>{d.sessions.find(s=>s.id==='old')!.name='Changed';},(d:AppData)=>{d.solves=d.solves.filter(s=>s.id!==preview.solveIds[0]);}]){const changed=structuredClone(data);change(changed);assert.throws(()=>applySessionClassification(changed,preview),/mudou|inválida/);}
  assert.throws(()=>applySessionClassification(data,{...preview,solveIds:preview.solveIds.slice(1)}));
  assert.throws(()=>applySessionClassification(data,{...preview,targetMode:'two-handed'}));
  const store=memory(JSON.stringify(data));saveData(next,store);assert.equal(store.writes,1);assert.deepEqual(JSON.parse(store.raw),expected);
  const originalRaw=JSON.stringify(data),quota={getItem:()=>originalRaw,setItem:()=>{throw new Error('quota');}};
  assert.throws(()=>saveData(applySessionClassification(data,preview),quota),/quota/);assert.equal(quota.getItem(),originalRaw);assert.deepEqual(data,before);
  const legacyRemoved=data.solves.find(s=>s.sessionId==='old')!;
  const classifiedWithout={...next,solves:next.solves.filter(s=>s.id!==legacyRemoved.id)};
  assert.throws(()=>restoreSolve(classifiedWithout,legacyRemoved),'undo must never silently classify an older removed solve');
});

test('v3 backup is integral, CSV has explicit scopes and invalid mode imports preserve saved bytes',()=>{
  const data=fixture(),encoded=exportBackup(data);assert.equal(JSON.parse(encoded).version,3);assert.deepEqual(parseBackup(encoded),data);
  const csv=exportCSV(data,{kind:'all'});for(const label of ['session_id','modalidade','two-handed','one-handed','unclassified'])assert.ok(csv.includes(label));
  const oh=exportCSV(data,{kind:'mode',mode:'one-handed'});assert.ok(oh.includes('one-handed'));assert.ok(!oh.includes('two-handed'));assert.ok(!oh.includes('unclassified'));assert.ok(!oh.includes('recognition'));
  const legacy=exportCSV(data,{kind:'session',sessionId:'old',mode:null});assert.ok(legacy.includes('unclassified'));assert.ok(legacy.includes('DNF'));assert.throws(()=>exportCSV(data,undefined as never));
  const store=memory(encoded);
  for(const change of [(b:any)=>{delete b.data.solves[0].mode;},(b:any)=>{b.data.sessions[0].mode='333oh';},(b:any)=>{b.data.solves[0].mode=null;},(b:any)=>{b.version=2;},(b:any)=>{b.data.activeSessionId='missing';}]){const bad=JSON.parse(encoded);change(bad);assert.throws(()=>importBackup(JSON.stringify(bad),store));assert.equal(store.writes,0);assert.equal(store.raw,encoded);}
  const example=readFileSync('tests/domain/fixtures/backup-v3.json','utf8');assert.deepEqual(parseBackup(exportBackup(parseBackup(example))),parseBackup(example));
});
