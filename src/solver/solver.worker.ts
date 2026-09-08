import { solveValidatedInput, solverError, SolverFailure } from './solution';
import { SOLVER_FRAME, validateDraft } from './validation';
import type { SolverWorkerRequest, SolverWorkerCancel, SolverWorkerResponse } from './types';
import { trackChildWorkers } from './worker-lifecycle';

const scope=self as unknown as DedicatedWorkerGlobalScope;
// cubing 0.63.4 PortableWorker uses new globalThis.Worker. Install before its lazy import.
const children=trackChildWorkers(globalThis);
const controller=new AbortController();
let started=false,closed=false,current:SolverWorkerRequest|undefined;
function close(){if(closed)return;closed=true;children.close();scope.close();}
scope.onmessage=async(event:MessageEvent<SolverWorkerRequest|SolverWorkerCancel>)=>{
  const request=event.data;
  if(!request||request.protocol!==1||typeof request.requestId!=='string'||request.requestId.length>128||!request.requestId||typeof request.inputKey!=='string'||request.inputKey.length>100)return;
  if(request?.protocol===1&&request.kind==='cancel'){
    if(current&&(current.requestId!==request.requestId||current.inputKey!==request.inputKey))return;
    controller.abort();children.close();scope.postMessage({protocol:1,kind:'cancelled',requestId:request.requestId,inputKey:request.inputKey});close();return;
  }
  if(started||request.kind!=='solve'||request.frame!==SOLVER_FRAME)return;
  started=true;current=request;
  const {requestId,inputKey}=request;
  const method=request.method??'direct';
  const send=(message:Omit<SolverWorkerResponse,'protocol'>)=>{if(!closed)scope.postMessage({...message,protocol:1});};
  const validated=validateDraft(request.facelets);
  if(validated.kind!=='valid'||validated.inputKey!==inputKey){send({kind:'error',requestId,inputKey,code:validated.kind!=='valid'?'invalid-input':'input-key-mismatch',message:'O preenchimento não corresponde à solicitação.'} as SolverWorkerResponse);close();return;}
  try {
    if(method==='direct'){
      const result=await solveValidatedInput(validated,phase=>send({kind:'progress',requestId,inputKey,phase,method} as SolverWorkerResponse));
      children.close();send({kind:'solution',requestId,inputKey,method,...result} as SolverWorkerResponse);
    }else if(method==='cfop'||method==='roux'){
      send({kind:'progress',requestId,inputKey,phase:'initializing',method} as SolverWorkerResponse);
      const planner=method==='cfop'?(await import('./methods/cfop')).planCFOP:(await import('./methods/roux')).planRoux;
      const plan=await planner(validated,{signal:controller.signal,onStage:stage=>send({kind:'progress',requestId,inputKey,phase:'solving',method,stageId:stage.id} as SolverWorkerResponse)});
      send({kind:'progress',requestId,inputKey,phase:'verifying',method} as SolverWorkerResponse);
      const {verifyMethodPlan}=await import('./methods/plan');
      if(!verifyMethodPlan(validated,plan))throw new SolverFailure('verification-failed','O plano não confirmou todas as etapas e as 54 cores finais.');
      children.close();send({kind:'solution',requestId,inputKey,method,plan,algorithm:plan.algorithm,tokens:plan.tokens,initialState:validated.state} as SolverWorkerResponse);
    }else throw new SolverFailure('invalid-input','Método desconhecido.');
  } catch(error){children.close();send(solverError(requestId,inputKey,error instanceof Error&&error.name==='RouxSearchLimit'?new SolverFailure('search-limit',error.message):error));}
  finally{close();}
};
