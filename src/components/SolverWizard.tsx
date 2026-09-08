import {useEffect, useMemo, useState} from 'react';
import {ArrowLeft, ArrowRight, CheckCircle2, Rotate3D} from 'lucide-react';
import {applyMove, FACE_COLORS, FACE_COLOR_LABELS} from '../domain/cube';
import type {CubeState, Face} from '../domain/types';
import {getDraftPreview, getWizardPreview, getWizardStep, getWizardTransition, SOLVER_WIZARD_STEPS} from '../solver';
import type {DraftFacelets, SolverIssue, SolverSlot} from '../solver';
import CubeView from './CubeView';
import CubeFaceEditor from './CubeFaceEditor';
import SolverIssueSummary from './SolverIssueSummary';
import {useCubePlayback} from './useCubePlayback';

type Transition = {from:Face|null; to:Face|null; serial:number};
function instructions(state:CubeState, tokens:readonly string[]) {
  const lines:string[]=[]; let current=state;
  for(const token of tokens) {
    const front=current.find(s=>s.id.endsWith('4')&&s.normal[2]===1)!.color;
    const top=current.find(s=>s.id.endsWith('4')&&s.normal[1]===1)!.color;
    const target:Record<string,string>={x:'cima',"x'":'baixo',y:'esquerda',"y'":'direita',z:'direita',"z'":'esquerda'};
    lines.push(`Gire o cubo inteiro 90°: leve o centro ${FACE_COLOR_LABELS[token[0]==='z'?top:front].toLowerCase()}, que está ${token[0]==='z'?'em cima':'à frente'}, para ${target[token]}.`);
    current=applyMove(current,token);
  }
  return lines;
}

function Rotation({draft,transition,onDone}: {draft:DraftFacelets;transition:Transition;onDone:()=>void}) {
  const start=useMemo(()=>transition.from===null?getDraftPreview(draft):getWizardPreview(draft,transition.from),[draft,transition.from]);
  const sequence=useMemo(()=>getWizardTransition(transition.from,transition.to),[transition.from,transition.to]);
  const player=useCubePlayback(start.state,sequence.algorithm,0.85);
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  useEffect(()=>{if(reduced)player.jump(sequence.tokens.length);else player.togglePlayback();},[reduced]);
  useEffect(()=>{if(player.step===sequence.tokens.length&&!player.moving)onDone();},[player.step,player.moving,sequence.tokens.length,onDone]);
  const palette=useMemo(()=>new Map(Object.entries(start.palette)),[start]);
  return <div className="solver-wizard-rotation" data-testid="solver-wizard-rotation" data-step={player.step} data-angle={player.angle.toFixed(5)}>
    <CubeView state={player.state} palette={palette} size={260} cameraOrbit={[0,0]} interactive={false} motion={player.moving?player.current:undefined} angle={player.angle} label="Rotação do cubo inteiro para a próxima face"/>
    <ol>{instructions(start.state,sequence.tokens).map((text,index)=><li key={index}><span aria-hidden="true">{({x:'↑',"x'":'↓',y:'←',"y'":'→',z:'↷',"z'":'↶'} as Record<string,string>)[sequence.tokens[index]]} </span>{text}</li>)}</ol>
    {!sequence.tokens.length&&<p>A orientação já corresponde à face escolhida.</p>}
    <p className="small muted">Mova o cubo inteiro, não uma camada. A animação apenas demonstra o giro; posicione também o cubo físico.{reduced?' A redução de movimento está ativa; a orientação final é mostrada sem animação.':''}</p>
  </div>;
}

export default function SolverWizard({draft,onPaint,issues,onReviewChange}: {draft:DraftFacelets;onPaint:(face:Face,index:number,color:Face|null)=>void;issues:readonly SolverIssue[];onReviewChange:(review:boolean)=>void}) {
  const [face,setFace]=useState<Face>('U'),[review,setReview]=useState(false);
  const [transition,setTransition]=useState<Transition|null>({from:null,to:'U',serial:0});
  const [rotationDone,setRotationDone]=useState(false),[located,setLocated]=useState<SolverSlot|null>(null);
  const step=getWizardStep(face),complete=draft[face].every(Boolean),allComplete=SOLVER_WIZARD_STEPS.every(s=>draft[s.face].every(Boolean));
  const related=issues.flatMap(issue=>issue.slots);
  const reviewPreview=useMemo(()=>getDraftPreview(draft),[draft]);
  const reviewPalette=useMemo(()=>new Map(Object.entries(reviewPreview.palette)),[reviewPreview]);
  function go(to:Face|null) {
    if(transition)return;
    onReviewChange(false);setRotationDone(false);setTransition({from:review?null:face,to,serial:Date.now()});
  }
  function acceptOrientation() {
    if(!transition||!rotationDone)return;
    const to=transition.to;setTransition(null);setReview(to===null);if(to!==null)setFace(to);onReviewChange(to===null);
  }
  function locate(slot:SolverSlot) {if(transition)return;setLocated(slot);if(!review&&slot.face===face){document.querySelector<HTMLElement>(`[data-testid="solver-slot-${slot.face}-${slot.index}"]`)?.focus();return;}go(slot.face);}
  useEffect(()=>{if(!transition&&located&&located.face===face)document.querySelector<HTMLElement>(`[data-testid="solver-slot-${located.face}-${located.index}"]`)?.focus();},[face,transition,located]);
  if(transition)return <section className="solver-wizard" data-testid="solver-wizard"><span className="eyebrow">{transition.to===null?'REVISÃO FINAL':`FACE ${getWizardStep(transition.to).index+1} DE 6`}</span><h2>{transition.to===null?'Volte à referência para resolver':`Centro ${FACE_COLOR_LABELS[transition.to].toLowerCase()} à frente`}</h2><Rotation key={transition.serial} draft={draft} transition={transition} onDone={()=>setRotationDone(true)}/><p>{transition.to===null?'Ao terminar, confira amarelo em cima, verde à frente e vermelho à esquerda.':`Confira: ${FACE_COLOR_LABELS[getWizardStep(transition.to).neighbors.top]} acima e ${FACE_COLOR_LABELS[getWizardStep(transition.to).neighbors.right]} à direita.`}</p><button type="button" className="button" disabled={!rotationDone} onClick={acceptOrientation}>Posicionei o cubo assim <ArrowRight size={17}/></button></section>;
  return <section className="solver-wizard" data-testid="solver-wizard" data-face={review?'review':face}>
    <div className="solver-wizard-heading"><div><span className="eyebrow">{review?'REVISÃO FINAL':`FACE ${step.index+1} DE 6`}</span><h2>{review?'Confira as seis faces':`Centro ${FACE_COLOR_LABELS[face].toLowerCase()} à frente`}</h2></div><span>{SOLVER_WIZARD_STEPS.filter(s=>draft[s.face].every(Boolean)).length}/6 completas</span></div>
    {review?<><CubeView state={reviewPreview.state} palette={reviewPalette} size={260} label="Revisão das seis faces informadas"/><p className="muted">Arraste para conferir o cubo inteiro. A câmera não gira seu cubo físico. Para executar a solução, mantenha amarelo em cima, verde à frente e vermelho à esquerda.</p><div className="solver-wizard-review-faces">{SOLVER_WIZARD_STEPS.map(s=><button type="button" className="button secondary" key={s.face} onClick={()=>go(s.face)}><i style={{background:FACE_COLORS[s.face]}}/>Editar {FACE_COLOR_LABELS[s.face]}</button>)}</div></>:<><p className="muted">Preencha as oito posições ao redor do centro fixo. As quatro referências são as cores dos centros vizinhos.</p><CubeFaceEditor draft={draft} face={face} onPaint={onPaint} issueSlots={related}/><div className="solver-wizard-navigation"><button type="button" className="button secondary" disabled={step.index===0} onClick={()=>go(SOLVER_WIZARD_STEPS[step.index-1].face)}><ArrowLeft size={16}/> Anterior</button><button type="button" className="button" disabled={!complete} onClick={()=>go(step.index===5?null:SOLVER_WIZARD_STEPS[step.index+1].face)}>{step.index===5?'Revisar cubo':'Próxima face'}<ArrowRight size={16}/></button></div>{!complete&&<p className="small muted">Preencha as oito posições para avançar. Voltar não apaga suas cores.</p>}{allComplete&&step.index!==5&&<button type="button" className="text-button" onClick={()=>go(null)}><CheckCircle2 size={16}/> Voltar à revisão completa</button>}</>}
    {issues.length>0&&<SolverIssueSummary issues={issues} onLocate={locate}/>}
    <p className="small muted"><Rotate3D size={14}/> Ao voltar ou editar outra face, siga o giro indicado e confira os centros antes de pintar. Seu preenchimento permanece nesta página.</p>
  </section>;
}
