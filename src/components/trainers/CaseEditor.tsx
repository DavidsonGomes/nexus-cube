import { useEffect, useMemo, useRef, useState } from 'react';
import { invertAlgorithm } from '../../domain/cube';
import type { Face } from '../../domain/types';
import { validateDraft } from '../../solver';
import type { DraftFacelets, SolverClient } from '../../solver';
import { createSolverClient } from '../../solver/client';
import SolverWizard from '../SolverWizard';
import CubeView from '../CubeView';
import { useI18n } from '../../i18n';
import { createTrainerStore } from './session-store';
import type { TrainerStore } from './session-store';
import { TrainerSaveRetry } from './TrainerSessionLayout';

const emptyDraft = (): DraftFacelets => ({ U: Array(9).fill(null), R: Array(9).fill(null), F: Array(9).fill(null), D: Array(9).fill(null), L: Array(9).fill(null), B: Array(9).fill(null) }) as unknown as DraftFacelets;

/** Spec item 16: paint a position on the virtual cube, validate physical
 * possibility with the SAME solver validation, derive the setup from a real
 * solve (setup = inverse of the computed solution) and persist through the
 * domain-validated store. No setup is ever fabricated without a solve. */
export default function CaseEditor({ store, createClient }: { store?: TrainerStore; createClient?: () => SolverClient }) {
  const t = useI18n();
  const trainerStore = useMemo(() => store ?? createTrainerStore(), [store]);
  const [draft, setDraft] = useState<DraftFacelets>(emptyDraft);
  const [setup, setSetup] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState<unknown | null>(null);
  const [version, setVersion] = useState(0);
  const client = useRef<SolverClient | null>(null);
  useEffect(() => () => { client.current?.dispose(); }, []);
  const validation = useMemo(() => validateDraft(draft), [draft]);
  const saved = useMemo(() => { void version; return trainerStore.load().personalExercises; }, [trainerStore, version]);
  async function generateSetup() {
    if (validation.kind !== 'valid') return;
    setBusy(true); setError(''); setNotice(t.trainers.editor.generating);
    try {
      if (!client.current) client.current = (createClient ?? createSolverClient)();
      const outcome = await client.current.solve({ requestId: crypto.randomUUID(), method: 'direct', validated: validation });
      if (outcome.kind === 'solution') {
        setSetup(invertAlgorithm(outcome.tokens.join(' ')));
        setNotice(t.trainers.editor.generated);
      } else {
        setNotice(''); setError(t.trainers.editor.generateFailed);
      }
    } catch {
      setNotice(''); setError(t.trainers.editor.generateFailed);
    } finally { setBusy(false); }
  }
  function persist(payload: unknown) {
    const result = trainerStore.savePersonalExercise(payload);
    if (result.kind === 'storage-error') { setRetry(payload); return; }
    setRetry(null);
    if (result.kind === 'invalid') { setError(result.message); return; }
    setVersion(current => current + 1);
    setName(''); setObjective(''); setNote(''); setNotice(t.trainers.editor.saved);
  }
  return <section className="panel trainer-editor" aria-label={t.trainers.editor.title}>
    <h3>{t.trainers.editor.title}</h3>
    <p className="small muted">{t.trainers.editor.hint}</p>
    <SolverWizard draft={draft} issues={validation.kind === 'valid' ? [] : validation.issues} onPaint={(face: Face, index: number, color: Face | null) => { setSetup(''); setDraft(current => { const next = structuredClone(current) as Record<Face, (Face | null)[]>; next[face][index] = color; return next as unknown as DraftFacelets; }); }} onReviewChange={() => {}} />
    {validation.kind === 'valid' && <div className="trainer-editor-valid">
      <p role="status">{t.trainers.editor.valid}</p>
      <CubeView state={validation.state} size={170} label={t.trainers.editor.title} />
      <button type="button" className="button secondary" disabled={busy} onClick={() => { void generateSetup(); }}>{t.trainers.editor.generate}</button>
      {setup && <p className="algorithm-text" data-testid="editor-setup">{setup}</p>}
    </div>}
    <div className="trainer-select">
      <label>{t.trainers.editor.name}<input value={name} onChange={event => setName(event.target.value)} maxLength={80} /></label>
      <label>{t.trainers.editor.objective}<input value={objective} onChange={event => setObjective(event.target.value)} maxLength={200} /></label>
      <label>{t.trainers.editor.note}<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} /></label>
      {!setup && <p className="small muted">{t.trainers.editor.needSetup}</p>}
      <button type="button" className="button" disabled={!setup || !name.trim() || !objective.trim()} onClick={() => persist({ id: `personal/${crypto.randomUUID()}`, name: name.trim(), objective: objective.trim(), note: note.trim(), setup, solution: setup ? invertAlgorithm(setup) : null, createdAt: new Date().toISOString() })}>{t.trainers.editor.save}</button>
    </div>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="error-text">{error}</p>}
    {retry !== null && <TrainerSaveRetry message={t.trainers.session.saveFailed} onRetry={() => persist(retry)} />}
    <h4>{t.trainers.editor.yours} ({saved.length})</h4>
    {saved.length === 0 && <p className="small muted">{t.trainers.editor.none}</p>}
    {saved.length > 0 && <ul className="trainer-lab-saved">{saved.map(item => <li key={item.id}>
      <strong>{item.name}</strong><code>{item.setup}</code>
      <span><button type="button" className="text-button" onClick={() => { trainerStore.removePersonal(item.id); setVersion(current => current + 1); }}>{t.trainers.lab.remove}</button></span>
    </li>)}</ul>}
  </section>;
}
