import test from 'node:test';
import assert from 'node:assert/strict';
import { getWizardFace, getWizardStep, canonicalSlotToWizard, wizardSlotToCanonical, getWizardTransition } from '../../src/solver/wizard';
import type { Face, Vector3 } from '../../src/domain/types';

const faces:Face[]=['U','R','F','D','L','B'];
const normals:Record<Face,Vector3>={U:[0,1,0],R:[1,0,0],F:[0,0,1],D:[0,-1,0],L:[-1,0,0],B:[0,0,-1]};
const coord=(face:Face,row:number,col:number):Vector3=>{const a=col-1,b=1-row;switch(face){case'F':return[a,b,1];case'B':return[-a,b,-1];case'R':return[1,b,-a];case'L':return[-1,b,a];case'U':return[a,1,-b];case'D':return[a,-1,b]}};
const same=(a:readonly number[],b:readonly number[])=>a.every((n,i)=>n===b[i]);
function rotate(v:Vector3,axis:'x'|'y'|'z',turns:number):Vector3 { let [x,y,z]=v; for(let i=0;i<((turns%4)+4)%4;i++){if(axis==='x')[y,z]=[-z,y];else if(axis==='y')[x,z]=[z,-x];else [x,y]=[-y,x];}return[x||0,y||0,z||0] as Vector3; }
function poseTokens(pose:string):string[]{return pose?pose.split(' '):[]}
function expectedLocal(face:Face,_pose:string,draft:Record<Face,string[]>):string[]{const canonicalIndex=face==='D'?[6,3,0,7,4,1,8,5,2]:[0,1,2,3,4,5,6,7,8];return canonicalIndex.map(i=>draft[face][i]);}
function fixture():Record<Face,string[]>{return Object.fromEntries(faces.map(f=>[f,Array.from({length:9},(_,i)=>`${f}${i}`)])) as Record<Face,string[]>;}

test('wizard mapping roundtrips all 54 slots and local colors match independent geometry',()=>{const draft=fixture();for(const face of faces){const step=getWizardStep(face);for(let i=0;i<9;i++){const canonical=wizardSlotToCanonical(face,i);assert.deepEqual(canonicalSlotToWizard(canonical),{face,index:i});}assert.deepEqual(getWizardFace(draft,face),expectedLocal(face,step.pose.algorithm,draft));}});

test('wizard transitions are reversible and preserve endpoint orientation',()=>{for(const from of [null,...faces] as const)for(const to of [null,...faces] as const){const transition=getWizardTransition(from,to);assert.equal(transition.inverseAlgorithm,transition.algorithm?transition.algorithm.split(' ').reverse().map(t=>t.endsWith('2')?t:t.endsWith("'")?t.slice(0,-1):t+"'").join(' '):'');assert.equal(transition.moves.length,transition.tokens.length);}});
