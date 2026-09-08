import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { applyAlgorithm, applyMove, canonicalOrientation, cubeAtStep, faceColors, FACES, invertAlgorithm, isF2LSolved, isOLLOriented, isSolved, lastLayerThumbnail, moveInfo, ollSignature, parseAlgorithm, solvedCube } from '../../src/domain/cube';
import { CATALOG as ALL_CATALOG, selectCases, TWO_LOOK_GUIDE } from '../../src/domain/catalog';
import { oracleStickers, orientationFixtures, permutationFixtures, oracleOriented, oracleSolved, stickerKey } from './oracle';
import type { CubeState } from '../../src/domain/types';
const CATALOG=ALL_CATALOG.filter(c=>c.family==='OLL'||c.family==='PLL');
const kpuzzle=await puzzles['3x3x3'].kpuzzle();
function pllSignature(state: CubeState): string {return ['','y','y2',"y'"].flatMap(y=>['','U','U2',"U'"].map(u=>{const s=applyAlgorithm(state,`${y} ${u}`);const centers=FACES.map(f=>faceColors(s,f)[4]);return FACES.map(f=>faceColors(s,f).map(c=>FACES[centers.indexOf(c)]).join('')).join('');})).sort()[0];}
test('all primitive moves, wide moves, rotations and suffixes agree with independent cubing tables',()=>{
  const bases='R L U D F B M E S x y z r l u d f b Rw Lw Uw Dw Fw Bw'.split(' ');
  for(const b of bases)for(const suffix of ['',"'",'2']){const alg=b+suffix;assert.equal(stickerKey(applyAlgorithm(solvedCube(),alg)),stickerKey(oracleStickers(kpuzzle.defaultPattern().applyAlg(alg))),alg);assert.ok(isSolved(applyAlgorithm(solvedCube(),`${alg} ${alg} ${alg} ${alg}`)));}
  const alg="R U2 F' M E S r l' u2 b D x y z Lw2";assert.equal(stickerKey(applyAlgorithm(solvedCube(),alg)),stickerKey(oracleStickers(kpuzzle.defaultPattern().applyAlg(alg))));
  assert.deepEqual(parseAlgorithm("Rw U2' R'"),['r','U2',"R'"]);for(const a of ['R3','foo','R U (','[R,U]','RUR\''])assert.throws(()=>parseAlgorithm(a));assert.throws(()=>moveInfo('R U'));
});
test('all 78 case states, every animation step and alternatives agree with independent cubing oracle',()=>{
  assert.equal(CATALOG.filter(c=>c.family==='OLL').length,57);assert.equal(CATALOG.filter(c=>c.family==='PLL').length,21);assert.equal(new Set(CATALOG.map(c=>c.id)).size,78);
  for(const c of CATALOG){assert.ok(isF2LSolved(c.initialState),c.id);assert.ok(!isSolved(c.initialState),c.id);assert.equal(stickerKey(c.initialState),stickerKey(oracleStickers(kpuzzle.defaultPattern().applyAlg(c.setup))),c.id);
    const moves=parseAlgorithm(c.algorithm);let oracle=kpuzzle.defaultPattern().applyAlg(c.setup);
    for(let step=0;step<=moves.length;step++){assert.equal(stickerKey(cubeAtStep(c.setup,c.algorithm,step)),stickerKey(oracleStickers(oracle)),`${c.id} step ${step}`);if(step<moves.length)oracle=oracle.applyAlg(moves[step]);}
    assert.ok(oracleSolved(oracle),c.id);
    for(const alt of c.alternatives){const p=kpuzzle.defaultPattern().applyAlg(c.setup).applyAlg(alt);assert.ok(c.family==='OLL'?oracleOriented(p):oracleSolved(p),`${c.id} alternative ${alt}`);}
    const thumb=lastLayerThumbnail(c.initialState);assert.deepEqual(thumb.top,faceColors(c.initialState,'U'));assert.equal(Object.values(thumb).flat().length,21);
  }
});
test('independent enumeration of all 216 legal orientations matches exactly 57 OLL classes plus skip and each algorithm orients them',()=>{
  const catalog=CATALOG.filter(c=>c.family==='OLL');const signatures=new Set(catalog.map(c=>ollSignature(c.initialState)));assert.equal(signatures.size,57);
  const covered=new Set<string>();let count=0;
  for(const p of orientationFixtures(kpuzzle)){count++;const state=oracleStickers(p),sig=ollSignature(state);covered.add(sig);if(oracleOriented(p)){assert.ok(!signatures.has(sig));continue;}
    const c=catalog.find(c=>ollSignature(c.initialState)===sig);assert.ok(c,`missing ${sig}`);
    const solved=['','U','U2',"U'"].some(u=>oracleOriented(p.applyAlg(u).applyAlg(c.algorithm)));assert.ok(solved,`${c.id} does not orient independently constructed fixture`);
  }
  assert.equal(count,216);assert.equal(covered.size,58);assert.ok([...signatures].every(s=>covered.has(s)));
});
test('independent enumeration of 288 legal PLL permutations matches exactly 21 classes plus skip, and every case solves',()=>{
  const catalog=CATALOG.filter(c=>c.family==='PLL');const bySig=new Map(catalog.map(c=>[pllSignature(c.initialState),c]));assert.equal(bySig.size,21);
  const classes=new Set<string>();let count=0;
  for(const p of permutationFixtures(kpuzzle)){count++;const state=oracleStickers(p),sig=pllSignature(state);classes.add(sig);if(['','U','U2',"U'"].some(u=>oracleSolved(p.applyAlg(u)))){assert.ok(!bySig.has(sig));continue;}
    const c=bySig.get(sig);assert.ok(c,`missing ${sig}`);let solves=false;
    outer:for(const y of ['','y','y2',"y'"])for(const u of ['','U','U2',"U'"]){const after=p.applyAlg(`${y} ${u} ${c.algorithm}`);for(const auf of ['','U','U2',"U'"])if(oracleSolved(after.applyAlg(auf))){solves=true;break outer;}}
    assert.ok(solves,`${c.id} does not solve independent fixture`);
  }
  assert.equal(count,288);assert.equal(classes.size,22);
});
test('two-look selections expose ordered stages and preserve full catalog',()=>{
 assert.equal(selectCases({family:'OLL',twoLook:true}).length,10);assert.equal(selectCases({family:'PLL',twoLook:true}).length,6);
 for(const family of ['OLL','PLL'] as const)assert.deepEqual(new Set(TWO_LOOK_GUIDE[family].flatMap(s=>[...s.ids])),new Set(selectCases({family,twoLook:true}).map(c=>c.id)));
 assert.equal(selectCases({ids:[]}).length,0);assert.equal(selectCases({favorites:true}).length,0);
 assert.ok(isSolved(applyAlgorithm(solvedCube(),canonicalOrientation('x y z'))));assert.throws(()=>cubeAtStep('','R',2));assert.equal(invertAlgorithm("R U2 F'"),"F U2 R'");
});
