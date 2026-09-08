import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import type { KPattern } from 'cubing/kpuzzle';
import { CATALOG } from '../../src/domain/catalog';
import { getContentPlayback } from '../../src/domain/playback';
import { getPLLPermutation } from '../../src/domain/pll-permutation';
import type { PLLPermutation, PLLPieceKind, PLLArrow, PLLPieceMapping } from '../../src/domain/pll-permutation';
import { applyAlgorithm, solvedCube } from '../../src/domain/cube';
import { oracleStickers, permutationFixtures } from './oracle';
const k=await puzzles['3x3x3'].kpuzzle();
const cornerCells=[8,2,0,6],edgeCells=[7,5,1,3];
const corners=['UFR','URB','UBL','ULF'],edges=['UF','UR','UB','UL'];
function expectedMappings(p:KPattern){return (['CORNERS','EDGES'] as const).flatMap((o,j)=>{
 const cells=j?edgeCells:cornerCells,names=j?edges:corners;
 return cells.map((from,i)=>({kind:(j?'edge':'corner') as PLLPieceKind,from,to:cells[p.patternData[o].pieces[i]],piece:names[p.patternData[o].pieces[i]].split('').sort().join('')}));
}).sort((a,b)=>a.from-b.from);}
function verify(p:KPattern,result:PLLPermutation,label:string){
 assert.equal(result.status,'ready',label);if(result.status!=='ready')return;
 const expected=expectedMappings(p);
 assert.deepEqual(result.mappings.map(m=>({kind:m.kind,from:m.from.index,to:m.to.index,piece:m.piece})),expected,label);
 for(const m of result.mappings)for(const e of [m.from,m.to]){assert.equal(e.x,e.index%3+.5);assert.equal(e.y,Math.floor(e.index/3)+.5);}
 const directed=result.arrows.flatMap(a=>a.bidirectional?[`${a.from.index}>${a.to.index}`,`${a.to.index}>${a.from.index}`]:[`${a.from.index}>${a.to.index}`]).sort();
 assert.deepEqual(directed,expected.filter(m=>m.from!==m.to).map(m=>`${m.from}>${m.to}`).sort(),label+' directed arrows');
 assert.deepEqual(result.fixed.map(m=>m.from.index),expected.filter(m=>m.from===m.to).map(m=>m.from));
 const covered:number[]=[];
 for(const cycle of result.cycles){const ids=cycle.positions.map(p=>p.index);assert.ok(ids.length>=2&&ids.length<=4);
  ids.forEach((from,i)=>{const mapping=expected.find(e=>e.from===from)!;assert.equal(mapping.to,ids[(i+1)%ids.length],label+' cycle direction');assert.equal(mapping.kind,cycle.kind);assert.equal(mapping.piece,cycle.pieces[i]);});
  const arrows:readonly PLLArrow[]=result.arrows.filter(a=>a.cycleId===cycle.id);assert.equal(arrows.length,ids.length===2?1:ids.length);assert.ok(arrows.every(a=>a.bidirectional===(ids.length===2)));
  covered.push(...ids);
 }
 assert.deepEqual(covered.sort((a,b)=>a-b),expected.filter(m=>m.from!==m.to).map(m=>m.from));
}
test('all 21 PLL principal and alternative states expose independent cubie source/destination identities and directed cycles',()=>{
 const cases=CATALOG.filter(c=>c.family==='PLL');assert.equal(cases.length,21);
 for(const c of cases)for(const a of [c.algorithm,...c.alternatives]){
  const playback=getContentPlayback(c,a),p=k.defaultPattern().applyAlg(playback.preparation);
  verify(p,getPLLPermutation(playback.caseState),`${c.id}: ${a}`);
 }
 for(const id of ['PLL-Aa','PLL-Ab']){const c=cases.find(c=>c.id===id)!;const result=getPLLPermutation(c.initialState);assert.equal(result.status,'ready');if(result.status==='ready'){assert.equal(result.cycles.length,1);assert.equal(result.cycles[0].kind,'corner');assert.equal(result.cycles[0].positions.length,3);assert.ok(result.fixed.filter(m=>m.kind==='edge').length===4);}}
});
test('all 288 legal LL permutation fixtures are built independently, and every arrow goes to the identity destination',()=>{
 let n=0;for(const pattern of permutationFixtures(k)){verify(pattern,getPLLPermutation(oracleStickers(pattern)),`fixture ${n++}`);}assert.equal(n,288);
});
test('solved and fixed pieces have no arrows; AUF remains visible and two-cycles have exactly two heads',()=>{
 const solved=getPLLPermutation(solvedCube());assert.equal(solved.status,'ready');if(solved.status==='ready'){assert.equal(solved.fixed.length,8);assert.equal(solved.cycles.length,0);assert.equal(solved.arrows.length,0);}
 for(const auf of ['U','U2',"U'"]){const p=k.defaultPattern().applyAlg(auf),r=getPLLPermutation(oracleStickers(p));verify(p,r,auf);assert.equal(r.fixed.length,0);if(r.status==='ready'){assert.equal(r.arrows.length,auf==='U2'?4:8);assert.ok(r.arrows.every(a=>a.bidirectional===(auf==='U2')));}}
 const z=CATALOG.find(c=>c.id==='PLL-Z')!.initialState,zActual=getPLLPermutation(z),zAfterExplicitU=getPLLPermutation(applyAlgorithm(z,'U'));assert.equal(zActual.status,'ready');assert.equal(zAfterExplicitU.status,'ready');if(zActual.status==='ready'&&zAfterExplicitU.status==='ready'){assert.deepEqual(zActual.cycles.map(c=>[c.kind,c.positions.length]),[['corner',4],['edge',2]]);assert.deepEqual(zAfterExplicitU.cycles.map(c=>[c.kind,c.positions.length]),[['edge',2],['edge',2]]);}
 const p=k.defaultPattern().applyAlg(CATALOG.find(c=>c.id==='PLL-H')!.setup),r=getPLLPermutation(oracleStickers(p));assert.equal(r.status,'ready');if(r.status==='ready'){assert.equal(r.arrows.length,2);assert.ok(r.arrows.every(a=>a.bidirectional&&a.kind==='edge'));assert.equal(r.fixed.length,4);}
});
test('displayed centers and explicit up/front frame track cube rotations without discarding AUF',()=>{
 const c=CATALOG.find(c=>c.id==='PLL-Ga')!,state=applyAlgorithm(c.initialState,'U'),base=getPLLPermutation(state);
 const frames=[['x','B','U'],["x'",'F','D'],['x2','D','B'],['y','U','L'],['y2','U','B'],['z','R','F'],['z2','D','F']] as const;
 for(const [alg,up,front] of frames){const changed=getPLLPermutation(applyAlgorithm(state,alg),{up,front});assert.equal(changed.status,'ready',alg);if(changed.status==='ready'&&base.status==='ready'){assert.deepEqual(changed.mappings,base.mappings,alg);assert.deepEqual(changed.arrows,base.arrows,alg);}}
 const rotated=getPLLPermutation(applyAlgorithm(state,'y'));const quarter:Record<number,number>={0:2,1:5,2:8,3:1,5:7,6:0,7:3,8:6};
 assert.equal(rotated.status,'ready');if(rotated.status==='ready'&&base.status==='ready')for(const m of base.mappings){const after:PLLPieceMapping=rotated.mappings.find(n=>n.piece===m.piece)!;assert.equal(after.from.index,quarter[m.from.index]);assert.equal(after.to.index,quarter[m.to.index]);}
});
test('helper is pure and declines non-PLL intermediate states instead of drawing misleading arrows',()=>{
 const state=solvedCube(),before=structuredClone(state);getPLLPermutation(state);assert.deepEqual(state,before);
 for(const a of ['R','F','M',"R U R' U R U2 R'"]){const result=getPLLPermutation(applyAlgorithm(state,a));assert.equal(result.status,'not-pll',a);assert.equal(result.arrows.length,0);}
 assert.equal(getPLLPermutation([]).status,'not-pll');assert.throws(()=>getPLLPermutation(state,{up:'U',front:'D'}),/adjacentes/);
});
