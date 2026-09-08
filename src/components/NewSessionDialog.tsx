import {useState} from 'react';
import type {SolveMode} from '../domain';
import {createSession} from '../data';
import {useData} from './AppContext';
import {modeLabel} from './ModePicker';
export default function NewSessionDialog({mode,onClose,onCreated}:{mode:SolveMode;onClose:()=>void;onCreated?:(sessionId:string)=>void}) {
  const {update,saving}=useData();const [name,setName]=useState('');const [error,setError]=useState('');
  return <div className="modal-backdrop"><form className="modal" role="dialog" aria-modal="true" aria-label="Nova sessão" onSubmit={async event=>{event.preventDefault();if(saving)return;let createdId:string|null=null;if((await update(previous=>{const next=createSession(previous,name,mode);createdId=next.activeSessionId;return next;})).kind==='committed'){if(createdId)onCreated?.(createdId);onClose();}else setError('Não foi possível criar a sessão. Confira o nome e o armazenamento antes de tentar novamente.');}}>
    <span className="eyebrow">3×3 · {modeLabel(mode)}</span><h2>Seu próximo treino começa aqui.</h2><p className="muted">Os tempos desta sessão terão médias e recordes de {modeLabel(mode).toLowerCase()}.</p>
    <label>Nome da sessão<input autoFocus required maxLength={80} value={name} onChange={event=>setName(event.target.value)} placeholder="Ex.: Treino da semana"/></label>
    {error&&<p role="alert" className="error-text">{error}</p>}<div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button" disabled={!name.trim()||saving}>Criar sessão</button></div>
  </form></div>;
}
