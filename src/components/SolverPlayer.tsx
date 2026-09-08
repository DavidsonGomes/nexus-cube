import {useMemo, useState} from 'react';
import {Pause, Play, RotateCcw, SkipBack, SkipForward} from 'lucide-react';
import type {CubeState} from '../domain';
import {FACE_COLORS} from '../domain';
import CubeView from './CubeView';
import {useCubePlayback} from './useCubePlayback';
import type {MethodPlan} from '../solver';
import SolverMethodStages from './SolverMethodStages';

const faceNames: Record<string, string> = {U:'superior', R:'direita', F:'frontal', D:'inferior', L:'esquerda', B:'traseira'};
function explain(token: string) {
  const base = token[0];
  const turn = token.endsWith('2') ? 'meia volta (180°)' : token.endsWith("'") ? 'um quarto de volta no sentido anti-horário' : 'um quarto de volta no sentido horário';
  if ('xyz'.includes(base)) return `Gire o cubo inteiro: ${turn}, olhando diretamente para a face ${faceNames[({x:'R', y:'U', z:'F'} as Record<string,string>)[base]]}. Esta rotação faz parte da sequência; arrastar a câmera não a executa.`;
  if ('MES'.includes(base)) return `Gire somente a faixa central ${base}: ${turn}, olhando diretamente para a face ${faceNames[({M:'L', E:'D', S:'F'} as Record<string,string>)[base]]}. As faces externas desse eixo não giram.`;
  if (base === base.toLowerCase()) return `Gire juntas a face ${faceNames[base.toUpperCase()]} e a faixa central adjacente: ${turn}, olhando diretamente para essa face.`;
  return `Face ${faceNames[base] ?? base}: ${turn}, olhando diretamente para essa face.`;
}

export default function SolverPlayer({initialState, algorithm, plan}: {initialState: CubeState; algorithm: string; plan?: MethodPlan}) {
  const [speed, setSpeed] = useState(1);
  const [chosenStage, setChosenStage] = useState<number | null>(null);
  const player = useCubePlayback(initialState, algorithm, speed);
  const {tokens, step, state, moving, current, angle, running, reset, jump, next, togglePlayback} = player;
  const palette = useMemo(() => new Map(state.map(sticker => [sticker.id, FACE_COLORS[sticker.color]])), [state]);
  const inferredStage = plan ? Math.max(0, plan.stages.findIndex(stage => step < stage.endStep)) : 0;
  const stageIndex = plan ? chosenStage !== null && step >= plan.stages[chosenStage].startStep && (step < plan.stages[chosenStage].endStep || step === plan.stages[chosenStage].endStep && !moving) ? chosenStage : step === tokens.length ? plan.stages.length - 1 : inferredStage : 0;
  function chooseStage(index: number) {if (!plan) return; setChosenStage(index); jump(plan.stages[index].startStep);}
  return <div className="playback solver-player" data-testid="solver-player" data-playback-step={step} data-playback-angle={angle.toFixed(6)} data-playback-paused={moving && !running}>
    {plan && <SolverMethodStages plan={plan} index={stageIndex} step={step} moving={moving} onStage={chooseStage} onJump={jump}/>}
    <div className="playback-stage">
      <CubeView state={state} palette={palette} size={260} motion={moving ? current : undefined} angle={angle} label={`Seu cubo, ${step} de ${tokens.length} movimentos aplicados`}/>
      <p className="muted">Arraste com o mouse ou dedo para girar a câmera. Com foco no cubo, use as setas.</p>
    </div>
    <div className="playback-controls">
      <button className="icon-button" aria-label="Voltar ao cubo informado" onClick={() => {setChosenStage(null); reset();}}><RotateCcw size={18}/></button>
      <button className="icon-button" aria-label="Movimento anterior" disabled={step === 0 || moving} onClick={() => jump(step - 1)}><SkipBack size={19}/></button>
      <button className="play-button" aria-label={running ? 'Pausar solução' : 'Reproduzir solução'} disabled={!tokens.length} onClick={togglePlayback}>{running ? <Pause size={21}/> : <Play size={21}/>}</button>
      <button className="icon-button" aria-label="Próximo movimento" disabled={step === tokens.length || moving} onClick={next}><SkipForward size={19}/></button>
      <select aria-label="Velocidade da solução" value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[0.5, 1, 1.5, 2, 3].map(value => <option key={value} value={value}>{value}×</option>)}</select>
    </div>
    <div className="solver-step-description" aria-live="polite">
      <strong>{moving && !running ? 'Pausado' : step === tokens.length ? 'Cubo resolvido' : `Movimento ${step + 1} de ${tokens.length}`}</strong>
      <p>{step === tokens.length ? tokens.length ? 'Todos os movimentos foram aplicados ao estado que você informou.' : 'O estado informado já está resolvido. Nenhum movimento necessário.' : explain(tokens[step])}</p>
      <small>{step === 0 && !moving ? 'Estado informado, antes do primeiro giro.' : `Passo ${step} de ${tokens.length} concluído${moving ? '; próximo giro em execução.' : '.'}`}</small>
    </div>
    <div className="move-tokens" aria-label="Sequência completa da solução">
      {tokens.map((token, index) => <button key={index} className={index === step ? 'current' : index < step ? 'done' : ''} disabled={moving} aria-current={index === step ? 'step' : undefined} onClick={() => jump(index)} aria-label={`Ir ao movimento ${index + 1}: ${token}`}>{token}</button>)}
    </div>
    <div className="solver-physical-help"><strong>Acompanhe também no cubo físico</strong><p>Anterior muda apenas a visualização. No cubo físico, desfaça o último giro com seu inverso.</p><p>Reiniciar não monta novamente o estado no cubo físico. Confira se ele corresponde ao passo zero antes de executar a sequência.</p><p>Arraste para mudar a vista. A câmera não executa movimentos no cubo.</p><p>Ao saltar para outro movimento ou reproduzir novamente, confira se o cubo físico corresponde ao estado exibido antes de continuar.</p></div>
    <details className="solver-notation"><summary>{plan ? 'Como ler faces, faixas e rotações' : 'Como ler os 18 movimentos'}</summary><p>U: cima · D: baixo · F: frente · B: trás · R: direita · L: esquerda.</p><p>Uma letra indica um quarto de volta horário, olhando diretamente para a face movimentada. O apóstrofo (′) indica o sentido contrário; 2 indica meia volta. Na entrada, mantenha amarelo em cima, verde à frente e vermelho à esquerda.</p>{plan && <><p>M gira a faixa central no sentido de L; E no sentido de D; S no sentido de F. Letras minúsculas giram a face e a faixa adjacente juntas.</p><p>x, y e z giram o cubo inteiro nos sentidos de R, U e F, respectivamente. Execute essas rotações físicas quando aparecerem e acompanhe a referência mostrada até a rotação de retorno.</p></>}</details>
  </div>;
}
