import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { KPattern } from 'cubing/kpuzzle';
import type { Face } from '../../../src/domain/types';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import { SOLVER_WIZARD_STEPS, getWizardStep, getWizardTransition, getWizardPreview, getWizardFace, wizardSlotToCanonical, canonicalSlotToWizard, createEmptyDraft } from '../../../src/solver';
import { oracleStickers, stickerKey } from '../oracle';

const kp=await puzzles['3x3x3'].kpuzzle();
const positions:Face[]=['U','F','R','B','L','D'];
const algorithms:Record<Face,string>={U:"x'",F:'',R:'y',B:'y2',L:"y'",D:"y' x"};
const neighbors:Record<Face,Face[]>={U:['B','R','F','L'],F:['U','R','D','L'],R:['U','B','D','F'],B:['U','L','D','R'],L:['U','F','D','B'],D:['L','F','R','B']};
const dot=(a:readonly number[],b:readonly number[])=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const cross=(a:readonly number[],b:readonly number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
test('six front-facing proper poses have independently fixed neighbors and determinant +1',()=>{
  assert.deepEqual(SOLVER_WIZARD_STEPS.map(s=>s.face),positions);
  for(const face of positions){const step=getWizardStep(face),expected=oracleStickers(kp.defaultPattern().applyAlg(algorithms[face]));
    assert.equal(step.pose.algorithm,algorithms[face]);assert.deepEqual(Object.values(step.neighbors),neighbors[face]);
    const centers=expected.filter(s=>s.position.filter(n=>n!==0).length===1);
    const at=(v:number[])=>centers.find(s=>dot(s.normal,v)===1)!.color;
    assert.equal(at([0,0,1]),face);
    assert.deepEqual([at([0,1,0]),at([1,0,0]),at([0,-1,0]),at([-1,0,0])],Object.values(step.neighbors));
    assert.equal(dot(cross(step.pose.xAxis,step.pose.yAxis),step.pose.zAxis),1);
    assert.equal(stickerKey(getWizardPreview(createEmptyDraft(),face).state),stickerKey(expected));
  }
});
test('all 54 local positions map bijectively without mirror, including the rotated D grid',()=>{
  const visited=new Set<string>(),draft=createEmptyDraft(),before=JSON.stringify(draft);
  for(const face of positions){const step=getWizardStep(face);
    assert.deepEqual(step.slots.map(s=>s.index),face==='D'?[6,3,0,7,4,1,8,5,2]:[0,1,2,3,4,5,6,7,8]);
    const preview=getWizardPreview(draft,face);
    for(let index=0;index<9;index++){
      const canonical=wizardSlotToCanonical(face,index);visited.add(canonical.face+canonical.index);
      assert.deepEqual(canonicalSlotToWizard(canonical),{face,index});
      const sticker=preview.state.find(s=>s.id===canonical.face+canonical.index)!;
      assert.deepEqual(sticker.normal,[0,0,1]);assert.deepEqual(sticker.position,[index%3-1,1-Math.floor(index/3),1]);
      if(index!==4){const painted={...draft,[canonical.face]:draft[canonical.face].map((value,i)=>i===canonical.index?'B' as const:value)};
        assert.equal(getWizardFace(painted,face)[index],'B');
        for(const other of positions)if(other!==face)assert.deepEqual(getWizardFace(painted,other),getWizardFace(draft,other));
      }
    }
    assert.deepEqual(step.slots[4],{face,index:4});
  }
  assert.equal(visited.size,54);assert.equal(JSON.stringify(draft),before);
  assert.throws(()=>wizardSlotToCanonical('U',9));assert.throws(()=>wizardSlotToCanonical('D',-1));
});
test('every forward/back/edit/review transition reaches the exact external pose and is quarter-turn minimal',()=>{
  const views:(Face|null)[]=[null,...positions];
  const key=(p:KPattern)=>p.patternData.CENTERS.pieces.join(',');
  const pattern=(face:Face|null)=>kp.defaultPattern().applyAlg(face===null?'':algorithms[face]);
  for(const from of views){
    // Independent orientation graph uses KPuzzle's center permutations, not domain geometry.
    const distances=new Map([[key(pattern(from)),0]]),queue=[pattern(from)];
    for(let i=0;i<queue.length;i++)for(const rotation of ['x',"x'",'y',"y'",'z',"z'"]){const next=queue[i].applyAlg(rotation);if(!distances.has(key(next))){distances.set(key(next),distances.get(key(queue[i]))!+1);queue.push(next);}}
    assert.equal(distances.size,24);
    for(const to of views){const t=getWizardTransition(from,to),after=pattern(from).applyAlg(t.algorithm);
      assert.equal(stickerKey(oracleStickers(after)),stickerKey(oracleStickers(pattern(to))));
      assert.equal(stickerKey(oracleStickers(after.applyAlg(t.inverseAlgorithm))),stickerKey(oracleStickers(pattern(from))));
      assert.equal(t.tokens.length,distances.get(key(pattern(to))));
      assert.ok(t.tokens.every(token=>/^[xyz]'?$/.test(token)));assert.ok(t.moves.every(m=>m.layers.length===3&&Math.abs(m.quarterTurns)===1));
      const current=applyAlgorithm(solvedCube(),from===null?'':algorithms[from]);
      assert.equal(stickerKey(applyAlgorithm(current,t.algorithm)),stickerKey(oracleStickers(pattern(to))));
    }
  }
  assert.deepEqual(positions.slice(0,-1).map((f,i)=>getWizardTransition(f,positions[i+1]).algorithm),['x','y','y','y','x']);
});
