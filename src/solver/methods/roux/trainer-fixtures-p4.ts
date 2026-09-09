import type { TrainerFixtureSpec } from '../../../data/trainers/types';
import { FIRST_BLOCK_PIECES, SECOND_BLOCK_PIECES, U_CORNERS } from '../../../domain/stage-validation';
import type { ContentProvenance } from '../../../domain/types';

/** P4 Roux slice of the tools trainers (continue-here, lookahead, inspection), by contract
 * (docs/solver-methods/roux-trainer-p3.md, section Fase P4). Names and objectives are provisional
 * until Trama's curation. Continue-here fixtures have no generator: the start state comes from the
 * user's own solution at the declared stage boundary, injected by the common tool contract; the
 * precondition validates that state before the attempt.
 */

const FB = [...FIRST_BLOCK_PIECES] as readonly string[];
const SB = [...SECOND_BLOCK_PIECES] as readonly string[];
const BLOCKS = [...FB, 'L', ...SB, 'R'] as readonly string[];

const ROUX_PRIMARY: ContentProvenance = {
  title: 'Metodo Roux, paginas originais Steps 1 a 4',
  url: 'http://grrroux.free.fr/method/Intro.html',
  author: 'Gilles Roux',
  license: 'Referencia factual; nenhum texto, imagem ou applet redistribuido',
};
const PLAN: ContentProvenance = {
  title: 'Plano de exercicios Roux P3/P4',
  url: 'docs/solver-methods/roux-trainer-p3.md',
  author: 'Nexus Cube, planejamento Dobra',
  license: 'MIT (Nexus Cube)',
  notes: 'Nomes e textos provisorios ate curadoria Trama; recorte declarado, nao catalogo completo.',
};

const base = {
  methodId: 'roux',
  kind: 'execution',
  precondition: null,
  observe: undefined,
  preserve: [] as readonly string[],
  referenceFrame: 'fixed',
  setupSubgroup: null,
  difficulty: null,
  focus: null,
  provenance: [ROUX_PRIMARY, PLAN] as readonly ContentProvenance[],
} satisfies Partial<TrainerFixtureSpec>;

export const ROUX_CONTINUE_BOUNDARIES = [
  { fixtureId: 'roux/continue/fb', stage: 'fb', precondition: null, goal: 'fb', preserve: [] as readonly string[] },
  { fixtureId: 'roux/continue/sb', stage: 'sb', precondition: 'fb', goal: 'sb', preserve: [...FB, 'L'] as readonly string[] },
  { fixtureId: 'roux/continue/cmll', stage: 'cmll', precondition: 'sb', goal: 'cmll', preserve: BLOCKS },
  { fixtureId: 'roux/continue/eo', stage: 'lse', precondition: 'cmll', goal: 'eo', preserve: [...BLOCKS, ...U_CORNERS] as readonly string[] },
  { fixtureId: 'roux/continue/lr', stage: 'lse', precondition: 'eo', goal: 'lr', preserve: [...BLOCKS, ...U_CORNERS] as readonly string[] },
  { fixtureId: 'roux/continue/finish', stage: 'lse', precondition: 'lr', goal: 'finish', preserve: [...BLOCKS, ...U_CORNERS, 'UL', 'UR'] as readonly string[] },
] as const;

export const ROUX_P4_FIXTURES: readonly TrainerFixtureSpec[] = [
  ...ROUX_CONTINUE_BOUNDARIES.map(({ fixtureId, stage, precondition, goal, preserve }): TrainerFixtureSpec => ({
    ...base, id: fixtureId, trainerId: 'continue-here', stageId: stage, groupId: 'continue',
    name: `Continue daqui: ${goal}`,
    objective: 'Parta do estado real da sua solucao nesta fronteira e conclua a proxima etapa por conta propria; dicas progressivas usam a solucao ja calculada.',
    precondition: precondition ? { predicate: precondition } : null,
    goal: { predicate: goal },
    preserve,
    focus: { kind: 'pieces', pieces: goal === 'fb' ? FB : goal === 'sb' ? SB : U_CORNERS, referencePieces: BLOCKS },
  })),
  {
    ...base, id: 'roux/lookahead/sb-tracking', trainerId: 'lookahead', stageId: 'sb', groupId: 'lookahead', kind: 'recognition',
    name: 'Acompanhar as pecas do segundo bloco',
    objective: 'Enquanto a reproducao executa o primeiro bloco, siga DR, FR, BR, DFR e DBR e responda onde cada uma termina quando a animacao pausar.',
    goal: { predicate: 'any-legal' },
    focus: { kind: 'pieces', pieces: SB, referencePieces: [...FB, 'L'] },
  },
  {
    ...base, id: 'roux/lookahead/cmll-group', trainerId: 'lookahead', stageId: 'cmll', groupId: 'lookahead', kind: 'recognition',
    name: 'Prever o grupo CMLL',
    objective: 'Enquanto o segundo bloco termina, observe os quatro cantos de cima e responda qual grupo de orientacao vai aparecer.',
    precondition: { predicate: 'fb' },
    goal: { predicate: 'any-legal' },
    preserve: [...FB, 'L'],
    focus: { kind: 'pieces', pieces: U_CORNERS, referencePieces: BLOCKS },
  },
  {
    ...base, id: 'roux/inspection/fb', trainerId: 'inspection', stageId: 'fb', groupId: 'inspection',
    name: 'Inspecao do primeiro bloco',
    objective: 'Veja o estado pelo tempo configurado, esconda e execute o primeiro bloco planejado de memoria; a conferencia usa o predicado da etapa.',
    goal: { predicate: 'fb' },
    setupSubgroup: ['U', 'D', 'L', 'R', 'F', 'B'],
    difficulty: [
      { id: 'short', name: 'Curto', setupMoves: 8, minimumProven: false },
      { id: 'medium', name: 'Medio', setupMoves: 12, minimumProven: false },
      { id: 'long', name: 'Longo', setupMoves: 16, minimumProven: false },
    ],
    focus: { kind: 'pieces', pieces: FB, referencePieces: ['L'] },
  },
];
