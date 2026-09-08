import {useEffect,useRef,useState,useId} from 'react';
import {ArrowLeft,ArrowRightLeft,ShieldCheck} from 'lucide-react';
import {useData} from './AppContext';
import type {ContextHandle,Failure} from '../cloud/types';
import type {CloudSyncAPI,ReconciliationPreview,SyncConflict,SyncStatus,SyncChoiceResult} from '../cloud/sync-types';

const same=(a:ContextHandle|null,b:ContextHandle|null)=>!!a&&!!b&&a.projectRef===b.projectRef&&a.userId===b.userId&&a.generation===b.generation;
const entityNames:Record<string,string>={session:'sessões',solve:'resoluções',progress:'progresso',study:'estudos',settings:'preferências'};
type Choice='remote'|'merge';
export default function SyncReview({api,phase}:{api:CloudSyncAPI;phase:SyncStatus}){
 const {cloud,service,authAction,notify,timerBusy,saving}=useData();
 const context=cloud.context;const formId=useId();
 const [preview,setPreview]=useState<ReconciliationPreview|null>(null);
 const [conflicts,setConflicts]=useState<SyncConflict[]|null>(null);
 const [selected,setSelected]=useState<SyncConflict|null>(null);
 const [choice,setChoice]=useState<Choice>('merge');
 const [conflictChoice,setConflictChoice]=useState<'remote'|'local'>('remote');
 const [confirmed,setConfirmed]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const visible=()=>mounted.current&&same(context,service.getSnapshot().context);
 const available=phase!=='unavailable'&&cloud.accountImport==='available';
 const blocked=timerBusy||saving||pending||!available;
 async function request<T>(action:(captured:ContextHandle)=>Promise<T|Failure>,write=false):Promise<T|Failure|null>{
  if(!context||!context.userId||blocked)return null;
  const captured=context;setPending(true);setError('');
  try{
   const result=write?await authAction(()=>action(captured)):await action(captured);
   if(!visible()||service.getSnapshot().sync==='unavailable'||service.getSnapshot().accountImport!=='available')return null;
   if(result&&typeof result==='object'&&'kind'in result&&result.kind==='error')setError((result as Failure).message);
   return result;
  }catch{if(visible())setError('Não foi possível concluir a revisão. Seus dados anteriores continuam preservados.');return null;}
  finally{if(visible())setPending(false);}
 }
 async function loadConflicts(){const result=await request(captured=>api.listSyncConflicts(captured));if(result?.kind==='conflicts')setConflicts(result.conflicts);}
 useEffect(()=>{if(phase==='conflict'&&conflicts===null&&!blocked)void loadConflicts();},[phase,conflicts,timerBusy,saving]);
 async function openPreview(source:'account'|'guest'){
  const result=await request(captured=>source==='account'?api.previewAccountReconciliation({context:captured}):api.previewGuestAdoption({context:captured}));
  if(result?.kind==='preview'){setPreview(result.preview);setSelected(null);setConfirmed(false);setChoice('merge');}
 }
 function accepted(result:SyncChoiceResult|null){
  if(result?.kind!=='queued')return;
  setPreview(null);setSelected(null);setConflicts(null);setConfirmed(false);
  notify(result.operationId?'Escolha registrada neste dispositivo. Acompanhe a confirmação no servidor.':'Escolha aplicada. Confira o estado dos seus dados.');
 }
 async function confirmPreview(){
  if(!preview||!confirmed)return;
  const capturedPreview=preview;
  const result=await request(captured=>capturedPreview.source==='guest'?api.confirmGuestAdoption({context:captured,previewId:capturedPreview.previewId}):api.confirmAccountReconciliation({context:captured,previewId:capturedPreview.previewId,choice}),true);
  if(result?.kind==='error')setConfirmed(false);
  accepted(result);
 }
 async function confirmConflict(){
  if(!selected||!confirmed)return;
  const capturedConflict=selected;
  const result=await request(captured=>api.resolveSyncConflict({context:captured,conflictId:capturedConflict.id,choice:conflictChoice,expectedRemoteRevision:capturedConflict.expectedRemoteRevision}),true);
  if(result?.kind==='error'){setConfirmed(false);setConflicts(null);}
  accepted(result);
 }
 const back=()=>{setPreview(null);setSelected(null);setConfirmed(false);setError('');};
 if(!context?.userId)return null;
 if(!available)return <section className="sync-review" aria-label="Dados de visitante" data-testid="sync-review"><h3>Dados de visitante</h3><p>A transferência para sua conta ainda não está disponível nesta versão. Os dados de visitante continuam separados neste dispositivo.</p><button className="text-button" data-testid="sync-preview-guest" disabled>Conferir dados de visitante</button></section>;
 return <section className="sync-review" aria-label="Revisão dos dados da conta" data-testid="sync-review">
  {error&&<p className="error-text" role="alert">{error} Atualize a prévia se os dados tiverem mudado.</p>}
  {preview?<>
   <button className="text-button" disabled={blocked} onClick={back}><ArrowLeft size={15}/> Voltar</button>
   <h3>{preview.source==='guest'?'Adicionar seus dados de visitante':'Como começar nesta conta?'}</h3>
   <p>{preview.source==='guest'?'Confira os dados locais que deseja adicionar à conta conectada. Entrar não faz essa transferência automaticamente.':'Este dispositivo já tem dados da conta. Confira as duas cópias antes de começar a sincronização automática.'}</p>
   <div className="sync-counts"><table><caption>Prévia dos dados</caption><thead><tr><th>Conteúdo</th><th>{preview.source==='guest'?'Visitante':'Dispositivo'}</th><th>Servidor</th></tr></thead><tbody>{(['sessions','solves','progress','study'] as const).map((key,index)=><tr key={key}><th>{['Sessões','Resoluções','Progresso','Estudos'][index]}</th><td>{preview.local[key]}</td><td>{preview.remote[key]}</td></tr>)}</tbody></table></div>
   {preview.collisions>0&&<p className="sync-warning">{preview.collisions} {preview.collisions===1?'colisão encontrada':'colisões encontradas'}. Confira o aviso da prévia antes de continuar.</p>}
   {preview.warning&&<p className="sync-warning">{preview.warning}</p>}
   {preview.source==='account'&&<fieldset className="sync-choices" disabled={blocked}><legend>Escolha como continuar</legend><label className="checkbox-label"><input type="radio" name={`${formId}-reconciliation-choice`} checked={choice==='merge'} onChange={()=>{setChoice('merge');setConfirmed(false);}}/><span><strong>Combinar os dados</strong><small>Solicita a combinação apresentada nesta prévia.</small></span></label><label className="checkbox-label"><input type="radio" name="reconciliation-choice" checked={choice==='remote'} onChange={()=>{setChoice('remote');setConfirmed(false);}}/><span><strong>Usar os dados do servidor</strong><small>Substitui a cópia desta conta neste dispositivo pela versão do servidor.</small></span></label></fieldset>}
   <label className="sync-consent checkbox-label"><input type="checkbox" checked={confirmed} disabled={blocked} onChange={event=>setConfirmed(event.target.checked)}/><span>Revisei esta prévia e autorizo {preview.source==='guest'?'adicionar estes dados à conta conectada':choice==='remote'?'usar a versão do servidor neste dispositivo':'combinar estas cópias'}.</span></label>
   <button className="button" data-testid="sync-confirm-preview" disabled={blocked||!confirmed} onClick={()=>void confirmPreview()}>{pending?'Aplicando escolha…':'Confirmar escolha'}</button>
  </>:selected?<>
   <button className="text-button" disabled={blocked} onClick={back}><ArrowLeft size={15}/> Voltar</button><h3>Resolver alterações diferentes</h3>
   <p>{selected.localChangeCount} {selected.localChangeCount===1?'alteração local':'alterações locais'} em {selected.entities.map(value=>entityNames[value]??'dados da conta').join(', ')}.</p>
   <p>Escolha a cópia que deseja manter. Se ela mudar enquanto você decide, uma nova revisão será necessária.</p>
   <fieldset className="sync-choices" disabled={blocked}><legend>Qual versão manter?</legend><label className="checkbox-label"><input type="radio" name={`${formId}-conflict-choice`} checked={conflictChoice==='remote'} onChange={()=>{setConflictChoice('remote');setConfirmed(false);}}/><span><strong>Versão do servidor</strong><small>Abandona as alterações locais deste conflito.</small></span></label><label className="checkbox-label"><input type="radio" name="conflict-choice" checked={conflictChoice==='local'} onChange={()=>{setConflictChoice('local');setConfirmed(false);}}/><span><strong>Alterações deste dispositivo</strong><small>Solicita o envio com base na revisão apresentada.</small></span></label></fieldset>
   <label className="sync-consent checkbox-label"><input type="checkbox" checked={confirmed} disabled={blocked} onChange={event=>setConfirmed(event.target.checked)}/><span>Revisei o alcance e confirmo esta escolha.</span></label>
   <button className="button" data-testid="sync-confirm-conflict" disabled={blocked||!confirmed} onClick={()=>void confirmConflict()}>{pending?'Aplicando escolha…':'Confirmar versão'}</button>
  </>:<>
   {phase==='reconciliation-required'&&<div className="sync-onboarding"><ArrowRightLeft size={20}/><div><h3>Seus dados, com continuidade</h3><p>Uma revisão inicial permite começar sem enviar silenciosamente dados já existentes neste dispositivo. Depois dela, as alterações são salvas automaticamente.</p><button className="button secondary" data-testid="sync-preview-account" disabled={blocked} onClick={()=>void openPreview('account')}>Revisar dados desta conta</button></div></div>}
   {phase==='conflict'&&<><h3>Revisar alterações</h3>{conflicts?.map(conflict=><div className="sync-conflict" key={conflict.id}><p>{conflict.localChangeCount} {conflict.localChangeCount===1?'alteração':'alterações'} em {conflict.entities.map(value=>entityNames[value]??'dados').join(', ')}</p><button className="button secondary" disabled={blocked} onClick={()=>{setSelected(conflict);setConfirmed(false);setConflictChoice('remote');}}>Revisar versões</button></div>)}{conflicts?.length===0&&<p>Nenhum conflito pendente nesta leitura.</p>}{error&&<button className="text-button" disabled={blocked} onClick={()=>void loadConflicts()}>Consultar revisão novamente</button>}</>}
   <div className="sync-adoption"><ShieldCheck size={18}/><div><h3>Dados de visitante</h3><p>Adicionar esses dados à conta exige sua confirmação inicial. Nenhuma confirmação é pedida a cada resolução.</p><button className="text-button" data-testid="sync-preview-guest" disabled={blocked||cloud.accountImport!=='available'||phase==='reconciliation-required'} onClick={()=>void openPreview('guest')}>Conferir dados de visitante</button>{cloud.accountImport!=='available'&&<p>A transferência inicial ainda não está disponível neste contexto.</p>}</div></div>
  </>}
  {pending&&<p role="status">Preparando revisão…</p>}
 </section>;
}
