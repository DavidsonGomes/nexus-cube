import { moveInfo, rotateVector, solvedCube } from '../../domain/cube';
import type { CubeState, Vector3 } from '../../domain/types';
import { methodCheckpoint } from './plan';
import type { MethodPlannerOptions } from './types';

export interface AnchorModel {
  kind:'edge'|'corner';moves:readonly string[];transitions:readonly Uint8Array[];
  locate(state:CubeState,piece:string):number;
  goal(piece:string):number;
}
const key=(p:Vector3,n:Vector3)=>p.join(',')+'/'+n.join(',');
const solved=solvedCube();
function anchorId(piece:string):string {
  const colors=[...piece].sort().join('');
  const sticker=solved.find(s=>s.color===piece[0]&&solved.filter(t=>t.position.every((n,i)=>n===s.position[i])).map(t=>t.color).sort().join('')===colors);
  if(!sticker)throw new Error('Peça âncora desconhecida.');return sticker.id;
}
/** A legal cubie's anchor sticker uniquely identifies its 24 position/orientation states. */
export function createAnchorModel(kind:'edge'|'corner',moves:readonly string[]):AnchorModel {
  const dimension=kind==='edge'?2:3,states=solved.filter(s=>s.position.filter(n=>n!==0).length===dimension),indices=new Map(states.map((s,i)=>[key(s.position,s.normal),i]));
  if(states.length!==24)throw new Error('Órbita de âncoras inválida.');
  const transitions=moves.map(token=>{const m=moveInfo(token);return Uint8Array.from(states,s=>{
    const moved=m.layers.includes(s.position[m.axis]);
    const position=moved?rotateVector(s.position,m.axis,m.quarterTurns):s.position,normal=moved?rotateVector(s.normal,m.axis,m.quarterTurns):s.normal;
    return indices.get(key(position,normal))!;
  });});
  const locate=(state:CubeState,piece:string)=>{
    if(piece.length!==dimension)throw new Error('Peça fora da órbita.');
    const sticker=state.find(s=>s.id===anchorId(piece));if(!sticker)throw new Error('Âncora ausente.');
    const index=indices.get(key(sticker.position,sticker.normal));if(index===undefined)throw new Error('Pose de âncora inválida.');return index;
  };
  return {kind,moves:[...moves],transitions,locate,goal:piece=>locate(solved,piece)};
}
export interface AnchorPDB {model:AnchorModel;pieces:readonly string[];distances:Int16Array;encode(state:CubeState):number;transition(code:number,move:number):number;solution(state:CubeState):string[]}
/** Complete abstraction BFS (up to four anchors), no fallback to a general solution. */
export async function buildAnchorPDB(model:AnchorModel,pieces:readonly string[],options:MethodPlannerOptions={}):Promise<AnchorPDB>{
  if(pieces.length<1||pieces.length>4||new Set(pieces).size!==pieces.length)throw new Error('PDB exige uma a quatro peças distintas.');
  const size=24**pieces.length,distances=new Int16Array(size).fill(-1),queue=new Uint32Array(size);
  const pack=(values:readonly number[])=>values.reduce((n,v)=>n*24+v,0);
  const encode=(state:CubeState)=>pack(pieces.map(p=>model.locate(state,p)));
  const transition=(code:number,move:number)=>{
    let result=0,factor=1;
    for(let i=0;i<pieces.length;i++){const digit=code%24;code=Math.floor(code/24);result+=model.transitions[move][digit]*factor;factor*=24;}
    return result;
  };
  const goal=pack(pieces.map(p=>model.goal(p)));queue[0]=goal;distances[goal]=0;let head=0,tail=1;
  while(head<tail){
    if(head%2048===0)await methodCheckpoint(options);
    const code=queue[head++],nextDistance=distances[code]+1;
    for(let move=0;move<model.moves.length;move++){const next=transition(code,move);if(distances[next]>=0)continue;distances[next]=nextDistance;queue[tail++]=next;}
  }
  return {model,pieces:[...pieces],distances,encode,transition,solution(state){
    let code=encode(state);if(distances[code]<0)throw new Error('Estado fora da abstração alcançável.');const result:string[]=[];
    while(distances[code]>0){const move=model.moves.findIndex((_,i)=>distances[transition(code,i)]===distances[code]-1);if(move<0)throw new Error('Alfabeto da busca não é reversível.');result.push(model.moves[move]);code=transition(code,move);}
    return result;
  }};
}
