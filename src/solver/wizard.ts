import { applyAlgorithm, invertAlgorithm, moveInfo, parseAlgorithm, solvedCube } from '../domain/cube';
import type { Face, MoveInfo, Vector3 } from '../domain/types';
import type { DraftFacelets, SolverIndex, SolverSlot } from './types';
import { getDraftPreview } from './validation';

export interface WizardPose {
  /** Whole-cube rotation from the fixed solver frame, never a layer turn. */
  readonly algorithm:string;
  readonly inverseAlgorithm:string;
  /** Images of the original +X/+Y/+Z axes in presentation coordinates. */
  readonly xAxis:Vector3;
  readonly yAxis:Vector3;
  readonly zAxis:Vector3;
}
export interface WizardStep {
  readonly index:number;
  readonly face:Face;
  readonly pose:WizardPose;
  readonly neighbors:Readonly<{top:Face;right:Face;bottom:Face;left:Face}>;
  /** Local front grid, row-major as viewed from outside, to canonical URFDLB slots. */
  readonly slots:readonly SolverSlot[];
}
export interface WizardTransition {
  /** null means the fixed solver frame (yellow up, green front). */
  readonly from:Face|null;
  readonly to:Face|null;
  readonly algorithm:string;
  readonly inverseAlgorithm:string;
  readonly tokens:readonly string[];
  readonly moves:readonly MoveInfo[];
}
const base=solvedCube();
const same=(a:readonly number[],b:readonly number[])=>a.every((n,i)=>n===b[i]);
const center=(state:ReturnType<typeof solvedCube>,normal:readonly number[])=>state.find(s=>s.id.endsWith('4')&&same(s.normal,normal))!.color;
const vector=(value:Vector3):Vector3=>Object.freeze([...value]) as Vector3;
const slot=(id:string):SolverSlot=>Object.freeze({face:id[0] as Face,index:Number(id[1]) as SolverIndex});

function makeStep(face:Face,algorithm:string,index:number):WizardStep {
  const state=applyAlgorithm(base,algorithm);
  const axis=(id:string)=>vector(state.find(s=>s.id===id)!.normal);
  const slots=Array.from({length:9},(_,i)=>slot(state.find(s=>same(s.normal,[0,0,1])&&same(s.position,[i%3-1,1-Math.floor(i/3),1]))!.id));
  return Object.freeze({index,face,pose:Object.freeze({algorithm,inverseAlgorithm:invertAlgorithm(algorithm),xAxis:axis('R4'),yAxis:axis('U4'),zAxis:axis('F4')}),
    neighbors:Object.freeze({top:center(state,[0,1,0]),right:center(state,[1,0,0]),bottom:center(state,[0,-1,0]),left:center(state,[-1,0,0])}),slots:Object.freeze(slots)});
}
/** First yellow faces the viewer. Every forward step then needs one quarter rotation. */
export const SOLVER_WIZARD_STEPS:readonly WizardStep[]=Object.freeze([
  makeStep('U',"x'",0),makeStep('F','',1),makeStep('R','y',2),
  makeStep('B','y2',3),makeStep('L',"y'",4),makeStep('D',"y' x",5),
]);
export function getWizardStep(face:Face):WizardStep {
  const step=SOLVER_WIZARD_STEPS.find(step=>step.face===face);
  if(!step)throw new Error('Face inválida no preenchimento guiado.');
  return step;
}
function indexValid(index:number):asserts index is SolverIndex {
  if(!Number.isInteger(index)||index<0||index>8)throw new Error('Posição inválida no preenchimento guiado.');
}
export function wizardSlotToCanonical(face:Face,index:number):SolverSlot {
  indexValid(index);return getWizardStep(face).slots[index];
}
export function canonicalSlotToWizard(input:SolverSlot):SolverSlot {
  indexValid(input.index);const step=getWizardStep(input.face);
  const index=step.slots.findIndex(s=>s.face===input.face&&s.index===input.index);
  if(index<0)throw new Error('Posição sem correspondência no preenchimento guiado.');
  return Object.freeze({face:step.face,index:index as SolverIndex});
}
export function getWizardFace(draft:DraftFacelets,face:Face):readonly (Face|null)[] {
  return Object.freeze(getWizardStep(face).slots.map(s=>draft[s.face][s.index]));
}
/** Only preview geometry rotates. Canonical draft slots and their palette IDs are retained. */
export function getWizardPreview(draft:DraftFacelets,face:Face):ReturnType<typeof getDraftPreview> {
  const preview=getDraftPreview(draft);
  return {state:applyAlgorithm(preview.state,getWizardStep(face).pose.algorithm),palette:preview.palette};
}
const rotationTokens=['x',"x'",'y',"y'",'z',"z'"] as const;
const orientationKey=(state:ReturnType<typeof solvedCube>)=>['R4','U4','F4'].map(id=>state.find(s=>s.id===id)!.normal.join(',')).join('/');
/** Shortest quarter-turn path among the 24 proper orientations. Stable tie order x,x',y,y',z,z'. */
export function getWizardTransition(from:Face|null,to:Face|null):WizardTransition {
  const initial=applyAlgorithm(base,from===null?'':getWizardStep(from).pose.algorithm);
  const target=orientationKey(applyAlgorithm(base,to===null?'':getWizardStep(to).pose.algorithm));
  const queue=[{state:initial,tokens:[] as string[]}],seen=new Set([orientationKey(initial)]);
  for(let cursor=0;cursor<queue.length;cursor++){
    const current=queue[cursor];
    if(orientationKey(current.state)===target){
      const algorithm=current.tokens.join(' '),tokens=Object.freeze(parseAlgorithm(algorithm));
      const moves=Object.freeze(tokens.map(token=>{const info=moveInfo(token);return Object.freeze({...info,layers:Object.freeze([...info.layers])});}));
      return Object.freeze({from,to,algorithm,inverseAlgorithm:invertAlgorithm(algorithm),tokens,moves});
    }
    for(const token of rotationTokens){const state=applyAlgorithm(current.state,token),key=orientationKey(state);
      if(!seen.has(key)){seen.add(key);queue.push({state,tokens:[...current.tokens,token]});}}
  }
  throw new Error('Não foi possível orientar o cubo inteiro.');
}
