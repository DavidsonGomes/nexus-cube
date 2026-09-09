import {CheckCircle2, ChevronLeft, ChevronRight, Flag} from 'lucide-react';
import type {MethodPlan, MethodStage} from '../solver';
import {ptBR} from '../i18n/pt-BR';

const lblStage = ptBR.trainers.catalog;
export const METHOD_STAGE_LABELS: Record<MethodStage['id'], string> = {
  'cfop.cross': 'Cruz branca', 'cfop.f2l.FR': 'Par da frente à direita', 'cfop.f2l.FL': 'Par da frente à esquerda',
  'cfop.f2l.BR': 'Par de trás à direita', 'cfop.f2l.BL': 'Par de trás à esquerda', 'cfop.oll': 'Orientar a última camada',
  'cfop.pll': 'Permutar a última camada', 'cfop.auf': 'Alinhamento final', 'roux.fb': 'Bloco esquerdo',
  'roux.sb': 'Bloco direito', 'roux.cmll': 'Resolver os cantos', 'roux.cmll-auf': 'Alinhar os cantos',
  'roux.eo': 'Orientar as seis arestas', 'roux.lr': 'Completar esquerda e direita', 'roux.finish': 'Concluir arestas e centros',
  'lbl.cross': lblStage['lbl-cross'].name, 'lbl.corners': lblStage['lbl-corners'].name, 'lbl.middle': lblStage['lbl-middle'].name,
  'lbl.top-cross': lblStage['lbl-top-cross'].name, 'lbl.top-edges': lblStage['lbl-top-edges'].name,
  'lbl.top-corners-position': lblStage['lbl-top-corners-position'].name, 'lbl.top-corners-orient': lblStage['lbl-top-corners-orient'].name,
};
function objective(stage: MethodStage): string {
  switch (stage.goal.kind) {
    case 'cross': return 'Formar a cruz branca embaixo, com as cores laterais alinhadas aos centros.';
    case 'f2l-pair': return {FR:'Completar o par branco, verde e laranja, na frente à direita.', FL:'Completar o par branco, verde e vermelho, na frente à esquerda.', BR:'Completar o par branco, azul e laranja, atrás à direita.', BL:'Completar o par branco, azul e vermelho, atrás à esquerda.'}[stage.goal.slot];
    case 'f2l': return 'Concluir a cruz e os quatro pares das duas primeiras camadas.';
    case 'oll': return 'Deixar nove adesivos amarelos na face superior, mantendo as duas primeiras camadas resolvidas.';
    case 'pll-up-to-auf': return 'Organizar as peças superiores entre si, antes de conferir o ajuste final de U.';
    case 'first-block': return 'Completar o bloco inferior do lado vermelho: três arestas e dois cantos corretos.';
    case 'second-block': return 'Completar o bloco inferior do lado laranja, preservando o bloco esquerdo.';
    case 'cmll-up-to-auf': return 'Orientar e organizar os quatro cantos superiores. Um ajuste de U pode ficar para a próxima etapa.';
    case 'cmll': return 'Alinhar os quatro cantos superiores às suas posições e orientações fixas.';
    case 'lse-eo': return 'Orientar as seis arestas restantes, com seus adesivos amarelos ou brancos voltados para cima ou para baixo.';
    case 'lse-lr': return 'Posicionar as arestas superiores dos lados laranja e vermelho, mantendo a orientação das demais ao final.';
    case 'first-layer': return lblStage['lbl-corners'].description;
    case 'll-edges-oriented': return lblStage['lbl-top-cross'].description;
    case 'll-edges-solved': return lblStage['lbl-top-edges'].description;
    case 'll-corners-placed': return lblStage['lbl-top-corners-position'].description;
    case 'solved': return 'Resolver os 54 adesivos e alinhar todos os centros na referência inicial.';
  }
}

export default function SolverMethodStages({plan, index, step, moving, onStage, onJump}: {
  plan: MethodPlan; index: number; step: number; moving: boolean; onStage: (index: number) => void; onJump: (step: number) => void;
}) {
  const stage = plan.stages[index];
  const atEnd = step === stage.endStep && !moving;
  const atStart = step === stage.startStep && !moving;
  const empty = stage.startStep === stage.endStep;
  return <section className="solver-method-stages" data-testid="solver-method-stages" data-stage-id={stage.id}>
    <div className="solver-stage-heading"><span className="eyebrow">{plan.method.toUpperCase()} · {plan.stages.length} ETAPAS REAIS</span><span>Etapa {index + 1} de {plan.stages.length}</span></div>
    <div className="solver-stage-tabs" role="group" aria-label="Etapas da solução">{plan.stages.map((item, position) => <button key={item.id} aria-pressed={position === index} onClick={() => onStage(position)}><span>{step >= item.endStep && !moving ? <CheckCircle2 size={15}/> : position + 1}</span>{METHOD_STAGE_LABELS[item.id]}</button>)}</div>
    <div className="solver-stage-card"><h3><Flag size={18}/>{stage.title}</h3><p>{objective(stage)}</p><p className="muted">{stage.explanation}</p>
      <div className="solver-stage-check" role="status">{empty ? 'Esta etapa já está concluída neste estado. Nenhum giro é necessário.' : atEnd ? 'Objetivo desta etapa conferido neste estado. Compare seu cubo antes de continuar.' : atStart ? 'Confira este estado no seu cubo antes de começar a etapa.' : 'Etapa em andamento. O objetivo e a preservação são conferidos no estado final da etapa.'}</div>
      <p className="small muted">{stage.tokens.length} movimentos nesta etapa. {stage.preservedPieces.length ? 'Os resultados anteriores indicados pelo plano são preservados ao final; peças podem se deslocar durante os giros.' : 'A etapa parte do estado real informado, sem substituir peças ou ocultar ajustes.'}</p>
      {stage.preservedPieces.length > 0 && <details><summary>Peças preservadas ao final</summary><p className="small">{stage.preservedPieces.join(' · ')}</p><p className="small muted">As letras identificam cada peça por suas faces na referência resolvida, mesmo quando ela está em outro lugar.</p></details>}
      <p className="small muted">{stage.centerPolicy === 'm-slice-even' ? 'Ao terminar esta etapa, os centros amarelo e branco podem estar invertidos no eixo vertical por M2. O plano ainda precisa alinhá-los ao final.' : stage.centerPolicy === 'fixed' ? 'Os centros devem voltar à referência fixa ao terminar esta etapa. Execute as rotações explícitas da sequência quando indicadas.' : 'Acompanhe a referência de centros mostrada nesta etapa. O plano completo termina na referência fixa.'}</p>
      {stage.adjustments.length > 0 && <div className="solver-stage-adjustments"><strong>Ajustes e rotações desta etapa</strong>{stage.adjustments.map((adjustment, position) => <div key={position}><code>{adjustment.algorithm || 'Nenhum giro'}</code><p>{adjustment.explanation}</p><small>Movimentos {adjustment.startStep + 1} a {adjustment.endStep} da sequência completa.</small></div>)}</div>}
      <div className="solver-stage-controls"><button className="button secondary" onClick={() => onJump(stage.startStep)}>Ver início da etapa</button><button className="button secondary" onClick={() => onJump(stage.endStep)}>Ver objetivo atingido</button></div>
    </div>
    <div className="solver-stage-navigation"><button className="button secondary" disabled={index === 0} onClick={() => onStage(index - 1)}><ChevronLeft size={16}/> Etapa anterior</button><button className="button secondary" disabled={index === plan.stages.length - 1} onClick={() => onStage(index + 1)}>Próxima etapa <ChevronRight size={16}/></button></div>
    <p className="small muted">Saltar uma etapa muda a visualização. Confira se o cubo físico corresponde ao estado exibido antes de executar os próximos giros.</p>
  </section>;
}
