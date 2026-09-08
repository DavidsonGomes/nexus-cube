import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { KPattern } from 'cubing/kpuzzle';
import { oracleStickers, stickerKey } from '../oracle';
import { createSolvedDraft, draftFromCube, solveValidatedInput, solverStateAtStep, solverTokens, validateDraft, verifySolverSolution } from '../../../src/solver';

test('installed local solver solves independently constructed original inputs, including nontrivial orientations',async()=>{
  const puzzle=await puzzles['3x3x3'].kpuzzle();
  const arbitrary=structuredClone(puzzle.defaultPattern().patternData);
  [arbitrary.CORNERS.pieces[0],arbitrary.CORNERS.pieces[4]]=[4,0];
  [arbitrary.EDGES.pieces[0],arbitrary.EDGES.pieces[8]]=[8,0];
  arbitrary.CORNERS.orientation[0]=1;arbitrary.CORNERS.orientation[4]=2;
  arbitrary.EDGES.orientation[3]=1;arbitrary.EDGES.orientation[9]=1;
  const patterns=[puzzle.defaultPattern(),puzzle.defaultPattern().applyAlg("R U R' U' F2 D B' L2 U2 F R2 D' B2 L U'"),new KPattern(puzzle,arbitrary)];
  for(const [index,original] of patterns.entries()){
    const input=validateDraft(draftFromCube(oracleStickers(original)));assert.equal(input.kind,'valid');if(input.kind!=='valid')continue;
    const result=await solveValidatedInput(input);
    const final=original.applyAlg(result.algorithm);
    assert.equal(stickerKey(oracleStickers(final)),stickerKey(oracleStickers(puzzle.defaultPattern())));
    assert.equal(stickerKey(result.initialState),stickerKey(oracleStickers(original)));
    assert.ok(verifySolverSolution(input.state,result.algorithm));
    assert.deepEqual(solverStateAtStep(input.state,result.algorithm,0),input.state);
    assert.equal(result.tokens.length===0,index===0);
  }
});
test('result notation and fixed center comparison cannot silently accept an arbitrary rotation',()=>{
  assert.throws(()=>solverTokens('x'));assert.throws(()=>solverTokens("R2'"));assert.throws(()=>solverTokens('Rw'));
  const valid=validateDraft(createSolvedDraft());assert.equal(valid.kind,'valid');if(valid.kind==='valid')assert.throws(()=>solverStateAtStep(valid.state,'R',2));
});
