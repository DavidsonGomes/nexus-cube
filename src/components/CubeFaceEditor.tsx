import {useState} from 'react';
import {Check, Eraser, LockKeyhole} from 'lucide-react';
import type {Face} from '../domain';
import {FACE_COLORS as COLORS} from '../domain';
import {SOLVER_FACES, SOLVER_FACE_ORIENTATION} from '../solver';
import type {DraftFacelets} from '../solver';

export const SOLVER_FACE_LABELS: Record<Face, string> = {U:'Cima', R:'Direita', F:'Frente', D:'Baixo', L:'Esquerda', B:'Trás'};
export const SOLVER_COLOR_LABELS: Record<Face, string> = {U:'Amarelo', R:'Vermelho', F:'Verde', D:'Branco', L:'Laranja', B:'Azul'};
const opposite: Record<Face, Face> = {U:'D', D:'U', R:'L', L:'R', F:'B', B:'F'};
function neighbors(face:Face): readonly Face[] {const {top, right} = SOLVER_FACE_ORIENTATION[face]; return [top, right, opposite[top], opposite[right]];}

export default function CubeFaceEditor({draft, onPaint, issueSlots = []}: {draft: DraftFacelets; onPaint: (face: Face, index: number, color: Face | null) => void; issueSlots?: readonly {face: Face; index: number}[]}) {
  const [selectedColor, setSelectedColor] = useState<Face | null>('U');
  const [selectedFace, setSelectedFace] = useState<Face>('F');
  const counts = Object.fromEntries(SOLVER_FACES.map(color => [color, SOLVER_FACES.flatMap(face => draft[face]).filter(value => value === color).length])) as Record<Face, number>;
  return <div className="solver-editor" data-testid="solver-editor">
    <fieldset className="solver-palette"><legend>1. Escolha a cor</legend>
      {SOLVER_FACES.map(color => <button key={color} type="button" className={selectedColor === color ? 'selected' : ''} aria-pressed={selectedColor === color} onClick={() => setSelectedColor(color)} data-testid={`solver-color-${color}`}><span className="solver-swatch" style={{background: COLORS[color]}}>{selectedColor === color && <Check size={17}/>}</span><span>{SOLVER_COLOR_LABELS[color]}<small>{counts[color]}/9</small></span></button>)}
      <button type="button" className={`solver-eraser ${selectedColor === null ? 'selected' : ''}`} aria-pressed={selectedColor === null} onClick={() => setSelectedColor(null)}><Eraser size={18}/> Apagar</button>
    </fieldset>
    <div className="solver-edit-heading"><h2>2. Preencha cada face</h2><span>Centros fixos <LockKeyhole size={13}/></span></div>
    <p className="muted solver-edit-help">Olhe cada face de frente. As indicações ao redor da grade mostram quais faces ficam em cada lado.</p>
    <div className="solver-face-picker" aria-label="Face para editar">{SOLVER_FACES.map(face => <button type="button" key={face} aria-pressed={selectedFace === face} className={selectedFace === face ? 'selected' : ''} onClick={() => setSelectedFace(face)}><span className="solver-mini-face" aria-hidden="true">{draft[face].map((color, index) => <i key={index} style={{background: color ? COLORS[color] : undefined}}/>)}</span><span>{SOLVER_FACE_LABELS[face]}</span></button>)}</div>
    <div className="solver-face-net">{SOLVER_FACES.map(face => <section key={face} className={`solver-face solver-face-${face} ${selectedFace === face ? 'is-selected' : ''}`} aria-label={`Face ${SOLVER_FACE_LABELS[face]}`}>
      <h3>{SOLVER_FACE_LABELS[face]} <span>{face}</span></h3>
      <div className="solver-oriented-face">
        <span className="solver-neighbor top">{SOLVER_FACE_LABELS[neighbors(face)[0]]}</span><span className="solver-neighbor right">{SOLVER_FACE_LABELS[neighbors(face)[1]]}</span><span className="solver-neighbor bottom">{SOLVER_FACE_LABELS[neighbors(face)[2]]}</span><span className="solver-neighbor left">{SOLVER_FACE_LABELS[neighbors(face)[3]]}</span>
        <div className="solver-face-grid">{draft[face].map((color, index) => <button type="button" key={index} data-testid={`solver-slot-${face}-${index}`} disabled={index === 4} className={`${color ? '' : 'unpainted'} ${issueSlots.some(slot => slot.face === face && slot.index === index) ? 'has-issue' : ''}`} style={color ? {background:COLORS[color],color:'#16231e'} : undefined} aria-label={`${SOLVER_FACE_LABELS[face]}, linha ${Math.floor(index / 3) + 1}, coluna ${index % 3 + 1}: ${color ? SOLVER_COLOR_LABELS[color] : 'sem cor'}${index === 4 ? ', centro fixo' : ''}`} onClick={() => onPaint(face, index, selectedColor)}>{index === 4 ? <LockKeyhole size={17}/> : color ? null : <span>+</span>}</button>)}</div>
      </div>
    </section>)}</div>
    <p className="solver-paint-hint" aria-live="polite">{selectedColor ? `Cor selecionada: ${SOLVER_COLOR_LABELS[selectedColor]}. Toque nos adesivos para pintar.` : 'Borracha selecionada. Toque em um adesivo para apagar.'}</p>
  </div>;
}
