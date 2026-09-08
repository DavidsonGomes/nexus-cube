import { FACE_COLORS, faceColors, solvedCube } from '../domain/cube';
import type { CubeState, Face, Sticker } from '../domain/types';
import type { DraftFacelets, SolverIndex, SolverIssue, SolverIssueCode, SolverSlot, SolverValidation } from './types';

export const SOLVER_FRAME = 'URFDLB-fixed-v1' as const;
export const SOLVER_FACES: readonly Face[] = Object.freeze(['U','R','F','D','L','B'] as Face[]);
export const SOLVER_FACE_ORIENTATION: Readonly<Record<Face,{top:Face;right:Face}>> = Object.freeze({
  U:{top:'B',right:'R'},R:{top:'U',right:'B'},F:{top:'U',right:'R'},D:{top:'F',right:'R'},L:{top:'U',right:'F'},B:{top:'U',right:'L'},
});
export const SOLVER_ISSUE_MESSAGES: Readonly<Record<SolverIssueCode,string>> = Object.freeze({
  'invalid-shape':'Não foi possível ler as seis faces. Revise as grades 3 × 3 e tente novamente.',
  'invalid-color':'Uma cor não foi reconhecida. Escolha uma das seis cores da paleta.',
  incomplete:'Ainda há posições sem cor. Preencha as casas vazias antes de resolver.',
  'color-count':'Cada cor precisa aparecer 9 vezes, incluindo o centro. Confira a contagem e revise o preenchimento.',
  'center-mismatch':'Os centros não correspondem à referência do editor. Confira amarelo em cima, verde à frente e vermelho à direita.',
  'invalid-piece':'As cores ou sua ordem não formam uma peça deste cubo. Compare o preenchimento com o cubo físico.',
  'duplicate-piece':'Uma combinação de cores aparece em mais de uma peça. Confira as peças e revise o preenchimento.',
  'corner-twist':'A orientação dos cantos não corresponde a um estado possível por giros. Confira as três cores de cada canto e a orientação das faces.',
  'edge-flip':'A orientação das arestas não corresponde a um estado possível por giros. Confira as duas cores de cada aresta e a orientação das faces.',
  'permutation-parity':'A combinação de posições das peças não pode ser obtida apenas com giros. Confira as seis faces e as cores de cada peça.',
});
// Reid ordered face triples, including handedness. Rotations are cyclic, never reflections.
const cornerNames = 'UFR URB UBL ULF DRF DFL DLB DBR'.split(' ');
const edgeNames = 'UF UR UB UL DF DR DB DL FR FL BR BL'.split(' ');
const normals:Record<Face,readonly number[]>={U:[0,1,0],D:[0,-1,0],R:[1,0,0],L:[-1,0,0],F:[0,0,1],B:[0,0,-1]};
const geometry=solvedCube();
const same=(a:readonly number[],b:readonly number[])=>a.every((v,i)=>v===b[i]);
const slotOf=(sticker:Sticker):SolverSlot=>({face:sticker.id[0] as Face,index:Number(sticker.id[1]) as SolverIndex});
function pieceSlots(name:string):SolverSlot[] {
  const position=[0,0,0];
  for(const f of name) normals[f as Face].forEach((v,i)=>position[i]+=v);
  return [...name].map(f=>slotOf(geometry.find(s=>same(s.position,position)&&same(s.normal,normals[f as Face]))!));
}
function issue(code:SolverIssueCode,scope:SolverIssue['scope']='cube',slots:SolverSlot[]=[]):SolverIssue {
  return {code,scope,slots,message:SOLVER_ISSUE_MESSAGES[code]};
}
function validShape(input:unknown):input is DraftFacelets {
  if(!input||typeof input!=='object'||Array.isArray(input))return false;
  const record=input as Record<string,unknown>;
  return Object.keys(record).length===6&&SOLVER_FACES.every(f=>Object.hasOwn(record,f)&&Array.isArray(record[f])&&record[f].length===9&&Array.from({length:9},(_,i)=>Object.hasOwn(record[f] as object,i)).every(Boolean));
}
export function createSolverDraft():DraftFacelets {
  return Object.fromEntries(SOLVER_FACES.map(f=>[f,Array.from({length:9},(_,i)=>i===4?f:null)])) as unknown as DraftFacelets;
}
export const createEmptyDraft=createSolverDraft;
export function createSolvedDraft():DraftFacelets { return draftFromCube(solvedCube()); }
export function draftFromCube(state:CubeState):DraftFacelets {
  return Object.fromEntries(SOLVER_FACES.map(f=>[f,faceColors(state,f)])) as unknown as DraftFacelets;
}
/** Preview identities are slots, not an assertion of physically valid pieces. */
export function getDraftPreview(draft:DraftFacelets):{state:CubeState;palette:Readonly<Record<string,string>>} {
  const palette:Record<string,string>={};
  for(const s of geometry){const color=draft?.[s.color]?.[Number(s.id[1])];palette[s.id]=SOLVER_FACES.includes(color as Face)?FACE_COLORS[color as Face]:'#737373';}
  return {state:solvedCube(),palette};
}
const parity=(pieces:number[])=>pieces.reduce((total,p,i)=>total+pieces.slice(i+1).filter(q=>q<p).length,0)%2;
export function validateDraft(input:unknown):SolverValidation {
  if(!validShape(input))return {kind:'invalid',issues:[issue('invalid-shape')]};
  const draft=input;
  const invalid:SolverSlot[]=[],missing:SolverSlot[]=[],centers:SolverSlot[]=[];
  const counts:Record<Face,number>={U:0,R:0,F:0,D:0,L:0,B:0};
  for(const face of SOLVER_FACES)for(let i=0;i<9;i++){
    const color=input[face][i],slot={face,index:i as SolverIndex};
    if(color===null)missing.push(slot);
    else if(!SOLVER_FACES.includes(color))invalid.push(slot);
    else counts[color]++;
    if(i===4&&color!==face)centers.push(slot);
  }
  if(invalid.length)return {kind:'invalid',issues:[issue('invalid-color','slot',invalid)]};
  if(centers.length)return {kind:'invalid',issues:[issue('center-mismatch','slot',centers)]};
  if(missing.length)return {kind:'incomplete',issues:[issue('incomplete','slot',missing)]};
  if(SOLVER_FACES.some(f=>counts[f]!==9))return {kind:'invalid',issues:[{...issue('color-count'),counts,expected:9}]};
  const issues:SolverIssue[]=[],identities=new Map<string,string>();
  function extract(names:string[]) {
    const pieces:number[]=[],orientation:number[]=[],seen=new Map<number,SolverSlot[]>();
    for(const name of names){
      const slots=pieceSlots(name),colors=slots.map(s=>draft[s.face][s.index]).join('');
      let found=-1,amount=-1;
      for(let p=0;p<names.length;p++)for(let o=0;o<name.length;o++)if(names[p].slice(o)+names[p].slice(0,o)===colors){found=p;amount=o;}
      if(found<0){issues.push(issue('invalid-piece','piece',slots));continue;}
      const previous=seen.get(found);
      if(previous)issues.push(issue('duplicate-piece','piece',[...previous,...slots]));
      else seen.set(found,slots);
      pieces.push(found);orientation.push(amount);
      const sources=pieceSlots(names[found]);
      slots.forEach((slot,j)=>{const source=sources[(j+amount)%sources.length];identities.set(slot.face+slot.index,source.face+source.index);});
    }
    return {pieces,orientation};
  }
  const corners=extract(cornerNames),edges=extract(edgeNames);
  if(issues.length)return {kind:'invalid',issues};
  if(corners.orientation.reduce((a,b)=>a+b,0)%3)issues.push(issue('corner-twist'));
  if(edges.orientation.reduce((a,b)=>a+b,0)%2)issues.push(issue('edge-flip'));
  if(parity(corners.pieces)!==parity(edges.pieces))issues.push(issue('permutation-parity'));
  if(issues.length)return {kind:'invalid',issues};
  const facelets=Object.freeze(Object.fromEntries(SOLVER_FACES.map(f=>[f,Object.freeze([...input[f]])]))) as DraftFacelets;
  const state=Object.freeze(geometry.map(s=>Object.freeze({...s,id:identities.get(s.id)??s.id,color:facelets[s.color][Number(s.id[1])] as Face,position:Object.freeze([...s.position]) as Sticker['position'],normal:Object.freeze([...s.normal]) as Sticker['normal']})));
  return Object.freeze({kind:'valid',inputKey:SOLVER_FRAME+':'+SOLVER_FACES.map(f=>facelets[f].join('')).join(''),facelets,state,cubies:Object.freeze({corners:Object.freeze({pieces:Object.freeze(corners.pieces),orientation:Object.freeze(corners.orientation)}),edges:Object.freeze({pieces:Object.freeze(edges.pieces),orientation:Object.freeze(edges.orientation)})})});
}
