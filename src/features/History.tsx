import {useMemo,useState} from 'react';
import {Download,Trash2,Pencil,Plus} from 'lucide-react';
import {selectSessions,selectSolves,scopedStatistics,scopedChartData,globalRecords,formatMetric,formatTime,effectiveMs,parseManualTime} from '../domain';
import type {Solve,Penalty,StoredSolveMode,SolveMode,SolveScope,Metric} from '../domain';
import {renameSession,deleteSession,updateSolve,deleteSolve,restoreSolve,exportCSV,parseBackup} from '../data';
import {useData} from '../components/AppContext';
import ModePicker,{modeLabel} from '../components/ModePicker';
import NewSessionDialog from '../components/NewSessionDialog';
import SessionClassification from '../components/SessionClassification';
import HistoryChart from '../components/HistoryChart';
export function downloadFile(content:string,name:string,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export default function HistoryPage() {
 const {data,cloud,service,update,notify,timerBusy}=useData();
 const active=data.sessions.find(s=>s.id===data.activeSessionId);
 const [mode,setMode]=useState<StoredSolveMode>(active?.mode??null);
 const [sessionId,setSessionId]=useState<string|null>(active?.id??null);
 const [view,setView]=useState<'session'|'mode'>('session');
 const [selected,setSelected]=useState<string|null>(null),[removed,setRemoved]=useState<Solve|null>(null);
 const [newSession,setNewSession]=useState<SolveMode|null>(null),[classification,setClassification]=useState<string|null>(null);
 const sessions=useMemo(()=>selectSessions(data,mode),[data.sessions,mode]);
 const session=sessions.find(s=>s.id===sessionId)??sessions[0];
 const scope=useMemo<SolveScope>(()=>view==='session'&&session?{kind:'session',sessionId:session.id,mode}:{kind:'mode',mode},[view,session?.id,mode]);
 const solves=useMemo(()=>selectSolves(data,scope),[data.solves,data.sessions,scope]);
 const stats=useMemo(()=>scopedStatistics(data,scope),[data.solves,data.sessions,scope]);
 const records=useMemo(()=>scope.kind==='mode'&&mode!==null?globalRecords(data,mode):null,[data.solves,data.sessions,scope,mode]);
 const chart=useMemo(()=>scopedChartData(data,scope),[data.solves,data.sessions,scope]);
 const solve=solves.find(s=>s.id===selected);
 const legacyCount=useMemo(()=>selectSolves(data,{kind:'mode',mode:null}).length,[data.solves,data.sessions]);
 const classificationSession=data.sessions.find(s=>s.id===classification&&s.mode===null);
 async function downloadCSV(exportScope:SolveScope|{kind:'all'},name:string){
   if(!cloud.context)return;
   const result=await service.exportBackup(cloud.context);
   if(service.getSnapshot().context?.generation!==cloud.context.generation)return;
   if(result.kind==='error'){notify(result.message);return;}
   try{downloadFile(exportCSV(parseBackup(result.text),exportScope),name,'text/csv;charset=utf-8');}catch{notify('Não foi possível exportar este recorte. Confira a sessão e tente novamente.');}
 }
 function chooseMode(value:StoredSolveMode){setMode(value);setSessionId(null);setSelected(null);}
 const title=scope.kind==='session'?session!.name:modeLabel(mode);
 const metrics:[string,Metric][]=[['Melhor single',records?.bestSingle??stats.best],[scope.kind==='session'?'Média da sessão':`Média · ${modeLabel(mode)}`,stats.mean],...([5,12,50,100] as const).map(n=>[scope.kind==='mode'?`Melhor ao${n}`:`ao${n}`,scope.kind==='mode'?(records?.bestAverages[n]??stats.bestAverages[n]):stats.averages[n]] as [string,Metric])];
 return <>
  <ModePicker value={mode} onChange={chooseMode} legacy disabled={timerBusy}/>
  {legacyCount>0&&mode!==null&&<div className="legacy-notice">{legacyCount} {legacyCount===1?'resolução anterior continua preservada':'resoluções anteriores continuam preservadas'}, sem modalidade. <button className="text-button" onClick={async()=>chooseMode(null)}>Revisar não classificados</button></div>}
  {mode===null&&<section className="panel legacy-panel"><span className="eyebrow">HISTÓRICO PRESERVADO</span><h2>Não classificados</h2><p className="muted">Esses registros não entram nas médias ou recordes de Duas mãos e Uma mão. Você pode classificar uma sessão inteira quando tiver certeza de sua modalidade. Sessões misturadas ou incertas podem continuar aqui.</p></section>}
  <div className="workspace-toolbar"><select className="session-picker" aria-label="Sessão do histórico" value={session?.id??''} disabled={!sessions.length} onChange={e=>{setSessionId(e.target.value);setSelected(null);}}>{!sessions.length&&<option value="">Nenhuma sessão neste recorte</option>}{sessions.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select>
   <button className="icon-button" aria-label="Criar sessão" disabled={mode===null} onClick={async()=>setNewSession(mode)}><Plus size={17}/></button>
   <button className="icon-button" aria-label="Renomear sessão" disabled={!session} onClick={async()=>{if(!session)return;const name=prompt('Novo nome da sessão',session.name);if(name?.trim())update(p=>renameSession(p,session.id,name.trim()));}}><Pencil size={16}/></button>
   <button className="icon-button" aria-label="Excluir sessão" disabled={!session} onClick={async()=>{if(session&&confirm(`Excluir a sessão ${session.name} e seus registros?`))if((await update(p=>deleteSession(p,session.id))).kind==='committed'){setSessionId(null);setSelected(null);}}}><Trash2 size={16}/></button>
   {session?.mode===null&&<button className="button secondary" onClick={async()=>setClassification(session.id)}>Classificar sessão inteira</button>}
   <button className="button secondary toolbar-end" onClick={async()=>downloadCSV(scope,`nexus-cube-${mode??'unclassified'}.csv`)}><Download size={15}/> CSV deste recorte</button>
  </div>
  {!sessions.length&&mode!==null&&<section className="panel training-onboarding"><h2>Seu primeiro treino de {modeLabel(mode).toLowerCase()}</h2><p className="muted">Crie uma sessão para começar a acompanhar esta modalidade.</p><button className="button" onClick={async()=>setNewSession(mode)}>Criar sessão</button></section>}
  <div className="history-scope"><div className="segmented"><button className={scope.kind==='session'?'selected':''} disabled={!session} onClick={async()=>setView('session')}>Nesta sessão</button><button className={scope.kind==='mode'?'selected':''} onClick={async()=>setView('mode')}>{mode===null?'Histórico não classificado':`Recordes de ${modeLabel(mode).toLowerCase()}`}</button></div><span className="status-pill">3×3 · {modeLabel(mode)} · {scope.kind==='session'?'Sessão':'Todas as sessões deste recorte'}</span></div>
  <section className="stats-grid history-stats">{metrics.map(([label,metric])=><div className="stat-card" key={label}><span>{label}</span><strong>{formatMetric(metric)}</strong></div>)}</section>
  <div className="summary-line"><span>{stats.count} resoluções</span><span>{stats.dnfCount} DNF</span><span>{formatTime(stats.totalRawMs)} de prática</span>{([5,12,50,100] as const).map(n=><span key={n}>Melhor ao{n}: {formatMetric(stats.bestAverages[n])}</span>)}</div>
  <HistoryChart chart={chart}/>
  <section className="panel history-table"><div className="panel-heading"><h2>{title} <span className="muted">({solves.length})</span></h2><span className="muted small">Selecione para editar</span></div>{solves.length?<div className="table-scroll"><table><thead><tr><th>#</th><th>Tempo</th><th>Penalidade</th><th>Data</th>{scope.kind==='mode'&&<th>Sessão</th>}<th>Nota</th><th/></tr></thead><tbody>{solves.slice().reverse().map((s,i)=><tr key={s.id}><td>{solves.length-i}</td><td><button className="solve-link" onClick={async()=>setSelected(s.id)}>{formatTime(effectiveMs(s))}</button></td><td>{s.penalty==='none'?'Sem penalidade':s.penalty}</td><td>{new Date(s.createdAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</td>{scope.kind==='mode'&&<td>{sessions.find(session=>session.id===s.sessionId)?.name}</td>}<td className="note-cell">{s.note||'Sem nota'}</td><td><button className="icon-button" aria-label={`Detalhes da resolução ${solves.length-i}`} onClick={async()=>setSelected(s.id)}><Pencil size={15}/></button></td></tr>)}</tbody></table></div>:<p className="empty-copy">Nenhum tempo neste recorte. Seu próximo treino começa no Timer.</p>}</section>
  <details className="policy"><summary>Como calculamos suas médias</summary><p>ao5 e ao12 descartam 1 melhor e 1 pior resultado; ao50 descarta 3 de cada lado; ao100 descarta 5. DNF conta como pior. Se restar um DNF após o corte, a média é DNF. A média simples considera todos os tempos do recorte e resulta DNF se houver qualquer DNF. +2 afeta o resultado efetivo, preservando o tempo bruto. Recordes e séries de ao5 respeitam as sessões e a modalidade. Dados não classificados ficam separados.</p></details>
  <details className="policy"><summary>Exportar todas as modalidades</summary><p>O CSV completo inclui Duas mãos, Uma mão e Não classificados, com identificação de sessão e modalidade em cada registro.</p><button className="button secondary" onClick={async()=>downloadCSV({kind:'all'},'nexus-cube-todas-modalidades.csv')}>CSV completo</button></details>
  {removed&&<div className="undo-bar" role="status">Resolução excluída.<button className="text-button" onClick={async()=>{if((await update(p=>restoreSolve(p,removed))).kind==='committed')setRemoved(null);}}>Desfazer</button><button className="icon-button" aria-label="Dispensar desfazer" onClick={async()=>setRemoved(null)}>×</button></div>}
  {solve&&<div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-label="Detalhes da resolução"><div className="panel-heading"><h2>{formatTime(effectiveMs(solve))}</h2><button className="icon-button" aria-label="Fechar detalhes" onClick={async()=>setSelected(null)}>×</button></div><p className="capture-context">3×3 · {modeLabel(solve.mode)} · {sessions.find(s=>s.id===solve.sessionId)?.name}</p><p className="muted">Tempo bruto: {formatTime(solve.rawMs)} · {solve.source==='manual'?'Entrada manual':'Timer'}</p><label>Penalidade<select value={solve.penalty} onChange={e=>{const penalty=e.target.value as Penalty;void update(p=>updateSolve(p,solve.id,{penalty}));}}><option value="none">Sem penalidade</option><option value="+2">+2 segundos</option><option value="DNF">DNF</option></select></label>{solve.source==='manual'&&<button className="text-button" onClick={async()=>{const value=prompt('Corrigir tempo bruto',formatTime(solve.rawMs));if(value!==null)try{const rawMs=parseManualTime(value);update(p=>updateSolve(p,solve.id,{rawMs}));}catch(e){notify(String(e));}}}>Corrigir entrada manual</button>}<label>Notas<textarea value={solve.note} maxLength={5000} onChange={e=>{const note=e.target.value;void update(p=>updateSolve(p,solve.id,{note}));}}/></label><label>Embaralhamento<p className="algorithm-text">{solve.scramble}</p></label><div className="dialog-actions"><button className="button danger" onClick={async()=>{let deleted:Solve|null=null;if((await update(p=>{const result=deleteSolve(p,solve.id);deleted=result.removed;return result.data;})).kind==='committed'){setRemoved(deleted);setSelected(null);}}}>Excluir resolução</button><button className="button" onClick={async()=>setSelected(null)}>Concluir</button></div></div></div>}
  {newSession&&<NewSessionDialog mode={newSession} onCreated={id=>{setMode(newSession);setSessionId(id);setView('session');}} onClose={()=>setNewSession(null)}/>}
  {classificationSession&&<SessionClassification session={classificationSession} onClose={()=>setClassification(null)}/>}
 </>;
}
