import {useState} from 'react';
import type {Session,SessionClassificationPreview,SolveMode} from '../domain';
import {previewSessionClassification,applySessionClassification} from '../data';
import {useData} from './AppContext';
import ModePicker,{modeLabel} from './ModePicker';
export default function SessionClassification({session,onClose}:{session:Session;onClose:()=>void}) {
  const {data,update,notify,saving}=useData();const [mode,setMode]=useState<SolveMode|null>(null);const [preview,setPreview]=useState<SessionClassificationPreview|null>(null);const [confirmed,setConfirmed]=useState(false);const [error,setError]=useState('');
  function review(){if(!mode)return;try{setPreview(previewSessionClassification(data,session.id,mode));setConfirmed(false);setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}}
  return <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-label="Classificar sessão inteira">
    <span className="eyebrow">REGISTROS ANTERIORES</span><h2>Classificar a sessão inteira</h2><p><strong>{session.name}</strong></p>
    <p className="muted">Faça isso somente se todos os tempos desta sessão foram resolvidos na mesma modalidade. Se ela é misturada ou você não tem certeza, mantenha sem classificação e crie uma nova sessão para os próximos treinos.</p>
    <ModePicker value={mode} onChange={value=>{setMode(value);setPreview(null);setConfirmed(false);setError('');}}/>
    {!preview?<button className="button" disabled={!mode} onClick={review}>Revisar classificação</button>:<div className="classification-preview">
      <p><strong>{preview.solveCount} {preview.solveCount===1?'resolução':'resoluções'}</strong> {preview.solveCount===1?'passará':'passarão'} de Não classificados para <strong>{modeLabel(preview.targetMode)}</strong>.</p><p className="muted small">{preview.plus2Count} com +2 · {preview.dnfCount} DNF. Tempos, datas, notas, embaralhamentos e identificação dos registros serão preservados.</p>
      <label className="check-label"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Confirmo que a sessão inteira pertence a {modeLabel(preview.targetMode).toLowerCase()}.</label>
      <button className="button" disabled={!confirmed||saving} onClick={async()=>{if((await update(previous=>applySessionClassification(previous,preview))).kind==='committed'){notify('Sessão classificada. Seus registros foram preservados.');onClose();}else{setError('Não foi possível classificar. Se os registros mudaram, revise a prévia. Em caso de falha de armazenamento, seus dados anteriores continuam preservados.');setConfirmed(false);}}}>Confirmar classificação</button>
      {error&&<button className="text-button" onClick={review}>Atualizar prévia</button>}
    </div>}
    {error&&<p className="error-text" role="alert">{error}</p>}<button className="button secondary" onClick={onClose}>Manter sem classificação</button>
  </div></div>;
}
