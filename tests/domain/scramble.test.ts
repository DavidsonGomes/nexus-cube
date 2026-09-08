import test from 'node:test';
import assert from 'node:assert/strict';
import { randomScrambleForEvent } from 'cubing/scramble';
import { puzzles } from 'cubing/puzzles';
import { applyAlgorithm, parseAlgorithm, solvedCube, isSolved } from '../../src/domain/cube';
import { oracleStickers, stickerKey } from './oracle';
import { generateScramble, disposeScrambleWorker } from '../../src/domain/scramble';
// Exercise the real library sampler/solver in its own Node worker. These samples
// verify valid outcomes, not uniformity statistically; sampler source is documented.
test('real random-state sampler/solver produces legal nontrivial states matching the independent model',async()=>{
 const kpuzzle=await puzzles['3x3x3'].kpuzzle();const algorithms=new Set<string>();
 for(let i=0;i<3;i++){const alg=(await randomScrambleForEvent('333')).toString();algorithms.add(alg);assert.ok(parseAlgorithm(alg).length>1);const state=applyAlgorithm(solvedCube(),alg);assert.ok(!isSolved(state));assert.equal(stickerKey(state),stickerKey(oracleStickers(kpuzzle.defaultPattern().applyAlg(alg))));}
 assert.equal(algorithms.size,3);
});
test('worker client correlates simultaneous requests, exposes failures, recreates worker and cancels pending jobs',async()=>{
 const previous=globalThis.Worker;const instances: FakeWorker[]=[];
 class FakeWorker {onmessage?: (e:any)=>void;onerror?:()=>void;onmessageerror?:()=>void;requests: {id:number}[]=[];terminated=false;constructor(public url: URL,public options:unknown){instances.push(this);}postMessage(v:{id:number}){this.requests.push(v);}terminate(){this.terminated=true;}}
 globalThis.Worker=FakeWorker as unknown as typeof Worker;
 try{const a=generateScramble(),b=generateScramble();const w=instances[0];assert.equal(w.url.pathname.endsWith('/workers/scramble.worker.ts'),true);w.onmessage!({data:{id:w.requests[1].id,algorithm:'R U'}});w.onmessage!({data:{id:w.requests[0].id,algorithm:'F L'}});assert.equal((await a).algorithm,'F L');assert.equal((await b).algorithm,'R U');
 const failed=generateScramble();w.onmessage!({data:{id:w.requests.at(-1)!.id,error:'solver indisponivel'}});await assert.rejects(failed,/solver indisponivel/);
 const canceled=generateScramble();disposeScrambleWorker();await assert.rejects(canceled,/cancelada/);assert.ok(w.terminated);
 const next=generateScramble();assert.equal(instances.length,2);instances[1].onerror!();await assert.rejects(next,/Falha ao iniciar/);
 }finally{disposeScrambleWorker();globalThis.Worker=previous;}
});
