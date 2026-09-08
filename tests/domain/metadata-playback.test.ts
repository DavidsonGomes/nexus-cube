import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { CATALOG as ALL_CATALOG, getCase, selectCases, matchesCaseQuery } from '../../src/domain/catalog';
import { getAlgorithmPlayback } from '../../src/domain/playback';
import { applyAlgorithm, cubeAtStep, invertAlgorithm, isF2LSolved, isOLLOriented, isSolved, ollSignature, parseAlgorithm, solvedCube } from '../../src/domain/cube';
import { COMPILED_CASES } from '../../src/data/catalog-compiled';
import { oracleStickers, oracleSolved, stickerKey } from './oracle';
import { createInitialData, exportBackup, parseBackup } from '../../src/data/store';
import { updateCaseProgress } from '../../src/domain/study';
const CATALOG=ALL_CATALOG.filter(c=>c.family==='OLL'||c.family==='PLL');
const kpuzzle=await puzzles['3x3x3'].kpuzzle();
test('metadata covers the same 78 immutable cases with traceable common or descriptive names',()=>{
  assert.equal(CATALOG.length,78);assert.deepEqual(CATALOG.map(c=>c.id),COMPILED_CASES.map(c=>c.id));
  for(const c of CATALOG){const original=COMPILED_CASES.find(v=>v.id===c.id)!;assert.equal(c.algorithm,original.algorithm);assert.equal(c.setup,original.setup);assert.deepEqual(c.alternatives,original.alternatives);assert.ok(c.name.length>2);assert.ok(!/^OLL[ -]?\d+$/.test(c.name));assert.ok(!/^PLL-/.test(c.name));assert.ok(c.aliases.length);assert.ok(['common','descriptive'].includes(c.nameKind));assert.ok(c.nameSource.startsWith('https://'));}
  for(const [i,id] of ['OLL-29','OLL-30','OLL-41','OLL-42'].entries()){const c=getCase(id);assert.equal(c.name,`Irregular ${i+1}`);assert.equal(c.nameKind,'descriptive');assert.deepEqual(selectCases({query:`Awkward${i+1}`}).map(v=>v.id),[id]);}
  assert.equal(getCase('OLL-27').name,'Sune');assert.equal(getCase('OLL-26').name,'Antisune');assert.equal(getCase('PLL-H').name,'Permutação H');
});
test('search accepts aliases, accents, compact IDs and combines selection filters',()=>{
  for(const query of ['Irregular 2','irregular2','AWKWARD-2','Awkward Shape 2','OLL30','oll-30'])assert.deepEqual(selectCases({query}).map(c=>c.id),['OLL-30']);
  assert.deepEqual(selectCases({query:'permutacao H'}).map(c=>c.id),['PLL-H']);assert.ok(matchesCaseQuery(getCase('PLL-H'),'H perm'));assert.ok(matchesCaseQuery(getCase('OLL-26'),'anti sune'));assert.equal(selectCases({family:'PLL',query:'Awkward 2'}).length,0);assert.equal(selectCases({ids:[],query:'Sune'}).length,0);assert.equal(selectCases({query:'naoexiste'}).length,0);
  assert.equal(selectCases({query:'   '}).length,161);
});
test('prepare and solve use the exact inverse of each selected solution and agree with an independent engine at every preparation step',()=>{
  let differentOLLSetups=0;
  for(const c of CATALOG)for(const solution of [c.algorithm,...c.alternatives]){
    const prepare=getAlgorithmPlayback(c,solution,'prepare'),solve=getAlgorithmPlayback(c,solution,'solve');
    assert.equal(prepare.setup,'');assert.equal(prepare.algorithm,invertAlgorithm(solution));assert.equal(prepare.preparation,solve.setup);assert.equal(solve.algorithm,solve.solution);assert.equal(prepare.solution,solve.solution);
    assert.ok(isSolved(prepare.initialState));assert.equal(stickerKey(solve.initialState),stickerKey(prepare.caseState));
    const moves=parseAlgorithm(prepare.algorithm);let independent=kpuzzle.defaultPattern();
    for(let i=0;i<=moves.length;i++){assert.equal(stickerKey(cubeAtStep(prepare.setup,prepare.algorithm,i)),stickerKey(oracleStickers(independent)),`${c.id} prepare step ${i}`);if(i<moves.length)independent=independent.applyAlg(moves[i]);}
    assert.equal(stickerKey(prepare.caseState),stickerKey(oracleStickers(independent)));assert.ok(isF2LSolved(prepare.caseState));
    if(c.family==='OLL'){assert.equal(ollSignature(prepare.caseState),ollSignature(c.initialState),c.id);if(stickerKey(prepare.caseState)!==stickerKey(c.initialState))differentOLLSetups++;}else assert.ok(isOLLOriented(prepare.caseState));
    assert.ok(oracleSolved(independent.applyAlg(solution)),c.id);assert.ok(isSolved(cubeAtStep(solve.setup,solve.algorithm,parseAlgorithm(solve.algorithm).length)));
  }
  assert.ok(differentOLLSetups>0,'Must cover OLL alternatives whose inverse differs from primary setup');
});
test('inverse reverses order, preserves double turns and accepts equivalent normalized selected algorithms',()=>{
  assert.equal(invertAlgorithm("R U2 F' M x2"),"x2 M' F U2 R'");assert.equal(invertAlgorithm("R2' U2' M2' x2'"),'x2 M2 U2 R2');
  for(const c of CATALOG){const alternateNotation=c.algorithm.replace(/2(?!')/g,"2'");assert.equal(getAlgorithmPlayback(c,alternateNotation).solution,parseAlgorithm(c.algorithm).join(' '));}
  assert.throws(()=>getAlgorithmPlayback(getCase('OLL-27'),'R'),/nao pertence/);assert.throws(()=>getAlgorithmPlayback(getCase('OLL-27'),undefined,'invalid' as never),/Modo/);
});
test('renaming metadata leaves persisted favorites, notes, status and backup IDs unchanged',()=>{
  let data=createInitialData();data=updateCaseProgress(data,'OLL-30',{favorite:true,status:'learning',note:'Irregular 2'});data=updateCaseProgress(data,'PLL-H',{favorite:true});
  const restored=parseBackup(exportBackup(data));assert.deepEqual(restored,data);assert.equal(restored.version,3);assert.deepEqual(Object.keys(restored.progress),['OLL-30','PLL-H']);assert.equal(selectCases({query:'Awkward2',favorites:true},restored.progress)[0].id,'OLL-30');
});
