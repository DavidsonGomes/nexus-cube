import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOG, getCase, selectCases } from '../../src/domain/catalog';
import { applyAlgorithm, applyMove, cubeAtStep, solvedCube, parseAlgorithm } from '../../src/domain/cube';
import { drawStudyCase, recordStudyAttempt, updateCaseProgress } from '../../src/domain/study';
import { globalStatistics } from '../../src/domain/statistics';
import { qaData } from './contract-fixtures';
import { assertShape, qaF2L, qaOriented, qaSolved, orientationCoordinates, permutationCoordinates } from './sticker-oracle';
// @ts-ignore oraculos ESM independentes
import { ollClass, pllClass, ollCoverage, pllCoverage } from './cube-cases.mjs';

const LEGACY_LL_CASES = CATALOG.filter(c => c.family === 'OLL' || c.family === 'PLL');
const LEGACY_IDS = new Set(LEGACY_LL_CASES.map(c => c.id));

test('A5: 78 cases cover all independent legal classes, not duplicate labels', () => {
  assert.equal(CATALOG.length,161); assert.equal(new Set(CATALOG.map(c=>c.id)).size,161);
  assert.deepEqual(Object.fromEntries(['OLL','PLL','F2L','CMLL'].map(f=>[f,CATALOG.filter(c=>c.family===f).length])),{OLL:57,PLL:21,F2L:41,CMLL:42});
  assert.equal(LEGACY_LL_CASES.length,78); assert.equal(new Set(LEGACY_LL_CASES.map(c=>c.id)).size,78);
  const actualOLL=new Set<string>(),actualPLL=new Set<string>();
  for(const c of LEGACY_LL_CASES) {
    assertShape(c.initialState); assert.ok(qaF2L(c.initialState),`${c.id} F2L initial`);
    const final=applyAlgorithm(c.initialState,c.algorithm); assertShape(final); assert.ok(qaF2L(final),`${c.id} F2L final`);
    if(c.family==='OLL') {
      assert.ok(!qaOriented(c.initialState),`${c.id} already oriented`); assert.ok(qaOriented(final),`${c.id} orientation final`);
      const coordinates=orientationCoordinates(c.initialState);
      assert.equal(coordinates.corners.reduce((a,b)=>a+b,0)%3,0,c.id); assert.equal(coordinates.edges.reduce((a,b)=>a+b,0)%2,0,c.id);
      actualOLL.add(ollClass(coordinates));
    } else {
      assert.ok(qaOriented(c.initialState),`${c.id} PLL must begin oriented`); assert.ok(!qaSolved(c.initialState));
      assert.ok(['','U','U2',"U'"].some(auf=>qaSolved(applyAlgorithm(final,auf))),`${c.id} solves PLL`);
      actualPLL.add(pllClass(permutationCoordinates(c.initialState)));
    }
    assert.deepEqual(cubeAtStep(c.setup,c.algorithm,0),c.initialState,c.id+' setup equals initial');
  }
  assert.deepEqual([...actualOLL].sort(),[...ollCoverage.keys()].sort());
  assert.deepEqual([...actualPLL].sort(),[...pllCoverage.keys()].sort());
});

test('A5: case IDs match external reference classes and PLL diagram arrows', () => {
  const {references}=JSON.parse(readFileSync(new URL('./reference-classes.json',import.meta.url),'utf8'));
  assert.deepEqual([...LEGACY_IDS].sort(), Object.keys(references).sort());
  for(const c of LEGACY_LL_CASES) {
    const actual=c.family==='OLL'?ollClass(orientationCoordinates(c.initialState)):pllClass(permutationCoordinates(c.initialState));
    assert.equal(actual,references[c.id].class,`${c.id} pattern/ID reference`);
  }
});

test('A6: every discrete playback prefix and alternative preserves final stage', () => {
  for(const c of CATALOG) {
    let state=c.initialState; const moves=parseAlgorithm(c.algorithm);
    for(let step=0;step<=moves.length;step++) { assert.deepEqual(cubeAtStep(c.setup,c.algorithm,step),state,`${c.id} step ${step}`); if(step<moves.length)state=applyMove(state,moves[step]); }
    for(const algorithm of c.alternatives) {
      const end=applyAlgorithm(c.initialState,algorithm);
      if (c.family === 'OLL') assert.ok(qaOriented(end),`${c.id} alternative resolves OLL`);
      else if (c.family === 'PLL') assert.ok(qaSolved(end),`${c.id} alternative resolves PLL`);
      // F2L/CMLL objective semantics are covered by the dedicated independent
      // oracles in tests/domain/expansion-f2l.test.ts and tests/qa/cmll-cpco-oracle.test.ts.
      else assertShape(end);
    }
  }
});

test('A6: clockwise R moves UFR sticker correctly and preserves other layers', () => {
  const initial=solvedCube(), state=applyMove(initial,'R');
  const up=initial.find(s=>s.color==='U'&&s.position.join(',')==='1,1,1')!;
  const moved=state.find(s=>s.id===up.id)!;
  assert.deepEqual(moved.position,[1,1,-1]); assert.deepEqual(moved.normal,[0,0,-1]);
  for(const s of initial.filter(s=>s.position[0]!==1)) assert.deepEqual(state.find(v=>v.id===s.id),s);
  for(const token of ['U','R','F','D','L','B','M','E','S','x','y','z','r','l','u','d','f','b']) {
    const moved=applyMove(initial,token);assertShape(moved);
    // -0 e 0 representam a mesma coordenada geometrica.
    assert.equal(JSON.stringify(applyAlgorithm(initial,`${token} ${token} ${token} ${token}`)),JSON.stringify(initial));
    assert.equal(JSON.stringify(applyAlgorithm(initial,`${token} ${token}'`)),JSON.stringify(initial));
  }
});

test('A7: selection boundaries and study never alter solves/global records', () => {
  const data=qaData(), before=structuredClone(data),records=globalStatistics(data, null);
  assert.deepEqual(selectCases({ids:[]}),[]); assert.throws(()=>drawStudyCase([]));
  const chosen=selectCases({ids:['OLL-01','PLL-T']}); assert.equal(chosen.length,2);
  for(let n=0;n<100;n++)assert.ok(chosen.includes(drawStudyCase(chosen)));
  assert.equal(drawStudyCase([getCase('PLL-T')]).id,'PLL-T');
  assert.deepEqual(selectCases({favorites:true},data.progress).map(c=>c.id),['OLL-01']);
  assert.deepEqual(selectCases({learning:true,ids:['PLL-T']},data.progress),[]);
  const updated=recordStudyAttempt(updateCaseProgress(data,'PLL-T',{favorite:true,status:'mastered',note:'QA'}),{caseId:'PLL-T',recognition:'good',execution:'again',durationMs:null});
  assert.deepEqual(updated.solves,before.solves); assert.deepEqual(updated.sessions,before.sessions); assert.deepEqual(globalStatistics(updated, null),records);
  assert.equal(updated.studyAttempts.length,before.studyAttempts.length+1); assert.deepEqual(data,before);
});
