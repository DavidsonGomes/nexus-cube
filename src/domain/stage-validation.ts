import { applyAlgorithm, FACES, faceColors, isF2LSolved, isOLLOriented, isSolved, solvedCube } from './cube';
import type { CubeState, Face, FocusPolicy, LearningContent, ValidationSpec, Vector3 } from './types';
const normals:Record<Face,Vector3>={U:[0,1,0],D:[0,-1,0],F:[0,0,1],B:[0,0,-1],R:[1,0,0],L:[-1,0,0]};
const equal=(a:Vector3,b:Vector3)=>a.every((v,i)=>v===b[i]);
const identity=(s:string)=>s.split('').sort().join('');
export const CROSS_PIECES=['DF','DR','DB','DL'] as const;
export const FIRST_BLOCK_PIECES=['DL','FL','BL','DFL','DBL'] as const;
export const SECOND_BLOCK_PIECES=['DR','FR','BR','DFR','DBR'] as const;
export const U_CORNERS=['UFR','URB','UBL','ULF'] as const;
export const LSE_PIECES=['UF','UR','UB','UL','DF','DB'] as const;
/** Identity derived from solved stickers, independent of current position or pose. */
export function pieceStickerIds(pieces:readonly string[]): string[] {
  const wanted=new Set(pieces.map(identity)),solved=solvedCube();
  return solved.filter(s=>wanted.has(identity(solved.filter(t=>equal(t.position,s.position)).map(t=>t.color).join('')))).map(s=>s.id);
}
/** Works with domain stable IDs and independently constructed color/position fixtures. */
function pieceStickers(state:CubeState,piece:string) {return state.filter(s=>identity(state.filter(t=>equal(t.position,s.position)).map(t=>t.color).join(''))===identity(piece));}
export function arePiecesSolved(state:CubeState,pieces:readonly string[],referenceFrame:'fixed'|'centers'='fixed'):boolean {
  const expected=(color:Face)=>referenceFrame==='fixed'?normals[color]:state.find(s=>s.color===color&&s.position.filter(n=>n!==0).length===1)!.normal;
  return pieces.every(p=>{const stickers=pieceStickers(state,p);return stickers.length===p.length&&stickers.every(s=>equal(s.normal,expected(s.color)));});
}
export function isCrossSolved(state:CubeState):boolean{return arePiecesSolved(state,[...CROSS_PIECES,'D','F','R','B','L']);}
export function isFirstBlockSolved(state:CubeState):boolean{return arePiecesSolved(state,[...FIRST_BLOCK_PIECES,'L']);}
export function isSecondBlockSolved(state:CubeState):boolean{return isFirstBlockSolved(state)&&arePiecesSolved(state,[...SECOND_BLOCK_PIECES,'R']);}
export function isCMLLSolved(state:CubeState):boolean{return isSecondBlockSolved(state)&&arePiecesSolved(state,U_CORNERS);}
/** Beginner EO convention: normalize the M slice first (U/D centers on y).
 * M2 may remain at EO/LR; the final solved goal also requires correct centers.
 */
export function isLSEOriented(state:CubeState):boolean {
  if(!isCMLLSolved(state))return false;
  const up=state.find(s=>s.color==='U'&&s.position.filter(n=>n!==0).length===1)!;
  if(Math.abs(up.normal[1])!==1)return false;
  return LSE_PIECES.every(p=>{const s=pieceStickers(state,p).find(s=>s.color==='U'||s.color==='D');return !!s&&Math.abs(s.normal[1])===1;});
}
export function validateStage(state:CubeState,spec:ValidationSpec):boolean {
  if(spec.preserve&&!arePiecesSolved(state,spec.preserve,spec.referenceFrame??'fixed'))return false;
  switch(spec.goal){
    case 'cross':return isCrossSolved(state);
    case 'f2l-pair':return isCrossSolved(state)&&arePiecesSolved(state,[spec.targetSlot??'FR','D'+(spec.targetSlot??'FR')]);
    case 'f2l':return isF2LSolved(state);
    case 'oll':return isOLLOriented(state);
    case 'pll':case 'solved':return isSolved(state);
    case 'first-block':return isFirstBlockSolved(state);
    case 'second-block':return isSecondBlockSolved(state);
    case 'cmll':return isCMLLSolved(state);
    case 'lse-eo':return isLSEOriented(state);
    case 'lse-lr':return isLSEOriented(state)&&arePiecesSolved(state,['UL','UR']);
  }
}
export function getContentFocus(item:Pick<LearningContent,'focus'>,caseState:CubeState):{stickerIds:string[];referenceStickerIds:string[];kind:FocusPolicy['kind']} {
  const {focus}=item;
  const stickerIds=focus.kind==='full'?caseState.map(s=>s.id):focus.kind==='oll-orientation'?caseState.filter(s=>s.color===faceColors(caseState,'U')[4]).map(s=>s.id):focus.kind==='last-layer'?caseState.filter(s=>s.position[1]===1).map(s=>s.id):pieceStickerIds(focus.pieces??[]);
  return {stickerIds,referenceStickerIds:pieceStickerIds(focus.referencePieces??[]),kind:focus.kind};
}
/** Read target-pair recognition, ignoring irrelevant upper-layer pieces. */
export function f2lSignature(state:CubeState,slot='FR'):string {
 return ['', 'U','U2',"U'"].map(u=>{const s=applyAlgorithm(state,u);return [slot,'D'+slot].map(p=>pieceStickers(s,p).map(t=>`${t.color}:${t.position}:${t.normal}`).sort().join('|')).join('/');}).sort()[0];
}
