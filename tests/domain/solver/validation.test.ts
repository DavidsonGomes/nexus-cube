import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { KPattern } from 'cubing/kpuzzle';
import { oracleStickers, stickerKey } from '../oracle';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import { createEmptyDraft, createSolvedDraft, draftFromCube, getDraftPreview, validateDraft } from '../../../src/solver';
import type { DraftFacelets } from '../../../src/solver';
import type { Face } from '../../../src/domain/types';

function mutable(draft:DraftFacelets){return structuredClone(draft) as Record<Face,(Face|null)[]>;}
const kp=await puzzles['3x3x3'].kpuzzle();
function patternChange(change:(data:KPattern['patternData'])=>void){const data=structuredClone(kp.defaultPattern().patternData);change(data);return draftFromCube(oracleStickers(new KPattern(kp,data)));}
function codes(input:unknown){const v=validateDraft(input);assert.notEqual(v.kind,'valid');return v.kind==='valid'?[]:v.issues.map(i=>i.code);}

test('fixed frame, empty preview and strict input shape/colors/counts',()=>{
  const empty=createEmptyDraft();assert.equal(Object.values(empty).flat().filter(c=>c===null).length,48);
  assert.deepEqual(codes(empty),['incomplete']);
  assert.deepEqual(codes({...empty,U:[]}),['invalid-shape']);
  const invalid=mutable(createSolvedDraft());(invalid.U as unknown[])[0]='purple';assert.deepEqual(codes(invalid),['invalid-color']);
  const centers=mutable(createSolvedDraft());[centers.U[4],centers.D[4]]=[centers.D[4],centers.U[4]];assert.deepEqual(codes(centers),['center-mismatch']);
  const count=mutable(createSolvedDraft());count.F[0]='R';const checked=validateDraft(count);assert.equal(checked.kind,'invalid');assert.equal(checked.issues[0].counts?.R,10);assert.equal(checked.issues[0].expected,9);
  const preview=getDraftPreview(empty);assert.equal(preview.state.length,54);assert.equal(preview.palette.U0,'#737373');assert.equal(preview.palette.U4,'#ffd54a');
});
test('independent KPuzzle states preserve all sticker locations, cubies and stable identities',()=>{
  for(const alg of ['', 'R', 'F', 'B', 'L', 'D', 'U', "R U2 F' D L2 B R' U F2", "F R U R' U' F' B2 D' L U2 R2"]){
    const pattern=kp.defaultPattern().applyAlg(alg),expected=oracleStickers(pattern),valid=validateDraft(draftFromCube(expected));
    assert.equal(valid.kind,'valid',alg);if(valid.kind!=='valid')continue;
    assert.deepEqual(valid.cubies.corners,pattern.patternData.CORNERS);
    assert.deepEqual(valid.cubies.edges,pattern.patternData.EDGES);
    assert.equal(stickerKey(valid.state),stickerKey(expected));
    // Geometry treats -0 and +0 as the same coordinate; compare every identity/color/vector.
    const identities=(state:typeof valid.state)=>state.map(s=>[s.id,s.color,s.position.join(','),s.normal.join(',')]).sort((a,b)=>a[0].localeCompare(b[0]));
    assert.deepEqual(identities(valid.state),identities(applyAlgorithm(solvedCube(),alg)));
    assert.ok(Object.isFrozen(valid.facelets.U));assert.ok(Object.isFrozen(valid.state[0].position));
  }
});
test('twist, flip and parity are independently invalid, with global rather than guilty slots',()=>{
  const fixtures:[DraftFacelets,string][]=[
    [patternChange(d=>{d.CORNERS.orientation[0]=1;}),'corner-twist'],
    [patternChange(d=>{d.EDGES.orientation[0]=1;}),'edge-flip'],
    [patternChange(d=>{[d.EDGES.pieces[0],d.EDGES.pieces[1]]=[1,0];}),'permutation-parity'],
  ];
  for(const [draft,code] of fixtures){const v=validateDraft(draft);assert.equal(v.kind,'invalid');assert.deepEqual(v.issues.map(i=>i.code),[code]);assert.equal(v.issues[0].scope,'cube');assert.deepEqual(v.issues[0].slots,[]);}
});
test('mirrored corner and duplicate identities fail despite nine of every color',()=>{
  const mirror=mutable(createSolvedDraft());[mirror.F[2],mirror.R[0]]=[mirror.R[0],mirror.F[2]];assert.ok(codes(mirror).includes('invalid-piece'));
  // UF/DB -> UB/DF duplicates, counts preserved by swapping the F and B stickers.
  const duplicate=mutable(createSolvedDraft());[duplicate.F[1],duplicate.B[7]]=[duplicate.B[7],duplicate.F[1]];assert.ok(codes(duplicate).includes('duplicate-piece'));
});
