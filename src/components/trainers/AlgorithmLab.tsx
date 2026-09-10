import { useMemo, useState } from 'react';
import { invertAlgorithm, parseAlgorithm, solvedCube } from '../../domain/cube';
import SolverPlayer from '../SolverPlayer';
import { useI18n } from '../../i18n';
import { createTrainerStore } from './session-store';
import type { TrainerStore } from './session-store';
import { TrainerSaveRetry } from './TrainerSessionLayout';

/** Spec item 15: type, edit and replay sequences in 3D; invert, repeat, take a
 * slice, and persist personal algorithms through the domain-validated store.
 * The 3D replay is the real shared player; nothing here fabricates state. */
export default function AlgorithmLab({ store, initial = "R U R' U'" }: { store?: TrainerStore; initial?: string }) {
  const t = useI18n();
  const trainerStore = useMemo(() => store ?? createTrainerStore(), [store]);
  const [value, setValue] = useState(initial);
  const [name, setName] = useState('');
  const [sliceFrom, setSliceFrom] = useState(1);
  const [sliceTo, setSliceTo] = useState(4);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<unknown | null>(null);
  const [version, setVersion] = useState(0);
  const tokens = useMemo(() => { try { return parseAlgorithm(value); } catch { return null; } }, [value]);
  const saved = useMemo(() => { void version; return trainerStore.load().personalAlgorithms; }, [trainerStore, version]);
  function apply(next: string) { setValue(next); setNotice(''); setError(''); }
  function persist(payload: unknown) {
    const result = trainerStore.savePersonalAlgorithm(payload);
    if (result.kind === 'storage-error') { setRetry(payload); return; }
    setRetry(null);
    if (result.kind === 'invalid') { setError(result.message); return; }
    setVersion(current => current + 1);
    setName('');
    setNotice(t.trainers.lab.saved);
  }
  return <section className="panel trainer-lab" aria-label={t.trainers.lab.title}>
    <h3>{t.trainers.lab.title}</h3>
    <label>{t.trainers.lab.input}<input value={value} onChange={event => apply(event.target.value)} className="algorithm-text" data-testid="lab-input" /></label>
    {tokens === null && <p role="alert" className="error-text">{t.trainers.lab.invalid}</p>}
    {tokens !== null && tokens.length > 0 && <>
      <div className="finger-demo-controls">
        <button type="button" className="button secondary" onClick={() => apply(invertAlgorithm(tokens.join(' ')))}>{t.trainers.lab.invert}</button>
        <button type="button" className="button secondary" onClick={() => apply(`${tokens.join(' ')} ${tokens.join(' ')}`)}>{t.trainers.lab.repeat}</button>
        <label className="trainer-lab-slice">{t.trainers.lab.sliceFrom}
          <input type="number" min={1} max={tokens.length} value={sliceFrom} onChange={event => setSliceFrom(Math.min(tokens.length, Math.max(1, Math.floor(Number(event.target.value) || 1))))} />
          {t.trainers.lab.sliceTo}
          <input type="number" min={sliceFrom} max={tokens.length} value={Math.min(sliceTo, tokens.length)} onChange={event => setSliceTo(Math.min(tokens.length, Math.max(sliceFrom, Math.floor(Number(event.target.value) || sliceFrom))))} />
          <button type="button" className="text-button" onClick={() => apply(tokens.slice(sliceFrom - 1, Math.min(sliceTo, tokens.length)).join(' '))}>{t.trainers.lab.slice}</button>
        </label>
      </div>
      <SolverPlayer initialState={solvedCube()} algorithm={tokens.join(' ')} />
      <div className="finger-demo-controls">
        <label>{t.trainers.lab.saveName}<input value={name} onChange={event => setName(event.target.value)} maxLength={80} /></label>
        <button type="button" className="button" disabled={!name.trim()} onClick={() => persist({ id: `personal/${crypto.randomUUID()}`, contentId: null, name: name.trim(), moves: tokens.join(' '), createdAt: new Date().toISOString() })}>{t.trainers.lab.save}</button>
      </div>
    </>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="error-text">{error}</p>}
    {retry !== null && <TrainerSaveRetry message={t.trainers.session.saveFailed} onRetry={() => persist(retry)} />}
    <h4>{t.trainers.lab.yours} ({saved.length})</h4>
    {saved.length === 0 && <p className="small muted">{t.trainers.lab.none}</p>}
    {saved.length > 0 && <ul className="trainer-lab-saved">{saved.map(item => <li key={item.id}>
      <strong>{item.name}</strong><code>{item.moves}</code>
      <span>
        <button type="button" className="text-button" onClick={() => apply(item.moves)}>{t.trainers.lab.load}</button>
        <button type="button" className="text-button" onClick={() => { trainerStore.removePersonal(item.id); setVersion(current => current + 1); }}>{t.trainers.lab.remove}</button>
      </span>
    </li>)}</ul>}
  </section>;
}
