import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowRight, CheckCircle2, Copy, LoaderCircle, RotateCcw, ShieldCheck, X} from 'lucide-react';
import type {Face} from '../domain';
import {createSolverClient, createEmptyDraft, getDraftPreview, SOLVER_FACES, validateDraft} from '../solver';
import type {DraftFacelets, SolverClient, SolverOutcome, SolverPhase, SolverMode, MethodStageId} from '../solver';
import type {ContextHandle} from '../cloud/types';
import {useData} from '../components/AppContext';
import CubeView from '../components/CubeView';
import CubeFaceEditor, {SOLVER_COLOR_LABELS} from '../components/CubeFaceEditor';
import SolverPlayer from '../components/SolverPlayer';
import {METHOD_STAGE_LABELS} from '../components/SolverMethodStages';

type Solution = Extract<SolverOutcome, {kind:'solution'}>;
type Job = {requestId:string; inputKey:string; method:SolverMode; revision:number; context:ContextHandle; controller:AbortController};
const sameContext = (a:ContextHandle, b:ContextHandle|null) => !!b && a.projectRef === b.projectRef && a.userId === b.userId && a.generation === b.generation;
const phaseLabels: Record<SolverPhase,string> = {initializing:'Preparando o solucionador local…', solving:'Calculando os movimentos…', verifying:'Conferindo a solução para as cores informadas…'};
const modes: {id:SolverMode; title:string; description:string}[] = [
  {id:'direct',title:'Direta',description:'Uma sequência geral para o estado informado, um giro por vez.'},
  {id:'cfop',title:'CFOP',description:'Cruz branca, quatro pares, orientação e permutação da última camada.'},
  {id:'roux',title:'Roux',description:'Dois blocos, cantos e conclusão das seis arestas e dos centros.'},
];
// All three real worker paths passed the coordinated local UI checks.
const releasedMethods:readonly SolverMode[] = ['direct', 'cfop', 'roux'];

export default function SolverPage({createClient = createSolverClient, availableMethods = releasedMethods}: {createClient?:()=>SolverClient; availableMethods?:readonly SolverMode[]}) {
  const {cloud, service, notifyForContext} = useData();
  const [draft, setDraft] = useState<DraftFacelets>(createEmptyDraft);
  const [solution, setSolution] = useState<Solution|null>(null);
  const [phase, setPhase] = useState<SolverPhase|null>(null);
  const [method, setMethod] = useState<SolverMode>('direct');
  const [stageProgress, setStageProgress] = useState<MethodStageId|null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const client = useRef<SolverClient|null>(null);
  const job = useRef<Job|null>(null);
  const revision = useRef(0);
  const mounted = useRef(true);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const validation = useMemo(() => validateDraft(draft), [draft]);
  const preview = useMemo(() => getDraftPreview(draft), [draft]);
  const palette = useMemo(() => new Map(Object.entries(preview.palette)), [preview]);
  const filled = SOLVER_FACES.flatMap(face => draft[face]).filter(color => color !== null).length;
  const issues = validation.kind === 'valid' ? [] : validation.issues;
  const issueSlots = validation.kind === 'invalid' ? validation.issues.flatMap(issue => issue.slots) : [];
  function authorized() {const current=service.getSnapshot(); return current.status === 'authenticated' || current.status === 'offline-account';}
  function current(candidate:Job) {
    return mounted.current && job.current === candidate && revision.current === candidate.revision && authorized() && sameContext(candidate.context, service.getSnapshot().context);
  }
  function stop() {
    job.current?.controller.abort(); job.current = null;
    client.current?.cancel(); setPhase(null); setStageProgress(null);
  }
  function chooseMethod(next:SolverMode) {
    if (next === method || !availableMethods.includes(next)) return;
    stop(); revision.current++; setSolution(null); setError(''); setMethod(next);
    setStatus('O novo plano partirá das cores do editor. Se você já moveu o cubo físico, confira a entrada antes de continuar.');
  }
  function replaceDraft(next:DraftFacelets) {
    stop(); revision.current++; setSolution(null); setError(''); setStatus(solution || phase ? 'As cores mudaram. Calcule outra solução para este estado.' : ''); setDraft(next); setResetOpen(false);
  }
  function paint(face:Face, index:number, color:Face|null) {
    if (index === 4 || draft[face][index] === color) return;
    replaceDraft({...draft, [face]:draft[face].map((value, slot) => slot === index ? color : value)});
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; job.current?.controller.abort(); job.current = null; client.current?.dispose(); client.current = null; };
  }, []);
  useEffect(() => {if(solution) resultHeading.current?.focus();}, [solution]);
  async function solve() {
    const context = service.getSnapshot().context;
    if (!context || !context.userId || !authorized() || validation.kind !== 'valid' || job.current || !availableMethods.includes(method)) return;
    const candidate:Job = {requestId:crypto.randomUUID(), inputKey:validation.inputKey, method, revision:revision.current, context:{...context}, controller:new AbortController()};
    job.current = candidate; setPhase('initializing'); setStageProgress(null); setSolution(null); setError(''); setStatus('');
    try {
      client.current ??= createClient();
      const result = await client.current.solve({requestId:candidate.requestId, validated:validation, method:candidate.method}, {signal:candidate.controller.signal, onProgress:event => {
        if(current(candidate) && event.requestId === candidate.requestId && event.inputKey === candidate.inputKey && (!event.method || event.method === candidate.method)) {setPhase(event.phase); setStageProgress(event.stageId ?? null);}
      }});
      if(!current(candidate)) return;
      job.current = null; setPhase(null);
      if(result.requestId !== candidate.requestId || result.inputKey !== candidate.inputKey) {setError('A resposta não corresponde ao cubo informado. Tente resolver novamente.'); return;}
      if(result.kind === 'solution') {
        if(result.method !== candidate.method) {setError('O método recebido não corresponde à sua escolha. O resultado foi descartado.'); return;}
        setSolution(result);
      }
      else if(result.kind === 'error') setError(result.code === 'search-limit' || result.code === 'timeout' ? 'Não foi possível concluir este plano dentro do limite de busca. O estado informado continua válido. Você pode tentar outro método.' : result.message);
      else setStatus('Solicitação cancelada. Você pode continuar editando.');
    } catch {
      if(!current(candidate)) return;
      job.current = null; setPhase(null); setError('Não foi possível calcular agora. Seu preenchimento foi preservado. Tente novamente.');
    }
  }
  async function copySolution() {
    const context=cloud.context, captured=solution;
    if(!captured || !context || !authorized() || !sameContext(context, service.getSnapshot().context))return;
    try {await navigator.clipboard.writeText(captured.algorithm); if(mounted.current)notifyForContext('Solução copiada.', context);} catch {if(mounted.current)notifyForContext('Não foi possível copiar a solução.', context);}
  }
  if(!cloud.context?.userId || !(cloud.status === 'authenticated' || cloud.status === 'offline-account')) return null;
  return <div className="solver-page" data-testid="solver-page">
    <section className="solver-intro"><span className="solver-intro-icon"><ShieldCheck size={23}/></span><div><strong>Comece por aqui</strong><p>Segure o cubo com o centro <b>amarelo em cima</b>, <b>verde à frente</b> e <b>vermelho à direita</b>. Os 6 centros já estão definidos. Preencha as outras 48 posições para representar os 54 adesivos. Confira o passo inicial e execute a sequência no seu cubo. O cálculo acontece neste dispositivo.</p></div></section>
    <section className="solver-mode-section" aria-label="Escolha do método"><div className="solver-mode-picker">{modes.map(mode => <button key={mode.id} className={method === mode.id ? 'selected' : ''} aria-pressed={method === mode.id} disabled={!availableMethods.includes(mode.id)} onClick={() => chooseMethod(mode.id)}><strong>{mode.title}</strong><span>{mode.description}</span>{!availableMethods.includes(mode.id) && <small>Em implementação e validação</small>}</button>)}</div><p className="small muted">Nenhum modo promete a menor sequência. Trocar o método reinicia a reprodução a partir das cores informadas.</p></section>
    <div className="solver-workspace">
      <section className="panel solver-editor-panel"><CubeFaceEditor draft={draft} onPaint={paint} issueSlots={issueSlots}/>
        <div className="solver-edit-actions"><button className="text-button" onClick={() => setResetOpen(value => !value)}><RotateCcw size={16}/> Limpar adesivos</button></div>
        {resetOpen && <div className="solver-reset-confirm"><p>Apagar as cores preenchidas? Os seis centros continuam fixos.</p><div><button className="button secondary" onClick={() => setResetOpen(false)}>Manter</button><button className="button" onClick={() => replaceDraft(createEmptyDraft())}>Limpar preenchimento</button></div></div>}
      </section>
      <aside className="solver-preview-column">
        <section className="panel solver-preview"><div className="panel-heading"><h2>Seu preenchimento em 3D</h2><span className="solver-count">{filled}/54</span></div>
          <CubeView state={preview.state} palette={palette} size={260} label="Prévia das cores informadas no editor"/>
          <p className="muted">Arraste para girar a câmera. Cinza indica uma posição ainda sem cor. A prévia acompanha suas edições.</p>
          <div className={`solver-validation ${validation.kind}`} aria-live="polite" data-testid="solver-validation">
            {validation.kind === 'valid' ? <><CheckCircle2 size={20}/><div><strong>Estado válido</strong><p>As peças e suas orientações formam um cubo possível.</p></div></> : <div><strong>{validation.kind === 'incomplete' ? `Faltam ${54 - filled} adesivos` : 'Revise o preenchimento'}</strong>{issues.map((issue,index) => <div key={`${issue.code}-${index}`}><p>{issue.message}</p>{issue.code === 'color-count' && issue.counts && <ul className="solver-color-counts">{SOLVER_FACES.map(face => <li key={face}>{SOLVER_COLOR_LABELS[face]}: {issue.counts![face]} de {issue.expected ?? 9}</li>)}</ul>}{issue.scope === 'cube' && issue.slots.length === 0 && ['corner-twist','edge-flip','permutation-parity'].includes(issue.code) && <small>O aviso descreve o conjunto informado; ele não identifica sozinho onde houve erro.</small>}</div>)}{issueSlots.length > 0 && <small>Os contornos indicam posições relacionadas à inconsistência, não necessariamente a sua causa.</small>}</div>}
          </div>
          {phase ? <div className="solver-working" role="status"><LoaderCircle size={19} className="persistence-spinner"/><span>{phaseLabels[phase]}{stageProgress && <small className="solver-progress-stage">{METHOD_STAGE_LABELS[stageProgress]}</small>}</span><button className="icon-button" aria-label="Cancelar cálculo" onClick={() => {stop();setStatus('Solicitação cancelada. Você pode continuar editando.');}}><X size={18}/></button></div> : <button className="button solver-solve" data-testid="solver-submit" disabled={validation.kind !== 'valid'} onClick={() => void solve()}>Resolver este cubo <ArrowRight size={18}/></button>}
          {status && <p className="solver-feedback" role="status">{status}</p>}{error && <p className="solver-feedback error" role="alert">{error}</p>}
        </section>
        <details className="panel solver-guide"><summary>Conferir a orientação das faces</summary><p>Os centros identificam as faces e não mudam de lugar. Ao olhar a face de trás, mantenha amarelo em cima: a face laranja fica à direita dessa grade. Ao olhar a face de baixo, mantenha verde acima da grade.</p><p>Use as indicações ao redor de cada face. Se o esquema do seu cubo for diferente, ele não é compatível com esta versão. Não troque as cores na transcrição para fazer a entrada passar na validação.</p><p>Este editor não registra tempos, não altera sessões e não cria tentativas de estudo. O preenchimento é temporário e é descartado ao sair desta área.</p></details>
      </aside>
    </div>
    {solution && <section className="panel solver-result" data-testid="solver-result"><div className="panel-heading"><div><span className="eyebrow">3. ACOMPANHE NO SEU CUBO</span><h2 ref={resultHeading} tabIndex={-1}>{solution.tokens.length ? 'Uma solução para o seu estado.' : 'Seu cubo já está resolvido.'}</h2></div><button className="button secondary" disabled={!solution.tokens.length} onClick={() => void copySolution()}><Copy size={16}/> Copiar solução</button></div><p className="muted">{solution.method === 'direct' ? 'Solução Direta pronta. Confira o cubo no passo inicial antes de começar. Esta sequência geral não corresponde necessariamente às etapas de CFOP ou Roux.' : `Plano ${solution.method.toUpperCase()} pronto, com ${solution.plan.stages.length} etapas verificadas a partir das cores informadas. Confira a entrada e os objetivos antes de executar os giros.`} Nenhuma sequência promete o menor número de movimentos.</p><SolverPlayer key={solution.requestId + ':' + solution.inputKey} initialState={solution.initialState} algorithm={solution.algorithm} plan={solution.method === 'direct' ? undefined : solution.plan}/></section>}
  </div>;
}
