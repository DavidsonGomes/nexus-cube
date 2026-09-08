import test from 'node:test';
import assert from 'node:assert/strict';
import { average, statistics, globalStatistics, chartData } from '../../src/domain/statistics';
import { effectiveMs, inspectionPenalty, inspectionCue, parseManualTime } from '../../src/domain/timer';
import { createInitialData, saveData, loadData, parseBackup, exportBackup, importBackup, exportCSV, validateData, STORAGE_KEY, MAX_BACKUP_BYTES } from '../../src/data/store';
import { addSolve, updateSolve, createSession, deleteSession, deleteSolve, restoreSolve } from '../../src/data/mutations';
import { drawStudyCase, recordStudyAttempt, updateCaseProgress } from '../../src/domain/study';
import { selectCases } from '../../src/domain/catalog';
import type { Solve, AverageSize, AppData } from '../../src/domain/types';
function solves(n: number): Solve[]{return Array.from({length:n},(_,i)=>({id:`s${i}`,sessionId:'session',mode:'two-handed',rawMs:(i+1)*1000,penalty:'none',scramble:'R U',note:'',source:'timer',createdAt:new Date(1700000000000+i*1000).toISOString()}));}
function initial():AppData {return createSession(createInitialData(),'Primeira','two-handed');}
const storage=()=>{const map=new Map<string,string>();return {map,getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);}};};
test('all trimmed averages include +2 and exclude the prescribed extremes; DNF cutoff for every size',()=>{
 for(const [n,trim] of [[5,1],[12,1],[50,3],[100,5]] as const){const s=solves(n);assert.deepEqual(average(s,n),{kind:'value',ms:(n+1)*500});assert.deepEqual(average(s.slice(1),n),{kind:'insufficient'});
 const plus=s.map(v=>({...v,penalty:'+2' as const}));assert.deepEqual(average(plus,n),{kind:'value',ms:(n+1)*500+2000});
 for(let i=0;i<trim;i++)s[n-1-i].penalty='DNF';assert.deepEqual(average(s,n),{kind:'value',ms:(n+1)*500});s[n-1-trim].penalty='DNF';assert.deepEqual(average(s,n),{kind:'dnf'});
 }
 const s=solves(5);s[1].penalty='DNF';assert.deepEqual(average(s,5),{kind:'value',ms:4000});s[2].penalty='DNF';assert.deepEqual(average(s,5),{kind:'dnf'});
});
test('session mean, raw duration, chart gaps, best windows and global records obey session boundaries',()=>{
 const s=solves(12);s[11].penalty='DNF';const stats=statistics(s);assert.deepEqual(stats.mean,{kind:'dnf'});assert.equal(stats.totalRawMs,78000);assert.equal(stats.dnfCount,1);assert.deepEqual(stats.last,{kind:'dnf'});assert.deepEqual(stats.best,{kind:'value',ms:1000});assert.deepEqual(stats.bestAverages[5],{kind:'value',ms:3000});assert.equal(chartData(s).at(-1)?.single,null);
 let data=initial();const first=data.activeSessionId!;data=createSession(data,'Segunda','two-handed');data.solves=solves(8).map((s,i)=>({...s,sessionId:i<4?first:data.activeSessionId!}));assert.deepEqual(globalStatistics(data,'two-handed').bestAverages[5],{kind:'insufficient'});assert.deepEqual(statistics([]).best,{kind:'insufficient'});assert.deepEqual(statistics(s.map(v=>({...v,penalty:'DNF'}))).best,{kind:'dnf'});
});
test('inspection boundaries and manual input reject ambiguous or malformed times',()=>{
 assert.deepEqual([0,14999.9,15000,16999.9,17000].map(inspectionPenalty),['none','none','+2','+2','DNF']);assert.deepEqual([7999,8000,11999,12000].map(inspectionCue),[0,8,8,12]);assert.equal(parseManualTime('1:02,345'),62345);assert.equal(parseManualTime('12.3'),12300);for(const bad of ['','-1','1:60','NaN','Infinity','1e3','12abc','1:2:3','.3','2.0001'])assert.throws(()=>parseManualTime(bad));assert.throws(()=>inspectionPenalty(-1));assert.equal(effectiveMs({rawMs:1234,penalty:'+2'}),3234);
});
test('mutations preserve raw times and immutable scramble, support undo and isolate study records',()=>{
 let data=initial();data=addSolve(data,{sessionId:data.activeSessionId!,mode:'two-handed',rawMs:12340,penalty:'none',scramble:'R U',source:'timer'});const id=data.solves[0].id;for(const penalty of ['+2','DNF','none'] as const){data=updateSolve(data,id,{penalty});assert.equal(data.solves[0].rawMs,12340);assert.equal(data.solves[0].scramble,'R U');}
 assert.throws(()=>updateSolve(data,id,{scramble:'F'} as never));const deleted=deleteSolve(data,id);assert.equal(deleted.data.solves.length,0);assert.deepEqual(restoreSolve(deleted.data,deleted.removed),data);assert.throws(()=>restoreSolve(data,deleted.removed));
 const original=statistics(data.solves);data=recordStudyAttempt(data,{caseId:'OLL-27',recognition:'good',execution:'again',durationMs:5432});data=updateCaseProgress(data,'OLL-27',{favorite:true,status:'learning',note:'Praticar reconhecimento'});assert.deepEqual(statistics(data.solves),original);assert.equal(data.studyAttempts.length,1);assert.equal(selectCases({favorites:true},data.progress)[0].id,'OLL-27');assert.equal(drawStudyCase(selectCases({ids:['PLL-T']})).id,'PLL-T');assert.throws(()=>drawStudyCase([]));
 assert.throws(()=>deleteSession(createInitialData(),'missing'));assert.equal(deleteSession(data,data.activeSessionId!).activeSessionId,null);data=createSession(data,'Outra','two-handed');const old=data.solves[0].sessionId;data=deleteSession(data,old);assert.equal(data.solves.length,0);assert.equal(data.studyAttempts.length,1);
});
test('backup round trip restores all data, rejects invalid payload atomically, preserves corrupt local input and propagates quota errors',()=>{
 const store=storage();let data=initial();data=addSolve(data,{sessionId:data.activeSessionId!,mode:'two-handed',rawMs:10000,penalty:'+2',scramble:'R U',source:'timer',note:'abc'});data=recordStudyAttempt(data,{caseId:'PLL-T',recognition:'good',execution:'good',durationMs:null});data=updateCaseProgress(data,'PLL-T',{favorite:true});saveData(data,store);assert.deepEqual(loadData(store),{data,error:null});const backup=exportBackup(data);assert.deepEqual(parseBackup(backup),data);assert.deepEqual(importBackup(backup,store),data);
 const before=store.getItem(STORAGE_KEY);const change=(fn:(v:any)=>void)=>{const b=JSON.parse(backup);fn(b);assert.throws(()=>importBackup(JSON.stringify(b),store));assert.equal(store.getItem(STORAGE_KEY),before);};
 change(b=>b.version=999);change(b=>b.extra=true);change(b=>b.data.solves[0].rawMs=-1);change(b=>b.data.solves[0].rawMs='10');change(b=>b.data.solves[0].createdAt='2026-02-30T00:00:00.000Z');change(b=>b.data.solves.push(b.data.solves[0]));change(b=>b.data.solves[0].sessionId='unknown');change(b=>b.data.progress['OLL-99']={caseId:'OLL-99',favorite:false,status:'new',note:''});change(b=>b.data.settings.focus='false');change(b=>b.data.settings.animationSpeed=0);change(b=>b.data.studyAttempts[0].recognition='ok');change(b=>b.data.sessions=[]);change(b=>b.data.solves[0].scramble='R nonsense');
 store.setItem(STORAGE_KEY,'{broken');assert.ok(loadData(store).error);assert.equal(store.getItem(STORAGE_KEY),'{broken');assert.throws(()=>saveData(data,{getItem:()=>null,setItem:()=>{throw new Error('QuotaExceededError');}}),/QuotaExceeded/);assert.throws(()=>parseBackup('x'.repeat(MAX_BACKUP_BYTES+1)),/bytes UTF-8/);
});
test('CSV quotes commas and multiline fields, neutralizes spreadsheet formulas and excludes study',()=>{
 let data=initial();data=addSolve(data,{sessionId:data.activeSessionId!,mode:'two-handed',rawMs:1234,penalty:'+2',scramble:'R U',source:'manual',note:'=SUM(1,2)\n"quoted"'});const csv=exportCSV(data,{kind:'all'});assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"3234"'));assert.ok(csv.includes('"\'=SUM(1,2)\n""quoted"""'));assert.ok(csv.includes('"\'+2"'));assert.ok(!csv.includes('recognition'));assert.throws(()=>exportCSV(data,{kind:'session',sessionId:'missing',mode:'two-handed'}));
});
