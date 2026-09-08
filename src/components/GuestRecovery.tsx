import {useState} from 'react';
import {Download,Upload} from 'lucide-react';
import {parseBackup,STORAGE_KEY} from '../data';
import {selectSolves} from '../domain';
import type {AppData} from '../domain';
import {useData} from './AppContext';
import {downloadFile} from '../features/History';

export default function GuestRecovery(){
 const {cloud,service,recover,timerBusy,saving}=useData();
 const [preview,setPreview]=useState<AppData|null>(null),[error,setError]=useState('');
 if(cloud.status!=='guest'||!cloud.error||!['invalid','storage-error','locked'].includes(cloud.error.code))return null;
 const context=cloud.context;
 function original(){if(service.getSnapshot().status!=='guest')return;try{const text=localStorage.getItem(STORAGE_KEY);if(text===null){setError('Não há fonte original nesta chave de armazenamento.');return;}downloadFile(text,'nexus-cube-armazenamento-original.txt','text/plain;charset=utf-8');}catch{setError('Não foi possível ler a fonte original. Ela não foi modificada.');}}
 async function restore(){if(!preview||timerBusy||saving)return;const result=await recover(preview);if(result.kind==='committed')setPreview(null);else setError(result.message);}
 return <section id="guest-recovery" className="panel draft-recovery" aria-label="Recuperar armazenamento do Timer"><span className="eyebrow">RECUPERAÇÃO DO TIMER</span><h2>Seu conteúdo original foi preservado.</h2><p>O armazenamento de visitante está bloqueado. Baixe uma cópia da fonte antes de restaurar um backup válido. Esta recuperação não transfere dados para uma conta.</p><div className="backup-actions"><button className="button secondary" disabled={timerBusy||saving} onClick={original}><Download size={16}/> Baixar fonte original</button><label className="button secondary file-button"><Upload size={16}/> Selecionar backup<input type="file" accept=".json,application/json" disabled={timerBusy||saving} onChange={async event=>{const file=event.target.files?.[0];event.target.value='';if(!file||!context)return;setPreview(null);try{const text=await file.text();if(service.getSnapshot().context?.generation!==context.generation)return;setPreview(parseBackup(text));setError('');}catch{setError('O backup não pôde ser validado. A fonte original e os dados atuais não foram substituídos.');}}}/></label></div><p className="muted small">A fonte original é uma cópia exata do armazenamento, não um novo backup convertido.</p>{error&&<p className="error-text" role="alert">{error}</p>}{preview&&<div className="classification-preview"><h3>Revisar restauração</h3><p>{preview.sessions.length} sessões, {preview.solves.length} resoluções e {preview.studyAttempts.length} práticas de estudo.</p><p>{selectSolves(preview,{kind:'mode',mode:'two-handed'}).length} de Duas mãos · {selectSolves(preview,{kind:'mode',mode:'one-handed'}).length} de Uma mão · {selectSolves(preview,{kind:'mode',mode:null}).length} não classificados.</p><p>O backup substituirá o espaço local de visitante. A cópia original da chave legada continuará preservada.</p><div className="dialog-actions"><button className="button secondary" disabled={saving} onClick={()=>setPreview(null)}>Cancelar</button><button className="button" disabled={timerBusy||saving} onClick={()=>void restore()}>Confirmar restauração do visitante</button></div></div>}</section>;
}
