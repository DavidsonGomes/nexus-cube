import type { CubeState, Face, MoveInfo, Sticker, Vector3 } from './types';
/** Fixed physical scheme: yellow up, green front, red left. Geometry uses face identities. */
export const FACE_COLORS: Readonly<Record<Face, string>> = Object.freeze({ U: '#ffd54a', R: '#fb923c', F: '#22c55e', D: '#ffffff', L: '#ef4444', B: '#3b82f6' });
export const FACE_COLOR_LABELS: Readonly<Record<Face, string>> = Object.freeze({ U: 'Amarelo', R: 'Laranja', F: 'Verde', D: 'Branco', L: 'Vermelho', B: 'Azul' });
const normals: Record<Face, Vector3> = { U: [0,1,0], R: [1,0,0], F: [0,0,1], D: [0,-1,0], L: [-1,0,0], B: [0,0,-1] };
export const FACES: Face[] = ['U','R','F','D','L','B'];
function coordinates(face: Face, row: number, col: number): Vector3 {
  const a=col-1, b=1-row;
  switch(face) { case 'F': return [a,b,1]; case 'B': return [-a,b,-1]; case 'R': return [1,b,-a]; case 'L': return [-1,b,a]; case 'U': return [a,1,-b]; case 'D': return [a,-1,b]; }
}
export function solvedCube(): CubeState { return FACES.flatMap(face => Array.from({length:9}, (_,i): Sticker => ({id:face+i, color:face, position:coordinates(face,Math.floor(i/3),i%3),normal:normals[face]}))); }
export function parseAlgorithm(algorithm: string): string[] {
  if (typeof algorithm !== 'string' || algorithm.length > 10000) throw new Error('Algoritmo invalido ou longo demais.');
  if (!algorithm.trim()) return [];
  return algorithm.trim().split(/\s+/).map(token => {
    const m=/^([URFDLB]w|[URFDLBMESxyzurfdlb])(2'?|')?$/.exec(token);
    if (!m) throw new Error(`Movimento invalido: ${token}`);
    return m[1].replace(/([URFDLB])w/, (_, f: string)=>f.toLowerCase())+(m[2]?.startsWith('2')?'2':m[2]??'');
  });
}
export function moveInfo(token: string): MoveInfo {
  const parsed=parseAlgorithm(token); if(parsed.length!==1) throw new Error('Informe um movimento.');
  const t=parsed[0], base=t[0];
  const defs: Record<string, [0|1|2,number[],number]> = {
    R:[0,[1],-1], L:[0,[-1],1], U:[1,[1],-1], D:[1,[-1],1], F:[2,[1],-1], B:[2,[-1],1],
    M:[0,[0],1], E:[1,[0],1], S:[2,[0],-1], x:[0,[-1,0,1],-1], y:[1,[-1,0,1],-1], z:[2,[-1,0,1],-1],
    r:[0,[0,1],-1], l:[0,[-1,0],1], u:[1,[0,1],-1], d:[1,[-1,0],1], f:[2,[0,1],-1], b:[2,[-1,0],1],
  };
  const [axis,layers,sign]=defs[base]; return {token:t,axis,layers,quarterTurns:sign*(t.endsWith('2')?2:t.endsWith("'")?-1:1)};
}
export function rotateVector(v: Vector3, axis: 0|1|2, quarterTurns: number): Vector3 {
  let [x,y,z]=v; for(let i=0;i<((quarterTurns%4)+4)%4;i++) { if(axis===0) [y,z]=[-z,y]; else if(axis===1) [x,z]=[z,-x]; else [x,y]=[-y,x]; } return [x||0,y||0,z||0];
}
export function applyMove(state: CubeState, token: string): CubeState { const m=moveInfo(token); return state.map(s=>m.layers.includes(s.position[m.axis])?{...s,position:rotateVector(s.position,m.axis,m.quarterTurns),normal:rotateVector(s.normal,m.axis,m.quarterTurns)}:s); }
export function applyAlgorithm(state: CubeState, algorithm: string): CubeState { return parseAlgorithm(algorithm).reduce(applyMove,state); }
export function invertAlgorithm(algorithm: string): string { return parseAlgorithm(algorithm).reverse().map(t=>t.endsWith('2')?t:t.endsWith("'")?t.slice(0,-1):t+"'").join(' '); }
const equal=(a: Vector3,b: Vector3)=>a.every((n,i)=>n===b[i]);
export function faceColors(state: CubeState,face: Face): Face[] { return Array.from({length:9},(_,i)=> { const s=state.find(s=>equal(s.normal,normals[face])&&equal(s.position,coordinates(face,Math.floor(i/3),i%3))); if(!s) throw new Error('Estado incompleto.'); return s.color; }); }
export function isSolved(state: CubeState): boolean { return FACES.every(f=>{const c=faceColors(state,f);return c.every(v=>v===c[4]);}); }
export function isF2LSolved(state: CubeState): boolean { return FACES.every(f=> { const c=faceColors(state,f); return f==='U'||(f==='D'?c:c.slice(3)).every(v=>v===c[4]); }); }
export function isOLLOriented(state: CubeState): boolean { const top=faceColors(state,'U'); return isF2LSolved(state)&&top.every(c=>c===top[4]); }
export function cubeAtStep(setup: string, algorithm: string,step: number): CubeState { const moves=parseAlgorithm(algorithm); if(!Number.isInteger(step)||step<0||step>moves.length) throw new Error('Passo invalido.'); return applyAlgorithm(applyAlgorithm(solvedCube(),setup),moves.slice(0,step).join(' ')); }
export function lastLayerThumbnail(state: CubeState) { return {top:faceColors(state,'U'),front:faceColors(state,'F').slice(0,3),right:faceColors(state,'R').slice(0,3),back:faceColors(state,'B').slice(0,3),left:faceColors(state,'L').slice(0,3)}; }
/** Stable recognition mask, independent of piece permutation; four U viewpoints. */
export function ollSignature(state: CubeState): string { return ['', 'U','U2',"U'"].map(u=>{const s=applyAlgorithm(state,u),up=faceColors(s,'U')[4];return ['U','F','R','B','L'].map(f=>faceColors(s,f as Face).slice(0,f==='U'?9:3).map(c=>c===up?'1':'0').join('')).join('');}).sort()[0]; }
export function canonicalOrientation(algorithm: string): string {
  algorithm=parseAlgorithm(algorithm).join(' '); const state=applyAlgorithm(solvedCube(),algorithm); const queue=[{state, alg:''}];const visited=new Set<string>();
  while(queue.length) {const item=queue.shift()!;const key=FACES.map(f=>faceColors(item.state,f)[4]).join('');if(visited.has(key))continue;visited.add(key);if(key===FACES.join(''))return [algorithm,item.alg].filter(Boolean).join(' ');for(const r of ['x',"x'",'x2','y',"y'",'y2','z',"z'",'z2'])queue.push({state:applyMove(item.state,r),alg:[item.alg,r].filter(Boolean).join(' ')});}
  throw new Error('Centros invalidos.');
}
