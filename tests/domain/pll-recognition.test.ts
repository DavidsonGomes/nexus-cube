import test from 'node:test';
import assert from 'node:assert/strict';
import { Alg } from 'cubing/alg';
import { puzzles } from 'cubing/puzzles';
import type { KPattern } from 'cubing/kpuzzle';
import { CATALOG } from '../../src/domain/catalog';
import { getPLLRecognition, getPLLRecognitionPlayback } from '../../src/domain/pll-recognition';
import { cubeAtStep, invertAlgorithm, parseAlgorithm } from '../../src/domain/cube';
import { oracleStickers, oracleSolved, permutationFixtures, stickerKey } from './oracle';
const k=await puzzles['3x3x3'].kpuzzle(),pll=CATALOG.filter(c=>c.family==='PLL');
const adjustments:Record<string,string>={Z:'U',Jb:'U',Ra:'U',Rb:"U'",Ga:'U',Gb:'U',Gc:'U',Gd:'U'};
const cycleLengths=(p:number[])=>{const seen=new Set<number>(),lengths:number[]=[];for(let i=0;i<4;i++){if(seen.has(i))continue;let j=i,n=0;do{seen.add(j);n++;j=p[j];}while(j!==i);if(n>1)lengths.push(n);}return lengths.sort();};
/** Independent equivalence on cubie arrays, not a helper-selected AUF. */
function classKey(p:KPattern):string {const d=p.patternData;return Array.from({length:4},(_,positionShift)=>Array.from({length:4},(_,colorShift)=>['CORNERS','EDGES'].map(o=>Array.from({length:4},(_,i)=>(d[o].pieces[(i+positionShift)%4]+colorShift)%4).join('')).join('/'))).flat().sort()[0];}
function verifyProfile(name:string,p:KPattern){
 const cp=p.patternData.CORNERS.pieces.slice(0,4),ep=p.patternData.EDGES.pieces.slice(0,4),c=cycleLengths(cp),e=cycleLengths(ep);
 if(['Ua','Ub','H','Z'].includes(name)){assert.deepEqual(c,[]);assert.deepEqual(e,['H','Z'].includes(name)?[2,2]:[3]);}
 else if(['Aa','Ab','E'].includes(name)){assert.deepEqual(e,[]);assert.deepEqual(c,name==='E'?[2,2]:[3]);}
 else if(['Ga','Gb','Gc','Gd'].includes(name)){assert.deepEqual(c,[3]);assert.deepEqual(e,[3]);}
 else{assert.deepEqual(c,[2]);assert.deepEqual(e,[2]);const changed=cp.flatMap((piece,i)=>piece===i?[]:[i]);const delta=Math.abs(changed[0]-changed[1]);assert.equal(delta===2,['V','Y','Na','Nb'].includes(name),name+' corner adjacency');}
}
test('all21 nominal recognition profiles select explicit AUF, preserve source data and use coherent inverse effective sequences for every alternative',()=>{
 const before=JSON.stringify(pll);assert.equal(pll.length,21);
 for(const item of pll)for(const algorithm of [item.algorithm,...item.alternatives]){
  const name=item.id.slice(4),r=getPLLRecognition(item,algorithm);
  const raw=k.defaultPattern().applyAlg(new Alg(algorithm).invert()),recognized=raw.applyAlg(r.adjustment);
  assert.equal(r.adjustment,adjustments[name]??'',item.id);assert.equal(r.originalAlgorithm,parseAlgorithm(algorithm).join(' '));
  assert.equal(stickerKey(r.rawState),stickerKey(oracleStickers(raw)));assert.equal(stickerKey(r.recognitionState),stickerKey(oracleStickers(recognized)));
  verifyProfile(name,recognized);assert.equal(classKey(recognized),classKey(raw),item.id+' must retain named class');
  assert.equal(r.undoAdjustment,new Alg(r.adjustment).invert().toString());assert.equal(r.solution,[r.undoAdjustment,r.originalAlgorithm].filter(Boolean).join(' '));
  assert.equal(r.preparation,[r.rawPreparation,r.adjustment].filter(Boolean).join(' '));assert.equal(invertAlgorithm(r.solution),r.preparation);
  assert.ok(oracleSolved(recognized.applyAlg(r.solution)));assert.equal(stickerKey(oracleStickers(k.defaultPattern().applyAlg(r.preparation))),stickerKey(r.recognitionState));
 }
 assert.equal(JSON.stringify(pll),before,'catalog algorithms/alternatives/setups/IDs must remain untouched');
});
test('recognized21 states cover exactly the independently enumerated288 legal permutation fixtures minus skip',()=>{
 const classes=new Set([...permutationFixtures(k)].map(classKey));assert.equal(classes.size,22);classes.delete(classKey(k.defaultPattern()));
 const seen=new Set(pll.map(item=>classKey(k.defaultPattern().applyAlg(getPLLRecognition(item).preparation))));assert.equal(seen.size,21);assert.deepEqual(seen,classes);
});
test('adjusted preparation and solve playback match independent moves at every step for all21 and alternatives',()=>{
 for(const item of pll)for(const a of [item.algorithm,...item.alternatives])for(const mode of ['prepare','solve'] as const){
  const p=getPLLRecognitionPlayback(item,a,mode);assert.equal(p.caseState,p.recognitionState);assert.equal(p.inverseSolution,p.preparation);assert.equal(p.usesAuthoredSetup,false);
  assert.equal(p.setup,mode==='prepare'?'':p.preparation);assert.equal(p.algorithm,mode==='prepare'?p.preparation:p.solution);
  let independent=k.defaultPattern().applyAlg(p.setup);const moves=parseAlgorithm(p.algorithm);
  assert.equal(stickerKey(p.initialState),stickerKey(oracleStickers(independent)));
  for(let step=0;step<=moves.length;step++){assert.equal(stickerKey(cubeAtStep(p.setup,p.algorithm,step)),stickerKey(oracleStickers(independent)),`${item.id}/${mode}/${step}`);if(step<moves.length)independent=independent.applyAlg(moves[step]);}
  assert.equal(stickerKey(oracleStickers(independent)),mode==='prepare'?stickerKey(p.recognitionState):stickerKey(oracleStickers(k.defaultPattern())));
 }
});
test('Z/Jb/Ra/Rb and G use their nominal profiles rather than the raw cycle count; invalid family/alternative is rejected',()=>{
 for(const name of ['Z','Jb','Ra','Rb','Ga','Gb','Gc','Gd']){const item=pll.find(c=>c.id==='PLL-'+name)!,r=getPLLRecognition(item);assert.notEqual(r.adjustment,'');assert.notDeepEqual(r.rawPermutation.cycles,r.recognitionPermutation.cycles);}
 const z=getPLLRecognition(pll.find(c=>c.id==='PLL-Z')!);assert.equal(z.recognitionPermutation.fixed.filter(m=>m.kind==='corner').length,4);assert.equal(z.recognitionPermutation.arrows.length,2);assert.ok(z.recognitionPermutation.arrows.every(a=>a.kind==='edge'&&a.bidirectional));
 assert.throws(()=>getPLLRecognition(CATALOG.find(c=>c.family==='OLL')!),/PLL/);assert.throws(()=>getPLLRecognition(pll[0],'R'),/pertence/);assert.throws(()=>getPLLRecognitionPlayback(pll[0],undefined,'bad' as never),/Modo/);
});
