import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Copy, Play, Square } from 'lucide-react';
import type { TimingModeId, TrainerAttempt } from '../../data/trainers';
import { computeTrainerCaseStatistics } from '../../data/trainers';
import SolverPlayer from '../SolverPlayer';
import { solvedCube } from '../../domain/cube';
import { useI18n } from '../../i18n';
import type { PreparedSetup, TrainerProgram } from './programs';
import { createTrainerStore } from './session-store';
import type { TrainerStore } from './session-store';
import { TimingModePicker, TrainerFlowSteps, TrainerSaveRetry, TrainerStopArea } from './TrainerSessionLayout';
import type { TrainerNodeKey } from './catalog';

/** Operational P1 session: select, prepare (outside the clock), attempt in the
 * chosen timing mode, self-evaluated review and durable save with retry that
 * never resets the measured time. Everything measurable comes from the
 * generators; the recognition mode stays out until recognition content exists. */
const SESSION_MODES: readonly TimingModeId[] = ['free', 'timed', 'repetitions', 'continuous-batch', 'duration'];

type Phase =
  | { kind: 'select' }
  | { kind: 'loading' }
  | { kind: 'prepare'; prepared: PreparedSetup }
  | { kind: 'attempt'; prepared: PreparedSetup; startedAt: number | null; laps: readonly number[]; cycles: number; assisted: boolean }
  | { kind: 'review'; prepared: PreparedSetup; laps: readonly number[]; cycles: number; physicalCycles: number | null; assisted: boolean; revealed: boolean }
  | { kind: 'retry'; pending: readonly TrainerAttempt[]; prepared: PreparedSetup }
  | { kind: 'saved'; prepared: PreparedSetup };

const format = (ms: number) => (ms / 1000).toFixed(2).replace('.', ',') + 's';

export default function TrainerSession({ nodeKey, trainerId, title, loadProgram, initialProgram, store, onBack, now }: {
  nodeKey: TrainerNodeKey;
  trainerId: TrainerAttempt['trainerId'];
  title: string;
  loadProgram: () => Promise<TrainerProgram>;
  /** Synchronous hydration seam for SSR-focused tests. */
  initialProgram?: TrainerProgram;
  store?: TrainerStore;
  onBack: () => void;
  now?: () => number;
}) {
  const t = useI18n();
  const clock = now ?? (() => performance.now());
  const trainerStore = useMemo(() => store ?? createTrainerStore(), [store]);
  const [program, setProgram] = useState<TrainerProgram | null>(initialProgram ?? null);
  const [loadError, setLoadError] = useState('');
  const [itemId, setItemId] = useState(initialProgram?.items[0]?.id ?? '');
  const [slot, setSlot] = useState('FR');
  const [levelId, setLevelId] = useState('');
  const [mode, setMode] = useState<TimingModeId>('timed');
  const [repTarget, setRepTarget] = useState(3);
  const [phase, setPhase] = useState<Phase>({ kind: 'select' });
  const [tick, setTick] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [notice, setNotice] = useState('');
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (program) return;
    loadProgram().then(loaded => { if (!live.current) return; setProgram(loaded); setItemId(loaded.items[0]?.id ?? ''); setLevelId(loaded.levels?.[0]?.id ?? ''); }).catch(() => { if (live.current) setLoadError('load'); });
  }, [loadProgram]);
  useEffect(() => {
    if (phase.kind !== 'attempt' || phase.startedAt === null) return;
    const interval = setInterval(() => setTick(value => value + 1), 100);
    return () => clearInterval(interval);
  }, [phase]);
  void tick;

  async function generate() {
    if (!program || !itemId) return;
    setPhase({ kind: 'loading' });
    try {
      const prepared = await program.generate(itemId, { slot, levelId: levelId || undefined, seed: (Date.now() ^ Math.floor(Math.random() * 0xffff)) >>> 0 });
      if (live.current) setPhase({ kind: 'prepare', prepared });
    } catch { if (live.current) { setPhase({ kind: 'select' }); setLoadError('generate'); } }
  }
  function beginAttempt(prepared: PreparedSetup) {
    setPhase({ kind: 'attempt', prepared, startedAt: mode === 'free' || mode === 'duration' ? null : null, laps: [], cycles: 0, assisted: false });
  }
  function startClock() { setPhase(current => current.kind === 'attempt' ? { ...current, startedAt: clock() } : current); }
  function stopClock() {
    setPhase(current => {
      if (current.kind !== 'attempt' || current.startedAt === null) return current;
      const lap = clock() - current.startedAt;
      const laps = [...current.laps, lap];
      if (mode === 'repetitions' && laps.length < repTarget) return { ...current, startedAt: clock(), laps };
      return { kind: 'review', prepared: current.prepared, laps, cycles: current.cycles, physicalCycles: null, assisted: current.assisted, revealed: false };
    });
  }
  function finishAttempt(extra?: { cycles?: number; physicalCycles?: number | null }) {
    setPhase(current => current.kind === 'attempt' ? { kind: 'review', prepared: current.prepared, laps: current.laps, cycles: extra?.cycles ?? current.cycles, physicalCycles: extra?.physicalCycles ?? null, assisted: current.assisted, revealed: false } : current);
  }
  function buildAttempts(review: Extract<Phase, { kind: 'review' }>, outcome: TrainerAttempt['outcome']): TrainerAttempt[] {
    const base = {
      trainerId, contentId: review.prepared.itemId, alternativeId: null,
      hand: null, slot: program?.slots ? (slot as TrainerAttempt['slot']) : null,
      createdAt: new Date().toISOString(), outcome, assisted: review.assisted || outcome === 'consulted',
      inspectionMs: null,
    } as const;
    if (mode === 'timed') return [{ ...base, id: crypto.randomUUID(), timingMode: 'timed', rawMs: review.laps[0] ?? 0, cycles: null, physicalCycles: null }];
    if (mode === 'repetitions') return review.laps.map(lap => ({ ...base, id: crypto.randomUUID(), timingMode: 'repetitions' as const, rawMs: lap, cycles: repTarget, physicalCycles: null }));
    if (mode === 'continuous-batch') return [{ ...base, id: crypto.randomUUID(), timingMode: 'continuous-batch', rawMs: null, cycles: Math.max(1, review.cycles), physicalCycles: null }];
    if (mode === 'duration') return [{ ...base, id: crypto.randomUUID(), timingMode: 'duration', rawMs: null, cycles: null, physicalCycles: Math.max(0, review.physicalCycles ?? 0) }];
    return [{ ...base, id: crypto.randomUUID(), timingMode: 'free', rawMs: null, cycles: null, physicalCycles: null }];
  }
  function save(pending: readonly TrainerAttempt[], prepared: PreparedSetup) {
    for (let index = 0; index < pending.length; index++) {
      const result = trainerStore.append(pending[index]);
      if (result.kind === 'storage-error') { setPhase({ kind: 'retry', pending: pending.slice(index), prepared }); return; }
    }
    setHistoryVersion(value => value + 1);
    setNotice(t.trainers.session.saved);
    setPhase({ kind: 'saved', prepared });
  }

  const attempts = useMemo(() => {
    void historyVersion;
    return trainerStore.load().attempts.filter(attempt => attempt.trainerId === trainerId && attempt.timingMode === mode && (phase.kind === 'select' || phase.kind === 'loading' ? true : attempt.contentId === currentItem(phase)));
  }, [trainerStore, trainerId, mode, phase, historyVersion]);
  const stats = useMemo(() => computeTrainerCaseStatistics(attempts), [attempts]);

  if (loadError) return <p role="alert" className="error-text">{t.trainers.coverage.preparingDetail}</p>;
  if (!program) return <p role="status">…</p>;
  const flowStep = phase.kind === 'select' || phase.kind === 'loading' ? 'select' : phase.kind === 'prepare' ? 'prepare' : phase.kind === 'attempt' ? 'attempt' : 'review';
  return <section className="trainer-session" aria-label={title}>
    <header className="trainer-session-header">
      <button type="button" className="button secondary back-button" onClick={onBack}><ArrowLeft size={15} aria-hidden /> {title}</button>
      <TrainerFlowSteps current={flowStep} />
    </header>
    {(phase.kind === 'select' || phase.kind === 'loading') && <div className="trainer-select panel">
      <label>{t.trainers.session.select.item}<select value={itemId} onChange={event => setItemId(event.target.value)}>{program.items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      {program.slots && <label>{t.trainers.session.select.slot}<select value={slot} onChange={event => setSlot(event.target.value)}>{program.slots.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
      {program.levels && <label>{t.trainers.session.select.level}<select value={levelId} onChange={event => setLevelId(event.target.value)}>{program.levels.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}</select></label>}
      <TimingModePicker value={mode} onChange={setMode} available={SESSION_MODES} />
      {mode === 'repetitions' && <label>{t.trainers.session.select.reps}<input type="number" min={1} max={50} value={repTarget} onChange={event => setRepTarget(Math.max(1, Math.floor(Number(event.target.value) || 1)))} /></label>}
      <button type="button" className="button" disabled={phase.kind === 'loading' || !itemId} onClick={() => { void generate(); }}><Play size={15} aria-hidden /> {t.trainers.session.select.start}</button>
    </div>}
    {phase.kind === 'prepare' && <div className="trainer-session-context">
      <div className="panel"><h3>{t.trainers.session.prepare.title}</h3>
        <p className="small muted">{t.trainers.session.prepare.body}</p>
        <p className="algorithm-text" data-testid="trainer-setup">{phase.prepared.setup}</p>
        {phase.prepared.provenMinimumMoves !== undefined && <p className="small muted">{t.trainers.session.prepare.provenMinimum(phase.prepared.provenMinimumMoves)}</p>}
        <SolverPlayer initialState={solvedCube()} algorithm={phase.prepared.setup} />
        <div className="finger-demo-controls">
          <button type="button" className="text-button" onClick={() => { void navigator.clipboard?.writeText(phase.prepared.setup).then(() => setNotice(t.trainers.session.prepare.copied)); }}><Copy size={14} aria-hidden /> {t.trainers.session.prepare.copy}</button>
          <button type="button" className="button secondary" onClick={() => { void generate(); }}>{t.trainers.session.prepare.regenerate}</button>
          <button type="button" className="button" onClick={() => beginAttempt(phase.prepared)}>{t.trainers.session.prepare.ready}</button>
        </div>
      </div>
    </div>}
    {phase.kind === 'attempt' && <div className="trainer-session-context">
      {mode === 'timed' || mode === 'repetitions' ? (phase.startedAt === null
        ? <button type="button" className="button trainer-start" onClick={startClock}><Play size={16} aria-hidden /> {t.trainers.session.attempt.start}</button>
        : <>
          <p className="timer-digits trainer-session-clock" aria-live="off">{format(clock() - phase.startedAt)}</p>
          {mode === 'repetitions' && <p className="small muted">{t.trainers.session.attempt.repOf(phase.laps.length + 1, repTarget)}</p>}
          <TrainerStopArea label={mode === 'repetitions' ? t.trainers.session.attempt.lap : t.trainers.session.attempt.stop} onStop={stopClock} />
        </>)
        : mode === 'continuous-batch' ? <>
          <p className="trainer-session-clock timer-digits">{t.trainers.session.attempt.cycles(phase.cycles)}</p>
          <div className="finger-demo-controls">
            <button type="button" className="button" onClick={() => setPhase({ ...phase, cycles: phase.cycles + 1 })}>{t.trainers.session.attempt.cycle}</button>
            <button type="button" className="button secondary" disabled={phase.cycles === 0} onClick={() => finishAttempt({ cycles: phase.cycles })}><Square size={15} aria-hidden /> {t.trainers.session.attempt.finish}</button>
          </div>
        </> : mode === 'duration' ? <DurationFinish onFinish={physicalCycles => finishAttempt({ physicalCycles })} />
        : <button type="button" className="button" onClick={() => finishAttempt()}>{t.trainers.session.attempt.finish}</button>}
      {phase.prepared.solution && !phase.assisted && <button type="button" className="text-button" onClick={() => setPhase({ ...phase, assisted: true })}>{t.trainers.session.attempt.consult}</button>}
      {phase.assisted && <p role="status" className="small">{t.trainers.session.attempt.consulted}{phase.prepared.solution && <> <code className="algorithm-text">{phase.prepared.solution}</code></>}</p>}
    </div>}
    {phase.kind === 'review' && <div className="trainer-session-context">
      <div className="panel"><h3>{t.trainers.session.review.title}</h3>
        {phase.laps.length > 0 && <p className="small">{phase.laps.length > 1 ? `${t.trainers.session.review.series}: ${phase.laps.map(format).join(' · ')}` : format(phase.laps[0])}</p>}
        <div className="finger-demo-controls">
          <button type="button" className="button" onClick={() => save(buildAttempts(phase, 'correct'), phase.prepared)}>{t.trainers.session.review.correct}</button>
          <button type="button" className="button secondary" onClick={() => save(buildAttempts(phase, 'wrong'), phase.prepared)}>{t.trainers.session.review.wrong}</button>
          <button type="button" className="button secondary" onClick={() => save(buildAttempts(phase, 'consulted'), phase.prepared)}>{t.trainers.session.review.consulted}</button>
        </div>
        {phase.prepared.solution
          ? <>{!phase.revealed && <button type="button" className="text-button" onClick={() => setPhase({ ...phase, revealed: true })}>{t.trainers.session.review.reveal}</button>}
            {phase.revealed && <><p className="algorithm-text">{phase.prepared.solution}</p><SolverPlayer initialState={phase.prepared.state} algorithm={phase.prepared.solution} /></>}</>
          : <p className="small muted">{t.trainers.session.review.noSolution}</p>}
      </div>
    </div>}
    {phase.kind === 'retry' && <TrainerSaveRetry message={t.trainers.session.saveFailed} onRetry={() => save(phase.pending, phase.prepared)} />}
    {phase.kind === 'saved' && <div className="trainer-session-context">
      {notice && <p role="status">{notice}</p>}
      <div className="finger-demo-controls">
        <button type="button" className="button" onClick={() => { void generate(); }}>{t.trainers.session.again}</button>
        <button type="button" className="button secondary" onClick={() => setPhase({ kind: 'select' })}>{t.trainers.actions.back}</button>
      </div>
    </div>}
    <footer className="trainer-session-history panel">
      <h3>{t.trainers.session.history.title}</h3>
      {stats.attempts === 0 ? <p className="small muted">{t.trainers.session.history.empty}</p> : <p className="small" data-testid="trainer-history">
        {t.trainers.session.history.attempts(stats.attempts)}
        {stats.lastMs !== null && <> · {t.trainers.session.history.last}: {format(stats.lastMs)}</>}
        {stats.bestMs !== null && <> · {t.trainers.session.history.best}: {format(stats.bestMs)}</>}
        {stats.cleanCorrectMeanMs !== null && <> · {t.trainers.session.history.cleanMean(stats.cleanCorrectSampleSize)}: {format(stats.cleanCorrectMeanMs)}</>}
        {stats.correctRate !== null && <> · {t.trainers.session.history.rate}: {Math.round(stats.correctRate * 100)}%</>}
      </p>}
    </footer>
  </section>;
}

function currentItem(phase: Phase): string {
  return phase.kind === 'select' || phase.kind === 'loading' ? '' : phase.prepared.itemId;
}

function DurationFinish({ onFinish }: { onFinish: (physicalCycles: number) => void }) {
  const t = useI18n();
  const [value, setValue] = useState(0);
  return <div className="panel">
    <label>{t.trainers.session.attempt.physicalCycles}<input type="number" min={0} value={value} onChange={event => setValue(Math.max(0, Math.floor(Number(event.target.value) || 0)))} /></label>
    <button type="button" className="button" onClick={() => onFinish(value)}>{t.trainers.session.attempt.finish}</button>
  </div>;
}
