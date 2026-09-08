// Focused curator verification, not the integrated test suite.
// Independently enumerates coordinates without using generator paths or inverses.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {puzzles} from 'cubing/puzzles';
import {KPattern} from 'cubing/kpuzzle';
import {CMLL_SOURCES} from '../../src/data/expansion-sources/cmll.ts';
import {EXERCISE_SOURCES} from '../../src/data/expansion-sources/exercises.ts';
import {oracleStickers,stickerKey} from '../../tests/domain/oracle.ts';
import {applyAlgorithm,applyMove,solvedCube,parseAlgorithm} from '../../src/domain/cube.ts';
import {validateStage} from '../../src/domain/stage-validation.ts';

const k=await puzzles['3x3x3'].kpuzzle();
const edgeNames='UF UR UB UL DF DR DB DL FR FL BR BL'.split(' ');
const cornerNames='UFR URB UBL ULF DRF DFL DLB DBR'.split(' ');
const centers='U L F R B D'.split(' ');
const free=[0,1,2,3,4,6];
const U=['','U','U2',"U'"];
const nrm=s=>s.split('').sort().join('');
function permutations(a){return a.length?a.flatMap((v,i)=>permutations(a.filter((_,j)=>i!==j)).map(p=>[v,...p])):[[]];}
function parity(a){let n=0;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)n+=a[i]>a[j]?1:0;return n%2;}
function coord(p){const c=p.patternData.CORNERS;return c.pieces.slice(0,4).join('')+'/'+c.orientation.slice(0,4).join('');}
function pieceOK(p,name){const orbit=name.length===1?'CENTERS':name.length===2?'EDGES':'CORNERS',names=name.length===1?centers:name.length===2?edgeNames:cornerNames;const i=names.findIndex(v=>nrm(v)===nrm(name));assert(i>=0);return p.patternData[orbit].pieces[i]===i&&(orbit==='CENTERS'||p.patternData[orbit].orientation[i]===0);}
const blockNames=['DL','FL','BL','DFL','DBL','DR','FR','BR','DFR','DBR'];
const cmllOK=p=>[...blockNames,...cornerNames,'L','R'].every(n=>pieceOK(p,n));
function eoBad(p){return oracleStickers(p).filter(s=>['U','D'].includes(s.color)&&s.position.filter(v=>v!==0).length===2&&Math.abs(s.normal[1])!==1).length;}
function eoOK(p){const c=p.patternData.CENTERS.pieces;return cmllOK(p)&&[0,5].includes(c[0])&&eoBad(p)===0;}
function goalOK(p,v){
 const pieces=v.goal==='cross'?['DF','DR','DB','DL']:v.goal==='f2l-pair'?['DF','DR','DB','DL',v.targetSlot,'D'+v.targetSlot]:v.goal==='first-block'?blockNames.slice(0,5):v.goal==='second-block'?blockNames:v.goal==='cmll'?[...blockNames,...cornerNames]:[];
 if(!pieces.every(n=>pieceOK(p,n)))return false;
 if(v.goal==='lse-eo')return eoOK(p);
 if(v.goal==='lse-lr')return eoOK(p)&&pieceOK(p,'UL')&&pieceOK(p,'UR');
 if(v.goal==='solved')return [...edgeNames,...cornerNames,...centers].every(n=>pieceOK(p,n));
 return true;
}
function fixture(cp,co,variant=0){
 const d=structuredClone(k.defaultPattern().patternData);
 d.CORNERS.pieces.splice(0,4,...cp);d.CORNERS.orientation.splice(0,4,...co);
 const perm=free.map((_,i)=>free[(i+variant)%6]);
 free.forEach((slot,i)=>d.EDGES.pieces[slot]=perm[i]);
 if(parity(d.EDGES.pieces)!==parity(d.CORNERS.pieces)) [d.EDGES.pieces[0],d.EDGES.pieces[1]]=[d.EDGES.pieces[1],d.EDGES.pieces[0]];
 let parityEO=0;for(let i=0;i<5;i++){d.EDGES.orientation[free[i]]=(variant>>i)&1;parityEO^=d.EDGES.orientation[free[i]];}d.EDGES.orientation[free[5]]=parityEO;
 return new KPattern(k,d);
}
// Build equivalence classes from labeled independent fixtures using actual U turns.
// Relabeling upper corner colors cyclically is independent of edge permutations.
const lookup=new Map();
for(const row of CMLL_SOURCES){
 const cp=row.recognition.pieces,co=row.recognition.orientation;
 for(let rename=0;rename<4;rename++)for(const u of U){
  const p=fixture(cp.map(n=>(n+rename)%4),co).applyAlg(u),id=coord(p);
  assert(!lookup.has(id)||lookup.get(id)===row.id,`overlap ${row.id}`);lookup.set(id,row.id);
 }
}
const skips=new Set(U.map(u=>coord(k.defaultPattern().applyAlg(u))));
assert.equal(CMLL_SOURCES.length,42);assert.equal(lookup.size+skips.size,648);
let enumerated=0,solvedFixtures=0;
for(const cp of permutations([0,1,2,3]))for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++){
 const co=[a,b,c,(6-a-b-c)%3],p=fixture(cp,co),id=coord(p);enumerated++;
 assert.equal(lookup.has(id)||skips.has(id),true,`uncovered ${id}`);
 if(skips.has(id))continue;
 const row=CMLL_SOURCES.find(r=>r.id===lookup.get(id));
 let result;
 outer:for(const before of U)for(const after of U){const q=p.applyAlg([before,row.algorithm,after].filter(Boolean).join(' '));if(cmllOK(q)){result=q;break outer;}}
 assert(result,`unresolved coordinate ${id}`);solvedFixtures++;
}
assert.equal(enumerated,648);
let varied=0,comparedSteps=0;
for(const row of CMLL_SOURCES){
 let leavesEdges=false;
 for(let variant=0;variant<12;variant++){
  let p=fixture(row.recognition.pieces,row.recognition.orientation,variant);
  if(variant>=6)p=p.applyAlg(variant%2?'M':'M2');
  const start=oracleStickers(p),end=p.applyAlg(row.algorithm);
  assert(cmllOK(end),`CMLL preserve/goal ${row.id}/${variant}`);
  assert([...blockNames].every(n=>pieceOK(p,n)));
  const geometric=applyAlgorithm(start,row.algorithm);
  assert.equal(stickerKey(geometric),stickerKey(oracleStickers(end)));
  if(!goalOK(end,{goal:'solved'}))leavesEdges=true;
  varied++;
 }
 assert(leavesEdges,`${row.id} was checked only as a whole-cube inverse`);
 const recognition=fixture(row.recognition.pieces,row.recognition.orientation);
 let p=recognition,g=oracleStickers(p);
 for(const move of parseAlgorithm(row.algorithm)){p=p.applyAlg(move);g=applyMove(g,move);assert.equal(stickerKey(g),stickerKey(oracleStickers(p)));comparedSteps++;}
}
const exerciseProof=[];
let lseReferenceChecks=0;
for(const row of EXERCISE_SOURCES){
 let p=k.defaultPattern().applyAlg(row.setup),g=applyAlgorithm(solvedCube(),row.setup);
 assert.equal(stickerKey(g),stickerKey(oracleStickers(p)),row.id+' setup');
 const initial=p;
 const initialGoal=goalOK(p,row.validation);
 assert(!initialGoal,row.id+' already meets its goal');
 if(row.stageId==='sb')assert(blockNames.slice(0,5).every(n=>pieceOK(p,n)));
 if(row.stageId==='f2l')assert(['DF','DR','DB','DL',...blockNames.filter(n=>!['FR','DFR'].includes(n))].every(n=>pieceOK(p,n)));
 if(row.stageId==='lse')assert(cmllOK(p));
 const stateByStep=[p];
 for(const move of parseAlgorithm(row.solution)){p=p.applyAlg(move);g=applyMove(g,move);assert.equal(stickerKey(g),stickerKey(oracleStickers(p)),row.id);stateByStep.push(p);comparedSteps++;}
 assert(goalOK(p,row.validation),row.id+' independent goal');
 assert(validateStage(g,row.validation),row.id+' domain goal');
 if(row.stageId==='lse'){
  assert.equal(row.validation.referenceFrame,'fixed');
  if(['lse-eo','lse-lr'].includes(row.validation.goal)){
   assert(goalOK(p.applyAlg('M2'),row.validation),row.id+' independent M2 residual');
   assert(validateStage(applyMove(g,'M2'),row.validation),row.id+' domain M2 residual');
   assert(!goalOK(p.applyAlg('M'),row.validation),row.id+' independent odd M rejection');
   assert(!validateStage(applyMove(g,'M'),row.validation),row.id+' domain odd M rejection');
   lseReferenceChecks+=2;
  }else{
   assert(!validateStage(applyMove(g,'M2'),row.validation),row.id+' final centers must be solved');lseReferenceChecks++;
  }
 }
 for(const preserved of row.validation.preserve){assert(pieceOK(initial,preserved),row.id+' declared initial preserve '+preserved);assert(pieceOK(p,preserved),row.id+' final preserve '+preserved);}
 for(const m of row.milestones)assert(Number.isInteger(m.step)&&m.step>=0&&m.step<stateByStep.length);
 if(row.id.endsWith('eo-duas'))assert.equal(eoBad(initial),2);
 if(row.id.endsWith('eo-quatro'))assert.equal(eoBad(initial),4);
 if(row.id.endsWith('eo-seis'))assert.equal(eoBad(initial),6);
 exerciseProof.push({id:row.id,goal:row.validation.goal,moves:parseAlgorithm(row.solution).length,initialGoal,finalGoal:true,initialBadEdges:row.stageId==='lse'?eoBad(initial):undefined,finalBadEdges:row.stageId==='lse'?eoBad(p):undefined,milestones:row.milestones.map(m=>({step:m.step,title:m.title,cornerPermutation:stateByStep[m.step].patternData.CORNERS.pieces,edges:stateByStep[m.step].patternData.EDGES,centers:stateByStep[m.step].patternData.CENTERS.pieces}))});
}
const lengths=CMLL_SOURCES.map(r=>parseAlgorithm(r.algorithm).length).sort((a,b)=>a-b);
const report={independentCoordinates:enumerated,nonSkipCoordinatesSolved:solvedFixtures,classes:42,skipCoordinates:skips.size,variedEdgeFixtures:varied,comparedMovementSteps:comparedSteps,lseReferenceChecks,cmllMoves:{min:lengths[0],median:(lengths[20]+lengths[21])/2,max:lengths.at(-1),metric:'tokens: quarter, inverse, double, wide, slice or rotation each count one'},exercises:exerciseProof,hashes:Object.fromEntries(['cmll','exercises'].map(n=>[n,createHash('sha256').update(readFileSync(`src/data/expansion-sources/${n}.ts`)).digest('hex')]))};
writeFileSync('docs/expansion-curation/verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,exercises:exerciseProof.length,hashes:report.hashes}));
