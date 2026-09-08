import {useState,useEffect,useRef,useCallback,useMemo} from 'react';
import {Copy,Shuffle,Focus,Keyboard,Plus,ArrowRight,Timer as TimerIcon,Box} from 'lucide-react';
import {generateScramble,inspectionPenalty,formatTime,formatMetric,parseManualTime,effectiveMs,selectSessions,selectSolves,scopedStatistics,beginSolveCapture} from '../domain';
import type {Scramble,Penalty,SolveMode,SolveCapture} from '../domain';
import {setActiveSession} from '../data';
import {useData} from '../components/AppContext';
import CubeView from '../components/CubeView';
import ModePicker,{modeLabel} from '../components/ModePicker';
import type {CaptureHandle} from '../cloud/types';
import TimerPreferences from '../components/TimerPreferences';
import NewSessionDialog from '../components/NewSessionDialog';
type Phase='arming'|'armed'|'cancelling'|'cancel-error'|'idle'|'holding'|'ready'|'inspection'|'running'|'manual'|'pending';
type PendingSolve=SolveCapture&{rawMs:number;penalty:Penalty;source:'timer'|'manual';createdAt:string};
export default function TimerPage({navigate}:{navigate:(area:'history'|'algorithms')=>void}) {
 const {data,update,notify,setTimerBusy,beginCapture,completeCapture,finishCapture,cancelCapture,saving}=useData();
 const session=data.sessions.find(s=>s.id===data.activeSessionId);
 const [mode,setMode]=useState<SolveMode|null>(session?.mode??null);
 const [newSession,setNewSession]=useState(false);
 useEffect(()=>{setMode(session?.mode??null);},[session?.id,session?.mode]);
 const sessions=useMemo(()=>mode?selectSessions(data,mode):[],[data.sessions,mode]);
 const canCapture=!!mode&&session?.mode===mode&&!newSession;
 const [scramble,setScramble]=useState<Scramble|null>(null);
 const [scrambleError,setScrambleError]=useState('');
 const [phase,setPhase]=useState<Phase>('idle');const phaseRef=useRef<Phase>('idle');
 const [elapsed,setElapsed]=useState(0);const [manual,setManual]=useState(false);const [manualText,setManualText]=useState('');const [manualError,setManualError]=useState('');const [preview,setPreview]=useState(false);
 const [pending,setPending]=useState<PendingSolve|null>(null);
 useEffect(()=>{if(phaseRef.current==='idle')setElapsed(0);},[session?.id,session?.mode,mode]);
 const started=useRef(0),inspectionStarted=useRef<number|null>(null),holding=useRef<ReturnType<typeof setTimeout>|null>(null),held=useRef(false);
 const cloudCapture=useRef<CaptureHandle|null>(null),saveInFlight=useRef(false),cancelInFlight=useRef(false);
 const gestureId=useRef(0),holdStarted=useRef(0);
 const locked=useRef<SolveCapture|null>(null),penaltyRef=useRef<Penalty>('none');
 const queued=useRef<Promise<Scramble>|null>(null),callGeneration=useRef(0),alive=useRef(true),beeps=useRef(new Set<number>()),config=useRef(data.settings);
 const capturedSessionName=useRef('');
 if(phaseRef.current==='idle')config.current=data.settings;
 const changePhase=(value:Phase)=>{phaseRef.current=value;setPhase(value);setTimerBusy(value!=='idle');};
 const nextScramble=useCallback(async()=>{const call=++callGeneration.current;setScrambleError('');setScramble(null);try{const next=await(queued.current??generateScramble());queued.current=null;if(alive.current&&call===callGeneration.current)setScramble(next);}catch(e){if(alive.current&&call===callGeneration.current)setScrambleError(String(e));}},[]);
 useEffect(()=>{alive.current=true;void nextScramble();return()=>{alive.current=false;setTimerBusy(false);if(holding.current)clearTimeout(holding.current);};},[nextScramble]);
 function beep(){if(!config.current.inspectionSound)return;try{const ctx=new AudioContext();const osc=ctx.createOscillator();const gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);gain.gain.value=.12;osc.frequency.value=700;osc.start();osc.stop(ctx.currentTime+.12);osc.onended=()=>void ctx.close();}catch{}}
 useEffect(()=>{let frame=0;const tick=()=>{const p=phaseRef.current;if(p==='running')setElapsed(performance.now()-started.current);if(inspectionStarted.current!==null&&['inspection','holding','ready'].includes(p)){const ms=performance.now()-inspectionStarted.current;setElapsed(ms);for(const mark of [8,12])if(ms>=mark*1000&&!beeps.current.has(mark)){beeps.current.add(mark);beep();notify(`Inspeção: ${mark} segundos.`);}}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[]);
 function resetCapture(){gestureId.current++;held.current=false;if(holding.current)clearTimeout(holding.current);holding.current=null;locked.current=null;cloudCapture.current=null;inspectionStarted.current=null;penaltyRef.current='none';setPending(null);setManual(false);setManualError('');changePhase('idle');}
 async function clearCapture(){
   if(saveInFlight.current||cancelInFlight.current)return;
   held.current=false;gestureId.current++;
   if(holding.current)clearTimeout(holding.current);holding.current=null;
   const handle=cloudCapture.current;
   if(!handle){if(phaseRef.current!=='arming'&&alive.current)resetCapture();return;}
   cancelInFlight.current=true;changePhase('cancelling');
   try{const result=await cancelCapture(handle);if(!alive.current)return;if(result.kind==='cancelled')resetCapture();else{changePhase('cancel-error');notify(result.kind==='error'?result.message:'O cancelamento não foi confirmado.');}}
   finally{cancelInFlight.current=false;}
 }
 function readyAfterHold(gesture:number){
   if(!held.current||gesture!==gestureId.current||!cloudCapture.current)return;
   const remaining=config.current.holdMs-(performance.now()-holdStarted.current);
   if(remaining<=0){changePhase('ready');return;}
   changePhase('holding');
   holding.current=setTimeout(()=>{holding.current=null;if(alive.current&&held.current&&gesture===gestureId.current&&cloudCapture.current)changePhase('ready');},remaining);
 }
 async function capture(source:'timer'|'manual',gesture?:number):Promise<boolean>{
   if(!canCapture||!session||!mode||!scramble||saving){held.current=false;return false;}
   config.current={...data.settings};capturedSessionName.current=session.name;
   changePhase('arming');if(source==='manual')held.current=false;
   try{const captured=beginSolveCapture(data,{sessionId:session.id,mode,scramble:scramble.algorithm});const result=await beginCapture(captured,source);
     if(result.kind!=='armed'){if(alive.current){notify(result.kind==='error'?result.message:'Não foi possível preparar o registro.');resetCapture();}return false;}
     if(!alive.current){void cancelCapture(result.capture);return false;}
     locked.current=captured;cloudCapture.current=result.capture;penaltyRef.current='none';
     if(source==='manual'){changePhase('manual');return true;}
     if(gesture!==gestureId.current||!held.current){await clearCapture();return false;}
     readyAfterHold(gesture);return true;
   }catch(e){if(alive.current){notify(e instanceof Error?e.message:String(e));resetCapture();}return false;}
 }
 async function save(result:PendingSolve){
   if(saveInFlight.current||!cloudCapture.current)return;
   saveInFlight.current=true;setPending(result);setManual(false);changePhase('pending');
   try{
     const handle=cloudCapture.current;
     const draft=await completeCapture(handle,{rawMs:result.rawMs,penalty:result.penalty,note:''});
     if(draft.kind!=='draft-saved'){if(alive.current)notify(draft.kind==='error'?draft.message:'A preservação do resultado ainda não foi confirmada.');return;}
     const saved=await finishCapture(handle);
     if(!alive.current)return;
     if(saved.kind==='committed'){setElapsed(result.rawMs);resetCapture();setManualText('');notify(`${modeLabel(result.mode)} · Resolução registrada.`);void nextScramble();}
     else notify(saved.message+' O tempo continua aguardando gravação.');
   }finally{saveInFlight.current=false;}
 }
 const stop=()=>{if(!locked.current)return;const rawMs=Math.max(1,Math.round(performance.now()-started.current));inspectionStarted.current=null;setElapsed(rawMs);void save({...locked.current,rawMs,penalty:penaltyRef.current,source:'timer',createdAt:new Date().toISOString()});};
 const press=()=>{
   if(held.current||saving||['arming','manual','pending','cancelling','cancel-error'].includes(phaseRef.current)||newSession)return;
   if(phaseRef.current==='running'){held.current=true;stop();return;}
   if(phaseRef.current==='idle'){
     if(!canCapture||!scramble)return;
     held.current=true;holdStarted.current=performance.now();const gesture=++gestureId.current;void capture('timer',gesture);return;
   }
   if(phaseRef.current!=='inspection')return;
   held.current=true;holdStarted.current=performance.now();readyAfterHold(++gestureId.current);
 };
 const release=()=>{
   if(!held.current)return;
   held.current=false;if(holding.current){clearTimeout(holding.current);holding.current=null;}
   const current=phaseRef.current;
   const ready=current==='ready'||(current==='holding'&&!!cloudCapture.current&&performance.now()-holdStarted.current>=config.current.holdMs);
   if(!ready){
     if(current==='arming'){gestureId.current++;return;}
     if(current==='holding'){gestureId.current++;if(inspectionStarted.current!==null)changePhase('inspection');else void clearCapture();}
     return;
   }
   if(!locked.current)return;
   if(config.current.inspection&&inspectionStarted.current===null){inspectionStarted.current=performance.now();beeps.current.clear();setElapsed(0);changePhase('inspection');queued.current=generateScramble();queued.current.catch(()=>{});return;}
   penaltyRef.current=inspectionStarted.current===null?'none':inspectionPenalty(performance.now()-inspectionStarted.current);
   if(!queued.current){queued.current=generateScramble();queued.current.catch(()=>{});}
   started.current=performance.now();setElapsed(0);changePhase('running');
 };
 const cancelHold=()=>{
   held.current=false;gestureId.current++;if(holding.current)clearTimeout(holding.current);holding.current=null;
   const current=phaseRef.current;
   if(current==='holding'||current==='ready'){if(inspectionStarted.current!==null)changePhase('inspection');else void clearCapture();}
 };
 const handlers=useRef({press,release,cancelHold});handlers.current={press,release,cancelHold};
 useEffect(()=>{const interactive=(t:EventTarget|null)=>t instanceof Element&&((t instanceof HTMLElement&&t.isContentEditable)||!!t.closest('input,textarea,select,button,a,[contenteditable],[role="button"],[role="dialog"],[tabindex]:not(.timer-stage)'));const down=(e:KeyboardEvent)=>{if(e.code!=='Space'||e.repeat||interactive(e.target)||document.querySelector('[role="dialog"]'))return;e.preventDefault();handlers.current.press();};const up=(e:KeyboardEvent)=>{if(e.code!=='Space')return;if(interactive(e.target)){handlers.current.cancelHold();return;}e.preventDefault();handlers.current.release();};const cancel=()=>handlers.current.cancelHold();window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',cancel);return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',cancel);};},[]);
 const captureSettings=config.current;
 useEffect(()=>{document.body.classList.toggle('timer-focus',captureSettings.focus&&['running','inspection','ready','holding'].includes(phase));return()=>document.body.classList.remove('timer-focus');},[captureSettings.focus,phase]);
 const scope=useMemo(()=>session&&mode===session.mode?{kind:'session' as const,sessionId:session.id,mode:session.mode}:null,[session?.id,session?.mode,mode]);
 const solves=useMemo(()=>scope?selectSolves(data,scope):[],[data.solves,scope]);
 const stats=useMemo(()=>scope?scopedStatistics(data,scope):null,[data.solves,data.sessions,scope]);
 const busy=phase!=='idle'||saving;const inspecting=inspectionStarted.current!==null&&phase!=='running';
 const display=inspecting?(elapsed>=17000?'DNF':elapsed>=15000?'+2':String(Math.ceil((15000-elapsed)/1000))):captureSettings.hideRunningTime&&phase==='running'?'Resolvendo':formatTime(elapsed);
 const phaseText=phase==='arming'?'PREPARANDO REGISTRO…':phase==='cancelling'?'CANCELANDO PREPARAÇÃO…':phase==='cancel-error'?'CANCELAMENTO PENDENTE':phase==='pending'?'AGUARDANDO GRAVAÇÃO':phase==='ready'?'SOLTE PARA COMEÇAR':phase==='holding'?'SEGURE MAIS UM POUCO':phase==='inspection'?'INSPEÇÃO EM ANDAMENTO':phase==='running'?'CONCENTRE-SE. VOCÊ CONSEGUE.':canCapture?'SEGURE PARA PREPARAR':'ESCOLHA SUA MODALIDADE E SESSÃO';
 async function chooseMode(value:SolveMode|null){if(busy||!value)return;const available=selectSessions(data,value);if(available.length){if((await update(previous=>setActiveSession(previous,available[0].id))).kind==='committed')setMode(value);}else setMode(value);}
 return <>
  <ModePicker value={mode} onChange={chooseMode} disabled={busy}/>
  {!canCapture&&!busy&&<section className="panel training-onboarding"><span className="eyebrow">CADA MODALIDADE, SEU PROGRESSO</span><h2>{mode?'Crie uma sessão para começar.':'Como você quer treinar hoje?'}</h2><p className="muted">Escolha Duas mãos ou Uma mão e dê um nome ao seu treino. Tempos, médias e recordes ficam separados.</p>{session?.mode===null&&<p className="legacy-notice">Sua sessão anterior está preservada em <strong>Não classificados</strong>. No Histórico, você pode revisá-la sem atribuir uma modalidade automaticamente.</p>}{mode&&<button className="button" onClick={()=>setNewSession(true)}>Criar sessão de {modeLabel(mode).toLowerCase()}</button>}<button className="text-button" onClick={()=>navigate('history')}>Ver registros anteriores <ArrowRight size={15}/></button></section>}
  <div className="workspace-toolbar"><span className="session-dot"/><select aria-label="Sessão ativa" className="session-picker" value={canCapture?session?.id:''} disabled={busy||sessions.length===0} onChange={e=>{const id=e.target.value;void update(previous=>setActiveSession(previous,id));}}><option value="" disabled>{mode?'Escolha uma sessão':'Escolha a modalidade'}</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><span className="muted small">{stats?.count??0} resoluções</span><button className="text-button toolbar-end" disabled={busy||!mode} onClick={()=>setNewSession(true)}><Plus size={15}/> Nova sessão</button></div>
  {busy&&locked.current&&<div className="capture-context" role="status">3×3 · {modeLabel(locked.current.mode)} · {capturedSessionName.current||'Sessão capturada'}{(phase==='inspection'||phase==='armed'||phase==='cancel-error')&&<button className="text-button" onClick={clearCapture} disabled={saving}>Cancelar preparação</button>}</div>}
  {pending&&<section className="panel pending-save" role="alert"><h2>Seu tempo ainda não foi salvo.</h2><strong>{formatTime(pending.rawMs)} · {modeLabel(pending.mode)}</strong><p>O resultado, a sessão e o embaralhamento continuam aqui. Libere espaço e tente novamente.</p><p className="algorithm-text">{pending.scramble}</p><div className="dialog-actions"><button className="button secondary" onClick={()=>{if(confirm('Descartar este tempo ainda não salvo?'))clearCapture();}}>Descartar tempo</button><button className="button" disabled={saving} onClick={()=>void save(pending)}>Tentar salvar novamente</button></div></section>}
<section className="timer-card"><div className="scramble-heading"><span className="eyebrow">EMBARALHAMENTO DE TREINO</span><div className="scramble-actions"><button className="icon-button" disabled={!scramble||busy} aria-label="Copiar embaralhamento" onClick={()=>navigator.clipboard.writeText(scramble!.algorithm).then(()=>notify('Embaralhamento copiado.'),()=>notify('Não foi possível copiar.'))}><Copy size={17}/></button><button className="icon-button" disabled={busy||(!scramble&&!scrambleError)} aria-label="Novo embaralhamento" onClick={()=>void nextScramble()}><Shuffle size={18}/></button></div></div><p className={`scramble-text ${!scramble?'pending':''}`}>{scramble?.algorithm??(scrambleError?'Não foi possível gerar. Use Novo embaralhamento para tentar novamente.':'Preparando o gerador de estados aleatórios…')}</p><div className="scramble-meta"><span>3×3 · amarelo em cima, verde à frente</span><button className="tiny-pill" disabled={!scramble} onClick={()=>setPreview(!preview)}>{preview?'OCULTAR CUBO':'VER ESTADO 3D'}</button></div>{preview&&scramble&&<div className="scramble-cube"><CubeView state={scramble.state}/><span>Arraste para girar a câmera</span></div>}<div className={`timer-stage phase-${phase}`} tabIndex={canCapture?0:-1} aria-disabled={!canCapture||phase==='pending'} aria-label="Cronômetro: mantenha pressionado para preparar, solte para iniciar, pressione para parar" onPointerDown={e=>{if(!e.isPrimary||e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);press();}} onPointerUp={e=>{if(!e.isPrimary)return;e.preventDefault();release();}} onPointerCancel={cancelHold} style={{touchAction:'none',userSelect:'none'}}><div className="ready-label"><span/>{phaseText}</div><div className={`timer-digits ${display.length>9?'long-time':''}`}>{display.includes(',')?<>{display.split(',')[0]}<span className="fraction">,{display.split(',')[1]}</span></>:display}</div><div className="timer-help"><Keyboard size={17}/><span>Segure <kbd>espaço</kbd> para preparar. Solte quando estiver pronto para iniciar.</span></div><p className="touch-help">Segure para preparar. Solte para iniciar.</p></div><div className="timer-footer"><span className="muted small">Inspeção {captureSettings.inspection?'ativada · 15 s':'desativada'}</span><button className="text-button" disabled={busy||!scramble||!canCapture} onClick={async()=>{if(await capture('manual')){setManual(true);setManualError('');}}}>Entrada manual</button><TimerPreferences/></div></section><section className="stats-grid">{[['ÚLTIMO TEMPO',stats?.last],['MELHOR TEMPO',stats?.best],['MÉDIA DE 5',stats?.averages[5]],['MÉDIA DE 12',stats?.averages[12]]].map(([label,metric])=><div className="stat-card" key={String(label)}><span>{String(label)}</span><strong>{metric?formatMetric(metric as import('../domain').Metric):'…'}</strong><small>{String(label).includes('MÉDIA')?'Melhor e pior descartados':'Nesta sessão'}</small></div>)}</section><div className="bottom-grid"><section className="panel"><div className="panel-heading"><h2>Últimas resoluções</h2><button className="text-button" onClick={()=>navigate('history')}>Ver todas <ArrowRight size={15}/></button></div>{solves.length?<div className="recent-times">{solves.slice(-5).reverse().map((s,i)=><div key={s.id}><span>#{solves.length-i}</span><strong>{formatTime(effectiveMs(s))}</strong><small>{s.penalty==='+2'?'+2':new Date(s.createdAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small></div>)}</div>:<div className="empty-inline"><span className="empty-icon"><TimerIcon size={23}/></span><div><strong>O primeiro passo é começar.</strong><p>Seus tempos aparecerão aqui após cada resolução.</p></div></div>}</section><button className="learn-card" onClick={()=>navigate('algorithms')}><div><span className="eyebrow">ALÉM DO CRONÔMETRO</span><h2>Menos pausas.<br/>Mais fluidez.</h2><p>Explore CFOP e Roux <ArrowRight size={16}/></p></div><Box className="learn-cube" size={78} strokeWidth={1}/></button></div>{manual&&<div className="modal-backdrop"><form className="modal" role="dialog" aria-modal="true" aria-label="Entrada manual" onSubmit={event=>{event.preventDefault();try{if(!locked.current)throw new Error('Escolha uma sessão antes de registrar.');const rawMs=parseManualTime(manualText);save({...locked.current,rawMs,penalty:'none',source:'manual',createdAt:new Date().toISOString()});}catch(e){setManualError(e instanceof Error?e.message:String(e));}}}><h2>Adicionar resolução</h2><p className="capture-context">3×3 · {modeLabel(locked.current?.mode??null)} · {capturedSessionName.current}</p><label>Tempo em segundos ou minutos<input autoFocus value={manualText} onChange={e=>setManualText(e.target.value)} placeholder="Ex.: 23.45 ou 1:02.30" required/></label>{manualError&&<p role="alert" className="error-text">{manualError}</p>}<p className="muted">O embaralhamento e a sessão capturados ao abrir este formulário serão associados ao tempo.</p><div className="dialog-actions"><button type="button" className="button secondary" onClick={clearCapture}>Cancelar</button><button className="button">Salvar tempo</button></div></form></div>}{newSession&&mode&&<NewSessionDialog mode={mode} onClose={()=>setNewSession(false)}/>}</>;
}
