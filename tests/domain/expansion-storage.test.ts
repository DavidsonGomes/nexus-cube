import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exportBackup, importBackup, loadData, parseBackup, saveData, STORAGE_KEY } from '../../src/data/store';
import { recordStudyAttempt } from '../../src/domain/study';
const v1=readFileSync('tests/domain/fixtures/backup-v1.json','utf8'),v2=readFileSync('tests/domain/fixtures/backup-v2.json','utf8');
function memory(initial:string){let raw=initial,writes=0;return {getItem:(key:string)=>{assert.equal(key,STORAGE_KEY);return raw;},setItem:(key:string,value:string)=>{assert.equal(key,STORAGE_KEY);raw=value;writes++;},get raw(){return raw;},get writes(){return writes;}};}
test('legacy load and import preserve every field of archived v1 and all 78 IDs, committing only once',()=>{
 const old=JSON.parse(v1).data,storage=memory(JSON.stringify(old));const loaded=loadData(storage);assert.equal(loaded.error,null);assert.deepEqual(loaded.data,{...old,version:3,sessions:old.sessions.map((s:object)=>({...s,mode:null})),solves:old.solves.map((s:object)=>({...s,mode:null}))});assert.equal(storage.writes,0);
 const restored=importBackup(v1,storage);assert.deepEqual(restored,loaded.data);assert.equal(storage.writes,1);assert.deepEqual(JSON.parse(storage.raw),restored);assert.equal(Object.keys(restored.progress).length,78);
});
test('v2 roundtrip includes namespaced algorithms and exercises; study remains separate from solves',()=>{
 const data=parseBackup(v2);assert.equal(data.version,3);assert.deepEqual(parseBackup(exportBackup(data)),data);assert.ok(data.progress['roux/cmll/01']);assert.ok(data.progress['cfop/f2l/01']);assert.ok(data.progress['roux/lse/fechar-centros']);
 const trained=recordStudyAttempt(data,{caseId:'cfop/cross/alinhar-uma-aresta',recognition:'good',execution:'again',durationMs:1000});assert.deepEqual(trained.solves,data.solves);assert.equal(trained.studyAttempts.length,data.studyAttempts.length+1);
});
test('invalid versions, namespace references and quota failures never overwrite saved data',()=>{
 const storage=memory(v2);
 for(const mutate of [(b:any)=>b.version=3,(b:any)=>b.data.version=1,(b:any)=>b.data.progress['roux/cmll/99']={caseId:'roux/cmll/99',favorite:true,status:'new',note:''},(b:any)=>b.data.studyAttempts[0].caseId='cfop/f2l/fake']){
  const bad=JSON.parse(v2);mutate(bad);assert.throws(()=>importBackup(JSON.stringify(bad),storage));assert.equal(storage.raw,v2);assert.equal(storage.writes,0);
 }
 const legacy=JSON.parse(v1);legacy.data.progress['cfop/f2l/01']={caseId:'cfop/f2l/01',favorite:true,status:'new',note:''};assert.throws(()=>parseBackup(JSON.stringify(legacy)));
 assert.throws(()=>importBackup(v1,{getItem:()=>v2,setItem:()=>{throw new DOMException('Full','QuotaExceededError');}}),/Nao foi possivel salvar/);
 const corrupt=memory('{broken');assert.ok(loadData(corrupt).error);assert.equal(corrupt.raw,'{broken');assert.equal(corrupt.writes,0);
});
