import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import type { AppData } from '../../src/domain/types';
import { beginSolveCapture } from '../../src/domain/modes';
import { applySessionClassification, deleteSession, previewSessionClassification, restoreSolve } from '../../src/data/mutations';
import { exportBackup, importBackup, loadData, parseBackup, saveData, MAX_ACCOUNT_SNAPSHOT_BYTES, MAX_BACKUP_BYTES, MAX_SNAPSHOT_BYTES, MAX_SYNC_SELECTION_EXTRA_BYTES, V3_COMPAT_SNAPSHOT_BYTES } from '../../src/data/store';
import { preflightSyncProjection, projectSyncAccountData, toSyncAccountData, toSyncRecords, validateSyncRecords, projectSyncRecords } from '../../src/data/sync-projection';

const stamp='2026-09-08T12:00:00.000Z';
const size=(value:unknown)=>Buffer.byteLength(JSON.stringify(value),'utf8');
function fixture():AppData {
  return {version:3,sessions:[{id:'z',name:'Z',createdAt:stamp,mode:'two-handed'},{id:'a',name:'A',createdAt:stamp,mode:null}],activeSessionId:'z',
    solves:[{id:'later',sessionId:'z',mode:'two-handed',rawMs:0.1,penalty:'+2',scramble:'R U',createdAt:'2026-09-08T13:00:00.000Z',note:'\0\ud800🧊',source:'timer'},
      {id:'earlier',sessionId:'a',mode:null,rawMs:Number.MIN_VALUE,penalty:'DNF',scramble:'',createdAt:stamp,note:'',source:'manual'}],
    progress:{'PLL-Z':{caseId:'PLL-Z',favorite:true,status:'learning',note:'z'},'OLL-01':{caseId:'OLL-01',favorite:false,status:'new',note:'a'}},
    studyAttempts:[{id:'study',caseId:'OLL-01',createdAt:stamp,recognition:'good',execution:'again',durationMs:1.5}],
    settings:{theme:'dark',inspection:false,inspectionSound:false,holdMs:300,focus:false,hideRunningTime:false,animationSpeed:1}};
}

test('projection preserves IDs/fields/array and progress order; settings sync, selection stays local',()=>{
  const local=fixture(),before=structuredClone(local),account=toSyncAccountData(local);
  assert.equal(Object.hasOwn(account,'activeSessionId'),false);
  assert.deepEqual(account,{version:3,sessions:before.sessions,solves:before.solves,progress:before.progress,studyAttempts:before.studyAttempts,settings:before.settings});
  account.settings={theme:'light',inspection:true,inspectionSound:true,holdMs:123.5,focus:true,hideRunningTime:true,animationSpeed:0.5};
  const result=projectSyncAccountData(account,local);assert.equal(result.kind,'projected');
  if(result.kind!=='projected')return;
  assert.equal(result.selectionChange,'none');assert.equal(result.data.activeSessionId,'z');
  assert.deepEqual(result.data.settings,account.settings);assert.deepEqual(result.data.solves,before.solves);
  assert.deepEqual(Object.keys(result.data.progress),['PLL-Z','OLL-01']);assert.deepEqual(local,before);
  result.data.solves[0].note='changed copy';assert.equal(account.solves[0].note,before.solves[0].note);
});

test('remote deletion/classification clears selection explicitly without replacing frozen capture',()=>{
  const local=fixture(),capture=beginSolveCapture(local,{sessionId:'z',mode:'two-handed',scramble:'R U'});
  const removed=projectSyncAccountData(toSyncAccountData(deleteSession(local,'z')),local);
  assert.equal(removed.kind,'projected');if(removed.kind==='projected'){assert.equal(removed.selectionChange,'removed');assert.equal(removed.data.activeSessionId,null);}
  assert.deepEqual(capture,{sessionId:'z',mode:'two-handed',scramble:'R U'});assert.ok(Object.isFrozen(capture));
  local.activeSessionId='a';
  const classified=applySessionClassification(local,previewSessionClassification(local,'a','one-handed'));
  const next=projectSyncAccountData(toSyncAccountData(classified),local);
  assert.equal(next.kind,'projected');if(next.kind==='projected'){assert.equal(next.selectionChange,'mode-changed');assert.equal(next.data.activeSessionId,null);assert.equal(next.data.solves[1].mode,'one-handed');}
  const none=projectSyncAccountData(toSyncAccountData(fixture()),{...fixture(),activeSessionId:null});
  assert.equal(none.kind,'projected');if(none.kind==='projected')assert.equal(none.data.activeSessionId,null);
});

test('strict V3/schema, mode coherence, IDs and fields reject invalid account input',()=>{
  const local=fixture(),base=toSyncAccountData(local);
  for(const invalid of [{...base,version:1},{...base,version:4},{...base,activeSessionId:null},{...base,settings:undefined},
    {...base,solves:[{...base.solves[0],mode:null}]},{...base,solves:[{...base.solves[0],sessionId:'missing'}]},
    {...base,solves:[base.solves[0],base.solves[0]]},{...base,solves:[{...base.solves[0],mode:undefined}]},
    {...base,solves:[{...base.solves[0],id:'__proto__'}]},{...base,solves:[{...base.solves[0],source:'imported'}]}]){
    assert.throws(()=>preflightSyncProjection(invalid));assert.throws(()=>projectSyncAccountData(invalid,local));
  }
  assert.deepEqual(local,fixture());
});

test('entity bridge reconstructs numeric uint64 ordering per collection and preserves settings/progress',()=>{
  const local=fixture(),records=toSyncRecords(local),before=structuredClone(records);
  assert.deepEqual(validateSyncRecords(records).data,{...local,activeSessionId:null});
  for(const record of records){
    if(record.entity==='settings')continue;
    record.listPosition=record.listPosition==='0'?'9007199254740993':'18446744073709551615';
  }
  records.reverse();
  const reconstructed=projectSyncRecords(records,local);
  assert.equal(reconstructed.kind,'projected');if(reconstructed.kind==='projected')assert.deepEqual(reconstructed.data,local);
  assert.deepEqual(Object.keys(validateSyncRecords(records).data.progress),['PLL-Z','OLL-01']);
  assert.deepEqual(before,toSyncRecords(local));
  const fail=(mutate:(items:ReturnType<typeof toSyncRecords>)=>unknown)=>assert.throws(()=>validateSyncRecords(mutate(toSyncRecords(local))));
  fail(items=>[...items,items[0]]);
  fail(items=>items.filter(r=>r.entity!=='settings'));
  for(const position of ['01','-1','18446744073709551616','1.0','+1'])fail(items=>{items[0].listPosition=position;return items;});
  fail(items=>{items[1].listPosition=items[0].listPosition;return items;});
  fail(items=>{items[0].id='different';return items;});
  fail(items=>items.map((r,i)=>i===0?{...r,tombstone:true}:r));
});

test('restore keeps exact original fields and mode; classified or deleted parent cannot inherit',()=>{
  const local=fixture(),removed=local.solves[1],without={...local,solves:local.solves.slice(0,1)};
  const restored=restoreSolve(without,removed),result=projectSyncAccountData(toSyncAccountData(restored),without);
  assert.equal(result.kind,'projected');if(result.kind==='projected')assert.deepEqual(result.data.solves.find(s=>s.id===removed.id),removed);
  const wrong=toSyncAccountData(restored);wrong.sessions[1].mode='one-handed';assert.throws(()=>preflightSyncProjection(wrong));
  wrong.sessions.splice(1,1);assert.throws(()=>preflightSyncProjection(wrong));
  assert.deepEqual(removed,fixture().solves[1]);
});

test('byte preflight uses UTF-8 and both null and longest live ID; envelope matches real export',()=>{
  const data=fixture();data.sessions.push({id:'x'.repeat(100),name:'Long',createdAt:stamp,mode:'one-handed'});
  const bytes=preflightSyncProjection(toSyncAccountData(data));
  assert.equal(bytes.snapshotWithNullBytes,size({...data,activeSessionId:null}));
  assert.equal(bytes.snapshotWithLongestSelectionBytes,size({...data,activeSessionId:'x'.repeat(100)}));
  assert.equal(bytes.selectionExtraBytes,98);assert.equal(bytes.backupWithLongestSelectionBytes,Buffer.byteLength(exportBackup({...data,activeSessionId:'x'.repeat(100)}),'utf8'));
  assert.equal(bytes.fitsAllSelections,true);
  const short=fixture();const small=preflightSyncProjection(toSyncAccountData(short));assert.equal(small.snapshotWithNullBytes,small.snapshotWithLongestSelectionBytes+1);assert.equal(small.selectionExtraBytes,0);
});

function largeFixture(active:string|null,targetBytes:number):AppData {
  const data=fixture();data.sessions=[{id:'a',name:'A',createdAt:stamp,mode:'two-handed'},{id:'x'.repeat(100),name:'Long',createdAt:stamp,mode:'two-handed'}];data.activeSessionId=active;
  data.progress={};data.studyAttempts=[];
  data.solves=Array.from({length:5000},(_,i)=>({id:`s${i}`,sessionId:'a',mode:'two-handed',rawMs:1,penalty:'none',scramble:'',createdAt:stamp,note:'',source:'manual'}));
  let remaining=targetBytes-size(data);
  for(const solve of data.solves){const n=Math.min(10000,remaining);solve.note='a'.repeat(n);remaining-=n;if(!remaining)break;}
  assert.equal(remaining,0);assert.equal(size(data),targetBytes);return data;
}

test('fixed account budget preserves all former null/ID1/ID100 limits and never expands on replay',()=>{
  const oldLimit=2*20*1024*1024+24*200002+12*101000;
  assert.equal(V3_COMPAT_SNAPSHOT_BYTES,oldLimit);assert.equal(MAX_ACCOUNT_SNAPSHOT_BYTES,oldLimit+1);
  assert.equal(MAX_SYNC_SELECTION_EXTRA_BYTES,98);assert.equal(MAX_SNAPSHOT_BYTES,oldLimit+99);assert.equal(MAX_BACKUP_BYTES,oldLimit+99+83);
  for(const active of [null,'a','x'.repeat(100)]){
    const data=largeFixture(active,oldLimit),account=toSyncAccountData(data),bytes=preflightSyncProjection(account);
    assert.ok(bytes.fitsAllSelections);assert.ok(bytes.snapshotWithNullBytes<=oldLimit+1);
    const projected=projectSyncAccountData(account,{...data,activeSessionId:'x'.repeat(100)});
    assert.equal(projected.kind,'projected');if(projected.kind!=='projected')continue;
    assert.equal(projected.data.activeSessionId,'x'.repeat(100));
    const once=exportBackup(projected.data),recovered=parseBackup(once),twice=exportBackup(recovered);
    assert.deepEqual(recovered,projected.data);assert.equal(Buffer.byteLength(once),Buffer.byteLength(twice));
    assert.equal(preflightSyncProjection(toSyncAccountData(recovered)).snapshotWithNullBytes,bytes.snapshotWithNullBytes);
  }
});

test('account exact/+1 and local exact/+1 are separate; quota/load/import preserve source atomically',()=>{
  const exact=largeFixture(null,MAX_ACCOUNT_SNAPSHOT_BYTES),long={...exact,activeSessionId:'x'.repeat(100)};
  assert.equal(size(long),MAX_SNAPSHOT_BYTES);assert.equal(Buffer.byteLength(exportBackup(long)),MAX_BACKUP_BYTES);
  const tooMuch=structuredClone(exact);tooMuch.solves.at(-1)!.note+='a';
  const account={version:3 as const,sessions:tooMuch.sessions,solves:tooMuch.solves,progress:tooMuch.progress,studyAttempts:tooMuch.studyAttempts,settings:tooMuch.settings};
  const blocked=projectSyncAccountData(account,fixture());assert.equal(blocked.kind,'capacity-blocked');if(blocked.kind==='capacity-blocked')assert.equal(blocked.reason,'account-limit');
  let raw='original',writes=0;const storage={getItem:()=>raw,setItem:(_key:string,value:string)=>{writes++;raw=value;}};
  assert.throws(()=>saveData(tooMuch,storage),/limite fixo/);assert.equal(writes,0);
  assert.throws(()=>exportBackup(tooMuch),/limite fixo/);
  const invalid=JSON.stringify({format:'nexus-cube',version:3,exportedAt:stamp,data:tooMuch});
  assert.throws(()=>importBackup(invalid,storage),/limite fixo/);assert.equal(raw,'original');assert.equal(writes,0);
  const stored=JSON.stringify(tooMuch);assert.ok(loadData({getItem:()=>stored,setItem:()=>assert.fail('no write')}).error);
  assert.throws(()=>parseBackup(exportBackup(long)+' '),/bytes UTF-8/);
  assert.throws(()=>importBackup(exportBackup(exact),{getItem:()=>raw,setItem:()=>{throw new Error('quota');}}),/quota/);assert.equal(raw,'original');
});
