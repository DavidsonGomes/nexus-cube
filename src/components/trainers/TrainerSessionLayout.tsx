import type { ReactNode } from 'react';
import type { TimingModeId } from '../../data/trainers';
import { useI18n } from '../../i18n';
import { TIMING_MODE_IDS, TRAINER_FLOW_STEP_IDS } from './catalog';
import type { TrainerFlowStep } from './types';

export function TrainerFlowSteps({ current }: { current: TrainerFlowStep }) {
  const t = useI18n();
  const activeIndex = TRAINER_FLOW_STEP_IDS.indexOf(current);
  return <ol className="trainer-flow" aria-label="Etapas do treino">
    {TRAINER_FLOW_STEP_IDS.map((step, index) => <li key={step} aria-current={step === current ? 'step' : undefined} className={index < activeIndex ? 'done' : step === current ? 'current' : undefined}>{t.trainers.flow[step]}</li>)}
  </ol>;
}

export function TimingModePicker({ value, onChange, disabled, available }: {
  value: TimingModeId;
  onChange: (mode: TimingModeId) => void;
  disabled?: boolean;
  available?: readonly TimingModeId[];
}) {
  const t = useI18n();
  const modes = available ? TIMING_MODE_IDS.filter(mode => available.includes(mode)) : TIMING_MODE_IDS;
  const selected = modes.includes(value) ? value : modes[0];
  return <div className="trainer-timing">
    <div className="segmented trainer-timing-modes" role="group" aria-label={t.trainers.timingPickerLabel}>
      {modes.map(mode => <button key={mode} type="button" disabled={disabled} className={mode === selected ? 'selected' : undefined} aria-pressed={mode === selected} onClick={() => onChange(mode)}>{t.trainers.timing[mode].label}</button>)}
    </div>
    <p className="trainer-timing-summary">{t.trainers.timing[selected].summary} {t.trainers.timingOutsideClock}</p>
  </div>;
}

/** Shared session shell. Desktop: 3D cube on the left, contextual panel on the
 * right. Mobile: a single column where the clock and the stop area stay
 * reachable without scrolling. Slots only; domain state arrives in P1. */
export default function TrainerSessionLayout({ header, cube, fingerDemo, context, clock, history }: {
  header: ReactNode;
  cube: ReactNode;
  fingerDemo?: ReactNode;
  context: ReactNode;
  clock?: ReactNode;
  history?: ReactNode;
}) {
  return <div className="trainer-session">
    <header className="trainer-session-header">{header}</header>
    <div className="trainer-session-grid">
      <div className="trainer-session-stage">
        <div className="trainer-session-cube">{cube}</div>
        {fingerDemo}
      </div>
      <div className="trainer-session-context">
        {context}
        {clock}
      </div>
    </div>
    {history && <footer className="trainer-session-history">{history}</footer>}
  </div>;
}

export function TrainerStopArea({ label, hint, onStop, disabled }: { label: string; hint?: string; onStop: () => void; disabled?: boolean }) {
  const t = useI18n();
  return <button type="button" className="trainer-stop" onClick={onStop} disabled={disabled}>
    <span className="trainer-stop-label">{label}</span>
    <span className="trainer-stop-hint">{hint ?? t.trainers.stopHint}</span>
  </button>;
}

export function TrainerSaveRetry({ message, onRetry, busy }: { message: string; onRetry: () => void; busy?: boolean }) {
  const t = useI18n();
  return <div className="trainer-save-retry" role="alert">
    <p>{message} {t.trainers.saveRetry.preserved}</p>
    <button type="button" className="button secondary" onClick={onRetry} disabled={busy}>{t.trainers.saveRetry.retry}</button>
  </div>;
}
