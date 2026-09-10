import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { LEARNING_CONTENT } from '../domain';
import type { MethodId, StageId } from '../domain';
import { ROUX_TRAINER_FIXTURES } from '../solver/methods/roux/trainer-fixtures';
import { LBL_TRAINER_FIXTURES } from '../solver/methods/lbl/trainer-fixtures';
import type { CatalogSectionId, TrainerNodeKey } from '../components/trainers/catalog';
import { useI18n } from '../i18n';
import { TrainerDetailView, TrainerGroupView, TrainersOverview } from '../components/trainers/TrainersCatalog';
import TrainerSession from '../components/trainers/TrainerSession';
import AlgorithmLab from '../components/trainers/AlgorithmLab';
import CaseEditor from '../components/trainers/CaseEditor';
import { programFor } from '../components/trainers/programs';
import { ptBR } from '../i18n/pt-BR';
import { buildTrainerCatalog } from '../components/trainers/catalog';

type CatalogView =
  | { level: 'overview' }
  | { level: 'group'; section: CatalogSectionId }
  | { level: 'trainer'; section: CatalogSectionId; key: TrainerNodeKey }
  | { level: 'session'; section: CatalogSectionId; key: TrainerNodeKey };

export default function TrainersPage({ onOpenLibrary }: { onOpenLibrary: (methodId: MethodId, stageId: StageId) => void }) {
  const t = useI18n();
  const [view, setView] = useState<CatalogView>({ level: 'overview' });
  const groups = useMemo(() => buildTrainerCatalog({
    studyCounts: (methodId, stageId) => LEARNING_CONTENT.filter(item => item.methodId === methodId && item.stageId === stageId).length,
    // Published domain registry (Prisma P1). Coverage for the generator-based
    // trainers (cross/F2L/OLL/PLL) waits for their fixture-spec contract.
    fixtures: [...LBL_TRAINER_FIXTURES, ...ROUX_TRAINER_FIXTURES],
  }), []);
  function go(next: CatalogView) { setView(next); window.scrollTo({ top: 0 }); }
  if (view.level === 'session') {
    const group = groups.find(item => item.id === view.section)!;
    const node = group.nodes.find(item => item.key === view.key)!;
    const load = programFor(view.key)!;
    return <TrainerSession nodeKey={view.key} trainerId={node.id!} title={ptBR.trainers.catalog[view.key].name} loadProgram={load} onBack={() => go({ level: 'trainer', section: view.section, key: view.key })} />;
  }
  if (view.level === 'trainer') {
    const group = groups.find(item => item.id === view.section)!;
    const node = group.nodes.find(item => item.key === view.key)!;
    if (view.key === 'algorithm-lab') return <div className="trainer-tool"><button type="button" className="button secondary back-button" onClick={() => go({ level: 'group', section: view.section })}>{ptBR.trainers.groups[view.section].title}</button><AlgorithmLab /></div>;
    if (view.key === 'case-editor') return <div className="trainer-tool"><button type="button" className="button secondary back-button" onClick={() => go({ level: 'group', section: view.section })}>{ptBR.trainers.groups[view.section].title}</button><CaseEditor /></div>;
    const trainable = node.id !== null && programFor(view.key) !== null;
    return <TrainerDetailView section={view.section} node={node} onBack={() => go({ level: 'group', section: view.section })} onOpenStudy={onOpenLibrary} onTrain={trainable ? () => go({ level: 'session', section: view.section, key: view.key }) : undefined} />;
  }
  if (view.level === 'group') {
    const group = groups.find(item => item.id === view.section)!;
    return <TrainerGroupView group={group} onBack={() => go({ level: 'overview' })} onOpenTrainer={key => go({ level: 'trainer', section: view.section, key })} onOpenStudy={onOpenLibrary} />;
  }
  return <>
    <section className="trainer-intro panel">
      <div className="trainer-intro-copy">
        <Sparkles size={19} aria-hidden />
        <div>
          <h2>{t.trainers.intro.title}</h2>
          <p>{t.trainers.intro.body}</p>
        </div>
      </div>
    </section>
    <TrainersOverview groups={groups} onOpenGroup={section => go({ level: 'group', section })} />
  </>;
}
