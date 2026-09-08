import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAlgorithm, faceColors, solvedCube } from '../../src/domain/cube';
import { draftFromCube, validateDraft } from '../../src/solver';
import { planCFOP } from '../../src/solver/methods/cfop/index';

const faces=['U','R','F','D','L','B'] as const;
const vector=(state:ReturnType<typeof solvedCube>)=>faces.flatMap(face=>faceColors(state,face));
const solved=()=>faces.flatMap(face=>Array(9).fill(face));
const same=(a:readonly number[],b:readonly number[])=>a.every((v,i)=>v===b[i]);
function targetPosition(piece:string):readonly number[]{const ref=solvedCube(),set=new Set(piece.split(''));return ref.find(s=>set.has(s.id[0])&&ref.filter(t=>same(t.position,s.position)).length===set.size&&ref.filter(t=>same(t.position,s.position)).every(t=>set.has(t.id[0])))!.position;}
function pieceSolvedAt(state:ReturnType<typeof solvedCube>,piece:string):boolean{const ref=solvedCube(),pos=targetPosition(piece),set=new Set(piece.split('')),at=state.filter(s=>same(s.position,pos)),normals=new Map(ref.filter(s=>same(s.position,pos)).map(s=>[s.color,s.normal.join(',')]));return at.length===set.size&&new Set(at.map(s=>s.color)).size===set.size&&at.every(s=>set.has(s.color)&&s.normal.join(',')===normals.get(s.color));}
const cross=['DF','DR','DB','DL'] as const;
const pairPieces=(slot:string)=>[slot,'D'+slot];
const top=['UF','UR','UB','UL','UFR','URB','UBL','ULF'] as const;

test('CFOP plan recomputes every endpoint from one mixed original input', async () => {
  const source=applyAlgorithm(solvedCube(), 'R U F2 L D B2');
  const validated=validateDraft(draftFromCube(source));
  assert.equal(validated.kind,'valid');
  if(validated.kind!=='valid')return;
  const plan=await planCFOP(validated);
  assert.deepEqual(plan.stages.map(stage=>stage.id),['cfop.cross','cfop.f2l.FR','cfop.f2l.FL','cfop.f2l.BR','cfop.f2l.BL','cfop.oll','cfop.pll','cfop.auf']);
  let state=source;
  assert.deepEqual(vector(plan.initialState),vector(source));
  for(const stage of plan.stages){
    assert.deepEqual(vector(stage.initialState),vector(state),stage.id);
    state=applyAlgorithm(state,stage.algorithm);
    assert.deepEqual(vector(stage.finalState),vector(state),stage.id);
    assert.equal(stage.endStep-stage.startStep,stage.tokens.length,stage.id);
    if(stage.id==='cfop.cross'){
      assert.ok(cross.every(piece=>pieceSolvedAt(stage.finalState,piece)), 'cross identities and side colors');
    }
    if(stage.id.startsWith('cfop.f2l.')){
      const slot=stage.id.slice('cfop.f2l.'.length); assert.ok(pairPieces(slot).every(piece=>pieceSolvedAt(stage.finalState,piece)),stage.id);
      const prior=['FR','FL','BR','BL'].slice(0,['FR','FL','BR','BL'].indexOf(slot));
      assert.ok(prior.flatMap(pairPieces).every(piece=>pieceSolvedAt(stage.finalState,piece)),`${stage.id} preserves prior pairs`);
    }
    if(stage.id==='cfop.pll'){
      assert.ok(['','U',"U'",'U2'].some(auf=>top.every(piece=>pieceSolvedAt(applyAlgorithm(stage.finalState,auf),piece))), 'PLL up-to-AUF endpoint');
    }
  }
  const d=faceColors(plan.stages[0].finalState,'D');
  assert.deepEqual([d[1],d[3],d[5],d[7]],['D','D','D','D']);
  const u=faceColors(plan.stages[5].finalState,'U');
  assert.ok(u.every(color=>color==='U'),'OLL endpoint independently has U-oriented stickers');
  assert.deepEqual(vector(plan.finalState),solved());
});
