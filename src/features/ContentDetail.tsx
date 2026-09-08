import {contentReference,getPresentationPlayback} from '../components/contentPresentation';
import type {PLLPresentation} from '../components/contentPresentation';
import {useState} from 'react';
import {ArrowLeft,ArrowRight,Copy,Play,Star} from 'lucide-react';
import {METHODS,STAGES,updateCaseProgress} from '../domain';
import type {LearningContent,StudyStatus} from '../domain';
import {useData} from '../components/AppContext';
import Playback from '../components/Playback';
import {LessonBrief} from '../components/LearningPath';
export const statusLabels={new:'Não iniciado',learning:'Aprendendo',mastered:'Dominado'};
export default function ContentDetail({item,next,onBack,onOpen,onStudy}: {
  item:LearningContent;next?:LearningContent;onBack:()=>void;onOpen:(item:LearningContent)=>void;onStudy:(item:LearningContent)=>void;
}) {
  const {data,update,notify}=useData();
  const [alternative,setAlternative]=useState('');
  const [pllPresentation,setPLLPresentation]=useState<PLLPresentation>('recognition');
  const effective=getPresentationPlayback(item,alternative||item.algorithm,'solve',pllPresentation);
  const progress=data.progress[item.id];
  return <>
    <button className="text-button back-button" onClick={onBack}><ArrowLeft size={16}/> Voltar à biblioteca</button>
    <div className="detail-heading"><div><span className="eyebrow">{METHODS.find(method=>method.id===item.methodId)?.name} · {STAGES.find(stage=>stage.id===item.stageId)?.name} · {item.group}</span><h1>{item.name}</h1><p className="case-identity">{contentReference(item)}{item.aliases.length>0&&` · ${item.aliases.join(' · ')}`}</p></div><button className={`button secondary ${progress?.favorite?'favorite':''}`} onClick={()=>update(previous=>updateCaseProgress(previous,item.id,{favorite:!progress?.favorite}))}><Star size={17} fill={progress?.favorite?'currentColor':'none'}/>{progress?.favorite?'Favorito':'Favoritar'}</button></div>
    <LessonBrief objective={item.objective} prerequisites={item.preconditions} preserve={item.preservation}/>
    <div className="detail-grid">
      <section className="panel"><Playback key={`${item.id}:${alternative}:${pllPresentation}`} item={item} algorithm={alternative||item.algorithm} pllPresentation={pllPresentation} onPLLPresentationChange={setPLLPresentation}/></section>
      <section className="panel case-notes"><h2>Seu progresso</h2>
        <label>Status<select value={progress?.status??'new'} onChange={event=>{const status=event.target.value as StudyStatus;void update(previous=>updateCaseProgress(previous,item.id,{status}));}}>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Notas de estudo<textarea placeholder="O que observar, dicas de execução, pontos a repetir..." value={progress?.note??''} maxLength={10000} onChange={event=>{const note=event.target.value;void update(previous=>updateCaseProgress(previous,item.id,{note}));}}/></label>
        <label>{item.kind==='exercise'?'Solução deste exercício':item.family==='PLL'?'Solução reproduzida':'Algoritmo selecionado'}<p className="algorithm-text">{effective.solution}</p></label>
        <button className="text-button" onClick={()=>navigator.clipboard.writeText(effective.solution).then(()=>notify('Solução copiada.'),()=>notify('Não foi possível copiar.'))}><Copy size={15}/> Copiar solução</button>
        {item.family==='PLL'&&effective.solution!==(alternative||item.algorithm)&&<div className="original-algorithm"><strong>Algoritmo original da alternativa</strong><p className="algorithm-text">{alternative||item.algorithm}</p><p className="muted small">A solução reproduzida inclui a compensação do ajuste U mostrado no cubo.</p></div>}
        {item.alternatives.length>0&&<label>Alternativa<select value={alternative} onChange={event=>setAlternative(event.target.value)}><option value="">Principal</option>{item.alternatives.map((value,index)=><option value={value} key={value}>Alternativa {index+1}: {value}</option>)}</select></label>}
        {alternative&&<p className="muted small">Os marcos explicados acompanham a solução principal. Esta alternativa tem sua própria sequência.</p>}
        <button className="button secondary" onClick={()=>onStudy(item)}><Play size={16}/> Praticar este conteúdo</button>
        <details className="content-sources"><summary>Fontes e nomenclatura</summary><p>{item.nameKind==='common'?'Nome comum':'Nome descritivo para identificação neste percurso'}.</p>{item.provenance.map((source,index)=><p key={`${source.url}:${index}`}><a className="text-button" href={source.url.startsWith('docs/')?`/sources/${source.url.slice(5).replace(/\.md$/,'.txt')}`:source.url} target="_blank" rel="noreferrer">{source.title} ↗</a><br/>{source.author} · {source.license}{source.notes&&<><br/>{source.notes}</>}</p>)}</details>
      </section>
    </div>
    {next&&<div className="next-content"><div><strong>Continue seu percurso</strong><p>{next.name} · {STAGES.find(stage=>stage.id===next.stageId)?.name}</p></div><button className="button secondary" onClick={()=>onOpen(next)}>Próximo conteúdo <ArrowRight size={16}/></button></div>}
  </>;
}
