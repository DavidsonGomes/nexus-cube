/** Independent cubie oracle: Reid notation positions, cubing KPuzzle move tables.
 * No domain move functions, inverse algorithms or catalog used to enumerate fixtures.
 */
import { KPattern } from 'cubing/kpuzzle';
import type { KPuzzle } from 'cubing/kpuzzle';
import type { CubeState, Face, Vector3 } from '../../src/domain/types';
const vectors: Record<string,Vector3>={U:[0,1,0],D:[0,-1,0],R:[1,0,0],L:[-1,0,0],F:[0,0,1],B:[0,0,-1]};
const edgeNames='UF UR UB UL DF DR DB DL FR FL BR BL'.split(' ');
const cornerNames='UFR URB UBL ULF DRF DFL DLB DBR'.split(' ');
const centerNames='U L F R B D'.split(' ');
export function oracleStickers(pattern: KPattern): CubeState {
  return (['EDGES','CORNERS','CENTERS'] as const).flatMap((orbit,o)=>{const names=[edgeNames,cornerNames,centerNames][o];return names.flatMap((slot,i)=>{
    const data=pattern.patternData[orbit],source=names[data.pieces[i]],amount=orbit==='CENTERS'?0:data.orientation[i];const colors=source.slice(amount)+source.slice(0,amount);
    const position=slot.split('').reduce((v,c)=>v.map((n,j)=>n+vectors[c][j]) as unknown as Vector3,[0,0,0] as Vector3);
    return slot.split('').map((face,j)=>({id:`${source}-${colors[j]}`,color:colors[j] as Face,position,normal:vectors[face]}));
  });});
}
export function patternWithLL(kpuzzle: KPuzzle, corners=[0,1,2,3],edges=[0,1,2,3],co=[0,0,0,0],eo=[0,0,0,0]): KPattern {
  const data=structuredClone(kpuzzle.defaultPattern().patternData);for(let i=0;i<4;i++){data.CORNERS.pieces[i]=corners[i];data.EDGES.pieces[i]=edges[i];data.CORNERS.orientation[i]=co[i];data.EDGES.orientation[i]=eo[i];}return new KPattern(kpuzzle,data);
}
export function* orientationFixtures(k: KPuzzle): Generator<KPattern> {for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++)for(let e=0;e<2;e++)for(let f=0;f<2;f++)for(let g=0;g<2;g++)yield patternWithLL(k,undefined,undefined,[a,b,c,(6-a-b-c)%3],[e,f,g,(e+f+g)%2]);}
function permutations(values: number[]): number[][] {if(!values.length)return [[]];return values.flatMap((n,i)=>permutations(values.filter((_,j)=>j!==i)).map(t=>[n,...t]));}
function parity(p: number[]): number {let count=0;for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++)count+=Number(p[i]>p[j]);return count%2;}
export function* permutationFixtures(k: KPuzzle): Generator<KPattern> {const perms=permutations([0,1,2,3]);for(const corners of perms)for(const edges of perms)if(parity(corners)===parity(edges))yield patternWithLL(k,corners,edges);}
export function oracleOriented(p: KPattern): boolean {return ['CORNERS','EDGES'].every(o=>p.patternData[o].orientation.every(n=>n===0))&&['CORNERS','EDGES'].every(o=>p.patternData[o].pieces.slice(4).every((n,i)=>n===i+4));}
export function oracleSolved(p: KPattern): boolean {const stickers=oracleStickers(p);return Object.values(vectors).every(n=>{const face=stickers.filter(s=>s.normal.every((v,i)=>v===n[i]));const center=face.find(s=>s.position.every((v,i)=>v===n[i]))!;return face.every(s=>s.color===center.color);});}
export function stickerKey(state: CubeState): string {return state.map(s=>`${s.position.join(',')}/${s.normal.join(',')}:${s.color}`).sort().join('|');}
