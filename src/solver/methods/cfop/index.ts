import { applyAlgorithm, canonicalOrientation, invertAlgorithm, solvedCube } from '../../../domain/cube';
import { CATALOG } from '../../../domain/catalog';
import { arePiecesSolved, CROSS_PIECES, pieceStickerIds } from '../../../domain/stage-validation';
import type { CubeState } from '../../../domain/types';
import type { ValidatedSolverInput } from '../../types';
import { buildAnchorPDB, createAnchorModel } from '../anchors';
import type { AnchorPDB } from '../anchors';
import { AUF_OPTIONS, createMethodPlanBuilder, METHOD_STAGE_PROFILES, methodCheckpoint, methodGoalSatisfied, methodTokens, verifyMethodPlan } from '../plan';
import type { F2LSlot, MethodAdjustment, MethodPlan, MethodPlannerOptions, MethodStageSpec } from '../types';

const turns=['U','R','F','D','L','B'].flatMap(f=>[f,f+'2',f+"'"]);
const rotations=['','y','y2',"y'"];
const slots=['FR','FL','BR','BL'] as const;
const f2lPieces=[...CROSS_PIECES,...slots.flatMap(s=>[s,'D'+s])];
const join=(...parts:string[])=>parts.filter(Boolean).join(' ');
const conjugate=(rotation:string,algorithm:string)=>join(rotation,algorithm,invertAlgorithm(rotation));
const preserves=(state:CubeState,pieces:readonly string[])=>arePiecesSolved(state,pieces,'fixed');
function pairKey(state:CubeState,slot:F2LSlot):string {
  const ids=new Set(pieceStickerIds([slot,'D'+slot]));
  return state.filter(s=>ids.has(s.id)).map(s=>`${s.id}:${s.position.join(',')}:${s.normal.join(',')}`).sort().join('|');
}
function adjustments(algorithm:string,leadingAUF=''):MethodAdjustment[]{
  const tokens=methodTokens(algorithm),result:MethodAdjustment[]=[];
  if(leadingAUF)result.push({kind:'auf',algorithm:leadingAUF,startStep:0,endStep:methodTokens(leadingAUF).length,explanation:'Ajuste a camada U para posicionar o caso reconhecido.'});
  tokens.forEach((token,i)=>{if(/^[xyz]/.test(token))result.push({kind:'rotation',algorithm:token,startStep:i,endStep:i+1,explanation:'Reoriente o cubo conforme a rotação mostrada; as cores continuam ligadas ao referencial original.'});});
  return result;
}
let crossPDB:AnchorPDB|undefined;
interface PairCandidate {algorithm:string;caseId:string;auf:string}
let pairIndex:Map<F2LSlot,Map<string,PairCandidate[]>>|undefined;
async function buildPairIndex(options:MethodPlannerOptions){
  if(pairIndex)return pairIndex;
  const index=new Map(slots.map(s=>[s,new Map<string,PairCandidate[]>()]));let count=0;
  for(const item of CATALOG.filter(c=>c.family==='F2L'))for(const rotation of rotations)for(const auf of AUF_OPTIONS){
    if(++count%24===0)await methodCheckpoint(options);
    const algorithm=join(auf,conjugate(rotation,canonicalOrientation(item.algorithm))),setup=applyAlgorithm(solvedCube(),invertAlgorithm(algorithm));
    for(const slot of slots){
      const others=f2lPieces.filter(p=>p!==slot&&p!=='D'+slot);
      if(!preserves(setup,others)||methodGoalSatisfied(setup,{kind:'f2l-pair',slot}))continue;
      const key=pairKey(setup,slot),entries=index.get(slot)!.get(key)??[];
      entries.push({algorithm,caseId:item.id,auf});index.get(slot)!.set(key,entries);
    }
  }
  pairIndex=index;return index;
}
async function solvePair(state:CubeState,slot:F2LSlot,preserved:readonly string[],options:MethodPlannerOptions):Promise<{algorithm:string;caseId?:string;adjustments:MethodAdjustment[]}>{
  if(methodGoalSatisfied(state,{kind:'f2l-pair',slot}))return {algorithm:'',adjustments:[]};
  const index=(await buildPairIndex(options)).get(slot)!;
  // Eject buried target pieces from unsolved slots; never disturb an already completed pair.
  const eject=rotations.flatMap(r=>AUF_OPTIONS.filter(Boolean).map(u=>conjugate(r,join('R',u,"R'"))));
  const queue=[{state,algorithm:''}],seen=new Set([pairKey(state,slot)]);let cursor=0;
  while(cursor<queue.length){
    if(cursor%8===0)await methodCheckpoint(options);
    const current=queue[cursor++];
    for(const candidate of index.get(pairKey(current.state,slot))??[]){
      const after=applyAlgorithm(current.state,candidate.algorithm);
      if(!methodGoalSatisfied(after,{kind:'f2l-pair',slot})||!preserves(after,preserved))continue;
      const algorithm=join(current.algorithm,candidate.algorithm),offset=methodTokens(current.algorithm).length;
      return {algorithm,caseId:candidate.caseId,adjustments:[...adjustments(current.algorithm),...adjustments(candidate.algorithm,candidate.auf).map(a=>({...a,startStep:a.startStep+offset,endStep:a.endStep+offset}))]};
    }
    for(const algorithm of eject){
      const after=applyAlgorithm(current.state,algorithm);if(!preserves(after,preserved))continue;
      const key=pairKey(after,slot);if(seen.has(key))continue;seen.add(key);
      queue.push({state:after,algorithm:join(current.algorithm,algorithm)});
    }
  }
  throw new Error(`Não foi possível construir o par ${slot} preservando as etapas anteriores.`);
}
async function solveLL(state:CubeState,family:'OLL'|'PLL',options:MethodPlannerOptions):Promise<{algorithm:string;caseId?:string;adjustments:MethodAdjustment[]}>{
  const goal={kind:family==='OLL'?'oll':'pll-up-to-auf'} as const;
  if(methodGoalSatisfied(state,goal))return {algorithm:'',adjustments:[]};
  let tried=0;
  for(const item of CATALOG.filter(c=>c.family===family))for(const rotation of rotations)for(const auf of AUF_OPTIONS){
    if(++tried%16===0)await methodCheckpoint(options);
    const algorithm=join(auf,conjugate(rotation,canonicalOrientation(item.algorithm))),after=applyAlgorithm(state,algorithm);
    if(!preserves(after,f2lPieces)||!methodGoalSatisfied(after,goal))continue;
    return {algorithm,caseId:item.id,adjustments:adjustments(algorithm,auf)};
  }
  throw new Error(`Nenhum caso ${family} corresponde ao estado e referencial informados.`);
}
export async function planCFOP(input:ValidatedSolverInput,options:MethodPlannerOptions={}):Promise<MethodPlan>{
  const builder=createMethodPlanBuilder('cfop',input,options);
  await methodCheckpoint(options);
  if(!crossPDB)crossPDB=await buildAnchorPDB(createAnchorModel('edge',turns),CROSS_PIECES,options);
  const stage=(index:number,title:string,explanation:string):MethodStageSpec=>({...METHOD_STAGE_PROFILES.cfop[index],title,explanation});
  builder.addStage(stage(0,'Cruz na face D','Posicione as quatro arestas brancas, alinhadas aos centros laterais.'),crossPDB.solution(builder.state).join(' '));
  for(const [i,slot] of slots.entries()){
    const spec=stage(i+1,`Par F2L ${slot}`,`Conecte o canto D${slot} à aresta ${slot}, preservando a cruz e os pares anteriores.`);
    const result=await solvePair(builder.state,slot,spec.preservedPieces??[],options);
    builder.addStage({...spec,adjustments:result.adjustments,...(result.caseId?{matchedCaseId:result.caseId}:{})},result.algorithm);
  }
  const oll=await solveLL(builder.state,'OLL',options);
  builder.addStage({...stage(5,'Orientação da última camada','Oriente todos os adesivos amarelos para U, preservando as duas primeiras camadas.'),adjustments:oll.adjustments,...(oll.caseId?{matchedCaseId:oll.caseId}:{})},oll.algorithm);
  const pll=await solveLL(builder.state,'PLL',options);
  builder.addStage({...stage(6,'Permutação da última camada','Posicione as peças da última camada. O alinhamento U final é mostrado na etapa seguinte.'),adjustments:pll.adjustments,...(pll.caseId?{matchedCaseId:pll.caseId}:{})},pll.algorithm);
  const auf=AUF_OPTIONS.find(u=>methodGoalSatisfied(applyAlgorithm(builder.state,u),{kind:'solved'}));
  if(auf===undefined)throw new Error('Alinhamento final não encontrado.');
  builder.addStage({...stage(7,'Alinhamento final U','Alinhe a camada U aos centros para concluir as 54 cores.'),adjustments:auf?[{kind:'auf',algorithm:auf,startStep:0,endStep:1,explanation:'Alinhamento final da camada U.'}]:[]},auf);
  const plan=builder.finish();if(!verifyMethodPlan(input,plan))throw new Error('Plano CFOP não passou pela verificação final.');return plan;
}
