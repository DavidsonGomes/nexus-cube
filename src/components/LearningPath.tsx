import {ArrowRight,CheckCircle2,Layers3,Blocks,BookOpen} from 'lucide-react';
export interface MethodCard {
  id:string;name:string;description:string;count:number;stages:number;
}
export interface StageCard {
  id:string;name:string;description:string;count:number;completed:number;
}
export function MethodPicker({methods,active,onChange}:{methods:readonly MethodCard[];active:string;onChange:(id:string)=>void}) {
  return <div className="method-picker" aria-label="Métodos de resolução">{methods.map(method=><button key={method.id} className={`method-option ${active===method.id?'selected':''}`} aria-pressed={active===method.id} onClick={()=>onChange(method.id)}>
    <span className="method-symbol">{method.id==='cfop'?<Layers3 size={25}/>:<Blocks size={25}/>}</span><span className="method-copy"><strong>{method.name}</strong><span>{method.description}</span><small>{method.stages} etapas · {method.count} casos e exercícios</small></span><ArrowRight size={18}/>
  </button>)}</div>;
}
export function StagePath({stages,active,onChange}:{stages:readonly StageCard[];active:string;onChange:(id:string)=>void}) {
  return <nav className="stage-path" aria-label="Etapas do método">{stages.map((stage,index)=><button key={stage.id} className={`stage-node ${active===stage.id?'active':''}`} aria-current={active===stage.id?'step':undefined} onClick={()=>onChange(stage.id)}>
    <span className="stage-number">{stage.count>0&&stage.completed===stage.count?<CheckCircle2 size={17}/>:String(index+1).padStart(2,'0')}</span><span><strong>{stage.name}</strong><small>{stage.description}</small><span className="stage-count">{stage.count} conteúdos · {stage.completed} dominados</span></span>
  </button>)}</nav>;
}
export function LessonBrief({objective,prerequisites,preserve,recognition}: {
  objective:string;prerequisites:readonly string[];preserve:readonly string[];recognition?:string;
}) {
  return <section className="lesson-brief"><div className="lesson-objective"><BookOpen size={19}/><div><span className="eyebrow">NESTA PRÁTICA</span><h2>{objective}</h2></div></div>
    {recognition&&<p className="recognition-tip">{recognition}</p>}
    <div className="lesson-prerequisites"><div><strong>Antes de começar</strong><ul>{prerequisites.map(text=><li key={text}>{text}</li>)}</ul></div><div><strong>O que preservar</strong><ul>{preserve.map(text=><li key={text}>{text}</li>)}</ul></div></div>
  </section>;
}
export interface TimelineMarker {step:number;title:string;explanation:string}
export function LessonTimeline({markers,step,moving,onJump}:{markers:readonly TimelineMarker[];step:number;moving:boolean;onJump:(step:number)=>void}) {
  const current=markers.reduce((index,marker,i)=>marker.step<=step?i:index,-1);
  return <div className="lesson-timeline" aria-label="Marcos da explicação"><div className="panel-heading"><h2>Entenda cada etapa</h2><span className="muted small">Toque em um marco para explorar</span></div>{markers.map((marker,index)=><button key={`${marker.step}:${marker.title}`} className={`lesson-marker ${index===current?'current':''} ${index<current?'complete':''}`} disabled={moving} onClick={()=>onJump(marker.step)}>
    <span className="marker-dot">{index<current?<CheckCircle2 size={16}/>:index+1}</span><span><strong>{marker.title}</strong><p>{marker.explanation}</p><small>{marker.step===0?'Antes do primeiro movimento':`Após ${marker.step} ${marker.step===1?'movimento':'movimentos'}`}</small></span>
  </button>)}</div>;
}
