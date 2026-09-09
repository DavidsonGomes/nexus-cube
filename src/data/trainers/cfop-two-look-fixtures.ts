import type { ContentProvenance } from '../../domain/types';
import type { TrainerFixtureSpec } from './types';

const F2L_PIECES = ['DF', 'DR', 'DB', 'DL', 'FR', 'DFR', 'FL', 'DFL', 'BR', 'DBR', 'BL', 'DBL'] as const;
const GUIDE: ContentProvenance = {
  title: 'Guia 2-look do catálogo Nexus Cube',
  url: 'src/domain/catalog.ts',
  author: 'Nexus Cube',
  license: 'MIT (Nexus Cube); casos derivados de Cube Coach MIT',
  notes: 'Subetapas e casos do TWO_LOOK_GUIDE existente; recorte declarado, não catálogo novo.',
};
const base = {
  trainerId: 'oll-pll-two-step',
  methodId: 'cfop',
  groupId: 'll-two-look',
  kind: 'execution',
  preserve: F2L_PIECES,
  referenceFrame: 'fixed',
  setupSubgroup: null,
  difficulty: null,
  focus: { kind: 'last-layer' },
  provenance: [GUIDE],
} satisfies Partial<TrainerFixtureSpec>;

/** Two-look last layer decomposition (spec item 7): each substep is practicable alone, and
 * the two composite flows carry a verifiable checkpoint between the looks. Results of
 * partial and complete practice stay separated by fixture id in the trainer history.
 */
export const CFOP_TWO_LOOK_FIXTURES: readonly TrainerFixtureSpec[] = [
  {
    ...base, id: 'cfop/ll-two-look/oll-edges', stageId: 'oll',
    name: 'Orientar as arestas do topo',
    objective: 'Forme a cruz do topo: as quatro arestas de U orientadas, cantos livres.',
    precondition: { predicate: 'f2l' },
    goal: { predicate: 'oll-edges' },
  },
  {
    ...base, id: 'cfop/ll-two-look/oll-corners', stageId: 'oll',
    name: 'Orientar os cantos do topo',
    objective: 'Com a cruz do topo pronta, oriente os quatro cantos e conclua a orientação.',
    precondition: { predicate: 'oll-edges' },
    goal: { predicate: 'oll' },
  },
  {
    ...base, id: 'cfop/ll-two-look/pll-corners', stageId: 'pll',
    name: 'Permutar os cantos',
    objective: 'Com a última camada orientada, posicione os quatro cantos; AUF explícito é admitido.',
    precondition: { predicate: 'oll' },
    goal: { predicate: 'pll-corners' },
  },
  {
    ...base, id: 'cfop/ll-two-look/pll-edges', stageId: 'pll',
    name: 'Permutar as arestas',
    objective: 'Com os cantos posicionados, permute as arestas e feche o cubo.',
    precondition: { predicate: 'pll-corners' },
    goal: { predicate: 'finish' },
  },
  {
    ...base, id: 'cfop/ll-two-look/oll-full', stageId: 'oll',
    name: 'OLL em dois olhares',
    objective: 'Oriente a última camada em duas subetapas verificáveis: arestas e depois cantos.',
    precondition: { predicate: 'f2l' },
    checkpoints: [{ id: 'edges-oriented', name: 'Cruz do topo', objective: 'Confira as quatro arestas de U orientadas antes de seguir para os cantos.', condition: { predicate: 'oll-edges' } }],
    goal: { predicate: 'oll' },
  },
  {
    ...base, id: 'cfop/ll-two-look/pll-full', stageId: 'pll',
    name: 'PLL em dois olhares',
    objective: 'Permute a última camada em duas subetapas verificáveis: cantos e depois arestas.',
    precondition: { predicate: 'oll' },
    checkpoints: [{ id: 'corners-permuted', name: 'Cantos posicionados', objective: 'Confira os cantos resolvidos a menos de AUF antes de permutar as arestas.', condition: { predicate: 'pll-corners' } }],
    goal: { predicate: 'finish' },
  },
];
