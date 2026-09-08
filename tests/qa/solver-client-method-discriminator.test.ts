import assert from 'node:assert/strict';
import test from 'node:test';
import { createSolverClient, createSolvedDraft, validateDraft, type SolverWorkerPort, type SolverWorkerResponse, type ValidatedSolverInput } from '../../src/solver';

class Port implements SolverWorkerPort {
  onmessage:SolverWorkerPort['onmessage']=null; onerror=null; onmessageerror=null; terminated=false;
  postMessage(message:unknown) { this.message=message as {requestId:string;inputKey:string;method?:string}; }
  terminate(){this.terminated=true;}
  message!: {requestId:string;inputKey:string;method?:string};
  reply(response:SolverWorkerResponse){this.onmessage?.({data:response} as MessageEvent<SolverWorkerResponse>);}
}

function input():ValidatedSolverInput {
  const value=validateDraft(createSolvedDraft()); assert.equal(value.kind,'valid');
  if(value.kind!=='valid') throw new Error('fixture inválida');
  return value;
}

test('client preserves direct discriminator and rejects a forged method plan', async () => {
  const ports:Port[]=[]; const client=createSolverClient({workerFactory:()=>{const port=new Port();ports.push(port);return port;}}); const validated=input();
  const direct=client.solve({requestId:'direct',validated});
  ports[0].reply({protocol:1,kind:'solution',requestId:'direct',inputKey:validated.inputKey,method:'direct',algorithm:'',tokens:[],initialState:[]} as SolverWorkerResponse);
  const directResult=await direct; assert.equal(directResult.kind,'solution'); if(directResult.kind==='solution') assert.equal(directResult.method,'direct');
  const forged=client.solve({requestId:'forged',validated,method:'cfop'});
  ports[1].reply({protocol:1,kind:'solution',requestId:'forged',inputKey:validated.inputKey,method:'cfop',algorithm:'',tokens:[],initialState:[]} as SolverWorkerResponse);
  const forgedResult=await forged; assert.equal(forgedResult.kind,'error'); if(forgedResult.kind==='error') assert.equal(forgedResult.code,'calculation-failed');
  client.dispose();
});

test('client rejects unknown method before worker dispatch', async () => {
  let created=0; const client=createSolverClient({workerFactory:()=>{created++;return new Port();}}); const result=await client.solve({requestId:'bad',validated:input(),method:'method' as never});
  assert.equal(result.kind,'error'); if(result.kind==='error') assert.equal(result.code,'invalid-input'); assert.equal(created,0); client.dispose();
});
