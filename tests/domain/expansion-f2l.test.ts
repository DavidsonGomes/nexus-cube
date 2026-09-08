import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { KPattern } from 'cubing/kpuzzle';
import { F2L_CASES } from '../../src/data/f2l-compiled';
import { oracleStickers, stickerKey } from './oracle';
import { applyAlgorithm, solvedCube } from '../../src/domain/cube';
import { arePiecesSolved, CROSS_PIECES, f2lSignature, validateStage } from '../../src/domain/stage-validation';
const parity=(a:number[])=>a.reduce((n,v,i)=>n+a.slice(i+1).filter(w=>w<v).length,0)%2;
const aufs=['','U','U2',"U'"];
function key(p:KPattern):string{return aufs.map(u=>{const d=p.applyAlg(u).patternData;return ['CORNERS','EDGES'].map((o,j)=>{const i=d[o].pieces.indexOf(j?8:4);return `${i}:${d[o].orientation[i]}`;}).join('/');}).sort()[0];}
const protectedPieces=[...CROSS_PIECES,'FL','DFL','BR','DBR','BL','DBL'];
test('F2L enumerates 150 legal target-pair states into 41 cases plus skip without catalog/inverse construction',async()=>{
 const k=await puzzles['3x3x3'].kpuzzle();const fixtures=new Map<string,KPattern>();
 for(const cp of [0,1,2,3,4])for(const co of [0,1,2])for(const ep of [0,1,2,3,8])for(const eo of [0,1]){
  const d=structuredClone(k.defaultPattern().patternData);
  [d.CORNERS.pieces[cp],d.CORNERS.pieces[4]]=[d.CORNERS.pieces[4],d.CORNERS.pieces[cp]];
  [d.EDGES.pieces[ep],d.EDGES.pieces[8]]=[d.EDGES.pieces[8],d.EDGES.pieces[ep]];
  d.CORNERS.orientation[cp]=co;d.CORNERS.orientation[[0,1,2,3].find(i=>i!==cp)!]=(3-co)%3;
  d.EDGES.orientation[ep]=eo;d.EDGES.orientation[[0,1,2,3].find(i=>i!==ep)!]=eo;
  if(parity(d.CORNERS.pieces)!==parity(d.EDGES.pieces)){const [a,b]=[0,1,2,3].filter(i=>i!==ep);[d.EDGES.pieces[a],d.EDGES.pieces[b]]=[d.EDGES.pieces[b],d.EDGES.pieces[a]];}
  const p=new KPattern(k,d);assert.ok(arePiecesSolved(oracleStickers(p),protectedPieces));fixtures.set(key(p),p);
 }
 assert.equal(fixtures.size,42);const skip=key(k.defaultPattern()),seen=new Set<string>();
 for(const c of F2L_CASES){const p=k.defaultPattern().applyAlg(c.setup),signature=key(p);assert.notEqual(signature,skip,c.id);assert.ok(!seen.has(signature),c.id);seen.add(signature);
  const fixture=fixtures.get(signature)!;assert.ok(fixture,c.id);
  assert.ok(aufs.some(u=>arePiecesSolved(oracleStickers(fixture.applyAlg(u).applyAlg(c.algorithm)),[...protectedPieces,'FR','DFR'])),c.id);
 }
 assert.equal(seen.size,41);assert.deepEqual(new Set([...seen,skip]),new Set(fixtures.keys()));
});
test('F2L all registered alternatives preserve cross and other slots; both play directions match independent moves',async()=>{
 const k=await puzzles['3x3x3'].kpuzzle();
 for(const c of F2L_CASES){const main=applyAlgorithm(solvedCube(),c.setup);assert.ok(arePiecesSolved(main,protectedPieces));
 for(const a of [c.algorithm,...c.alternatives]){
  const final=k.defaultPattern().applyAlg(c.setup).applyAlg(a);assert.ok(validateStage(oracleStickers(final),{goal:'f2l-pair',targetSlot:'FR',preserve:protectedPieces}),`${c.id} ${a}`);
  assert.equal(stickerKey(applyAlgorithm(main,a)),stickerKey(oracleStickers(final)));
 }
 }
});
