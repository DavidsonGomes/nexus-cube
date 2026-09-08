import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import type { AppData } from '../../src/domain/types';
import { BACKUP_ENVELOPE_OVERHEAD_BYTES, MAX_BACKUP_BYTES, MAX_LEGACY_SOURCE_BYTES, MAX_SNAPSHOT_BYTES, exportBackup, importBackup, loadData, parseBackup, saveData, utf8ByteLength } from '../../src/data/store';

const LIMIT=20*1024*1024;
const stamp='2026-09-08T12:00:00.000Z';
// Independent byte oracle: Buffer, never the product's TextEncoder helper.
const bytes=(text:string)=>Buffer.byteLength(text,'utf8');
function emptyFixture():AppData {
  return {version:3,sessions:[{id:'boundary',name:'Limite sintético',createdAt:stamp,mode:'two-handed'}],activeSessionId:'boundary',
    solves:Array.from({length:5500},(_,i)=>({id:`boundary-${i}`,sessionId:'boundary',mode:'two-handed',rawMs:1000,penalty:'none',scramble:'',createdAt:stamp,note:'',source:'manual'})),
    progress:{},studyAttempts:[],settings:{theme:'dark',inspection:false,inspectionSound:false,holdMs:300,focus:false,hideRunningTime:false,animationSpeed:1}};
}
function fill<T extends {solves:{note:string}[]}>(data:T,size:number,emoji=false):T {
  let remaining=size-bytes(JSON.stringify(data));
  for(const solve of data.solves){
    if(emoji){const count=Math.min(5000,Math.floor(remaining/4));solve.note='🧊'.repeat(count);remaining-=count*4;}
    const ascii=Math.min(10000-solve.note.length,remaining);solve.note+='a'.repeat(ascii);remaining-=ascii;
    if(!remaining)break;
  }
  assert.equal(remaining,0,'fixture fits the actual per-note character bounds');
  assert.equal(bytes(JSON.stringify(data)),size);
  return data;
}
function storage(initial='original') {let raw=initial,writes=0;return {get raw(){return raw;},get writes(){return writes;},getItem:()=>raw,setItem:(_key:string,text:string)=>{raw=text;writes++;}};}

test('bounded migration allowance and exact snapshot/file budgets preserve ASCII and emoji at -1/exact/+1',t=>{
  const overhead=bytes(JSON.stringify({format:'nexus-cube',version:3,exportedAt:stamp,data:{}}))-bytes('{}');
  const snapshotLimit=2*LIMIT+24*200002+12*101000;
  assert.equal(MAX_LEGACY_SOURCE_BYTES,LIMIT);assert.equal(MAX_SNAPSHOT_BYTES,snapshotLimit);assert.equal(BACKUP_ENVELOPE_OVERHEAD_BYTES,overhead);assert.equal(MAX_BACKUP_BYTES,snapshotLimit+overhead);
  t.diagnostic(JSON.stringify({legacy:MAX_LEGACY_SOURCE_BYTES,snapshot:MAX_SNAPSHOT_BYTES,envelope:BACKUP_ENVELOPE_OVERHEAD_BYTES,backup:MAX_BACKUP_BYTES}));
  assert.equal(utf8ByteLength('🧊á'),6);
  for(const emoji of [false,true])for(const delta of [-1,0,1]){
    const data=fill(emptyFixture(),snapshotLimit+delta,emoji),store=storage();
    if(delta>0){assert.throws(()=>saveData(data,store),/bytes UTF-8/);assert.throws(()=>exportBackup(data),/bytes UTF-8/);assert.equal(store.raw,'original');assert.equal(store.writes,0);continue;}
    saveData(data,store);assert.equal(bytes(store.raw),snapshotLimit+delta);assert.equal(store.writes,1);
    const backup=exportBackup(data);assert.equal(bytes(backup),snapshotLimit+delta+overhead);assert.ok(!backup.includes('\n'));
    assert.deepEqual(parseBackup(backup),data);
    const restored=storage();assert.deepEqual(importBackup(backup,restored),data);assert.equal(restored.writes,1);assert.equal(restored.raw,store.raw);
    if(delta===0){assert.throws(()=>parseBackup(backup+' '),/bytes UTF-8/);assert.throws(()=>importBackup(backup+' ',restored));assert.equal(restored.writes,1);}
  }
});

test('every boundary legacy input restores after growth, reexports and reimports; quota still preserves source',()=>{
  for(const version of [1,2]){
    const historic=readFileSync(`tests/domain/fixtures/backup-v${version}.json`,'utf8');
    assert.ok(historic.includes('\n'));assert.ok(bytes(historic)<=LIMIT);assert.equal(parseBackup(historic).version,3);
    const current=emptyFixture();for(const solve of current.solves)solve.rawMs=100000000;
    const legacy={...current,version,sessions:current.sessions.map(({mode:_,...s})=>s),solves:current.solves.map(({mode:_,...s})=>s)};
    const numericGrowth=6*legacy.solves.length;
    const envelopeOverhead=bytes(JSON.stringify({format:'nexus-cube',version,exportedAt:stamp,data:{}}))-2;
    const source=JSON.stringify(fill(legacy,LIMIT-envelopeOverhead+numericGrowth,true)).replaceAll('"rawMs":100000000','"rawMs":1e8');
    const originalEnvelope='{"format":"nexus-cube","version":'+version+',"exportedAt":"'+stamp+'","data":'+source+'}';
    assert.equal(bytes(originalEnvelope),LIMIT);
    const store=storage(source),loaded=loadData(store);assert.equal(loaded.error,null);assert.equal(store.raw,source);assert.equal(store.writes,0);
    const original=JSON.parse(source);
    assert.deepEqual(loaded.data,{...original,version:3,sessions:original.sessions.map((s:object)=>({...s,mode:null})),solves:original.solves.map((s:object)=>({...s,mode:null}))});
    assert.ok(bytes(JSON.stringify(loaded.data))>LIMIT);
    assert.deepEqual(parseBackup(originalEnvelope),loaded.data);
    assert.deepEqual(importBackup(originalEnvelope,store),loaded.data);assert.equal(store.writes,1);
    assert.deepEqual(loadData(store),{data:loaded.data,error:null});
    const reexported=exportBackup(loaded.data);assert.deepEqual(parseBackup(reexported),loaded.data);
    const restored=storage();assert.deepEqual(importBackup(reexported,restored),loaded.data);assert.equal(restored.writes,1);
    assert.throws(()=>parseBackup(originalEnvelope+' '),/20 MiB/);
  }
  const valid=emptyFixture(),before=JSON.stringify(valid);let attempts=0;
  const quota={getItem:()=>before,setItem:()=>{attempts++;throw new Error('quota');}};
  assert.throws(()=>importBackup(exportBackup(valid),quota),/quota/);assert.equal(attempts,1);assert.equal(quota.getItem(),before);
});

test('lone-surrogate and fractional number normalization are included in the migration bound',()=>{
  const current=emptyFixture();current.solves=current.solves.slice(0,3);
  current.solves[0].note='\ud800';current.solves[0].rawMs=1e8;
  current.solves[1].rawMs=1e-6;current.solves[2].rawMs=Number.MIN_VALUE;
  const legacy={...current,version:2,sessions:current.sessions.map(({mode:_,...s})=>s),solves:current.solves.map(({mode:_,...s})=>s)};
  const source=JSON.stringify({format:'nexus-cube',version:2,exportedAt:stamp,data:legacy}).replace('\\ud800','\ud800').replace('"rawMs":100000000','"rawMs":1e8').replace('"rawMs":0.000001','"rawMs":1e-6');
  assert.equal(bytes('\ud800'),3);assert.equal(bytes(JSON.stringify('\ud800'))-2,6);
  const restored=parseBackup(source);assert.equal(restored.solves[0].note,'\ud800');assert.equal(restored.solves[0].rawMs,1e8);assert.equal(restored.solves[1].rawMs,1e-6);assert.equal(restored.solves[2].rawMs,Number.MIN_VALUE);
  assert.deepEqual(parseBackup(exportBackup(restored)),restored);
});
