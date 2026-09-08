import {useState} from 'react';
import {Check, Eraser, LockKeyhole} from 'lucide-react';
import type {Face} from '../domain/types';
import {FACE_COLORS as COLORS, FACE_COLOR_LABELS} from '../domain/cube';
import {SOLVER_FACES} from '../solver';
import {getWizardStep, getWizardFace, wizardSlotToCanonical} from '../solver/wizard';
import type {DraftFacelets, SolverSlot} from '../solver';

export const SOLVER_FACE_LABELS: Record<Face, string> = {U:'Cima', R:'Direita', F:'Frente', D:'Baixo', L:'Esquerda', B:'Trás'};
export const SOLVER_COLOR_LABELS = FACE_COLOR_LABELS;
const sideNames = {top:'Acima',right:'À direita',bottom:'Abaixo',left:'À esquerda'} as const;

export default function CubeFaceEditor({draft, face='U', onPaint, issueSlots=[], disabled=false}: {draft:DraftFacelets; face?:Face; onPaint:(face:Face,index:number,color:Face|null)=>void; issueSlots?:readonly SolverSlot[]; disabled?:boolean}) {
  const [selectedColor,setSelectedColor] = useState<Face|null>('U');
  const step = getWizardStep(face), colors = getWizardFace(draft,face);
  const counts = Object.fromEntries(SOLVER_FACES.map(color=>[color,SOLVER_FACES.flatMap(f=>draft[f]).filter(value=>value===color).length])) as Record<Face,number>;
  return <div className="solver-editor solver-guided-editor" data-testid="solver-editor">
    <fieldset className="solver-palette" disabled={disabled}><legend>Escolha uma cor e toque na posição correspondente</legend>
      {SOLVER_FACES.map(color=><button key={color} type="button" className={selectedColor===color?'selected':''} aria-pressed={selectedColor===color} onClick={()=>setSelectedColor(color)} data-testid={'solver-color-'+color}><span className="solver-swatch" style={{background:COLORS[color]}}>{selectedColor===color&&<Check size={17}/>}</span><span>{SOLVER_COLOR_LABELS[color]}<small>{counts[color]}/9</small></span></button>)}
      <button type="button" className={'solver-eraser '+(selectedColor===null?'selected':'')} aria-pressed={selectedColor===null} onClick={()=>setSelectedColor(null)}><Eraser size={18}/> Apagar</button>
    </fieldset>
    <div className="solver-oriented-face solver-wizard-face">
      {(Object.keys(sideNames) as (keyof typeof sideNames)[]).map(side=><span key={side} className={'solver-neighbor '+side}><i style={{background:COLORS[step.neighbors[side]]}}/><span>{sideNames[side]}<b>{SOLVER_COLOR_LABELS[step.neighbors[side]]}</b></span></span>)}
      <div className="solver-face-grid">{colors.map((color,index)=>{
        const slot=wizardSlotToCanonical(face,index), related=issueSlots.some(s=>s.face===slot.face&&s.index===slot.index);
        return <button type="button" key={index} data-testid={'solver-slot-'+slot.face+'-'+slot.index} disabled={disabled||index===4} className={(color?'':'unpainted')+(related?' has-issue':'')} style={color?{background:COLORS[color],color:'#16231e'}:undefined} aria-label={'Face de centro '+SOLVER_COLOR_LABELS[face]+', linha '+(Math.floor(index/3)+1)+', coluna '+(index%3+1)+': '+(color?SOLVER_COLOR_LABELS[color]:'sem cor')+(index===4?', centro fixo':'')+(related?', posição relacionada a uma inconsistência':'')} onClick={()=>onPaint(slot.face,slot.index,selectedColor)}>{index===4?<LockKeyhole size={19}/>:color?null:<span>+</span>}</button>;
      })}</div>
    </div>
    <p className="solver-paint-hint" aria-live="polite">{selectedColor?'Cor selecionada: '+SOLVER_COLOR_LABELS[selectedColor]+'. Toque nos adesivos para pintar.':'Borracha selecionada. Toque em um adesivo para apagar.'}</p>
  </div>;
}
