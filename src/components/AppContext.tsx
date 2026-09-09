import {createContext,useContext,useState,useCallback,useRef,useEffect,useSyncExternalStore,type ReactNode} from 'react';
import type {AppData,SolveCapture} from '../domain';
import {createInitialData} from '../data';
import {createCloudService} from '../cloud';
import type {CloudService,CloudSnapshot,CommitResult,ContextHandle,CaptureHandle,CaptureResult,CaptureInputResult,Failure} from '../cloud/types';

type Change=AppData|((previous:AppData)=>AppData);
type Context={
 data:AppData; cloud:CloudSnapshot; service:CloudService;
 update:(change:Change)=>Promise<CommitResult>; recover:(data:AppData)=>Promise<CommitResult>;
 error:string|null; notice:string; notify:(message:string)=>void; notifyForContext:(message:string,context:ContextHandle)=>void;
 timerBusy:boolean; setTimerBusy:(value:boolean)=>void; saving:boolean; localSaving:boolean;
 authAction:<T>(action:(service:CloudService)=>Promise<T>)=>Promise<T|Failure>;
 beginCapture:(capture:SolveCapture,source:'timer'|'manual')=>Promise<CaptureResult>;
 completeCapture:(capture:CaptureHandle,result:CaptureInputResult)=>Promise<CaptureResult>;
 finishCapture:(capture:CaptureHandle)=>Promise<CommitResult>;
 cancelCapture:(capture:CaptureHandle)=>Promise<CaptureResult>;
};
const AppContext=createContext<Context>(null!);
const failure=(code:Failure['code'],message:string):Failure=>({kind:'error',code,message});
const same=(a:ContextHandle|null,b:ContextHandle|null)=>!!a&&!!b&&a.projectRef===b.projectRef&&a.userId===b.userId&&a.generation===b.generation;
let singleton:CloudService|undefined;
const initializations=new WeakMap<CloudService,Promise<void>>();
let callbackUrl:string|null=null;
export function readAuthCallback(url:URL):{callbackUrl:string;cleanPath:string}|null{
 const parameters=['code','cloud_flow','token','token_hash','access_token','refresh_token','error','error_code','error_description','type','expires_in','expires_at'];
 const hash=new URLSearchParams(url.hash.slice(1));
 if(!parameters.some(name=>url.searchParams.has(name)||hash.has(name)))return null;
 const clean=new URL(url.href);
 for(const name of parameters)clean.searchParams.delete(name);
 clean.hash='';
 return {callbackUrl:url.href,cleanPath:clean.pathname+clean.search};
}
if(typeof location!=='undefined'){
 const callback=readAuthCallback(new URL(location.href));
 if(callback){
   callbackUrl=callback.callbackUrl;
   history.replaceState(null,'',callback.cleanPath);
 }
}
async function initialize(service:CloudService){
 let operation=initializations.get(service);
 if(!operation){const callback=callbackUrl;callbackUrl=null;operation=(async()=>{await service.initialize();if(callback)await service.handleAuthCallback(callback);})();initializations.set(service,operation);}
 await operation;
}
function getService(){return singleton??=createCloudService({url:import.meta.env.VITE_SUPABASE_URL??'',publishableKey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY??'',redirectTo:location.origin+'/auth/callback',syncEnabled:false});}
export function DataProvider({children,service:provided}:{children:ReactNode;service?:CloudService}){
 const [service]=useState<CloudService>(()=>provided??getService());
 const cloud=useSyncExternalStore(service.subscribe,service.getSnapshot,service.getSnapshot);
 const [empty]=useState(createInitialData);
 const [noticeState,setNoticeState]=useState({key:'',text:''});const [errorState,setErrorState]=useState<{key:string;text:string|null}>({key:'',text:null});
 const [timerBusy,setBusy]=useState(false),busy=useRef(false);
 const [saving,setSaving]=useState(false),saves=useRef(0);
 const [localWrites,setLocalWrites]=useState<Record<string,number>>({});
 const queue=useRef<Promise<unknown>>(Promise.resolve());
 const context=cloud.context;
 const contextKey=context?context.projectRef+':'+context.userId+':'+context.generation:'locked';
 const notice=noticeState.key===contextKey?noticeState.text:'';
 const localError=errorState.key===contextKey?errorState.text:null;
 const localSaving=(localWrites[contextKey]??0)>0;
 const notify=useCallback((text:string)=>setNoticeState({key:contextKey,text}),[contextKey]);
 const notifyForContext=useCallback((text:string,expected:ContextHandle)=>{if(same(expected,service.getSnapshot().context))setNoticeState({key:expected.projectRef+':'+expected.userId+':'+expected.generation,text});},[service]);
 const setLocalError=(text:string|null)=>setErrorState({key:contextKey,text});
 const setTimerBusy=useCallback((value:boolean)=>{busy.current=value;setBusy(value);},[]);
 useEffect(()=>{void initialize(service);},[service]);
 useEffect(()=>{setTimerBusy(false);},[contextKey,setTimerBusy]);
 function track<T>(operation:()=>Promise<T>,writes=false):Promise<T>{
   saves.current++;setSaving(true);
   const key=contextKey;
   if(writes)setLocalWrites(previous=>({...previous,[key]:(previous[key]??0)+1}));
   return operation().finally(()=>{saves.current--;setSaving(saves.current>0);if(writes)setLocalWrites(previous=>{const next={...previous};const count=(next[key]??1)-1;if(count>0)next[key]=count;else delete next[key];return next;});});
 }
 const update=useCallback((change:Change):Promise<CommitResult>=>{
   const captured=context;
   const operation=async():Promise<CommitResult>=>{
     const current=service.getSnapshot();
     if(!captured||!same(captured,current.context))return failure('identity-changed','Seu contexto mudou. Entre novamente antes de salvar.');
     try{
       const result=await service.commit({context:captured,expectedLocalRevision:current.localRevision,change});
       if(!same(captured,service.getSnapshot().context))return failure('identity-changed','A identidade mudou durante a gravação. Os dados permanecem no espaço original.');
       if(result.kind==='error'&&same(captured,service.getSnapshot().context))setLocalError(result.message);
       return result;
     }catch{return failure('storage-error','Não foi possível gravar. Seus dados anteriores foram preservados.');}
   };
   const pending=track(()=>queue.current.then(operation,operation),true);
   queue.current=pending;return pending;
 },[contextKey,service]);
 async function recover(data:AppData):Promise<CommitResult>{
   if(busy.current||saves.current)return failure('busy-capture','Conclua ou cancele o registro em andamento antes de restaurar.');
   if(!context)return failure('locked','Abra seu espaço antes de restaurar.');
   const captured=context;
   return track(async()=>{const result=await service.recover({context:captured,data});if(!same(captured,service.getSnapshot().context))return failure('identity-changed','A identidade mudou durante a restauração. Revise o espaço atual.');if(same(captured,service.getSnapshot().context)){if(result.kind==='committed'){setLocalError(null);notify('Dados restaurados com sucesso.');}else setLocalError(result.message);}return result;},true);
 }
 async function authAction<T>(action:(service:CloudService)=>Promise<T>):Promise<T|Failure>{
   if(busy.current||saves.current)return failure('busy-capture','Conclua ou cancele o registro e aguarde a gravação antes de mudar sua conta.');
   try{return await track(()=>action(service));}catch{return failure('auth-error','Não foi possível concluir. Tente novamente.');}
 }
 async function beginCapture(capture:SolveCapture,source:'timer'|'manual'):Promise<CaptureResult>{
   if(!context)return failure('locked','Escolha seu espaço de treino.');
   if(saves.current)return failure('stale-local','Aguarde a gravação anterior antes de preparar o cronômetro.');
   return track(()=>service.beginCapture({context,capture,source}),true);
 }
 const completeCapture=(capture:CaptureHandle,result:CaptureInputResult)=>track(()=>service.completeCapture({capture,result}),true);
 const finishCapture=(capture:CaptureHandle)=>track(async()=>{const result=await service.finishCapture({capture,expectedLocalRevision:service.getSnapshot().localRevision});return same(capture.context,service.getSnapshot().context)?result:failure('identity-changed','O registro permanece vinculado ao espaço original. Entre novamente para recuperá-lo.');},true);
 const cancelCapture=(capture:CaptureHandle)=>track(()=>service.cancelCapture(capture),true);
 return <AppContext.Provider value={{data:cloud.data??empty,cloud,service,update,recover,error:localError??cloud.error?.message??null,notice,notify,notifyForContext,timerBusy,setTimerBusy,saving,localSaving,authAction,beginCapture,completeCapture,finishCapture,cancelCapture}}>{children}</AppContext.Provider>;
}
export const useData=()=>useContext(AppContext);
