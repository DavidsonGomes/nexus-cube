import type { CubeState, Face, Vector3 } from './types';

export type PLLSlot = 'UBL'|'UB'|'UBR'|'UL'|'UR'|'UFL'|'UF'|'UFR';
export type PLLPieceKind = 'corner'|'edge';
/** Coordinates are cell centers in an SVG viewBox="0 0 3 3". */
export interface PLLEndpoint { index:number; slot:PLLSlot; x:number; y:number }
export interface PLLPieceMapping { piece:string; kind:PLLPieceKind; from:PLLEndpoint; to:PLLEndpoint }
export interface PLLCycle { id:string; kind:PLLPieceKind; positions:readonly PLLEndpoint[]; pieces:readonly string[] }
export interface PLLArrow { cycleId:string; kind:PLLPieceKind; from:PLLEndpoint; to:PLLEndpoint; bidirectional:boolean; pieces:readonly string[] }
export interface PLLFrame { up:Face; front:Face; right:Face }
export type PLLPermutation =
 | {status:'ready';frame:PLLFrame;mappings:readonly PLLPieceMapping[];fixed:readonly PLLPieceMapping[];cycles:readonly PLLCycle[];arrows:readonly PLLArrow[]}
 | {status:'not-pll';frame:PLLFrame;reason:string;mappings:readonly [];fixed:readonly [];cycles:readonly [];arrows:readonly []};
const normals:Record<Face,Vector3>={U:[0,1,0],D:[0,-1,0],R:[1,0,0],L:[-1,0,0],F:[0,0,1],B:[0,0,-1]};
const dot=(a:Vector3,b:Vector3)=>a.reduce((n,v,i)=>n+v*b[i],0);
const equal=(a:Vector3,b:Vector3)=>a.every((v,i)=>v===b[i]);
const slotNames:Record<number,PLLSlot>={0:'UBL',1:'UB',2:'UBR',3:'UL',5:'UR',6:'UFL',7:'UF',8:'UFR'};
/** Actual piece motion to the solved destination relative to displayed centers.
 * No AUF or recognition-class normalization. A two-cycle is drawn once with two heads.
 * up/front are geometric faces, not sticker colors; camera motion is not a cube move.
 */
export function getPLLPermutation(state:CubeState,options:{up?:Face;front?:Face}={}):PLLPermutation {
 const up=options.up??'U',front=options.front??'F',u=normals[up],f=normals[front];
 if(!u||!f||dot(u,f)!==0)throw new Error('Faces superior e frontal devem ser adjacentes.');
 const r:Vector3=[u[1]*f[2]-u[2]*f[1],u[2]*f[0]-u[0]*f[2],u[0]*f[1]-u[1]*f[0]];
 const right=(Object.keys(normals) as Face[]).find(face=>equal(normals[face],r))!;
 const frame:PLLFrame={up,front,right};
 const invalid=(reason:string):PLLPermutation=>({status:'not-pll',frame,reason,mappings:[],fixed:[],cycles:[],arrows:[]});
 if(state.length!==54)return invalid('O estado deve conter 54 adesivos.');
 const centers=state.filter(s=>s.position.filter(n=>n!==0).length===1);
 if(centers.length!==6||new Set(centers.map(s=>s.color)).size!==6)return invalid('Centros incompletos ou repetidos.');
 const centerByColor=new Map(centers.map(s=>[s.color,s.normal]));
 const upColor=centers.find(s=>equal(s.normal,u))?.color;
 if(!upColor)return invalid('Centro superior ausente.');
 const groups=new Map<string,CubeState>();
 for(const sticker of state){const key=sticker.position.join(',');groups.set(key,[...(groups.get(key)??[]),sticker]);}
 for(const sticker of state){
  if(dot(sticker.position,u)!==1&&!equal(sticker.normal,centerByColor.get(sticker.color)!))return invalid('As duas primeiras camadas devem estar resolvidas no referencial exibido.');
  if(equal(sticker.normal,u)&&sticker.color!==upColor)return invalid('A face superior deve estar orientada antes de mostrar a permutação.');
 }
 const endpoint=(position:Vector3):PLLEndpoint|undefined=>{
  if(dot(position,u)!==1)return undefined;
  const col=dot(position,r)+1,row=dot(position,f)+1,index=row*3+col,slot=slotNames[index];
  return slot?{index,slot,x:col+0.5,y:row+0.5}:undefined;
 };
 const mappings:PLLPieceMapping[]=[];
 for(const stickers of groups.values()){
  if(stickers.length<2||dot(stickers[0].position,u)!==1)continue;
  if(stickers.length>3||!stickers.some(s=>s.color===upColor))return invalid('Peça superior inválida.');
  const destination=stickers.reduce((v,s)=>v.map((n,i)=>n+centerByColor.get(s.color)![i]) as unknown as Vector3,[0,0,0] as Vector3);
  const from=endpoint(stickers[0].position),to=endpoint(destination);
  if(!from||!to||stickers.length!==(from.index%2===0?3:2))return invalid('Destino fora da camada superior.');
  mappings.push({piece:stickers.map(s=>s.color).sort().join(''),kind:stickers.length===3?'corner':'edge',from,to});
 }
 mappings.sort((a,b)=>a.from.index-b.from.index);
 if(mappings.length!==8||new Set(mappings.map(m=>m.to.index)).size!==8)return invalid('A permutação deve ter oito destinos distintos.');
 const byOrigin=new Map(mappings.map(m=>[m.from.index,m])),visited=new Set<number>();
 const fixed=mappings.filter(m=>m.from.index===m.to.index),cycles:PLLCycle[]=[],arrows:PLLArrow[]=[];
 for(const start of mappings){
  if(visited.has(start.from.index)||start.from.index===start.to.index)continue;
  const members:PLLPieceMapping[]=[];let current=start;
  do{if(visited.has(current.from.index)||current.kind!==start.kind)return invalid('Ciclo de permutação inválido.');visited.add(current.from.index);members.push(current);current=byOrigin.get(current.to.index)!;}while(current!==start);
  const id=`${start.kind}-${members.map(m=>m.from.index).join('-')}`;
  cycles.push({id,kind:start.kind,positions:members.map(m=>m.from),pieces:members.map(m=>m.piece)});
  if(members.length===2){arrows.push({cycleId:id,kind:start.kind,from:members[0].from,to:members[0].to,bidirectional:true,pieces:members.map(m=>m.piece)});}
  else for(const m of members)arrows.push({cycleId:id,kind:m.kind,from:m.from,to:m.to,bidirectional:false,pieces:[m.piece]});
 }
 return {status:'ready',frame,mappings,fixed,cycles,arrows};
}
