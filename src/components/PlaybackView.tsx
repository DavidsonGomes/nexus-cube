import {contentReference,getPresentationPlayback} from './contentPresentation';
import type {PLLPresentation} from './contentPresentation';
import React,{useMemo, useState} from 'react';
import {Copy, Pause, Play, RotateCcw, SkipBack, SkipForward} from 'lucide-react';
import {cubeAtStep, getContentPlayback, getPLLRecognition} from '../domain';
import type {LearningContent} from '../domain';

import StudyCube from './StudyCube';
import ContentThumbnail from './ContentThumbnail';
import PreparationCard from './PreparationCardView';
import {LessonTimeline} from './LearningPath';
import {useCubePlayback} from './useCubePlayback';

type PlaybackMode = 'prepare' | 'solve';
export interface PlaybackViewProps {item:LearningContent;algorithm?:string;hideSolution?:boolean;showSetup?:boolean;pllPresentation?:PLLPresentation;onPLLPresentationChange?:(value:PLLPresentation)=>void;ports:{notify:(text:string)=>void;animationSpeed:number;onAnimationSpeedChange:(speed:number)=>void;disabled?:boolean}}
export default function PlaybackView({item,algorithm=item.algorithm,hideSolution=false,showSetup=true,pllPresentation,onPLLPresentationChange,ports}:PlaybackViewProps) {
  const {notify}=ports;
  const [mode, setMode] = useState<PlaybackMode>(hideSolution ? 'prepare' : 'solve');
  const [localPresentation,setLocalPresentation]=useState<PLLPresentation>('recognition');
  const presentation=pllPresentation??localPresentation;
  const recognition=useMemo(()=>item.kind==='algorithm-case'&&item.family==='PLL'?getPLLRecognition(item,algorithm):null,[item,algorithm]);
  const effectiveMode = hideSolution ? 'prepare' : mode;
  const playback = useMemo(() => getPresentationPlayback(item, algorithm, effectiveMode,presentation), [item, algorithm, effectiveMode,presentation]);
  return <div className="case-trainer" data-pll-presentation={recognition?presentation:undefined}>
    {recognition&&<section className="pll-presentation"><div className="segmented" aria-label="Apresentação PLL"><button className={presentation==='recognition'?'selected':''} onClick={()=>{setLocalPresentation('recognition');onPLLPresentationChange?.('recognition');}}>Padrão alinhado</button><button className={presentation==='original'?'selected':''} onClick={()=>{setLocalPresentation('original');onPLLPresentationChange?.('original');}}>Sequência original</button></div><p>{presentation==='recognition'?(recognition.adjustment?`Ajuste ${recognition.adjustment} incluído. O preparo monta o padrão alinhado; a solução abaixo já compensa esse ajuste.`:'Este padrão já está alinhado. Nenhum ajuste U adicional.'):'Estado da sequência original, sem alinhamento adicional. As setas podem incluir o ajuste final da camada superior.'}</p></section>}

    {showSetup && <PreparationCard notify={notify} preparation={playback.preparation} title={item.kind === 'exercise' ? 'Preparar exercício' : 'Preparar o caso'} explanation={item.kind === 'exercise' ? 'Comece resolvido, com amarelo em cima e verde à frente. Monte esta posição para praticar o objetivo abaixo.' : recognition&&presentation==='recognition' ? 'Comece resolvido, com amarelo em cima e verde à frente. Este preparo já inclui o alinhamento indicado acima.' : undefined}/>}
    {!hideSolution && playback.usesAuthoredSetup && <details className="solution-reverse"><summary>Reverso da solução</summary><p className="algorithm-text">{playback.inverseSolution}</p><button className="text-button" onClick={() => navigator.clipboard.writeText(playback.inverseSolution).then(() => notify('Reverso copiado.'), () => notify('Não foi possível copiar.'))}><Copy size={15}/> Copiar reverso</button><p className="muted small">Desfaz a solução a partir do resultado da etapa. Para montar o exercício, use o preparo acima.</p></details>}
    {!hideSolution && item.family === 'PLL' && <section className="permutation-guide" aria-label="Permutação do caso preparado"><ContentThumbnail item={item} state={playback.caseState}/><div><h2>Para onde cada peça vai</h2><p>Uma ponta mostra o sentido do ciclo. Duas pontas indicam uma troca. Peças fixas ficam sem seta.</p><span className="muted small">As setas mostram o destino final das peças. Vista de cima do estado preparado nesta apresentação, com a frente embaixo.</span></div></section>}
    <div className="playback-mode segmented" aria-label="Modo da visualização">
      <button className={effectiveMode === 'prepare' ? 'selected' : ''} onClick={() => setMode('prepare')}>{item.kind === 'exercise' ? 'Preparar exercício' : 'Preparar o caso'}</button>
      {!hideSolution && <button className={effectiveMode === 'solve' ? 'selected' : ''} onClick={() => setMode('solve')}>Resolver</button>}
    </div>
    <p className="playback-mode-description">{effectiveMode === 'prepare' ? 'Cubo resolvido → caso para praticar' : item.objective}</p>
    <PlaybackTimeline key={`${item.id}:${algorithm}:${effectiveMode}:${presentation}`} item={item} playback={playback} ports={ports}/>
  </div>;
}
function PlaybackTimeline({item,playback,ports}: {item:LearningContent;playback:ReturnType<typeof getContentPlayback>;ports:PlaybackViewProps['ports']}) {
  const algorithm = playback.algorithm;

  const initialState = useMemo(() => cubeAtStep(playback.setup, algorithm, 0), [playback.setup, algorithm]);
  const speed = ports.animationSpeed;
  const {tokens, step, state, current, moving, angle, running, reset, jump, next, togglePlayback} = useCubePlayback(initialState, algorithm, speed);

  return <div className="playback" data-playback-mode={playback.mode} data-playback-step={step} data-playback-angle={angle.toFixed(6)} data-playback-paused={moving && !running}>
    <div className="playback-stage">
      <StudyCube item={item} referenceState={playback.caseState} state={state} size={260} motion={moving ? current : undefined} angle={angle} label={`${contentReference(item)}, movimento ${step} de ${tokens.length}`}/>
      <span className="muted small">Arraste com o mouse ou dedo para girar. Com foco no cubo, use as setas.</span>
    </div>
    <div className="playback-controls">
      <button className="icon-button" aria-label="Reiniciar algoritmo" onClick={reset}><RotateCcw size={18}/></button>
      <button className="icon-button" aria-label="Movimento anterior" disabled={step === 0 || moving} onClick={() => jump(step - 1)}><SkipBack size={19}/></button>
      <button className="play-button" aria-label={running ? 'Pausar algoritmo' : 'Reproduzir algoritmo'} onClick={togglePlayback}>{running ? <Pause size={21}/> : <Play size={21}/>}</button>
      <button className="icon-button" aria-label="Próximo movimento" disabled={step === tokens.length || moving} onClick={next}><SkipForward size={19}/></button>
      <select aria-label="Velocidade da animação" value={speed} disabled={ports.disabled} onChange={event=>ports.onAnimationSpeedChange(Number(event.target.value))}>
        {[0.5, 1, 1.5, 2, 3].map(value => <option key={value} value={value}>{value}×</option>)}
      </select>
    </div>
    <div className="move-tokens" aria-label="Movimentos do algoritmo">
      {tokens.map((token, index) => <button key={index} className={index === step ? 'current' : index < step ? 'done' : ''} disabled={moving} onClick={() => jump(index)} aria-label={`Ir ao movimento ${index + 1}: ${token}`}>{token}</button>)}
    </div>
    {playback.mode === 'solve' && playback.solution === item.algorithm && item.milestones.length > 0 && <LessonTimeline markers={item.milestones} step={step} moving={moving} onJump={jump}/>}
    <p className="muted small center">{moving && !running ? 'Pausado · ' : ''}{step === tokens.length ? 'Sequência concluída' : `Movimento ${step + 1} de ${tokens.length}`}</p>
  </div>;
}
