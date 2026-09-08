import assert from 'node:assert/strict';
import type { CubeState, Face, Vector3 } from '../../src/domain/types';

// Coordenadas QA declaradas independentemente do motor do produto.
const faces: Record<Face, Vector3> = { U:[0,1,0], D:[0,-1,0], F:[0,0,1], B:[0,0,-1], R:[1,0,0], L:[-1,0,0] };
const corners: Vector3[] = [[1,1,1],[1,1,-1],[-1,1,-1],[-1,1,1]];
const edges: Vector3[] = [[0,1,1],[1,1,0],[0,1,-1],[-1,1,0]];
const cornerFaces: Face[][] = [['U','R','F'],['U','B','R'],['U','L','B'],['U','F','L']];
const edgeFaces: Face[][] = [['U','F'],['U','R'],['U','B'],['U','L']];
const eq = (a: Vector3,b: Vector3) => a.every((v,i) => v === b[i]);
export function centerColors(state: CubeState) {
  return Object.fromEntries(Object.entries(faces).map(([face, v]) => [face, state.find(s => eq(s.position,v) && eq(s.normal,v))?.color])) as Record<Face,Face>;
}
export function assertShape(state: CubeState) {
  assert.equal(state.length,54); assert.equal(new Set(state.map(s=>s.id)).size,54);
  assert.equal(new Set(state.map(s=>s.position.join(',')+'/'+s.normal.join(','))).size,54);
  for (const face of Object.keys(faces)) assert.equal(state.filter(s=>s.color===face).length,9);
  for (const s of state) {
    assert.ok(s.position.every(v=>Number.isInteger(v)&&Math.abs(v)<=1));
    assert.equal(s.normal.reduce((sum,v)=>sum+Math.abs(v),0),1);
    assert.equal(s.position.reduce((sum,v,i)=>sum+v*s.normal[i],0),1);
  }
}
export function qaF2L(state: CubeState) {
  const centers=centerColors(state);
  return state.filter(s=>s.position[1]<1).every(s=>{
    const face=(Object.keys(faces) as Face[]).find(f=>eq(s.normal,faces[f]));
    return face && s.color===centers[face];
  });
}
export function qaOriented(state: CubeState) { const up=centerColors(state).U; return qaF2L(state)&&state.filter(s=>eq(s.normal,faces.U)).every(s=>s.color===up); }
export function qaSolved(state: CubeState) { const centers=centerColors(state); return state.every(s=>s.color===centers[(Object.keys(faces) as Face[]).find(f=>eq(s.normal,faces[f]))!]); }
export function orientationCoordinates(state: CubeState) {
  const up=centerColors(state).U;
  function orientations(positions: Vector3[], slots: Face[][]) {
    return positions.map((p,i)=>{
      const sticker=state.find(s=>eq(s.position,p)&&s.color===up);
      assert.ok(sticker, 'Peca superior sem cor de U');
      const ori=slots[i].findIndex(face=>eq(sticker.normal,faces[face])); assert.ok(ori>=0); return ori;
    });
  }
  return { corners:orientations(corners,cornerFaces), edges:orientations(edges,edgeFaces) };
}
export function permutationCoordinates(state: CubeState) {
  const centers=centerColors(state);
  const colorKey=(colors: string[])=>[...colors].sort().join('');
  function pieces(positions: Vector3[], expected: Face[][]) {
    return positions.map(p=>{
      const colors=state.filter(s=>eq(s.position,p)).map(s=>s.color);
      const piece=expected.findIndex(list=>colorKey(list.map(f=>centers[f]))===colorKey(colors));
      assert.ok(piece>=0,'Peca fora da ultima camada'); return piece;
    });
  }
  return { corners:pieces(corners,cornerFaces), edges:pieces(edges,edgeFaces) };
}
