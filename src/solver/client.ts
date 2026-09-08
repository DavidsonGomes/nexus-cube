import type { SolverClient, SolverOptions, SolverOutcome, SolverRequest, SolverWorkerResponse } from './types';
import { revalidateSolverInput, solverError, solverTokens, SolverFailure, verifySolverSolution } from './solution';
import { SOLVER_FRAME } from './validation';
import { verifyMethodPlan } from './methods/plan';

export interface SolverWorkerPort {
  onmessage: ((event:MessageEvent<SolverWorkerResponse>)=>void)|null;
  onerror: ((event:ErrorEvent)=>void)|null;
  onmessageerror: ((event:MessageEvent)=>void)|null;
  postMessage(message:unknown):void;
  terminate():void;
}
export interface SolverClientConfig { workerFactory?:()=>SolverWorkerPort; timeoutMs?:number }
/** One job per dedicated outer worker. Cancellation is immediate logically.
 * A cancel message asks the outer worker to terminate its tracked children and acknowledge.
 * The fallback only terminates the outer worker; it is not proof of physical child shutdown.
 */
export function createSolverClient(config:SolverClientConfig={}):SolverClient {
  const timeoutMs=config.timeoutMs??120000;
  if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error('Prazo inválido.');
  let disposed=false,active:{cancel:()=>void}|undefined;
  const cancel=()=>{active?.cancel();};
  function solve(request:SolverRequest,options:SolverOptions={}):Promise<SolverOutcome> {
    cancel();
    const requestId=request?.requestId,inputKey=request?.validated?.inputKey??'';
    const method=request?.method??'direct';
    if(disposed)return Promise.resolve({kind:'error',requestId,inputKey,code:'disposed',message:'O solucionador foi encerrado.'});
    if(typeof requestId!=='string'||!requestId||requestId.length>128)return Promise.resolve(solverError(requestId,inputKey,new SolverFailure('invalid-input','Identificador de solicitação inválido.')));
    if(!['direct','cfop','roux'].includes(method))return Promise.resolve(solverError(requestId,inputKey,new SolverFailure('invalid-input','Método desconhecido.')));
    let validated;
    try{validated=revalidateSolverInput(request.validated);}catch(error){return Promise.resolve(solverError(requestId,inputKey,error));}
    const frozen=validated;
    return new Promise(resolve=>{
      let worker:SolverWorkerPort|undefined,timer:ReturnType<typeof setTimeout>|undefined,done=false;
      const finish=(outcome:SolverOutcome)=>{
        if(done)return;done=true;
        if(timer!==undefined)clearTimeout(timer);
        options.signal?.removeEventListener('abort',abort);
        if(worker){
          const retiring=worker;
          if(outcome.kind==='cancelled'||(outcome.kind==='error'&&outcome.code==='timeout')){
            let closed=false;
            const kill=()=>{if(closed)return;closed=true;clearTimeout(retirement);retiring.onmessage=null;retiring.onerror=null;retiring.onmessageerror=null;retiring.terminate();};
            const retirement=setTimeout(kill,1000);
            retiring.onmessage=event=>{const r=event.data;if(r?.protocol===1&&r.kind==='cancelled'&&r.requestId===requestId&&r.inputKey===inputKey)kill();};
            retiring.onerror=kill;retiring.onmessageerror=kill;
            try{retiring.postMessage({protocol:1,kind:'cancel',requestId,inputKey});}catch{kill();}
          }else{retiring.onmessage=null;retiring.onerror=null;retiring.onmessageerror=null;retiring.terminate();}
        }
        if(active===job)active=undefined;
        resolve(outcome);
      };
      const abort=()=>finish({kind:'cancelled',requestId,inputKey});
      const job={cancel:abort};active=job;
      if(options.signal?.aborted){abort();return;}
      options.signal?.addEventListener('abort',abort,{once:true});
      try{
        worker=config.workerFactory?.()??new Worker(new URL('./solver.worker.ts',import.meta.url),{type:'module'});
        worker.onmessage=event=>{
          if(done||active!==job)return;
          const response=event.data;
          if(!response||response.protocol!==1||response.requestId!==requestId||response.inputKey!==inputKey)return;
          if(response.kind==='progress'){
            if(!['initializing','solving','verifying'].includes(response.phase))return;
            try{options.onProgress?.(response);}catch{/* Presentation callbacks cannot invalidate a calculation. */}
          }else if(response.kind==='solution'){
            try{
              if(response.method!==method)throw new SolverFailure('invalid-response','A resposta pertence a outro método.');
              if(response.method==='direct'){
                const tokens=solverTokens(response.algorithm);
                // Ignore worker-supplied state/tokens: verify against the locally captured original.
                if(!verifySolverSolution(frozen.state,response.algorithm))throw new SolverFailure('verification-failed','A resposta não resolve o estado informado.');
                finish({kind:'solution',method:'direct',requestId,inputKey,algorithm:tokens.join(' '),tokens,initialState:frozen.state});
              }else{
                if(response.plan.method!==method||response.algorithm!==response.plan.algorithm||!verifyMethodPlan(frozen,response.plan))throw new SolverFailure('verification-failed','O plano não corresponde à entrada ou às metas do método.');
                const plan=structuredClone(response.plan);
                finish({kind:'solution',method:response.method,requestId,inputKey,plan,algorithm:plan.algorithm,tokens:plan.tokens,initialState:frozen.state});
              }
            }catch(error){finish(solverError(requestId,inputKey,error));}
          }else if(response.kind==='error'){
            const code=response.code==='search-limit'?'search-limit':response.code==='verification-failed'?'verification-failed':'calculation-failed';
            finish(solverError(requestId,inputKey,new SolverFailure(code,code==='search-limit'?'O limite de busca foi atingido. Isso não significa que o cubo seja impossível.':code==='verification-failed'?'Não foi possível confirmar todas as etapas da solução.':'Não foi possível calcular a solução. Tente novamente.')));
          }else{finish(solverError(requestId,inputKey,new SolverFailure('invalid-response','Resposta inválida do solucionador.')));}
        };
        worker.onerror=()=>finish(solverError(requestId,inputKey,new SolverFailure('worker-error','Falha no worker local. Tente novamente.')));
        worker.onmessageerror=()=>finish(solverError(requestId,inputKey,new SolverFailure('invalid-response','Não foi possível ler a resposta do worker.')));
        timer=setTimeout(()=>finish(solverError(requestId,inputKey,new SolverFailure('timeout','O cálculo demorou demais. Tente novamente.'))),timeoutMs);
        worker.postMessage({protocol:1,kind:'solve',frame:SOLVER_FRAME,requestId,inputKey,method,facelets:frozen.facelets});
      }catch{finish(solverError(requestId,inputKey,new SolverFailure('worker-unavailable','O worker local não está disponível.')));}
    });
  }
  return {solve,cancel,dispose(){disposed=true;cancel();}};
}
