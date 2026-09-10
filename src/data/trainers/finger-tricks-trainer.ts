import { parseAlgorithm } from '../../domain/cube';
import type { ContentProvenance } from '../../domain/types';
import { restoreCyclesOf } from './finger-tricks';
import type { IntegratedFingerTrick } from './finger-tricks';
import { ONE_HANDED_FINGER_TRICKS, TWO_HANDED_FINGER_TRICKS } from './finger-tricks-registry';
import { buildTrainerCoverage } from './registry';
import type { TrainerCoverage, TrainerFixtureSpec } from './types';

const MAX_CUSTOM_SEQUENCE_TOKENS = 64;

function provenanceOf(entry: IntegratedFingerTrick): readonly ContentProvenance[] {
  const sources = entry.record.provenance.sources ?? [];
  return [
    { title: 'Curadoria de finger tricks Nexus Cube', url: 'docs/expansion-curation/finger-tricks-curation-format.md', author: 'Nexus Cube, curadoria Trama', license: 'MIT (Nexus Cube); producao autoral, fontes citadas sem copia' },
    ...sources.map(source => ({ title: source.title, url: source.url, author: 'Referencia citada', license: source.license, ...(source.supports ? { notes: source.supports } : {}) })),
  ];
}

/** One trainer fixture per verified curated sequence: name and pedagogy texts come verbatim
 * from Trama's records, the goal is free practice (self-assessed result, loops continuing
 * from the previous state), and coverage counts only what each verified set contains.
 * One-handed records (spec item 14) belong to the one-handed trainer, never mixed into the
 * two-handed finger tricks catalog.
 */
function fixtureOf(entry: IntegratedFingerTrick, trainerId: 'finger-tricks' | 'one-handed'): TrainerFixtureSpec {
  return {
    id: entry.record.id,
    trainerId,
    methodId: null,
    stageId: null,
    groupId: entry.record.category,
    kind: 'execution',
    name: entry.record.name,
    objective: entry.record.pedagogy?.objective ?? entry.record.name,
    ...(entry.record.pedagogy?.watchFor ? { observe: entry.record.pedagogy.watchFor } : {}),
    precondition: { predicate: 'any-legal' },
    goal: { predicate: 'any-legal' },
    preserve: [],
    referenceFrame: 'fixed',
    setupSubgroup: null,
    difficulty: null,
    focus: null,
    provenance: provenanceOf(entry),
  };
}
export const FINGER_TRICK_TRAINER_FIXTURES: readonly TrainerFixtureSpec[] = TWO_HANDED_FINGER_TRICKS.map(entry => fixtureOf(entry, 'finger-tricks'));
export const ONE_HAND_TRAINER_FIXTURES: readonly TrainerFixtureSpec[] = ONE_HANDED_FINGER_TRICKS.map(entry => fixtureOf(entry, 'one-handed'));
export const FINGER_TRICK_TRAINER_COVERAGE: TrainerCoverage = buildTrainerCoverage('finger-tricks', FINGER_TRICK_TRAINER_FIXTURES);
export const ONE_HAND_TRAINER_COVERAGE: TrainerCoverage = buildTrainerCoverage('one-handed', ONE_HAND_TRAINER_FIXTURES);

export interface CustomFingerTrickSequence { readonly moves: string; readonly tokens: readonly string[]; readonly restoreCycles: number }
/** Personal sequences (spec item 2): validated by the same grammar and proved by the same
 * restore-cycle computation; no grip is ever suggested for them, animation only by contract.
 */
export function validateCustomFingerTrickSequence(moves: string): CustomFingerTrickSequence {
  const tokens = parseAlgorithm(moves);
  if (!tokens.length) throw new Error('Sequencia personalizada vazia.');
  if (tokens.length > MAX_CUSTOM_SEQUENCE_TOKENS) throw new Error(`Sequencia personalizada acima de ${MAX_CUSTOM_SEQUENCE_TOKENS} movimentos.`);
  const canonical = tokens.join(' ');
  return { moves: canonical, tokens, restoreCycles: restoreCyclesOf(canonical) };
}
