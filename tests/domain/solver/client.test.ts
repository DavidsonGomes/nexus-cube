import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolverClient, createSolvedDraft, draftFromCube, validateDraft } from '../../../src/solver';
import type { SolverWorkerPort, SolverWorkerResponse, ValidatedSolverInput } from '../../../src/solver';
import { applyAlgorithm, solvedCube } from '../../../src/domain/cube';
import { createMethodPlanBuilder, METHOD_STAGE_PROFILES } from '../../../src/solver/methods/plan';

class FakeWorker implements SolverWorkerPort {
  onmessage:SolverWorkerPort['onmessage']=null;onerror:SolverWorkerPort['onerror']=null;onmessageerror:SolverWorkerPort['onmessageerror']=null;
  terminated=false;sent:unknown;
  postMessage(message:unknown){this.sent=message;const request=message as {kind:string;requestId:string;inputKey:string};if(request.kind==='cancel')this.onmessage?.({data:{protocol:1,kind:'cancelled',requestId:request.requestId,inputKey:request.inputKey}} as MessageEvent<SolverWorkerResponse>);}terminate(){this.terminated=true;}
  reply(valid:ValidatedSolverInput,id:string,algorithm:string){this.onmessage?.({data:{protocol:1,kind:'solution',method:'direct',requestId:id,inputKey:valid.inputKey,algorithm,tokens:['FAKE'],initialState:[]} as SolverWorkerResponse} as MessageEvent<SolverWorkerResponse>);}
}
function valid(){const v=validateDraft(draftFromCube(applyAlgorithm(solvedCube(),'R')));assert.equal(v.kind,'valid');return v as ValidatedSolverInput;}
test('client verifies returned algorithm against captured original and ignores supplied state/tokens',async()=>{
  const worker=new FakeWorker(),client=createSolverClient({workerFactory:()=>worker}),input=valid();
  const pending=client.solve({requestId:'one',validated:input});worker.reply(input,'one',"R'");const result=await pending;
  assert.equal(result.kind,'solution');if(result.kind==='solution'){assert.deepEqual(result.tokens,["R'"]);assert.deepEqual(result.initialState,input.state);}
  assert.ok(worker.terminated);client.dispose();
  const bad=new FakeWorker(),other=createSolverClient({workerFactory:()=>bad});const p=other.solve({requestId:'bad',validated:input});bad.reply(input,'bad','');assert.equal((await p).kind,'error');other.dispose();
});
test('supersede, abort, reset and dispose reject stale callbacks even when request/key are reused',async()=>{
  const workers:FakeWorker[]=[],client=createSolverClient({workerFactory:()=>{const w=new FakeWorker();workers.push(w);return w;}}),input=valid();
  const first=client.solve({requestId:'same',validated:input}),stale=workers[0].onmessage!;
  const second=client.solve({requestId:'same',validated:input});assert.equal((await first).kind,'cancelled');assert.ok(workers[0].terminated);
  stale({data:{protocol:1,kind:'solution',requestId:'same',inputKey:input.inputKey,algorithm:"R'"}} as MessageEvent<SolverWorkerResponse>);
  workers[1].reply(input,'same',"R'");assert.equal((await second).kind,'solution');
  const controller=new AbortController(),aborted=client.solve({requestId:'abort',validated:input},{signal:controller.signal});controller.abort();assert.equal((await aborted).kind,'cancelled');
  const reset=client.solve({requestId:'reset',validated:input});client.cancel();assert.equal((await reset).kind,'cancelled');
  const disposed=client.solve({requestId:'dispose',validated:input});client.dispose();assert.equal((await disposed).kind,'cancelled');assert.equal((await client.solve({requestId:'later',validated:input})).kind,'error');
});
test('forged key fails before dispatch; worker failures and timeout are recoverable errors',async()=>{
  let calls=0;const client=createSolverClient({workerFactory:()=>{calls++;return new FakeWorker();},timeoutMs:5});const input=valid();
  assert.equal((await client.solve({requestId:'forged',validated:{...input,inputKey:'forged'}})).kind,'error');assert.equal(calls,0);
  const timeout=await client.solve({requestId:'timeout',validated:input});assert.equal(timeout.kind,'error');if(timeout.kind==='error')assert.equal(timeout.code,'timeout');client.dispose();
  const solved=validateDraft(createSolvedDraft());assert.equal(solved.kind,'valid');
});
test('method discriminator carries a complete verified plan and rejects a forged endpoint or another mode',async()=>{
  const input=validateDraft(createSolvedDraft());assert.equal(input.kind,'valid');if(input.kind!=='valid')return;
  for(const method of ['cfop','roux'] as const){
    const builder=createMethodPlanBuilder(method,input);
    for(const spec of METHOD_STAGE_PROFILES[method])builder.addStage({...spec,title:spec.id,explanation:'Already satisfied.'},'');
    const plan=builder.finish();
    for(const defect of ['none','endpoint','method'] as const){
      const worker=new FakeWorker(),client=createSolverClient({workerFactory:()=>worker}),copy=structuredClone(plan);
      const pending=client.solve({requestId:'method',validated:input,method});
      if(defect==='endpoint')copy.stages[0].finalState=applyAlgorithm(copy.initialState,'R');
      const data:SolverWorkerResponse=defect==='method'
        ? {protocol:1,kind:'solution',method:'direct',requestId:'method',inputKey:input.inputKey,algorithm:'',tokens:[],initialState:[]}
        : {protocol:1,kind:'solution',method,requestId:'method',inputKey:input.inputKey,plan:copy,algorithm:'',tokens:[],initialState:[]};
      worker.onmessage?.({data} as MessageEvent<SolverWorkerResponse>);
      const result=await pending;assert.equal(result.kind,defect==='none'?'solution':'error');
      if(result.kind==='solution'&&result.method!=='direct'){assert.deepEqual(result.plan,plan);assert.deepEqual(result.initialState,input.state);}
      client.dispose();
    }
  }
});
