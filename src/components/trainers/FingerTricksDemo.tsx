import { useMemo, useState } from 'react';
import { parseAlgorithm } from '../../domain/cube';
import { ArrowLeft, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { applyAlgorithm, solvedCube } from '../../domain/cube';
import { pieceStickerIds } from '../../domain/stage-validation';
import type { IntegratedFingerTrick } from '../../data/trainers';
import { VERIFIED_FINGER_TRICKS, selectFingerTrickCover } from '../../data/trainers/finger-tricks-registry';
import CubeView, { COLORS } from '../CubeView';
import { useI18n } from '../../i18n';

/** Collapsible grip demo next to the cube (docs/trainers-spec.md, UI section).
 * Display authority is the domain: `showGrip` comes from integrateFingerTricks
 * (verified records only); this component renders what it authorizes and never
 * re-derives status. Anchors follow the documented positional sticker ids. */
export default function FingerTricksDemo({ tricks = VERIFIED_FINGER_TRICKS }: { tricks?: readonly IntegratedFingerTrick[] }) {
  const t = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId === null ? null : tricks.find(trick => trick.record.id === openId) ?? null;
  if (open) return <TrickDemo trick={open} onBack={() => setOpenId(null)} />;
  return <section className="finger-demo" aria-label={t.trainers.fingerDemo.title}>
    <h3>{t.trainers.fingerDemo.title} ({tricks.length})</h3>
    <p className="small muted">{t.trainers.fingerDemo.intro}</p>
    <div className="finger-demo-list">
      {tricks.map(trick => <button key={trick.record.id} type="button" className="finger-demo-item" onClick={() => setOpenId(trick.record.id)}>
        <strong>{trick.record.name}</strong>
        <code>{trick.record.moves}</code>
        <span className="small muted">{t.trainers.fingerDemo.restoreCycles(trick.restoreCycles)}</span>
      </button>)}
    </div>
    <SequenceRecognizer tricks={tricks} onOpen={setOpenId} />
  </section>;
}

export function SequenceRecognizer({ tricks, onOpen }: { tricks: readonly IntegratedFingerTrick[]; onOpen: (id: string) => void }) {
  const t = useI18n();
  const [value, setValue] = useState('');
  const tokens = useMemo(() => { try { return parseAlgorithm(value); } catch { return []; } }, [value]);
  const cover = useMemo(() => tokens.length ? selectFingerTrickCover(tokens.join(' '), tricks) : [], [tokens, tricks]);
  const segments = useMemo(() => {
    const byStart = new Map(cover.map(occurrence => [occurrence.startStep, occurrence]));
    const result: { key: string; tokens: string[]; occurrence: typeof cover[number] | null }[] = [];
    for (let index = 0; index < tokens.length;) {
      const occurrence = byStart.get(index);
      if (occurrence) { result.push({ key: `c${index}`, tokens: tokens.slice(occurrence.startStep, occurrence.endStep), occurrence }); index = occurrence.endStep; }
      else { result.push({ key: `g${index}`, tokens: [tokens[index]], occurrence: null }); index++; }
    }
    return result;
  }, [tokens, cover]);
  return <div className="finger-recognize">
    <h4>{t.trainers.fingerDemo.recognize.title}</h4>
    <p className="small muted">{t.trainers.fingerDemo.recognize.hint}</p>
    <input aria-label={t.trainers.fingerDemo.recognize.title} placeholder={t.trainers.fingerDemo.recognize.placeholder} value={value} onChange={event => setValue(event.target.value)} />
    {tokens.length > 0 && <div className="finger-recognize-strip">
      {segments.map(segment => segment.occurrence
        ? <button key={segment.key} type="button" className="finger-recognize-trick" title={t.trainers.fingerDemo.recognize.segment(segment.occurrence.trick.record.name, segment.occurrence.startStep, segment.occurrence.endStep)} onClick={() => onOpen(segment.occurrence!.trick.record.id)}>
            <span>{segment.occurrence.trick.record.name}</span><code>{segment.tokens.join(' ')}</code>
          </button>
        : <code key={segment.key} className="finger-recognize-gap">{segment.tokens.join(' ')}</code>)}
    </div>}
    {tokens.length > 0 && cover.length === 0 && <p className="small muted">{t.trainers.fingerDemo.recognize.empty}</p>}
  </div>;
}

export function TrickDemo({ trick, onBack }: { trick: IntegratedFingerTrick; onBack: () => void }) {
  const t = useI18n();
  const [step, setStep] = useState(0);
  const [gripOpen, setGripOpen] = useState(true);
  const [fullColors, setFullColors] = useState(false);
  const tokens = trick.tokens;
  const state = useMemo(() => applyAlgorithm(solvedCube(), tokens.slice(0, step).join(' ')), [tokens, step]);
  const finished = step >= tokens.length;
  const touches = finished ? [] : trick.record.touches.filter(touch => touch.moveIndex === step);
  const anchorIds = useMemo(() => {
    const pieces = touches.flatMap(touch => touch.anchorPieces ?? []);
    return new Set(pieces.length ? pieceStickerIds(pieces) : []);
  }, [touches]);
  const palette = useMemo(() => fullColors || anchorIds.size === 0 ? undefined : new Map(state.map(sticker => [sticker.id, anchorIds.has(sticker.id) ? COLORS[sticker.color] : 'var(--cube-neutral)'])), [state, anchorIds, fullColors]);
  return <section className="finger-demo-open" aria-label={trick.record.name}>
    <button type="button" className="button secondary back-button" onClick={onBack}><ArrowLeft size={15} aria-hidden /> {t.trainers.fingerDemo.back}</button>
    <div className="finger-demo-heading"><h3>{trick.record.name}</h3><code>{trick.record.moves}</code></div>
    <p className="small muted">{t.trainers.fingerDemo.restoreCycles(trick.restoreCycles)}</p>
    <div className="finger-demo-stage">
      <div className="finger-demo-cube">
        <CubeView state={state} size={210} palette={palette} label={trick.record.name} />
        {trick.showGrip && anchorIds.size > 0 && !fullColors && <p className="cube-focus-caption">{t.trainers.fingerDemo.anchorsCaption}</p>}
        {trick.showGrip && <button type="button" className="text-button cube-color-toggle" aria-pressed={fullColors} onClick={() => setFullColors(value => !value)}>{t.trainers.fingerDemo.fullColors}</button>}
      </div>
      <div className="finger-demo-panel">
        <div className="move-tokens">{tokens.map((token, index) => <button type="button" key={index} className={index === step ? 'current' : index < step ? 'done' : undefined} onClick={() => setStep(index)}>{token}</button>)}</div>
        {finished && <p role="status">{t.trainers.fingerDemo.completed}</p>}
        {!finished && trick.showGrip && <div className="finger-demo-grip">
          <button type="button" className="text-button" aria-expanded={gripOpen} onClick={() => setGripOpen(value => !value)}>{t.trainers.fingerDemo.gripToggle}</button>
          {gripOpen && touches.map(touch => <article key={touch.touchIndex} className="finger-demo-touch">
            <header><strong>{t.trainers.fingerDemo.hand[touch.hand]} · {t.trainers.fingerDemo.finger[touch.finger]}</strong><span className="trainer-coverage">{t.trainers.fingerDemo.touchOf(touch.touchIndex, touch.touchCount)}</span></header>
            <p>{touch.action}. {touch.contactPoint}</p>
            <p>{touch.direction}</p>
            {touch.regripAfter && <p className="small muted">{t.trainers.fingerDemo.regrip}: {touch.regripAfter}</p>}
          </article>)}
        </div>}
        {!finished && !trick.showGrip && <p className="small muted">{t.trainers.fingerDemo.gripUnavailable}</p>}
        <div className="finger-demo-controls">
          <button type="button" className="button secondary" disabled={step === 0} onClick={() => setStep(value => Math.max(0, value - 1))}><ChevronLeft size={15} aria-hidden /> {t.trainers.fingerDemo.previous}</button>
          <button type="button" className="button secondary" disabled={finished} onClick={() => setStep(value => Math.min(tokens.length, value + 1))}>{t.trainers.fingerDemo.next} <ChevronRight size={15} aria-hidden /></button>
          <button type="button" className="text-button" disabled={step === 0} onClick={() => setStep(0)}><RotateCcw size={14} aria-hidden /> {t.trainers.fingerDemo.restart}</button>
        </div>
      </div>
    </div>
  </section>;
}
