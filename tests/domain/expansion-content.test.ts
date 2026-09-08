import test from 'node:test';
import assert from 'node:assert/strict';
import { KPattern } from 'cubing/kpuzzle';
import { puzzles } from 'cubing/puzzles';
import { CATALOG, EXERCISES, LEARNING_CONTENT, METHODS, STAGES, getContent, selectContent } from '../../src/domain';
import { getContentPlayback, cubeAtStep, invertAlgorithm, parseAlgorithm, solvedCube, applyAlgorithm, isSolved, getContentFocus, pieceStickerIds, validateStage, isCrossSolved, isFirstBlockSolved, isSecondBlockSolved, isCMLLSolved, isLSEOriented, arePiecesSolved } from '../../src/domain';
import { oracleStickers, stickerKey } from './oracle';
const k=await puzzles['3x3x3'].kpuzzle();
test('registry exposes 161 unique cases and 24 scoped exercises with complete stages and focus identities',()=>{
 assert.equal(CATALOG.length,161);assert.equal(EXERCISES.length,24);assert.equal(new Set(LEARNING_CONTENT.map(c=>c.id)).size,185);
 assert.deepEqual(CATALOG.reduce((n,c)=>({...n,[c.family]:(n[c.family]??0)+1}),{} as Record<string,number>),{OLL:57,PLL:21,F2L:41,CMLL:42});
 for(const method of METHODS)for(const stage of method.stageIds){assert.ok(STAGES.some(s=>s.id===stage&&s.methodId===method.id));assert.ok(selectContent({methodId:method.id,stageId:stage}).length);}
 for(const c of LEARNING_CONTENT){assert.equal(getContent(c.id),c);assert.ok(c.name&&c.objective&&c.groupId&&c.provenance.length&&c.preconditions.length&&c.preservation.length);assert.ok(c.aliases.length);assert.ok(c.milestones.every(m=>Number.isInteger(m.step)&&m.step>=0&&m.step<=parseAlgorithm(c.algorithm).length));
  const focus=getContentFocus(c,c.initialState);assert.ok(focus.stickerIds.length>0);assert.equal(new Set(focus.stickerIds).size,focus.stickerIds.length);for(const id of [...focus.stickerIds,...focus.referenceStickerIds])assert.ok(solvedCube().some(s=>s.id===id));
  for(const piece of [...c.focus.pieces??[],...c.focus.referencePieces??[]])assert.equal(pieceStickerIds([piece]).length,piece.length);
 }
 assert.equal(pieceStickerIds(['DFR','FR']).length,5);assert.equal(selectContent({kind:'exercise'}).length,24);assert.equal(selectContent({ids:[]}).length,0);
});
test('all 24 exercises prepare the authored context, solve only their declared objective, and match independent moves at each step',()=>{
 let partial=0;
 for(const c of EXERCISES)for(const algorithm of [c.algorithm,...c.alternatives]){
  const prepare=getContentPlayback(c,algorithm,'prepare'),solve=getContentPlayback(c,algorithm,'solve');
  assert.equal(prepare.preparation,parseAlgorithm(c.setup).join(' '));assert.equal(solve.inverseSolution,invertAlgorithm(algorithm));assert.equal(solve.usesAuthoredSetup,true);assert.equal(prepare.setup,'');assert.equal(solve.setup,prepare.preparation);
  assert.equal(stickerKey(prepare.caseState),stickerKey(c.initialState));assert.ok(isSolved(prepare.initialState));
  for(const playback of [prepare,solve]){const moves=parseAlgorithm(playback.algorithm);let oracle=k.defaultPattern().applyAlg(playback.setup);for(let step=0;step<=moves.length;step++){assert.equal(stickerKey(cubeAtStep(playback.setup,playback.algorithm,step)),stickerKey(oracleStickers(oracle)),`${c.id}/${playback.mode}/${step}`);if(step<moves.length)oracle=oracle.applyAlg(moves[step]);}}
  const final=applyAlgorithm(solve.caseState,solve.solution);assert.ok(validateStage(final,c.validation),c.id);
  assert.equal(stickerKey(applyAlgorithm(final,solve.inverseSolution)),stickerKey(solve.caseState));
  if(!isSolved(final)){partial++;assert.notEqual(stickerKey(applyAlgorithm(solvedCube(),solve.inverseSolution)),stickerKey(solve.caseState),`${c.id}: inverse(partial solution) must not be confused with authored context`);}
 }
 assert.ok(partial>=20);
});
test('all algorithm preparations follow the selected alternative and retain the declared final objective',()=>{
 for(const c of CATALOG)for(const a of [c.algorithm,...c.alternatives]){const p=getContentPlayback(c,a);assert.equal(p.usesAuthoredSetup,false);assert.equal(p.preparation,invertAlgorithm(a));assert.equal(p.preparation,p.inverseSolution);assert.ok(validateStage(applyAlgorithm(p.caseState,a),c.validation),c.id);assert.equal(stickerKey(p.caseState),stickerKey(oracleStickers(k.defaultPattern().applyAlg(p.preparation))));}
});
test('stage validators distinguish Roux blocks, CMLL, beginner EO, UL/UR and final centers, and respect explicit fixed frame',()=>{
 const cube=(alg:string)=>oracleStickers(k.defaultPattern().applyAlg(alg));
 assert.ok(isFirstBlockSolved(cube('R')));assert.ok(!isSecondBlockSolved(cube('R')));assert.ok(!isFirstBlockSolved(cube('L')));
 assert.ok(isSecondBlockSolved(cube('M U')));assert.ok(!isCMLLSolved(cube('U')));assert.ok(isCMLLSolved(cube('M')));assert.ok(!isCrossSolved(cube('M')));
 assert.ok(!isLSEOriented(cube('M')));assert.ok(isLSEOriented(cube('M2')));assert.ok(validateStage(cube('M2'),{goal:'lse-lr'}));assert.ok(!validateStage(cube('M2'),{goal:'solved'}));assert.ok(validateStage(cube(''),{goal:'solved'}));
 for(const item of EXERCISES.filter(c=>c.validation.goal==='lse-eo'||c.validation.goal==='lse-lr')){assert.equal(item.validation.referenceFrame,'fixed');assert.ok(validateStage(cube('M2'),item.validation),`${item.id}: M2 residual permitted with actual preservation spec`);assert.ok(!validateStage(cube('M'),item.validation));}
 const displacedCenters=structuredClone(k.defaultPattern().patternData);displacedCenters.CENTERS=k.defaultPattern().applyAlg('E2').patternData.CENTERS;const centersOnly=oracleStickers(new KPattern(k,displacedCenters));assert.ok(!isFirstBlockSolved(centersOnly));assert.ok(!isCrossSolved(centersOnly));
 assert.ok(!isFirstBlockSolved(cube('y')));assert.ok(arePiecesSolved(cube('y'),['DL','DFL'],'centers'));
 for(const alg of ['R','F','M','M2','U'])assert.ok(!validateStage(cube(alg),{goal:'solved'}));
 assert.ok(!isLSEOriented(getContent('roux/lse/eo-duas').initialState));assert.ok(!isLSEOriented(getContent('roux/lse/eo-quatro').initialState));assert.ok(!isLSEOriented(getContent('roux/lse/eo-seis').initialState));
});
