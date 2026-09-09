import type { TrainerDifficultyLevel, TrainerFixtureSpec } from '../../../data/trainers/types';
import { FIRST_BLOCK_PIECES, SECOND_BLOCK_PIECES, U_CORNERS } from '../../../domain/stage-validation';
import type { ContentProvenance } from '../../../domain/types';

/** Roux trainer fixture specs (P3), by contract with Prisma (docs/solver-methods/roux-trainer-p3.md).
 * Names and objectives are consumed verbatim from Trama's curation. Setup generation and validation
 * stay with Prisma; setupSubgroup null means the generator builds the state (inverse solution or
 * filtered scramble) and validates the precondition afterwards. LSE setups must normalize the net U
 * offset so the start state satisfies the cmll precondition.
 */

const FB = [...FIRST_BLOCK_PIECES] as readonly string[];
const SB = [...SECOND_BLOCK_PIECES] as readonly string[];
const BLOCKS = [...FB, 'L', ...SB, 'R'] as readonly string[];
const FACE_MOVES = ['U', 'D', 'L', 'R', 'F', 'B'] as readonly string[];

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
  notes: 'Recorte declarado, nao catalogo completo.',
};
const CURATION: ContentProvenance = {
  title: 'Curadoria pt-BR dos exercicios Roux',
  url: 'docs/expansion-curation/roux-trainer-names.md',
  author: 'Nexus Cube, curadoria Trama',
  license: 'MIT (Nexus Cube)',
  notes: 'Nomes, objetivos e textos observar consumidos verbatim.',
};
const corpusCase = (caseId: string, group: string): ContentProvenance => ({
  title: 'Corpus CMLL Nexus Cube',
  url: 'docs/expansion-curation/README.md',
  author: 'Nexus Cube, curadoria Trama',
  license: 'Producao autoral; sementes MIT com atribuicao preservada',
  notes: `Caso ${caseId}, grupo ${group}, criterio declarado de menor sequencia; propriedade de grupo provada em tests/domain/trainers/cmll-group-property.test.ts, aceite independente Sonda pendente.`,
});

const fullLevels = (short: number, medium: number, long: number): readonly TrainerDifficultyLevel[] => [
  { id: 'short', name: 'Curto', setupMoves: short, minimumProven: false },
  { id: 'medium', name: 'Medio', setupMoves: medium, minimumProven: false },
  { id: 'long', name: 'Longo', setupMoves: long, minimumProven: false },
];

const base = {
  trainerId: 'roux',
  methodId: 'roux',
  kind: 'execution',
  precondition: null,
  preserve: [] as readonly string[],
  referenceFrame: 'fixed',
  setupSubgroup: null,
  difficulty: null,
  focus: null,
  provenance: [ROUX_PRIMARY, PLAN, CURATION] as readonly ContentProvenance[],
} satisfies Partial<TrainerFixtureSpec>;

export const CMLL_INTRO_CASES = [
  { fixtureId: 'roux/cmll/intro-h', caseId: 'roux/cmll/03', group: 'H', name: 'Orientar cantos: grupo H' },
  { fixtureId: 'roux/cmll/intro-pi', caseId: 'roux/cmll/07', group: 'Pi', name: 'Orientar cantos: grupo Pi' },
  { fixtureId: 'roux/cmll/intro-u', caseId: 'roux/cmll/18', group: 'U', name: 'Orientar cantos: grupo U' },
  { fixtureId: 'roux/cmll/intro-t', caseId: 'roux/cmll/21', group: 'T', name: 'Orientar cantos: grupo T' },
  { fixtureId: 'roux/cmll/intro-l', caseId: 'roux/cmll/38', group: 'L', name: 'Orientar cantos: grupo L' },
  { fixtureId: 'roux/cmll/intro-s', caseId: 'roux/cmll/25', group: 'S', name: 'Orientar cantos: grupo S (Sune)' },
  { fixtureId: 'roux/cmll/intro-as', caseId: 'roux/cmll/31', group: 'AS', name: 'Orientar cantos: grupo AS (Antisune)' },
] as const;

const INTRO_OBSERVE = 'Este e o caminho introdutorio de um caso por grupo, nao o CMLL completo de 42 casos. Resolver em dois olhares gasta mais movimentos e ensina o reconhecimento; o conjunto completo vem depois.';
const ORIENTED_OBJECTIVE = 'Os cantos ja estao orientados: leve cada um ao seu lugar preservando os dois blocos. Ajuste de U no inicio e no fim e permitido e fica declarado.';
const INTRO_OBJECTIVE = 'Fluxo de dois olhares: ajuste U para o angulo do caso, execute e deixe os quatro cantos orientados. A permutacao fecha em seguida com um caso de cantos orientados.';

export const ROUX_TRAINER_FIXTURES: readonly TrainerFixtureSpec[] = [
  {
    ...base, id: 'roux/fb/pieces', stageId: 'fb', groupId: 'fb', kind: 'recognition',
    name: 'Reconhecer as pecas do primeiro bloco',
    objective: 'Encontre e selecione as cinco pecas do bloco esquerdo: as arestas DL, FL e BL e os cantos DFL e DBL.',
    goal: { predicate: 'any-legal' },
    focus: { kind: 'pieces', pieces: FB, referencePieces: ['L'] },
  },
  {
    ...base, id: 'roux/fb/edge-dl', stageId: 'fb', groupId: 'fb',
    name: 'Aresta DL, a base do bloco',
    objective: 'Leve a aresta DL ao lugar dela, alinhada com os centros L e D.',
    goal: { predicate: 'any-legal', preserve: ['DL'] },
    setupSubgroup: FACE_MOVES,
    focus: { kind: 'pieces', pieces: ['DL'], referencePieces: ['L'] },
  },
  {
    ...base, id: 'roux/fb/square', stageId: 'fb', groupId: 'fb',
    name: 'Quadrado frontal do primeiro bloco',
    objective: 'Forme o quadrado 1x2x2 da frente: aresta FL e canto DFL junto da DL, que deve sobreviver.',
    observe: 'Este exercicio treina o quadrado da frente por escolha pedagogica. No cubo real voce tambem pode comecar pelo quadrado de tras, com BL e DBL; a ideia e a mesma, espelhada para o outro lado do bloco.',
    precondition: { predicate: 'any-legal', preserve: ['DL'] },
    goal: { predicate: 'any-legal', preserve: ['DL', 'FL', 'DFL'] },
    preserve: ['DL'],
    setupSubgroup: ['U', 'R', 'F', 'B'],
    focus: { kind: 'pieces', pieces: ['DL', 'FL', 'DFL'], referencePieces: ['L'] },
  },
  {
    ...base, id: 'roux/fb/block', stageId: 'fb', groupId: 'fb',
    name: 'Completar o primeiro bloco',
    objective: 'Insira o par de tras, BL e DBL, e feche o bloco esquerdo 1x2x3.',
    precondition: { predicate: 'any-legal', preserve: ['DL', 'FL', 'DFL'] },
    goal: { predicate: 'fb' },
    preserve: ['DL', 'FL', 'DFL'],
    setupSubgroup: ['U', 'R', 'B'],
    focus: { kind: 'pieces', pieces: FB, referencePieces: ['L'] },
  },
  {
    ...base, id: 'roux/fb/full', stageId: 'fb', groupId: 'fb',
    name: 'Primeiro bloco completo',
    objective: 'Construa o bloco esquerdo inteiro a partir do preparo; o tamanho do preparo define o nivel, sem promessa de minimo.',
    goal: { predicate: 'fb' },
    setupSubgroup: FACE_MOVES,
    difficulty: fullLevels(8, 12, 16),
    focus: { kind: 'pieces', pieces: FB, referencePieces: ['L'] },
  },
  {
    ...base, id: 'roux/sb/pieces', stageId: 'sb', groupId: 'sb', kind: 'recognition',
    name: 'Reconhecer as pecas do segundo bloco',
    objective: 'Selecione DR, FR, BR, DFR e DBR e repare no que precisa sobreviver: o bloco esquerdo e o centro L.',
    precondition: { predicate: 'fb' },
    goal: { predicate: 'any-legal' },
    preserve: [...FB, 'L'],
    focus: { kind: 'pieces', pieces: SB, referencePieces: [...FB, 'L'] },
  },
  {
    ...base, id: 'roux/sb/edge-dr', stageId: 'sb', groupId: 'sb',
    name: 'Aresta DR com o bloco esquerdo pronto',
    objective: 'Resolva a aresta DR usando U, R, M e r; ao terminar, o bloco esquerdo continua intacto.',
    observe: 'U, R, M e r sao a ferramenta que nao mexe no bloco esquerdo, nao uma proibicao dos outros movimentos. Com pratica voce sabera quando sair delas sem perder o bloco.',
    precondition: { predicate: 'fb' },
    goal: { predicate: 'any-legal', preserve: ['DR'] },
    preserve: [...FB, 'L'],
    setupSubgroup: ['U', 'R', 'M', 'r'],
    focus: { kind: 'pieces', pieces: ['DR'], referencePieces: [...FB, 'L'] },
  },
  {
    ...base, id: 'roux/sb/square', stageId: 'sb', groupId: 'sb',
    name: 'Quadrado frontal do segundo bloco',
    objective: 'Forme o quadrado da frente do lado direito: FR e DFR junto da DR, preservando o bloco esquerdo.',
    precondition: { predicate: 'fb' },
    goal: { predicate: 'any-legal', preserve: ['DR', 'FR', 'DFR'] },
    preserve: [...FB, 'L', 'DR'],
    focus: { kind: 'pieces', pieces: ['DR', 'FR', 'DFR'], referencePieces: [...FB, 'L'] },
  },
  {
    ...base, id: 'roux/sb/block', stageId: 'sb', groupId: 'sb',
    name: 'Completar o segundo bloco',
    objective: 'Insira o par de tras, BR e DBR, e feche o bloco direito; os centros terminam no lugar.',
    precondition: { predicate: 'fb' },
    goal: { predicate: 'sb' },
    preserve: [...FB, 'L', 'DR', 'FR', 'DFR'],
    focus: { kind: 'pieces', pieces: SB, referencePieces: [...FB, 'L'] },
  },
  {
    ...base, id: 'roux/sb/full', stageId: 'sb', groupId: 'sb',
    name: 'Segundo bloco completo',
    objective: 'Construa o bloco direito inteiro com o primeiro bloco ja resolvido.',
    precondition: { predicate: 'fb' },
    goal: { predicate: 'sb' },
    preserve: [...FB, 'L'],
    setupSubgroup: ['U', 'R', 'M', 'r'],
    difficulty: fullLevels(8, 12, 16),
    focus: { kind: 'pieces', pieces: SB, referencePieces: [...FB, 'L'] },
  },
  {
    ...base, id: 'roux/cmll/orientation-recognition', stageId: 'cmll', groupId: 'cmll', kind: 'recognition',
    name: 'Reconhecer o grupo de orientacao',
    objective: 'Olhe somente os quatro cantos de cima e identifique o grupo de orientacao. As arestas soltas nao fazem parte do caso; aprenda a ignora-las.',
    precondition: { predicate: 'sb' },
    goal: { predicate: 'any-legal' },
    preserve: BLOCKS,
    focus: { kind: 'pieces', pieces: U_CORNERS, referencePieces: BLOCKS },
  },
  {
    ...base, id: 'roux/cmll/oriented-1', stageId: 'cmll', groupId: 'cmll',
    name: 'Cantos orientados 1',
    objective: ORIENTED_OBJECTIVE,
    precondition: { predicate: 'cmll-oriented' },
    goal: { predicate: 'cmll' },
    preserve: BLOCKS,
    focus: { kind: 'pieces', pieces: U_CORNERS, referencePieces: BLOCKS },
    provenance: [ROUX_PRIMARY, PLAN, CURATION, corpusCase('roux/cmll/01', 'O')],
  },
  {
    ...base, id: 'roux/cmll/oriented-2', stageId: 'cmll', groupId: 'cmll',
    name: 'Cantos orientados 2',
    objective: ORIENTED_OBJECTIVE,
    precondition: { predicate: 'cmll-oriented' },
    goal: { predicate: 'cmll' },
    preserve: BLOCKS,
    focus: { kind: 'pieces', pieces: U_CORNERS, referencePieces: BLOCKS },
    provenance: [ROUX_PRIMARY, PLAN, CURATION, corpusCase('roux/cmll/02', 'O')],
  },
  {
    ...base, id: 'roux/cmll/two-look', stageId: 'cmll', groupId: 'cmll',
    name: 'CMLL em dois olhares (guiado)',
    objective: 'Resolva os cantos em duas olhadas verificadas: primeiro oriente com o caso do seu grupo, confira o marco de cantos orientados, depois permute com um caso de cantos orientados.',
    observe: 'Este e o caminho guiado que junta as duas subetapas que voce ja treinou separadas. Gasta mais movimentos que um caso CMLL unico; o objetivo aqui e reconhecer e encadear, nao velocidade.',
    precondition: { predicate: 'sb' },
    checkpoints: [{
      id: 'oriented',
      name: 'Cantos orientados',
      objective: 'Confira o marco: os quatro cantos de cima orientados e os dois blocos intactos; a permutacao fica para a segunda olhada.',
      condition: { predicate: 'cmll-oriented' },
    }],
    goal: { predicate: 'cmll' },
    preserve: BLOCKS,
    focus: { kind: 'pieces', pieces: U_CORNERS, referencePieces: BLOCKS },
  },
  ...CMLL_INTRO_CASES.map(({ fixtureId, caseId, group, name }): TrainerFixtureSpec => ({
    ...base, id: fixtureId, stageId: 'cmll', groupId: 'cmll',
    name,
    objective: INTRO_OBJECTIVE,
    observe: INTRO_OBSERVE,
    precondition: { predicate: 'sb' },
    goal: { predicate: 'cmll-oriented' },
    preserve: BLOCKS,
    focus: { kind: 'pieces', pieces: U_CORNERS, referencePieces: BLOCKS },
    provenance: [ROUX_PRIMARY, PLAN, CURATION, corpusCase(caseId, group)],
  })),
  {
    ...base, id: 'roux/lse/eo', stageId: 'lse', groupId: 'lse',
    name: 'Orientar as seis arestas (4a)',
    objective: 'Oriente as seis arestas usando so M e U. A referencia e o eixo vertical dos centros; terminar com um M2 pendente e aceito nesta subetapa.',
    observe: 'Movimentos de M deslocam os centros; por isso a orientacao aqui tem referencia propria e nao e a mascara de amarelos do OLL.',
    precondition: { predicate: 'cmll' },
    goal: { predicate: 'eo' },
    preserve: [...BLOCKS, ...U_CORNERS],
    setupSubgroup: ['U', 'M'],
    focus: { kind: 'pieces', pieces: ['UF', 'UR', 'UB', 'UL', 'DF', 'DB'], referencePieces: [...BLOCKS, ...U_CORNERS] },
  },
  {
    ...base, id: 'roux/lse/lr', stageId: 'lse', groupId: 'lse',
    name: 'Arestas UL e UR (4b)',
    objective: 'Coloque UL e UR nos seus lugares sem desorientar nenhuma aresta.',
    precondition: { predicate: 'eo' },
    goal: { predicate: 'lr' },
    preserve: [...BLOCKS, ...U_CORNERS],
    setupSubgroup: ['U', 'M'],
    focus: { kind: 'pieces', pieces: ['UL', 'UR'], referencePieces: [...BLOCKS, ...U_CORNERS] },
  },
  {
    ...base, id: 'roux/lse/finish', stageId: 'lse', groupId: 'lse',
    name: 'Ultimas arestas e centros (4c)',
    objective: 'Resolva as quatro arestas de M e alinhe os centros na referencia original. O cubo termina resolvido, sem rotacao sobrando.',
    precondition: { predicate: 'lr' },
    goal: { predicate: 'finish' },
    preserve: [...BLOCKS, ...U_CORNERS, 'UL', 'UR'],
    setupSubgroup: ['U', 'M'],
    focus: { kind: 'pieces', pieces: ['UF', 'UB', 'DF', 'DB'], referencePieces: [...BLOCKS, ...U_CORNERS, 'UL', 'UR'] },
  },
  {
    ...base, id: 'roux/lse/full', stageId: 'lse', groupId: 'lse',
    name: 'LSE completa',
    objective: 'Feche o cubo a partir do pos CMLL: orientacao, depois UL e UR, depois as arestas de M, em sequencia.',
    precondition: { predicate: 'cmll' },
    goal: { predicate: 'finish' },
    preserve: [...BLOCKS, ...U_CORNERS],
    setupSubgroup: ['U', 'M'],
    difficulty: fullLevels(6, 10, 14),
    focus: { kind: 'pieces', pieces: ['UF', 'UR', 'UB', 'UL', 'DF', 'DB'], referencePieces: [...BLOCKS, ...U_CORNERS] },
  },
];
