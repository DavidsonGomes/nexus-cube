/** Scoped to our dedicated worker. Never patch the Window or the scramble worker. */
export function trackChildWorkers(host:{Worker:typeof Worker}):{close:()=>void;readonly count:number} {
  const NativeWorker=host.Worker,children=new Set<Worker>();let closed=false;
  host.Worker=class extends NativeWorker {
    constructor(url:string|URL,options?:WorkerOptions){
      if(closed)throw new Error('Worker context closed.');
      super(url,options);children.add(this);
    }
    override terminate(){children.delete(this);super.terminate();}
  };
  return {get count(){return children.size;},close(){if(closed)return;closed=true;for(const worker of [...children])worker.terminate();}};
}
