import {FACE_COLOR_LABELS} from '../domain/cube';
import {canonicalSlotToWizard} from '../solver/wizard';
import type {SolverIssue, SolverSlot} from '../solver';

export default function SolverIssueSummary({issues, onLocate}: {issues:readonly SolverIssue[]; onLocate:(slot:SolverSlot)=>void}) {
  const groups = new Map<string, SolverIssue[]>();
  for (const issue of issues) {const key = issue.code + ':' + issue.message; groups.set(key, [...(groups.get(key) ?? []), issue]);}
  return <div className="solver-issue-summary" data-testid="solver-issue-summary">
    {[...groups].map(([key, occurrences]) => <section key={key}>
      <p>{occurrences[0].message}</p>
      {occurrences[0].counts && <ul className="solver-color-counts">{(Object.keys(FACE_COLOR_LABELS) as (keyof typeof FACE_COLOR_LABELS)[]).map(face=><li key={face}>{FACE_COLOR_LABELS[face]}: {occurrences[0].counts![face]} de {occurrences[0].expected ?? 9}</li>)}</ul>}
      {occurrences.length > 1 && <strong>{occurrences.length} ocorrências para revisar</strong>}
      {occurrences.some(issue => issue.slots.length > 0) && <details><summary>Localizar posições relacionadas</summary>
        <ol>{occurrences.map((issue, index) => <li key={index}>
          <span>{issue.scope === 'piece' ? 'Peça' : 'Ocorrência'} {index + 1}</span>
          <div>{issue.slots.map((slot, i) => {const local = canonicalSlotToWizard(slot);return <button key={i} type="button" className="text-button" onClick={() => onLocate(slot)}>{FACE_COLOR_LABELS[local.face]}: linha {Math.floor(local.index / 3) + 1}, coluna {local.index % 3 + 1}</button>;})}</div>
          {!issue.slots.length && <small>O validador não localiza uma posição para esta ocorrência.</small>}
        </li>)}</ol>
      </details>}
      {occurrences.some(issue => issue.scope === 'cube' && !issue.slots.length) && <small>Este aviso se refere ao conjunto do cubo; não identifica sozinho uma posição incorreta.</small>}
    </section>)}
    {issues.some(issue => issue.slots.length > 0) && <p className="small muted">Os contornos indicam posições relacionadas à inconsistência, não necessariamente a sua causa. Compare essas posições com o cubo físico.</p>}
  </div>;
}
