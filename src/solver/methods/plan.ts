import { applyAlgorithm, faceColors, parseAlgorithm, solvedCube } from '../../domain/cube';
import { arePiecesSolved, CROSS_PIECES, FIRST_BLOCK_PIECES, SECOND_BLOCK_PIECES, U_CORNERS, isCMLLSolved, validateStage } from '../../domain/stage-validation';
import type { CubeState } from '../../domain/types';
import { revalidateSolverInput } from '../solution';
import type { ValidatedSolverInput } from '../types';
import { SOLVER_FACES, SOLVER_FRAME } from '../validation';
import type { MethodAdjustment, MethodGoal, MethodPlan, MethodPlannerOptions, MethodStage, MethodStageSpec, SolverMethod } from './types';

export const METHOD_MAX_MOVES=2048;
export const AUF_OPTIONS=['','U',"U'",'U2'] as const;
const f2l=[...CROSS_PIECES,'FR','DFR','FL','DFL','BR','DBR','BL','DBL'];
const blocks=[...FIRST_BLOCK_PIECES,...SECOND_BLOCK_PIECES];
type StageProfile=Pick<MethodStageSpec,'id'|'goal'|'preservedPieces'|'centerPolicy'>;
export const METHOD_STAGE_PROFILES:Readonly<Record<SolverMethod,readonly StageProfile[]>>={
  cfop:[
    {id:'cfop.cross',goal:{kind:'cross'},preservedPieces:[]},
    ...(['FR','FL','BR','BL'] as const).map((slot,i)=>({id:`cfop.f2l.${slot}` as const,goal:{kind:'f2l-pair' as const,slot},preservedPieces:f2l.slice(0,4+2*i)})),
    {id:'cfop.oll',goal:{kind:'oll'},preservedPieces:f2l},
    {id:'cfop.pll',goal:{kind:'pll-up-to-auf'},preservedPieces:f2l},
    {id:'cfop.auf',goal:{kind:'solved'},preservedPieces:f2l},
  ],
  roux:[
    {id:'roux.fb',goal:{kind:'first-block'},preservedPieces:[]},
    {id:'roux.sb',goal:{kind:'second-block'},preservedPieces:FIRST_BLOCK_PIECES},
    {id:'roux.cmll',goal:{kind:'cmll-up-to-auf'},preservedPieces:blocks},
    {id:'roux.cmll-auf',goal:{kind:'cmll'},preservedPieces:blocks},
    {id:'roux.eo',goal:{kind:'lse-eo'},preservedPieces:[...blocks,...U_CORNERS],centerPolicy:'m-slice-even'},
    {id:'roux.lr',goal:{kind:'lse-lr'},preservedPieces:[...blocks,...U_CORNERS],centerPolicy:'m-slice-even'},
    {id:'roux.finish',goal:{kind:'solved'},preservedPieces:[...blocks,...U_CORNERS,'UL','UR']},
  ],
};
for(const profiles of Object.values(METHOD_STAGE_PROFILES)){for(const p of profiles){Object.freeze(p.goal);if(p.preservedPieces)Object.freeze(p.preservedPieces);Object.freeze(p);}Object.freeze(profiles);}Object.freeze(METHOD_STAGE_PROFILES);
export function methodTokens(algorithm:string):string[]{
  if(typeof algorithm!=='string'||algorithm.length>METHOD_MAX_MOVES*4)throw new Error('Plano excessivo.');
  const tokens=parseAlgorithm(algorithm);
  if(tokens.length>METHOD_MAX_MOVES||tokens.some(t=>! /^[URFDLBMESxyzurfdlb](2|')?$/.test(t)))throw new Error('Movimento de método inválido.');
  return tokens;
}
export function fixedSolved(state:CubeState):boolean{return state.length===54&&SOLVER_FACES.every(f=>faceColors(state,f).every(c=>c===f));}
export function methodGoalSatisfied(state:CubeState,goal:MethodGoal):boolean {
  if(goal.kind==='solved')return fixedSolved(state);
  if(goal.kind==='pll-up-to-auf')return AUF_OPTIONS.some(u=>fixedSolved(applyAlgorithm(state,u)));
  if(goal.kind==='cmll-up-to-auf')return AUF_OPTIONS.some(u=>isCMLLSolved(applyAlgorithm(state,u)));
  if(goal.kind==='f2l-pair')return validateStage(state,{goal:'f2l-pair',targetSlot:goal.slot,referenceFrame:'fixed'});
  return validateStage(state,{goal:goal.kind,referenceFrame:'fixed'});
}
export function methodStateKey(state:CubeState):string{return state.map(s=>`${s.id}:${s.color}:${s.position.join(',')}:${s.normal.join(',')}`).sort().join('|');}
function stateShape(state:CubeState):boolean {
  return Array.isArray(state)&&state.length===54&&new Set(state.map(s=>s?.id)).size===54&&state.every(s=>s&&typeof s.id==='string'&&/^[URFDLB][0-8]$/.test(s.id)&&s.color===s.id[0]&&[s.position,s.normal].every(v=>Array.isArray(v)&&v.length===3&&v.every(n=>n===-1||n===0||n===1)));
}
function pieceKey(state:CubeState,piece:string):string {
  const identity=piece.split('').sort().join('');
  const matches=state.filter(s=>state.filter(t=>t.position.every((n,i)=>n===s.position[i])).map(t=>t.color).sort().join('')===identity);
  if(matches.length!==piece.length)throw new Error('Identidade de peça inválida no plano.');
  return matches.map(s=>`${s.color}:${s.position.join(',')}:${s.normal.join(',')}`).sort().join('|');
}
function centersAllowed(state:CubeState,policy:MethodStage['centerPolicy']):boolean {
  if(policy==='free')return true;
  const key=(s:CubeState)=>SOLVER_FACES.map(f=>faceColors(s,f)[4]).join('');
  return key(state)===key(solvedCube())||(policy==='m-slice-even'&&key(state)===key(applyAlgorithm(solvedCube(),'M2')));
}
export async function methodCheckpoint(options:MethodPlannerOptions={}):Promise<void>{
  if(options.signal?.aborted)throw new Error('Planejamento cancelado.');
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  if(options.signal?.aborted)throw new Error('Planejamento cancelado.');
}
export function createMethodPlanBuilder(method:SolverMethod,input:ValidatedSolverInput,options:MethodPlannerOptions={}) {
  const validated=revalidateSolverInput(input),stages:MethodStage[]=[],tokens:string[]=[];let current=validated.state;
  function addStage(spec:MethodStageSpec,algorithm:string):MethodStage {
    if(options.signal?.aborted)throw new Error('Planejamento cancelado.');
    const profile=METHOD_STAGE_PROFILES[method][stages.length];
    if(!profile||profile.id!==spec.id||JSON.stringify(profile.goal)!==JSON.stringify(spec.goal))throw new Error('Etapa ou objetivo fora da ordem do método.');
    if((spec.centerPolicy??'fixed')!==(profile.centerPolicy??'fixed'))throw new Error('Política de centros incorreta.');
    if((profile.preservedPieces??[]).some(p=>!(spec.preservedPieces??[]).includes(p)))throw new Error('Preservações obrigatórias ausentes.');
    const moves=methodTokens(algorithm),before=current,after=applyAlgorithm(before,moves.join(' '));
    if(!methodGoalSatisfied(after,spec.goal))throw new Error(`Objetivo não atingido: ${spec.id}`);
    if(!centersAllowed(after,spec.centerPolicy??'fixed'))throw new Error(`Centros fora da referência: ${spec.id}`);
    for(const piece of spec.preservedPieces??[])if(pieceKey(before,piece)!==pieceKey(after,piece))throw new Error(`Peça não preservada: ${piece}`);
    const startStep=tokens.length;
    const adjustments=(spec.adjustments??[]).map(a=>{
      if(!Number.isInteger(a.startStep)||!Number.isInteger(a.endStep)||a.startStep<0||a.endStep<a.startStep||a.endStep>moves.length||methodTokens(a.algorithm).join(' ')!==moves.slice(a.startStep,a.endStep).join(' '))throw new Error('Ajuste não corresponde à sequência.');
      return {...a,startStep:a.startStep+startStep,endStep:a.endStep+startStep};
    });
    const stage:MethodStage={id:spec.id,title:spec.title,explanation:spec.explanation,goal:spec.goal,referenceFrame:SOLVER_FRAME,centerPolicy:spec.centerPolicy??'fixed',preservedPieces:[...(spec.preservedPieces??[])],initialState:before,finalState:after,algorithm:moves.join(' '),tokens:moves,startStep,endStep:startStep+moves.length,adjustments,...(spec.matchedCaseId?{matchedCaseId:spec.matchedCaseId}:{})};
    tokens.push(...moves);if(tokens.length>METHOD_MAX_MOVES)throw new Error('Plano excessivo.');stages.push(stage);current=after;
    try{options.onStage?.(structuredClone(stage));}catch{/* Observer cannot mutate the plan or abort a valid calculation. */}
    return stage;
  }
  return {get state(){return current;},addStage,finish():MethodPlan{
    if(stages.length!==METHOD_STAGE_PROFILES[method].length)throw new Error('Plano de método incompleto.');
    if(!fixedSolved(current))throw new Error('Plano não termina nos 54 adesivos resolvidos.');
    return {version:1,method,inputKey:validated.inputKey,referenceFrame:SOLVER_FRAME,initialState:validated.state,finalState:current,algorithm:tokens.join(' '),tokens:[...tokens],stages:[...stages]};
  }};
}
/** Recompute every endpoint from the original input; never trust stage state/proof flags. */
export function verifyMethodPlan(input:ValidatedSolverInput,plan:MethodPlan):boolean {
  try{
    const validated=revalidateSolverInput(input);
    if(!plan||!['cfop','roux'].includes(plan.method)||!Array.isArray(plan.stages)||plan.stages.length!==METHOD_STAGE_PROFILES[plan.method].length||!Array.isArray(plan.tokens)||plan.tokens.length>METHOD_MAX_MOVES||typeof plan.algorithm!=='string'||plan.algorithm.length>METHOD_MAX_MOVES*4||!stateShape(plan.initialState)||!stateShape(plan.finalState))return false;
    if(plan.version!==1||!['cfop','roux'].includes(plan.method)||plan.inputKey!==validated.inputKey||plan.referenceFrame!==SOLVER_FRAME||methodStateKey(plan.initialState)!==methodStateKey(validated.state))return false;
    const builder=createMethodPlanBuilder(plan.method,validated);
    for(const stage of plan.stages){
      if(!stage||!stateShape(stage.initialState)||!stateShape(stage.finalState)||!Array.isArray(stage.tokens)||stage.tokens.length>METHOD_MAX_MOVES||!Array.isArray(stage.preservedPieces)||stage.preservedPieces.length>26||stage.preservedPieces.some((p:unknown)=>typeof p!=='string'||! /^[URFDLB]{1,3}$/.test(p))||!Array.isArray(stage.adjustments)||stage.adjustments.length>METHOD_MAX_MOVES)return false;
      const reconstructed=builder.addStage({...stage,adjustments:stage.adjustments.map((a:MethodAdjustment)=>({...a,startStep:a.startStep-stage.startStep,endStep:a.endStep-stage.startStep}))},stage.algorithm);
      if(stage.referenceFrame!==SOLVER_FRAME||stage.startStep!==reconstructed.startStep||stage.endStep!==reconstructed.endStep||stage.tokens.join(' ')!==reconstructed.tokens.join(' ')||methodStateKey(stage.initialState)!==methodStateKey(reconstructed.initialState)||methodStateKey(stage.finalState)!==methodStateKey(reconstructed.finalState))return false;
    }
    const result=builder.finish();
    return result.algorithm===plan.algorithm&&result.tokens.join(' ')===plan.tokens.join(' ')&&methodStateKey(result.finalState)===methodStateKey(plan.finalState);
  }catch{return false;}
}
export { arePiecesSolved };
