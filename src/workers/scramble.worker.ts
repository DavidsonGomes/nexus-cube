import { randomScrambleForEvent } from 'cubing/scramble';
// cubing owns the random-state sampler and min2phase solver. Vite bundles its
// nested module worker and dynamic solver chunks locally. No CDN or random-move fallback.
const workerScope=self as unknown as DedicatedWorkerGlobalScope;
let queue=Promise.resolve();
workerScope.onmessage=(event: MessageEvent<{id:number}>)=>{
  const id=event.data?.id;if(!Number.isSafeInteger(id))return;
  queue=queue.then(async()=>{try{const algorithm=(await randomScrambleForEvent('333')).toString();workerScope.postMessage({id,algorithm});}catch(error){workerScope.postMessage({id,error:error instanceof Error?error.message:'Falha no gerador de estados.'});}});
};
