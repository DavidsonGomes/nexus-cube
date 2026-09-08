import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { FACE_COLORS, FACE_COLOR_LABELS, applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import type { Face } from '../../../src/domain/types';
import { createSolverClient, createSolvedDraft, draftFromCube, getDraftPreview, SOLVER_FRAME, solveValidatedInput, validateDraft } from '../../../src/solver';
import { createMethodPlanBuilder, METHOD_STAGE_PROFILES, verifyMethodPlan } from '../../../src/solver/methods/plan';
import type { SolverWorkerPort, SolverWorkerResponse } from '../../../src/solver';
import { oracleStickers, stickerKey } from '../oracle';

// External physical scheme from the cubing 0.63.4 SVG, reoriented by z2.
// Deliberately literal expectations: never derive expected colors from FACE_COLORS.
const physical:Record<Face,string>={U:'Y',R:'O',F:'G',D:'W',L:'R',B:'B'};
const colorFace:Record<string,Face>={Y:'U',O:'R',G:'F',W:'D',R:'L',B:'B'};
test('physical centers and eight ordered corner triples match the source scheme, not its reflection',()=>{
  assert.deepEqual(FACE_COLORS,{U:'#ffd54a',R:'#fb923c',F:'#22c55e',D:'#ffffff',L:'#ef4444',B:'#3b82f6'});
  assert.deepEqual(FACE_COLOR_LABELS,{U:'Amarelo',R:'Laranja',F:'Verde',D:'Branco',L:'Vermelho',B:'Azul'});
  assert.ok(Object.isFrozen(FACE_COLORS));assert.ok(Object.isFrozen(FACE_COLOR_LABELS));
  const corners:[string,string][]=[['UFR','YGO'],['URB','YOB'],['UBL','YBR'],['ULF','YRG'],['DRF','WOG'],['DFL','WGR'],['DLB','WRB'],['DBR','WBO']];
  const state=solvedCube(),centers=Object.fromEntries(state.filter(s=>s.id.endsWith('4')).map(s=>[s.id[0],s.normal]));
  const hexToPhysical:Record<string,string>={'#ffd54a':'Y','#fb923c':'O','#22c55e':'G','#ffffff':'W','#ef4444':'R','#3b82f6':'B'};
  for(const [name,expected] of corners){
    const position=[0,1,2].map(axis=>[...name].reduce((sum,f)=>sum+centers[f][axis],0));
    const actual=[...name].map(f=>state.find(s=>s.position.every((n,i)=>n===position[i])&&s.normal.every((n,i)=>n===centers[f][i]))!);
    assert.equal(actual.map(s=>hexToPhysical[FACE_COLORS[s.color]]).join(''),expected,name);
  }
  // One face turn is still clockwise viewed from outside; no geometry reflection accompanies recoloring.
  const f=applyAlgorithm(state,'F');
  assert.deepEqual(f.find(s=>s.id==='F0')!.position,[1,1,1]);
  assert.deepEqual(f.find(s=>s.id==='F2')!.position,[1,-1,1]);
  assert.deepEqual(f.map(s=>s.id),state.map(s=>s.id));
});

test('asymmetric physical input is mapped by its actual center colors and solved from its original state',async()=>{
  const kp=await puzzles['3x3x3'].kpuzzle(),original=kp.defaultPattern().applyAlg("L F2 R' U B D2 L' U2 F R2");
  const source=oracleStickers(original);
  // The raw physical face grids are generated with the independent KPuzzle geometry oracle.
  const grid=(face:Face,row:number,col:number):number[]=>{
    const a=col-1,b=1-row;
    switch(face){case'U':return[a,1,-b];case'R':return[1,b,-a];case'F':return[a,b,1];case'D':return[a,-1,b];case'L':return[-1,b,a];case'B':return[-a,b,-1];}
  };
  const normals:Record<Face,number[]>={U:[0,1,0],R:[1,0,0],F:[0,0,1],D:[0,-1,0],L:[-1,0,0],B:[0,0,-1]};
  const faces:Face[]=['U','R','F','D','L','B'];
  const physicalGrid=Object.fromEntries(faces.map(face=>[face,Array.from({length:9},(_,i)=>{
    const p=grid(face,Math.floor(i/3),i%3);return physical[source.find(s=>s.normal.every((n,j)=>n===normals[face][j])&&s.position.every((n,j)=>n===p[j]))!.color];
  })]));
  const draft=Object.fromEntries(faces.map(f=>[f,physicalGrid[f].map(c=>colorFace[c])]));
  const input=validateDraft(draft);assert.equal(input.kind,'valid');if(input.kind!=='valid')return;
  assert.equal(stickerKey(input.state),stickerKey(source));
  assert.equal(input.inputKey,'URFDLB-fixed-v2:'+faces.map(f=>physicalGrid[f].map(c=>colorFace[c]).join('')).join(''));
  const before=JSON.stringify(draft),result=await solveValidatedInput(input);
  assert.equal(stickerKey(oracleStickers(original.applyAlg(result.algorithm))),stickerKey(oracleStickers(kp.defaultPattern())));
  assert.equal(stickerKey(result.initialState),stickerKey(source));assert.equal(JSON.stringify(draft),before);
  const preview=getDraftPreview(input.facelets);assert.equal(preview.palette.R4,'#fb923c');assert.equal(preview.palette.L4,'#ef4444');
});

test('old scheme keys never dispatch, old plans fail, and late old-key responses cannot install a solution',async()=>{
  const input=validateDraft(draftFromCube(applyAlgorithm(solvedCube(),'R')));assert.equal(input.kind,'valid');if(input.kind!=='valid')return;
  const oldKey=input.inputKey.replace('URFDLB-fixed-v2','URFDLB-fixed-v1');
  let dispatches=0;
  const worker:SolverWorkerPort={onmessage:null,onerror:null,onmessageerror:null,postMessage(){dispatches++;},terminate(){}};
  const client=createSolverClient({workerFactory:()=>worker});
  const invalid=await client.solve({requestId:'old',validated:{...input,inputKey:oldKey}});
  assert.equal(invalid.kind,'error');if(invalid.kind==='error')assert.equal(invalid.code,'input-key-mismatch');assert.equal(dispatches,0);
  const pending=client.solve({requestId:'same',validated:input});
  const respond=(key:string)=>worker.onmessage?.({data:{protocol:1,kind:'solution',method:'direct',requestId:'same',inputKey:key,algorithm:"R'",tokens:[],initialState:[]} as SolverWorkerResponse} as MessageEvent<SolverWorkerResponse>);
  let finished=false;void pending.then(()=>{finished=true;});respond(oldKey);await Promise.resolve();assert.equal(finished,false);
  respond(input.inputKey);assert.equal((await pending).kind,'solution');client.dispose();
  const solved=validateDraft(createSolvedDraft());assert.equal(solved.kind,'valid');if(solved.kind!=='valid')return;
  const builder=createMethodPlanBuilder('cfop',solved);for(const spec of METHOD_STAGE_PROFILES.cfop)builder.addStage({...spec,title:spec.id,explanation:'Satisfied.'},'');
  const plan=builder.finish();assert.equal(plan.referenceFrame,SOLVER_FRAME);
  const old=JSON.parse(JSON.stringify(plan));old.referenceFrame='URFDLB-fixed-v1';assert.equal(verifyMethodPlan(solved,old),false);
  old.referenceFrame=SOLVER_FRAME;old.stages[0].referenceFrame='URFDLB-fixed-v1';assert.equal(verifyMethodPlan(solved,old),false);
});
