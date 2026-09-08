import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectImportBytes, parseCsTimerText, parseCubeTimerProjection, parseNexusText, MAX_IMPORT_JSON_DEPTH } from '../../../src/imports';
import type { CubeTimerProjection, ImportParseResult, ParsedImport } from '../../../src/imports';

const stamp='2024-01-01T00:00:00.000Z';
function parsed(value:ImportParseResult):ParsedImport {assert.equal(value.kind,'parsed');if(value.kind!=='parsed')throw new Error('Expected parsed');return value;}
function nexus(version:1|2|3){
  const mode=version===3?{mode:'one-handed'}:{};
  return {format:'nexus-cube',version,exportedAt:stamp,data:{version,
    sessions:[{id:'synthetic_session',name:'Synthetic',createdAt:stamp,...mode}],activeSessionId:'synthetic_session',
    solves:[{id:'synthetic_solve',sessionId:'synthetic_session',rawMs:12345.5,penalty:'+2',scramble:'R U',createdAt:stamp,note:'synthetic\0😀',source:'timer',...mode}],
    progress:{'OLL-01':{caseId:'OLL-01',favorite:true,status:'learning',note:'synthetic study'}},
    studyAttempts:[{id:'synthetic_attempt',caseId:'OLL-01',createdAt:stamp,recognition:'good',execution:'again',durationMs:0.1}],
    settings:{theme:'system',inspection:false,inspectionSound:true,holdMs:300,focus:false,hideRunningTime:false,animationSpeed:1}}};
}

test('Nexus 1/2/3 preserves original fields, IDs and study; only legacy modes/version migrate',()=>{
  for(const version of [1,2,3] as const){
    const original=nexus(version),raw=JSON.stringify(original),result=parsed(parseNexusText(raw));
    const expected={...structuredClone(original.data),version:3,sessions:original.data.sessions.map(s=>({...s,mode:version===3?'one-handed':null})),solves:original.data.solves.map(s=>({...s,mode:version===3?'one-handed':null}))};
    assert.deepEqual(result.nexusData,expected);
    assert.deepEqual(result.metadata,original);
    assert.deepEqual(result.solves[0].original,original.data.solves[0]);
    assert.equal(result.solves.length,1);assert.equal(result.auxiliary.length,2);
    assert.equal(result.solves[0].origin.captureSource,'timer');
    assert.equal(result.solves[0].rawMs,12345.5);assert.equal(result.solves[0].penalty,'+2');
    assert.equal(JSON.stringify(original),raw);
  }
});

test('Nexus rejects mismatched versions, foreign fields and invalid original legacy modes',()=>{
  const wrong=nexus(1);wrong.version=2;assert.equal(parseNexusText(JSON.stringify(wrong)).kind,'invalid');
  const legacy=nexus(1);Object.assign(legacy.data.sessions[0],{mode:null});assert.equal(parseNexusText(JSON.stringify(legacy)).kind,'invalid');
  const extra={...nexus(3),token:'synthetic'};assert.equal(parseNexusText(JSON.stringify(extra)).kind,'invalid');
  assert.equal(parseNexusText('{}').kind,'unrecognized');
});

test('csTimer maps milliseconds, epoch seconds and three penalty codes without adding +2 to raw',()=>{
  const rows=[[[0,12345],'R','',1704067200],[[2000,12345],'U','plus',1704067200.125], [[-1,12345],'F','dnf',1704067201]];
  for(const encode of [false,true]){
    const sessionData={'1':{name:'Synthetic OH',opt:{scrType:'333oh'}}};
    const properties={sessionData:encode?JSON.stringify(sessionData):sessionData};
    const root={properties:encode?JSON.stringify(properties):properties,session1:encode?JSON.stringify(rows):rows};
    const result=parsed(parseCsTimerText(JSON.stringify(root)));
    assert.deepEqual(result.solves.map(s=>[s.rawMs,s.penalty,s.createdAt]),[[12345,'none',stamp],[12345,'+2','2024-01-01T00:00:00.125Z'],[12345,'DNF','2024-01-01T00:00:01.000Z']]);
    assert.ok(result.solves.every(s=>s.mode===null&&s.puzzle==='unknown'&&s.origin.captureSource==='unknown'));
    assert.equal(result.sessions[0].mode,null);assert.deepEqual(result.metadata,root);
  }
});

test('csTimer retains multiplicity, order, phases, extensions and Unicode without normalization',()=>{
  const note='é e\u0301 \0 \ud800 😀';
  const row=[[2000,9000,6000,3000],'R U',note,1704067200,['extension','333']];
  const root={session2:[row,row],session1:[[[0,8000],'','',1704067200,['extension','222']]]};
  const result=parsed(parseCsTimerText(JSON.stringify(root)));
  assert.deepEqual(result.sessions.map(s=>s.sourceKey),['session2','session1']);
  assert.deepEqual(result.solves.map(s=>s.sourceKey),['session2/0','session2/1','session1/0']);
  assert.equal(result.solves.length,3);assert.equal(result.solves[0].note,note);
  assert.deepEqual(result.solves[0].original,row);assert.equal(result.solves[0].puzzle,'333');assert.equal(result.solves[2].puzzle,'other');
  assert.equal(result.solves[2].scramble,'');assert.equal(result.solves[2].note,'');
  assert.ok(result.issues.some(i=>i.code==='phases-preserved'));
  assert.ok(result.issues.some(i=>i.code==='unsupported-puzzle'));
});

test('csTimer sparse/ambiguous fields stay absent; malformed metadata never guesses',()=>{
  const result=parsed(parseCsTimerText(JSON.stringify({session1:[[[17,1.5]],null,[[0,-1],'R',null,1704067200.0001]]})));
  assert.equal(result.solves.length,3);
  assert.deepEqual([result.solves[0].rawMs,result.solves[0].penalty,result.solves[0].createdAt,result.solves[0].scramble,result.solves[0].note],[1.5,null,null,null,null]);
  assert.equal(result.solves[1].rawMs,null);assert.equal(result.solves[2].createdAt,null);assert.equal(result.solves[2].rawMs,null);
  assert.equal(parseCsTimerText('{"session1":[],"properties":"not json"}').kind,'invalid');
  assert.equal(parseCsTimerText('{"session1":{}}').kind,'invalid');
  assert.equal(parseCsTimerText('{"session1":[],"properties":{"sessionData":{"1":7}}}').kind,'invalid');
});

function cube():CubeTimerProjection {return {userVersion:1,tables:{
  cube:[{id:'9007199254740993',CUBE:'Synthetic OH',SCRAMBLER_ID:1,BUILT_IN:0}],
  record:[{id:1,CUBE_ID:'9007199254740993',PATTERN_ID:3,STARTTIME_MS:1704067200000,STARTTIME:'synthetic',SOLVE_TIME_MS:12345,DNF:1,PLUS2:1}],
  pattern3x3x3:[{id:3,PATTERN:'R U',CUBE_ID:'9007199254740993'}],
  pll:[{id:1,PLL_IDX:1,SOLVE_TIME_MS:12}],quiz:[{id:1,NUM_OLL:1,NUM_PLL:1}],quiz_detail:[{id:1,history_id:1,pattern_idx:1,correct:1}]
}};}

test('Cube Timer projection preserves flags/64-bit IDs/auxiliary records and does not invent semantics',()=>{
  const source=cube(),snapshot=structuredClone(source),result=parsed(parseCubeTimerProjection(source));
  assert.deepEqual(source,snapshot);assert.deepEqual(result.metadata,snapshot);
  assert.equal(result.solves.length,1);assert.equal(result.auxiliary.length,4);
  const solve=result.solves[0];
  assert.deepEqual([solve.rawMs,solve.penalty,solve.scramble,solve.note,solve.createdAt,solve.mode],[null,null,null,null,null,null]);
  assert.equal(solve.sourceSessionKey,'cube/0');assert.equal(solve.puzzle,'unknown');
  assert.deepEqual(solve.original,source.tables.record[0]);
  source.tables.record[0].DNF=0;assert.deepEqual(solve.original,snapshot.tables.record[0]);
  assert.ok(result.issues.some(i=>i.code==='flags-unconfirmed'));
});

test('Cube Timer ambiguous relationships remain unresolved, duplicate rows remain distinct',()=>{
  const source=cube();source.tables.cube.push({...source.tables.cube[0]});source.tables.record.push({...source.tables.record[0]});
  const result=parsed(parseCubeTimerProjection(source));
  assert.deepEqual(result.solves.map(s=>s.sourceKey),['record/0','record/1']);
  assert.ok(result.solves.every(s=>s.sourceSessionKey===null));
  assert.equal(parseCubeTimerProjection({...source,userVersion:99}).kind,'unrecognized');
  assert.equal(parseCubeTimerProjection({userVersion:1,tables:{}}).kind,'unrecognized');
});

test('Byte inspection recognizes SQLite only as requiring a reader and rejects lossy UTF-8',()=>{
  const bytes=new TextEncoder().encode('SQLite format 3\0synthetic'),before=bytes.slice();
  assert.equal(inspectImportBytes(bytes).kind,'requires-sqlite-reader');assert.deepEqual(bytes,before);
  assert.equal(inspectImportBytes(Uint8Array.of(0xff,0xfe)).kind,'invalid');
  assert.equal(inspectImportBytes(new TextEncoder().encode(JSON.stringify(nexus(3)))).kind,'parsed');
  assert.equal(inspectImportBytes(new TextEncoder().encode('\ufeff{"session1":[]}')).kind,'parsed');
  assert.equal(inspectImportBytes(new TextEncoder().encode('{"unknown":[]}')).kind,'unrecognized');
});

test('Untrusted JSON is bounded and reserved properties are rejected without execution',()=>{
  assert.equal(parseCsTimerText('{"session1":[],"__proto__":{"polluted":true}}').kind,'invalid');
  assert.equal(parseCsTimerText('{"session1":[[[0,1e999],"","",0]]}').kind,'invalid');
  const deep='['.repeat(MAX_IMPORT_JSON_DEPTH+1)+'0'+']'.repeat(MAX_IMPORT_JSON_DEPTH+1);
  assert.equal(parseCsTimerText('{"session1":'+deep+'}').kind,'invalid');
  assert.equal(parseCsTimerText('{"session1":"(()=>{throw 1})()"}').kind,'invalid');
  assert.equal(Object.hasOwn({},'polluted'),false);
});
