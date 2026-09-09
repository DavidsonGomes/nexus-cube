import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import type { MethodId, StageId } from '../../domain';

import { useI18n } from '../../i18n';
import { TIMING_MODE_IDS } from './catalog';
import FingerTricksDemo from './FingerTricksDemo';
import type { CatalogSectionId, TrainerNodeKey } from './catalog';
import type { TrainerCatalogGroup, TrainerCatalogNode } from './types';

function Motif({ section }: { section: CatalogSectionId }) {
  return <span className={`trainer-motif motif-${section}`} aria-hidden>{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</span>;
}

function CoveragePill({ node }: { node: TrainerCatalogNode }) {
  const t = useI18n();
  const available = node.coverage !== null && node.coverage.validatedContentCount > 0;
  return <span className={`trainer-coverage ${available ? 'available' : 'preparing'}`}>
    {node.coverage !== null && available ? t.trainers.coverage.validated(node.coverage.validatedContentCount, node.coverage.declared) : t.trainers.coverage.preparing}
  </span>;
}

export function TrainersOverview({ groups, onOpenGroup }: { groups: readonly TrainerCatalogGroup[]; onOpenGroup: (section: CatalogSectionId) => void }) {
  const t = useI18n();
  return <div className="trainer-overview">
    {groups.map(group => {
      const validated = group.nodes.filter(node => node.coverage !== null && node.coverage.validatedContentCount > 0).length;
      return <button key={group.id} type="button" className="trainer-group-card" onClick={() => onOpenGroup(group.id)}>
        <Motif section={group.id} />
        <span className="trainer-group-card-copy">
          <strong>{t.trainers.groups[group.id].title}</strong>
          <span>{t.trainers.groups[group.id].description}</span>
          <small>{t.trainers.overview.trainersCount(group.nodes.length)} · {t.trainers.overview.validatedSummary(validated)}</small>
        </span>
        <span className="trainer-group-card-open">{t.trainers.overview.open} <ArrowUpRight size={15} aria-hidden /></span>
      </button>;
    })}
  </div>;
}

export function TrainerGroupView({ group, onBack, onOpenTrainer, onOpenStudy }: {
  group: TrainerCatalogGroup;
  onBack: () => void;
  onOpenTrainer: (key: TrainerNodeKey) => void;
  onOpenStudy: (methodId: MethodId, stageId: StageId) => void;
}) {
  const t = useI18n();
  return <section aria-labelledby={`trainer-group-${group.id}`}>
    <div className="trainer-drill-heading">
      <button type="button" className="button secondary back-button" onClick={onBack}><ArrowLeft size={15} aria-hidden /> {t.trainers.actions.backToGroups}</button>
      <div className="trainer-drill-title"><Motif section={group.id} />
        <div><h2 id={`trainer-group-${group.id}`}>{t.trainers.groups[group.id].title}</h2><p>{t.trainers.groups[group.id].description}</p></div>
      </div>
    </div>
    <div className="trainer-cards">
      {group.nodes.map(node => {
        const entry = t.trainers.catalog[node.key];
        return <article key={node.key} className="trainer-card">
          <button type="button" className="trainer-card-main" onClick={() => onOpenTrainer(node.key)}>
            <span className="trainer-card-title"><strong>{entry.name}</strong><ArrowUpRight size={15} aria-hidden /></span>
            <CoveragePill node={node} />
            <span className="trainer-card-description">{entry.description}</span>
          </button>
          {(entry.submodes.length > 0 || node.study) && <footer className="trainer-card-footer">
            {entry.submodes.length > 0 && <ul className="trainer-submodes">{entry.submodes.map(submode => <li key={submode}>{submode}</li>)}</ul>}
            {node.study && <button type="button" className="text-button" onClick={() => onOpenStudy(node.study!.methodId, node.study!.stageId)}>{t.trainers.actions.study(node.study.count)}</button>}
          </footer>}
        </article>;
      })}
    </div>
  </section>;
}

export function TrainerDetailView({ section, node, onBack, onOpenStudy, onTrain }: {
  section: CatalogSectionId;
  node: TrainerCatalogNode;
  onBack: () => void;
  onOpenStudy: (methodId: MethodId, stageId: StageId) => void;
  onTrain?: () => void;
}) {
  const t = useI18n();
  const entry = t.trainers.catalog[node.key];
  const available = node.coverage !== null && node.coverage.validatedContentCount > 0;
  return <section className="panel trainer-detail" aria-labelledby={`trainer-detail-${node.key}`}>
    <button type="button" className="button secondary back-button" onClick={onBack}><ArrowLeft size={15} aria-hidden /> {t.trainers.groups[section].title}</button>
    <div className="trainer-detail-heading">
      <div><h2 id={`trainer-detail-${node.key}`}>{entry.name}</h2><CoveragePill node={node} /></div>
      <div className="finger-demo-controls">
        {onTrain && <button type="button" className="button" onClick={onTrain}>{t.trainers.session.train}</button>}
        {node.study && <button type="button" className="button secondary" onClick={() => onOpenStudy(node.study!.methodId, node.study!.stageId)}>{t.trainers.actions.study(node.study.count)} <ArrowUpRight size={15} aria-hidden /></button>}
      </div>
    </div>
    <p className="trainer-detail-description">{entry.description}</p>
    {entry.submodes.length > 0 && <><h3>{t.trainers.detail.submodesTitle}</h3><ul className="trainer-submodes">{entry.submodes.map(submode => <li key={submode}>{submode}</li>)}</ul></>}
    {!available && <p className="trainer-detail-state">{t.trainers.coverage.preparingDetail}</p>}
    {node.key === 'finger-tricks' && <FingerTricksDemo />}
    <h3>{t.trainers.detail.timingTitle}</h3>
    <dl className="trainer-detail-timing">
      {TIMING_MODE_IDS.map(mode => <div key={mode}><dt>{t.trainers.timing[mode].label}</dt><dd>{t.trainers.timing[mode].summary}</dd></div>)}
    </dl>
    <p className="small muted">{t.trainers.detail.timingNote}</p>
  </section>;
}
