import test from 'node:test';
import assert from 'node:assert/strict';
import { KPattern } from 'cubing/kpuzzle';
import { puzzles } from 'cubing/puzzles';
import { oracleStickers, stickerKey } from '../oracle';
import { draftFromCube, validateDraft } from '../../../src/solver/validation';
import { planCFOP } from '../../../src/solver/methods/cfop';
import { METHOD_STAGE_PROFILES, methodStateKey, verifyMethodPlan } from '../../../src/solver/methods/plan';
import { createAnchorModel, buildAnchorPDB } from '../../../src/solver/methods/anchors';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';

const puzzle=await puzzles['3x3x3'].kpuzzle();
const cornerNames='UFR URB UBL ULF DRF DFL DLB DBR'.split(' '),edgeNames='UF UR UB UL DF DR DB DL FR FL BR BL'.split(' ');
const samePiece=(a:string,b:string)=>[...a].sort().join('')===[...b].sort().join('');
function fixed(pattern:KPattern,pieces:readonly string[]){for(const name of pieces){const names=name.length===3?cornerNames:edgeNames,orbit=name.length===3?'CORNERS':'EDGES',index=names.findIndex(n=>samePiece(n,name));assert.ok(index>=0);assert.equal(pattern.patternData[orbit].pieces[index],index,name);assert.equal(pattern.patternData[orbit].orientation[index],0,name);}}
test('CFOP plans real cross, four pairs and LL endpoints from independent arbitrary cubies',async()=>{
  const arbitrary=structuredClone(puzzle.defaultPattern().patternData);
  [arbitrary.CORNERS.pieces[1],arbitrary.CORNERS.pieces[6]]=[6,1];[arbitrary.EDGES.pieces[2],arbitrary.EDGES.pieces[10]]=[10,2];
  arbitrary.CORNERS.orientation[0]=2;arbitrary.CORNERS.orientation[5]=1;arbitrary.EDGES.orientation[1]=1;arbitrary.EDGES.orientation[8]=1;
  const patterns=[puzzle.defaultPattern(),puzzle.defaultPattern().applyAlg("R U R' U' F2 D B' L2 U2 F R2 D' B2 L U'"),new KPattern(puzzle,arbitrary)];
  for(const original of patterns){
    const input=validateDraft(draftFromCube(oracleStickers(original)));assert.equal(input.kind,'valid');if(input.kind!=='valid')continue;
    const plan=await planCFOP(input);assert.ok(verifyMethodPlan(input,plan));assert.equal(plan.stages.length,8);
    let actual=original,step=0;
    for(const [i,stage] of plan.stages.entries()){
      assert.equal(stage.id,METHOD_STAGE_PROFILES.cfop[i].id);assert.equal(stage.startStep,step);
      assert.equal(stickerKey(stage.initialState),stickerKey(oracleStickers(actual)));
      actual=actual.applyAlg(stage.algorithm);step+=stage.tokens.length;assert.equal(stage.endStep,step);
      assert.equal(stickerKey(stage.finalState),stickerKey(oracleStickers(actual)));
      fixed(actual,stage.preservedPieces);
      const solvedPairs=['FR','FL','BR','BL'].slice(0,Math.min(i,4));fixed(actual,['DF','DR','DB','DL',...solvedPairs.flatMap(s=>[s,'D'+s])]);
      if(i>=5)assert.ok(actual.patternData.CORNERS.orientation.every(n=>n===0)&&actual.patternData.EDGES.orientation.every(n=>n===0));
      for(const a of stage.adjustments)assert.equal(plan.tokens.slice(a.startStep,a.endStep).join(' '),a.algorithm);
    }
    assert.equal(stickerKey(oracleStickers(actual)),stickerKey(oracleStickers(puzzle.defaultPattern())));
    assert.equal(methodStateKey(plan.initialState),methodStateKey(input.state));
    const tampered=structuredClone(plan);tampered.stages[0].endStep++;assert.equal(verifyMethodPlan(input,tampered),false);
  }
});
test('anchor PDB transitions solve concrete edge targets and cancellation produces no fabricated plan',async()=>{
  const moves=['U','R','F','D','L','B'].flatMap(f=>[f,f+'2',f+"'"]),model=createAnchorModel('edge',moves);
  const pdb=await buildAnchorPDB(model,['DF','DR']);const initial=applyAlgorithm(solvedCube(),"F R U' D2 B");
  const end=applyAlgorithm(initial,pdb.solution(initial).join(' '));assert.equal(model.locate(end,'DF'),model.goal('DF'));assert.equal(model.locate(end,'DR'),model.goal('DR'));
  const input=validateDraft(draftFromCube(initial));assert.equal(input.kind,'valid');if(input.kind!=='valid')return;
  const controller=new AbortController();controller.abort();await assert.rejects(()=>planCFOP(input,{signal:controller.signal}),/cancelado/);
});
