import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAlgorithm, faceColors, solvedCube } from '../../src/domain/cube';
import type { CubeState } from '../../src/domain/types';
import { draftFromCube, validateDraft } from '../../src/solver';
import { planRoux } from '../../src/solver/methods/roux/index';
import { ROUX_BLOCKS, ROUX_CORNERS } from '../../src/solver/methods/roux/goals';

const FACES = ['U','R','F','D','L','B'] as const;
const vector = (state:ReturnType<typeof solvedCube>) => FACES.flatMap(face => faceColors(state, face));
const samePos = (a:readonly number[],b:readonly number[]) => a.every((v,i)=>v===b[i]);
function targetPosition(piece:string):readonly number[] {
  const solved=solvedCube(), faces=new Set(piece.split(''));
  return solved.find(sticker => faces.has(sticker.id[0]) && solved.filter(other=>samePos(other.position,sticker.position)).length===faces.size && solved.filter(other=>samePos(other.position,sticker.position)).every(other=>faces.has(other.id[0])))!.position;
}
function pieceSolvedAt(state:CubeState,piece:string):boolean {
  const solved=solvedCube(), position=targetPosition(piece), expected=new Set(piece.split(''));
  const stickers=state.filter(sticker=>samePos(sticker.position,position));
  const expectedNormals=new Map(solved.filter(sticker=>samePos(sticker.position,position)).map(sticker=>[sticker.color,sticker.normal.join(',')]));
  return stickers.length===expected.size && new Set(stickers.map(sticker=>sticker.color)).size===expected.size && stickers.every(sticker=>expected.has(sticker.color)&&sticker.normal.join(',')===expectedNormals.get(sticker.color));
}
function topCornersSolved(state:CubeState):boolean { return ['UFR','URB','UBL','ULF'].every(piece=>pieceSolvedAt(state,piece)); }
function centersM2Allowed(state:CubeState):boolean {
  const solved=solvedCube(), centers=state.filter(sticker=>sticker.id[1]==='4').map(sticker=>sticker.color).join('');
  const fixed=solved.filter(sticker=>sticker.id[1]==='4').map(sticker=>sticker.color).join('');
  const m2=faceColors(applyAlgorithm(solvedCube(),'M2'),'U').length ? applyAlgorithm(solvedCube(),'M2').filter(sticker=>sticker.id[1]==='4').map(sticker=>sticker.color).join('') : '';
  return centers===fixed||centers===m2;
}

test('Roux planner prefixes are independently recomputed from the original input', async () => {
  const source = applyAlgorithm(solvedCube(), 'R U');
  const validated = validateDraft(draftFromCube(source));
  assert.equal(validated.kind, 'valid');
  if (validated.kind !== 'valid') return;
  const plan = await planRoux(validated);
  assert.deepEqual(vector(plan.initialState), vector(source));
  assert.deepEqual(plan.stages.map(stage => stage.id), ['roux.fb','roux.sb','roux.cmll','roux.cmll-auf','roux.eo','roux.lr','roux.finish']);
  let prefix = source;
  for (const stage of plan.stages) {
    assert.equal(stage.startStep < stage.endStep || stage.algorithm === '', true, stage.id);
    assert.deepEqual(vector(stage.initialState), vector(prefix), stage.id);
    prefix = applyAlgorithm(prefix, stage.algorithm);
    assert.deepEqual(vector(stage.finalState), vector(prefix), stage.id);
    assert.equal(stage.endStep - stage.startStep, stage.tokens.length, stage.id);
    if (stage.id === 'roux.eo' || stage.id === 'roux.lr') assert.equal(stage.centerPolicy, 'm-slice-even', stage.id);
    if (stage.id === 'roux.finish') assert.equal(stage.centerPolicy, 'fixed', stage.id);
    if (stage.id === 'roux.sb') assert.ok(['DL','FL','BL','DFL','DBL','L'].every(piece => stage.preservedPieces.includes(piece)), stage.id);
    if (stage.id === 'roux.cmll' || stage.id === 'roux.cmll-auf') assert.ok(['DL','FL','BL','DFL','DBL','L','DR','FR','BR','DFR','DBR','R'].every(piece => stage.preservedPieces.includes(piece)), stage.id);
    if (stage.id === 'roux.fb') assert.ok(['DL','FL','BL','DFL','DBL'].every(piece => pieceSolvedAt(stage.finalState,piece)), stage.id);
    if (stage.id === 'roux.sb') assert.ok(['DL','FL','BL','DFL','DBL','DR','FR','BR','DFR','DBR'].every(piece => pieceSolvedAt(stage.finalState,piece)), stage.id);
    if (stage.id === 'roux.cmll') assert.ok(['DL','FL','BL','DFL','DBL','DR','FR','BR','DFR','DBR'].every(piece => pieceSolvedAt(stage.finalState,piece)), stage.id);
    if (stage.id === 'roux.cmll-auf') assert.equal(topCornersSolved(stage.finalState), true, stage.id);
    if (stage.id === 'roux.eo' || stage.id === 'roux.lr') assert.equal(centersM2Allowed(stage.finalState), true, stage.id);
  }
  assert.deepEqual(vector(plan.finalState), vector(prefix));
  assert.deepEqual(vector(plan.finalState), FACES.flatMap(face => Array(9).fill(face)));
  assert.ok(ROUX_BLOCKS.length > 0 && ROUX_CORNERS.length > ROUX_BLOCKS.length);
});

test('Roux planner cancellation is observed before search starts', async () => {
  const validated = validateDraft(draftFromCube(solvedCube()));
  assert.equal(validated.kind, 'valid');
  if (validated.kind !== 'valid') return;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => planRoux(validated, { signal: controller.signal }), /Planejamento cancelado|cancelado/i);
});
