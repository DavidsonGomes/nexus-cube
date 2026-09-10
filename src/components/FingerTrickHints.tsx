import { useMemo, useState } from 'react';
import type { FingerTrickTouch } from '../data/trainers';
import { selectFingerTrickCover } from '../data/trainers/finger-tricks-registry';
import { useI18n } from '../i18n';

/** Per-step finger trick guidance for players (docs/trainers-spec.md item 1).
 * The cover comes from the domain over the VERIFIED registry only, so the
 * display contract (grip only for verified) holds by construction; the hint
 * follows the exact sequence, never a universal move-to-finger table. */
export function TouchCard({ touch }: { touch: FingerTrickTouch }) {
  const t = useI18n();
  return <article className="finger-demo-touch">
    <header><strong>{t.trainers.fingerDemo.hand[touch.hand]} · {t.trainers.fingerDemo.finger[touch.finger]}</strong><span className="trainer-coverage">{t.trainers.fingerDemo.touchOf(touch.touchIndex, touch.touchCount)}</span></header>
    <p>{touch.action}. {touch.contactPoint}</p>
    <p>{touch.direction}</p>
    {touch.regripAfter && <p className="small muted">{t.trainers.fingerDemo.regrip}: {touch.regripAfter}</p>}
  </article>;
}

export default function FingerTrickHints({ tokens, step }: { tokens: readonly string[]; step: number }) {
  const t = useI18n();
  const [open, setOpen] = useState(true);
  const cover = useMemo(() => tokens.length ? selectFingerTrickCover(tokens.join(' ')) : [], [tokens]);
  const occurrence = cover.find(item => step >= item.startStep && step < item.endStep) ?? null;
  const touches = occurrence ? occurrence.touches.filter(touch => touch.globalMoveIndex === step) : [];
  if (cover.length === 0) return null;
  return <div className="finger-hints" data-testid="finger-hints">
    <button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{t.solver.fingerHints.toggle}</button>
    {open && (occurrence
      ? <div className="finger-demo-grip">
        <p className="small"><strong>{occurrence.trick.record.name}</strong> · <code>{occurrence.trick.record.moves}</code> · {t.solver.fingerHints.span(occurrence.startStep + 1, occurrence.endStep)}</p>
        {touches.map(touch => <TouchCard key={`${touch.moveIndex}:${touch.touchIndex}`} touch={touch} />)}
      </div>
      : <p className="small muted">{t.solver.fingerHints.none}</p>)}
  </div>;
}
