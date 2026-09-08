import {contentReference} from '../components/contentPresentation';
import {useMemo,useState} from 'react';
import {ArrowRight,BookOpen,Play,Search,Star} from 'lucide-react';
import {LEARNING_CONTENT,METHODS,STAGES,TWO_LOOK_GUIDE,selectContent,updateCaseProgress} from '../domain';
import type {LearningContent,MethodId,StageId} from '../domain';
import {useData} from '../components/AppContext';
import {MethodPicker,StagePath} from '../components/LearningPath';
import ContentThumbnail from '../components/ContentThumbnail';
import ContentDetail,{statusLabels} from './ContentDetail';
import StudySession from './StudySession';

export default function AlgorithmsPage() {
  const {data,update}=useData();
  const [methodId,setMethod]=useState<MethodId>('cfop');
  const [stageId,setStage]=useState<StageId>('cross');
  const [query,setQuery]=useState('');
  const [group,setGroup]=useState('all');
  const [filter,setFilter]=useState('all');
  const [twoLook,setTwoLook]=useState(false);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [detail,setDetail]=useState<LearningContent|null>(null);
  const [study,setStudy]=useState<readonly LearningContent[]|null>(null);
  const [timed,setTimed]=useState(false);
  const method=METHODS.find(item=>item.id===methodId)!;
  const stage=STAGES.find(item=>item.id===stageId)!;
  const stages=STAGES.filter(item=>item.methodId===methodId).sort((a,b)=>a.order-b.order);
  const stageContent=useMemo(()=>LEARNING_CONTENT.filter(item=>item.stageId===stageId),[stageId]);
  const groups=Array.from(new Map(stageContent.map(item=>[item.groupId,item.group])).entries());
  const results=useMemo(()=>selectContent({
    methodId:query.trim()?undefined:methodId,stageId:query.trim()?undefined:stageId,
    groupId:group==='all'?undefined:group,query,
    favorites:filter==='favorites'||undefined,learning:filter==='learning'||undefined,
  },data.progress).filter(item=>!twoLook||item.twoLook),[methodId,stageId,group,query,filter,twoLook,data.progress]);
  const exercises=results.filter(item=>item.kind==='exercise');
  const cases=results.filter(item=>item.kind==='algorithm-case');
  const selection=LEARNING_CONTENT.filter(item=>selected.has(item.id));
  const methodPath=stages.flatMap(entry=>{
    const contents=LEARNING_CONTENT.filter(item=>item.stageId===entry.id);
    return [...contents.filter(item=>item.kind==='exercise'),...contents.filter(item=>item.kind==='algorithm-case')];
  });
  function chooseStage(id:StageId) {setStage(id);setGroup('all');setTwoLook(false);setQuery('');}
  function open(item:LearningContent) {if(item.stageId!==stageId){setGroup('all');setTwoLook(false);}setMethod(item.methodId);setStage(item.stageId);setDetail(item);window.scrollTo({top:0});}
  function toggleSelection(item:LearningContent,checked:boolean) {setSelected(previous=>{const next=new Set(previous);if(checked)next.add(item.id);else next.delete(item.id);return next;});}
  function controls(item:LearningContent) {
    const progress=data.progress[item.id];
    return <div className="case-card-top"><label className="case-select"><input type="checkbox" aria-label={`Selecionar ${contentReference(item)} para estudo`} checked={selected.has(item.id)} onChange={event=>toggleSelection(item,event.target.checked)}/></label><span>{item.group}</span><button className={`icon-button ${progress?.favorite?'favorite':''}`} aria-label={`${progress?.favorite?'Remover favorito':'Favoritar'} ${contentReference(item)}`} onClick={()=>update(previous=>updateCaseProgress(previous,item.id,{favorite:!progress?.favorite}))}><Star size={15} fill={progress?.favorite?'currentColor':'none'}/></button></div>;
  }
  if(study)return <StudySession selection={study} timed={timed} onBack={()=>{setStudy(null);setDetail(null);window.scrollTo({top:0});}}/>;
  if(detail)return <ContentDetail key={detail.id} item={detail} next={methodPath[methodPath.findIndex(item=>item.id===detail.id)+1]} onBack={()=>{setDetail(null);window.scrollTo({top:0});}} onOpen={open} onStudy={item=>{setStudy([item]);window.scrollTo({top:0});}}/>;
  return <>
    <MethodPicker methods={METHODS.map(item=>({...item,count:LEARNING_CONTENT.filter(content=>content.methodId===item.id).length,stages:item.stageIds.length}))} active={methodId} onChange={id=>{const next=METHODS.find(item=>item.id===id)!;setMethod(next.id);chooseStage(next.stageIds[0]);}}/>
    <StagePath stages={stages.map(item=>{const contents=LEARNING_CONTENT.filter(content=>content.stageId===item.id);return {...item,count:contents.length,completed:contents.filter(content=>data.progress[content.id]?.status==='mastered').length};})} active={stageId} onChange={id=>chooseStage(id as StageId)}/>
    <div className="stage-introduction"><div><span className="eyebrow">{method.name} · SEU PRÓXIMO PASSO</span><h2>{stage.name}</h2><p>{stage.description}</p></div><label className="search-field"><Search size={17}/><input aria-label="Buscar algoritmo" placeholder="Buscar em todos os métodos" value={query} onChange={event=>{setQuery(event.target.value);setGroup('all');setTwoLook(false);}}/></label></div>
    <div className="catalog-filters">
      {(stageId==='oll'||stageId==='pll')&&!query&&<label className="checkbox-label"><input type="checkbox" checked={twoLook} onChange={event=>setTwoLook(event.target.checked)}/> 2 etapas</label>}
      <select aria-label="Filtrar progresso" value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">Todo o progresso</option><option value="favorites">Favoritos</option><option value="learning">Aprendendo</option></select>
      {!query&&groups.length>1&&<select aria-label="Grupo de casos" value={group} onChange={event=>setGroup(event.target.value)}><option value="all">Todos os grupos</option>{groups.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>}
      <span className="muted small">{results.length} conteúdos {query?'em todos os métodos':'nesta etapa'}</span><button className="text-button toolbar-end" onClick={()=>setSelected(new Set(results.map(item=>item.id)))}>Selecionar resultados</button>
    </div>
    <div className="study-toolbar"><span><strong>{selected.size}</strong> conteúdos para estudar</span><label className="checkbox-label"><input type="checkbox" checked={timed} onChange={event=>setTimed(event.target.checked)}/> Cronometrar prática</label><button className="text-button" disabled={!selected.size} onClick={()=>setSelected(new Set())}>Limpar</button><button className="button" disabled={!selected.size} onClick={()=>{setStudy(selection);window.scrollTo({top:0});}}><Play size={15}/> Iniciar estudo</button></div>
    {twoLook&&(stageId==='oll'||stageId==='pll')&&<div className="two-look-guide">{TWO_LOOK_GUIDE[stageId==='oll'?'OLL':'PLL'].map(entry=><div key={entry.name}><strong>{entry.name}</strong><p>{entry.instruction}</p><span>{entry.ids.join(' · ')}</span></div>)}</div>}
    {exercises.length>0&&<><div className="stage-content-heading"><h2><BookOpen size={17}/> {stageId==='f2l'&&!query?'Fundamentos antes dos casos':'Aprenda fazendo'}</h2><span className="muted small">{exercises.length} exercícios guiados</span></div><p className="lesson-coverage">Exemplos com posições definidas para aprender decisões, reconhecer peças e observar o que preservar. Explore os marcos no cubo e repita no seu cubo físico. Este percurso não enumera todas as posições possíveis.</p><div className="exercise-grid">{exercises.map(item=><article className="exercise-card" data-content-id={item.id} key={item.id}>{controls(item)}<button className="exercise-card-main" onClick={()=>open(item)}><ContentThumbnail item={item}/><span className="exercise-card-copy"><span className="content-kind">Exercício guiado</span><h2>{item.name}</h2><p>{item.objective}</p></span></button><div className="exercise-card-meta"><span className={`progress-label ${data.progress[item.id]?.status??'new'}`}>{statusLabels[data.progress[item.id]?.status??'new']}</span><button className="text-button" onClick={()=>open(item)}>Explorar <ArrowRight size={15}/></button></div></article>)}</div></>}
    {cases.length>0&&<><div className="stage-content-heading"><h2>Reconheça os padrões</h2><span className="muted small">{cases.length} casos algorítmicos</span></div><div className="catalog-grid">{cases.map(item=><article className="case-card" data-content-id={item.id} key={item.id}>{controls(item)}<button className="case-open" onClick={()=>open(item)}><ContentThumbnail item={item}/><h2>{item.name}</h2><p className="case-id">{contentReference(item)}</p><span className={`progress-label ${data.progress[item.id]?.status??'new'}`}>{statusLabels[data.progress[item.id]?.status??'new']}</span></button></article>)}</div></>}
    {results.length===0&&<div className="no-content-match"><Search size={28}/><h2>Nenhum conteúdo encontrado.</h2><p>Ajuste a busca ou os filtros para continuar.</p><button className="text-button" onClick={()=>{setQuery('');setFilter('all');setGroup('all');setTwoLook(false);}}>Limpar filtros</button></div>}
    <details className="policy"><summary>Guia rápido de notação</summary><p>R, L, U, D, F e B giram, respectivamente, direita, esquerda, cima, baixo, frente e trás em sentido horário, olhando diretamente para a face. O apóstrofo (R') indica o giro inverso; 2 (R2), meia volta. x, y e z giram o cubo inteiro como R, U e F. M, E e S giram camadas internas como L, D e F. Letras minúsculas ou w (r ou Rw) giram duas camadas juntas. Os preparos de estudo partem do cubo resolvido e não são embaralhamentos aleatórios.</p></details>
  </>;
}
