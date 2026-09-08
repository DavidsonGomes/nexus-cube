import {contentReference,getPresentationPlayback} from '../components/contentPresentation';
import type {PLLPresentation} from '../components/contentPresentation';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Copy,Eye,Shuffle} from 'lucide-react';
import {drawStudyCase,formatTime,recordStudyAttempt} from '../domain';
import type {LearningContent} from '../domain';
import {useData} from '../components/AppContext';
import StudyCube from '../components/StudyCube';
import Playback from '../components/Playback';
import PreparationCard from '../components/PreparationCard';
import {LessonBrief} from '../components/LearningPath';

export default function StudySession({selection,timed,onBack}: {selection:readonly LearningContent[];timed:boolean;onBack:()=>void}) {
  const {data,update,notify,saving}=useData();
  const [item,setItem]=useState(()=>drawStudyCase(selection));
  const [alternative,setAlternative]=useState('');
  const [pllPresentation,setPLLPresentation]=useState<PLLPresentation>('recognition');
  const [revealed,setRevealed]=useState(false);
  const [duration,setDuration]=useState<number|null>(null);
  const [clock,setClock]=useState(0);
  const [recognition,setRecognition]=useState<'again'|'good'>('good');
  const [execution,setExecution]=useState<'again'|'good'>('good');
  const started=useRef(performance.now());
  const [round,setRound]=useState(0);
  const playback=getPresentationPlayback(item,alternative||item.algorithm,'solve',pllPresentation);
  useEffect(()=>{
    if(!timed||revealed)return;
    const interval=setInterval(()=>setClock(performance.now()-started.current),50);
    return()=>clearInterval(interval);
  },[timed,revealed,round]);
  function next() {
    setItem(drawStudyCase(selection));setAlternative('');setPLLPresentation('recognition');setRevealed(false);setDuration(null);setClock(0);
    started.current=performance.now();setRecognition('good');setExecution('good');setRound(value=>value+1);
  }
  return <>
    <button className="text-button back-button" onClick={onBack}><ArrowLeft size={16}/> Voltar à biblioteca</button>
    <div className="study-heading"><div><span className="eyebrow">PRÁTICA INTENCIONAL</span><h2>Reconheça. Execute. Reflita.</h2><p>{selection.length} {selection.length===1?'conteúdo selecionado':'conteúdos selecionados'} · {data.studyAttempts.length} {data.studyAttempts.length===1?'prática registrada':'práticas registradas'}</p></div><span className="status-pill">Estudo separado dos seus tempos</span></div>
    {(revealed||item.kind==='exercise')&&<LessonBrief objective={item.objective} prerequisites={item.preconditions} preserve={item.preservation}/>}
    <div className="study-grid">
      <section className="panel"><h2>{item.kind==='exercise'?'Exercício para praticar':'Caso para reconhecer'}</h2>
        <div className="study-cube"><StudyCube key={`${round}:${alternative}:${pllPresentation}`} item={item} referenceState={playback.caseState} state={playback.caseState} size={270}/></div>
        <PreparationCard preparation={playback.preparation} title={item.kind==='exercise'?'Preparar exercício':'Preparar o caso'} explanation="Comece com o cubo resolvido, amarelo em cima e verde à frente. Monte o estado mostrado e tente resolver antes de revelar."/>
        {timed&&<strong className="study-clock">{formatTime(duration??clock)}</strong>}
        {!revealed?<button className="button" onClick={async()=>{setRevealed(true);setDuration(timed?Math.round(performance.now()-started.current):null);}}><Eye size={17}/> Revelar solução</button>:<div className="study-answer">
          <span className="eyebrow">{contentReference(item)}</span><h2>{item.name}</h2>
          <p className="muted small">{item.objective}</p>
          <label>Reconhecimento<select value={recognition} onChange={event=>setRecognition(event.target.value as typeof recognition)}><option value="good">Reconheci com confiança</option><option value="again">Quero praticar novamente</option></select></label>
          <label>Execução<select value={execution} onChange={event=>setExecution(event.target.value as typeof execution)}><option value="good">Executei com fluidez</option><option value="again">Preciso repetir</option></select></label>
          <button className="button" disabled={saving} onClick={async()=>{if((await update(previous=>recordStudyAttempt(previous,{caseId:item.id,recognition,execution,durationMs:duration}))).kind==='committed'){notify('Prática de estudo registrada.');next();}}}>Registrar e sortear próximo <Shuffle size={16}/></button>
        </div>}
      </section>
      <section className="panel">
        {revealed&&item.alternatives.length>0&&<label>Alternativa para praticar<select value={alternative} onChange={event=>setAlternative(event.target.value)}><option value="">Principal</option>{item.alternatives.map((value,index)=><option value={value} key={value}>Alternativa {index+1}: {value}</option>)}</select></label>}
        {revealed&&item.family==='PLL'&&<div className="study-solution"><strong>Solução reproduzida</strong><p className="algorithm-text">{playback.solution}</p><button className="text-button" onClick={async()=>navigator.clipboard.writeText(playback.solution).then(()=>notify('Solução copiada.'),()=>notify('Não foi possível copiar.'))}><Copy size={15}/> Copiar solução</button>{playback.solution!==(alternative||item.algorithm)&&<div className="original-algorithm"><strong>Algoritmo original da alternativa</strong><p className="algorithm-text">{alternative||item.algorithm}</p><p className="muted small">A solução reproduzida compensa o ajuste U do padrão alinhado.</p></div>}</div>}
        <Playback key={`${round}:${item.id}:${alternative}:${revealed}:${pllPresentation}`} item={item} algorithm={alternative||item.algorithm} hideSolution={!revealed} showSetup={false} pllPresentation={pllPresentation} onPLLPresentationChange={setPLLPresentation}/>
        {!revealed&&<p className="muted small">A solução fica oculta até você revelar.</p>}
      </section>
    </div>
  </>;
}
