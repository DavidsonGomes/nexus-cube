import { applyAlgorithm, invertAlgorithm, solvedCube } from '../../domain/cube';
import { CROSS_PIECES, arePiecesSolved } from '../../domain/stage-validation';
import { TWO_LOOK_GUIDE } from '../../domain/catalog';
import { COMPILED_CASES } from '../../data/catalog-compiled';
import { LBL_TRAINER_FIXTURES } from './lbl/trainer-fixtures';
import type { CubeState } from '../../domain/types';
import type { ValidatedSolverInput } from '../types';
import { buildAnchorPDB, createAnchorModel } from './anchors';
import type { AnchorPDB } from './anchors';
import { AUF_OPTIONS, createMethodPlanBuilder, METHOD_STAGE_PROFILES, methodCheckpoint, methodGoalSatisfied, methodStateKey, verifyMethodPlan } from './plan';
import { simplifySolverAlgorithm } from './simplify';
import type { MethodPlan, MethodPlannerOptions, MethodStageSpec } from './types';

const turns=['U','R','F','D','L','B'].flatMap(f=>[f,f+'2',f+"'"]);
const ROTATIONS=['','y','y2',"y'"];
const join=(...parts:string[])=>parts.filter(Boolean).join(' ');
const conjugate=(rotation:string,algorithm:string)=>join(rotation,algorithm,invertAlgorithm(rotation));
const CORNERS=['DFR','DFL','DBR','DBL'] as const;
const MIDDLE=['FR','FL','BR','BL'] as const;
const RIGHT_INSERT="U R U' R' U' F' U F";
const LEFT_INSERT="U' L' U L U F U' F'";
const algorithmOf=(id:string):string=>{
  const item=COMPILED_CASES.find(entry=>entry.id===id);
  if(!item)throw new Error(`Caso do guia ausente do catálogo: ${id}`);
  return item.algorithm;
};

let crossPDB:AnchorPDB|undefined;

/** Breadth-first over whole-cube states using a small macro alphabet, deduplicated by state
 * key. Macros are cross-safe by construction; acceptance still verifies everything claimed.
 */
async function searchMacros(start:CubeState,macros:readonly string[],accept:(state:CubeState)=>boolean,depth:number,options:MethodPlannerOptions):Promise<string> {
  let frontier:{state:CubeState;sequence:string}[]=[{state:start,sequence:''}];
  const seen=new Set([methodStateKey(start)]);
  for(let level=0;level<=depth;level++){
    for(const node of frontier)if(accept(node.state))return node.sequence;
    if(level===depth)break;
    await methodCheckpoint(options);
    const next:{state:CubeState;sequence:string}[]=[];
    for(const node of frontier)for(const macro of macros){
      const state=applyAlgorithm(node.state,macro);
      const key=methodStateKey(state);
      if(seen.has(key))continue;
      seen.add(key);
      next.push({state,sequence:join(node.sequence,macro)});
      if(seen.size>60000)throw new Error('Busca LBL excedeu o limite de estados.');
    }
    frontier=next;
  }
  throw new Error('Etapa LBL sem solução no alfabeto de macros.');
}

/** Rounds of (AUF + guide algorithm) with a trailing AUF closure; the substep sets are the
 * exact TWO_LOOK_GUIDE cases already published in the catalog.
 */
async function searchLooks(start:CubeState,algorithms:readonly string[],accept:(state:CubeState)=>boolean,rounds:number,options:MethodPlannerOptions):Promise<string> {
  let frontier:{state:CubeState;sequence:string}[]=[{state:start,sequence:''}];
  for(let round=0;round<=rounds;round++){
    for(const node of frontier)for(const closing of AUF_OPTIONS){
      if(accept(applyAlgorithm(node.state,closing)))return join(node.sequence,closing);
    }
    if(round===rounds)break;
    await methodCheckpoint(options);
    frontier=frontier.flatMap(node=>AUF_OPTIONS.flatMap(u=>algorithms.map(algorithm=>({state:applyAlgorithm(node.state,join(u,algorithm)),sequence:join(node.sequence,u,algorithm)}))));
  }
  throw new Error('Subetapa da última camada sem solução no conjunto do guia.');
}

function upperCornerOrientedAtUFR(state:CubeState):boolean {
  const cell=state.filter(sticker=>String(sticker.position)==='1,1,1');
  const top=cell.find(sticker=>sticker.color==='U'||sticker.color==='D');
  if(!top)throw new Error('Canto sem adesivo vertical na etapa final.');
  return top.normal[1]===1;
}

/** Beginner corner-twist mechanic, verbatim from the approved pedagogy: with the target at
 * the front-right, repeat R' D' R D in pairs until its top sticker faces up, then turn ONLY
 * the upper layer to bring the next corner; the cube recomposes on the last one.
 */
function solveFinalCorners(start:CubeState):string {
  const parts:string[]=[];let state=start;
  for(let guard=0;guard<24;guard++){
    if(AUF_OPTIONS.some(u=>methodGoalSatisfied(applyAlgorithm(state,u),{kind:'solved'}))){
      const closing=AUF_OPTIONS.find(u=>methodGoalSatisfied(applyAlgorithm(state,u),{kind:'solved'}))!;
      return join(...parts,closing);
    }
    if(!upperCornerOrientedAtUFR(state)){
      const twist="R' D' R D R' D' R D";
      parts.push(twist);state=applyAlgorithm(state,twist);continue;
    }
    parts.push('U');state=applyAlgorithm(state,'U');
  }
  throw new Error('A mecânica de cantos não fechou o cubo.');
}

/** Call in the solver worker. The seven stages follow the approved beginner proposal and the
 * stage goals delegate to the same trainer-domain predicates used by the trainer fixtures.
 */
export async function planLBL(input:ValidatedSolverInput,options:MethodPlannerOptions={}):Promise<MethodPlan> {
  const builder=createMethodPlanBuilder('lbl',input,options);
  await methodCheckpoint(options);
  if(!crossPDB)crossPDB=await buildAnchorPDB(createAnchorModel('edge',turns),CROSS_PIECES,options);
  const texts=new Map(LBL_TRAINER_FIXTURES.map(fixture=>[fixture.id,fixture]));
  const stage=(index:number,fixtureId:string):MethodStageSpec=>{
    const text=texts.get(fixtureId);
    if(!text)throw new Error(`Etapa LBL sem texto curado: ${fixtureId}`);
    return {...METHOD_STAGE_PROFILES.lbl[index],title:text.name,explanation:text.objective};
  };
  builder.addStage(stage(0,'lbl/cross'),simplifySolverAlgorithm(crossPDB.solution(builder.state).join(' ')));

  const ejects=ROTATIONS.flatMap(r=>["R U R'","R U' R'","R U2 R'"].map(form=>conjugate(r,form)));
  const cornerMacros=['U',"U'",'U2',...ejects];
  const cornerParts:string[]=[];
  const solvedCorners:string[]=[];
  for(const corner of CORNERS){
    await methodCheckpoint(options);
    const before=applyAlgorithm(builder.state,join(...cornerParts));
    const sequence=await searchMacros(before,cornerMacros,state=>arePiecesSolved(state,[...CROSS_PIECES,...solvedCorners,corner]),4,options);
    cornerParts.push(sequence);solvedCorners.push(corner);
  }
  builder.addStage(stage(1,'lbl/corners'),simplifySolverAlgorithm(join(...cornerParts)));

  const inserts=ROTATIONS.flatMap(r=>[conjugate(r,RIGHT_INSERT),conjugate(r,LEFT_INSERT)]);
  const middleMacros=['U',"U'",'U2',...inserts];
  const middleParts:string[]=[];
  const solvedMiddles:string[]=[];
  const firstLayer=[...CROSS_PIECES,...CORNERS];
  for(const edge of MIDDLE){
    await methodCheckpoint(options);
    const before=applyAlgorithm(builder.state,join(...middleParts));
    const sequence=await searchMacros(before,middleMacros,state=>arePiecesSolved(state,[...firstLayer,...solvedMiddles,edge]),4,options);
    middleParts.push(sequence);solvedMiddles.push(edge);
  }
  builder.addStage(stage(2,'lbl/middle'),simplifySolverAlgorithm(join(...middleParts)));

  const guide={
    edges:TWO_LOOK_GUIDE.OLL[0].ids.map(algorithmOf),
    pllCorners:TWO_LOOK_GUIDE.PLL[0].ids.map(algorithmOf),
    pllEdges:TWO_LOOK_GUIDE.PLL[1].ids.map(algorithmOf),
  };
  builder.addStage(stage(3,'lbl/top-cross'),simplifySolverAlgorithm(await searchLooks(builder.state,guide.edges,state=>methodGoalSatisfied(state,{kind:'ll-edges-oriented'}),2,options)));
  builder.addStage(stage(4,'lbl/top-edges'),simplifySolverAlgorithm(await searchLooks(builder.state,guide.pllEdges,state=>methodGoalSatisfied(state,{kind:'ll-edges-solved'}),2,options)));
  builder.addStage(stage(5,'lbl/top-corners-position'),simplifySolverAlgorithm(await searchLooks(builder.state,guide.pllCorners,state=>methodGoalSatisfied(state,{kind:'ll-corners-placed'})&&arePiecesSolved(state,['UF','UR','UB','UL']),3,options)));
  builder.addStage(stage(6,'lbl/top-corners-orient'),simplifySolverAlgorithm(solveFinalCorners(builder.state)));
  await methodCheckpoint(options);
  const plan=builder.finish();
  if(!verifyMethodPlan(input,plan))throw new Error('Plano Camadas não passou pela verificação final.');
  return plan;
}
