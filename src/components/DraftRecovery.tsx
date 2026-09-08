import {useEffect,useState} from 'react';
import {formatTime} from '../domain';
import type {RecoveryDraft} from '../cloud';
import {useData} from './AppContext';
import {modeLabel} from './ModePicker';

export default function DraftRecovery(){
 const {cloud,service,timerBusy,authAction,notify,finishCapture,setTimerBusy}=useData();
 const [drafts,setDrafts]=useState<RecoveryDraft[]>([]),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const context=cloud.context;
 const contextKey=context?`${context.projectRef}:${context.userId}:${context.generation}`:'';
 useEffect(()=>{
   if(!context||timerBusy||cloud.status==='offline-account'){setDrafts([]);setError('');return;}
   let current=true;
   void service.listDrafts(context).then(result=>{if(!current)return;if(result.kind==='drafts')setDrafts(result.drafts);else setError(result.message);});
   return()=>{current=false;};
 },[contextKey,cloud.localRevision,cloud.status,timerBusy,service]);
 async function resume(draft:RecoveryDraft){
   if(!context||pending||!draft.solve)return;
   setPending(true);setError('');
   const result=await authAction(current=>current.resumeCapture({context,draftId:draft.id}));
   if(service.getSnapshot().context?.generation!==context.generation)return;
   if(result.kind!=='resumed'){setPending(false);if(result.kind==='error')setError(result.message);return;}
   setTimerBusy(true);
   try{
     const saved=await finishCapture(result.capture);
     if(service.getSnapshot().context?.generation!==context.generation)return;
     if(saved.kind==='committed'){setDrafts(values=>values.filter(value=>value.id!==draft.id));notify('Resultado recuperado na sessão e modalidade originais.');}
     else setError(saved.message);
   }finally{setPending(false);setTimerBusy(false);}
 }
 async function discard(draft:RecoveryDraft){
   if(!context||pending||!confirm(draft.result?'Descartar este resultado ainda não registrado?':'Descartar esta preparação interrompida? Nenhum tempo será criado.'))return;
   setPending(true);setError('');
   const result=await authAction(current=>current.discardDraft({context,draftId:draft.id}));
   if(service.getSnapshot().context?.generation!==context.generation)return;
   setPending(false);
   if(result.kind==='cancelled'){setDrafts(values=>values.filter(value=>value.id!==draft.id));notify('Preparação descartada. Seus tempos registrados foram preservados.');}
   else if(result.kind==='error')setError(result.message);
 }
 if(timerBusy||(!drafts.length&&!error))return null;
 return <section className="panel draft-recovery" aria-label="Registros pendentes"><span className="eyebrow">SEU REGISTRO FOI PRESERVADO</span><h2>Retome de onde é possível.</h2><p className="muted">Uma preparação foi interrompida. Tempos só são recuperados quando o resultado completo chegou a ser gravado; uma interrupção nunca vira um tempo estimado.</p>
  {drafts.map(draft=><div className="draft-recovery-row" key={draft.id}><div><strong>{draft.solve?formatTime(draft.solve.rawMs):'Preparação interrompida'}</strong><p>{modeLabel(draft.capture.mode)} · {cloud.data?.sessions.find(session=>session.id===draft.capture.sessionId)?.name??'Sessão original'}</p>{draft.solve&&<p className="muted small">{draft.solve.source==='manual'?'Entrada manual':'Cronômetro'} · {new Date(draft.solve.createdAt).toLocaleString('pt-BR')} · {draft.solve.penalty==='none'?'Sem penalidade':draft.solve.penalty}</p>}</div><div className="dialog-actions">{draft.state==='completed'&&draft.solve&&<button className="button" disabled={pending} onClick={()=>void resume(draft)}>Salvar resultado recuperado</button>}<button className="button secondary" disabled={pending} onClick={()=>void discard(draft)}>{draft.solve?'Descartar resultado':'Descartar preparação'}</button></div></div>)}
  {error&&<p className="error-text" role="alert">{error}</p>}
 </section>;
}
