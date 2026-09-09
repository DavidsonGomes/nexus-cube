import { LBL_STAGES } from '../../../data/trainers/lbl-stages';
import type { TrainerFixtureSpec } from '../../../data/trainers/types';
import type { ContentProvenance, FocusPolicy } from '../../../domain/types';

/** Chained stage fixtures of the approved LBL proposal (docs/solver-methods/lbl-proposta-conjunta.md).
 * Conditions are imported from Prisma's LBL_STAGES table, never redefined; names, objectives and
 * observe texts are consumed verbatim from Trama's curation. Recognition and per-piece exercises
 * come in the next slice together with per-exercise curation and the stage generators.
 */

const PROPOSAL: ContentProvenance = {
  title: 'Proposta conjunta metodo Camadas',
  url: 'docs/solver-methods/lbl-proposta-conjunta.md',
  author: 'Nexus Cube, planejamento Dobra e curadoria Trama',
  license: 'MIT (Nexus Cube)',
  notes: 'Aprovada pelo Mestre em 2026-09-09; recorte iniciante declarado, nao catalogo completo.',
};
const CURATION: ContentProvenance = {
  title: 'Metade pedagogica do metodo Camadas',
  url: 'docs/expansion-curation/lbl-pedagogia.md',
  author: 'Nexus Cube, curadoria Trama',
  license: 'MIT (Nexus Cube)',
  notes: 'Nomes, objetivos e textos observar consumidos verbatim; fontes Ruwix e J Perm citadas sem copia.',
};

interface LBLStageText {
  readonly id: string;
  readonly name: string;
  readonly objective: string;
  readonly observe: string;
  readonly focus: FocusPolicy;
}

const STAGE_TEXTS: readonly LBLStageText[] = [
  {
    id: 'lbl/cross',
    name: 'Cruz branca',
    objective: 'Monte a cruz branca: quatro arestas brancas em volta do centro branco, cada uma casando com o centro lateral da sua cor.',
    observe: 'A aresta no lugar com a cor lateral errada nao esta pronta. A margarida (quatro arestas brancas em volta do centro amarelo) e um atalho didatico opcional antes de virar a cruz.',
    focus: { kind: 'pieces', pieces: ['DF', 'DR', 'DB', 'DL'], referencePieces: ['D'] },
  },
  {
    id: 'lbl/corners',
    name: 'Cantos da primeira camada',
    objective: 'Complete a primeira camada: leve cada canto branco para o seu lugar, entre as cores que ele mostra.',
    observe: 'Ponha o canto embaixo do lugar dele e repita o movimento magico ate encaixar certo; ele sempre encaixa.',
    focus: { kind: 'pieces', pieces: ['DFR', 'DFL', 'DBR', 'DBL'], referencePieces: ['DF', 'DR', 'DB', 'DL', 'D'] },
  },
  {
    id: 'lbl/middle',
    name: 'Meios da segunda camada',
    objective: 'Complete a segunda camada: encaixe as quatro arestas do meio, uma por vez, sem desmontar a primeira camada.',
    observe: 'Case a cor da frente da aresta com o centro e veja para que lado a outra cor aponta: isso decide se a insercao e pela direita ou pela esquerda. Aresta presa no lugar errado: insira qualquer outra ali para solta-la.',
    focus: { kind: 'pieces', pieces: ['FR', 'FL', 'BR', 'BL'], referencePieces: ['DF', 'DR', 'DB', 'DL', 'DFR', 'DFL', 'DBR', 'DBL', 'D'] },
  },
  {
    id: 'lbl/top-cross',
    name: 'Cruz amarela',
    objective: 'Forme a cruz amarela no topo. Ignore os cantos e ignore se as arestas casam dos lados; aqui so importa o amarelo para cima.',
    observe: 'So tres padroes: ponto, L e linha. Segure o L no canto tras/esquerda e a linha na horizontal; o mesmo movimento leva ponto a L, L a linha e linha a cruz.',
    focus: { kind: 'pieces', pieces: ['UF', 'UR', 'UB', 'UL'], referencePieces: ['U'] },
  },
  {
    id: 'lbl/top-edges',
    name: 'Alinhar as arestas amarelas',
    objective: 'Gire e troque as arestas amarelas ate cada uma casar com o centro lateral da sua cor.',
    observe: 'Primeiro procure duas arestas que ja casam. Vizinhas: deixe uma na direita e uma atras. Opostas: execute uma vez de qualquer jeito e vira o caso das vizinhas.',
    focus: { kind: 'pieces', pieces: ['UF', 'UR', 'UB', 'UL'], referencePieces: ['U'] },
  },
  {
    id: 'lbl/top-corners-position',
    name: 'Posicionar os cantos amarelos',
    objective: 'Leve cada canto amarelo para o SEU lugar, mesmo que torto: as tres cores do canto devem bater com os tres lados que ele toca.',
    observe: 'Procure um canto ja no lugar certo (mesmo torto) e segure-o na frente/direita; repita o movimento ate os outros tres girarem para os lugares. Nenhum no lugar: execute uma vez e um aparecera.',
    focus: { kind: 'pieces', pieces: ['UFR', 'URB', 'UBL', 'ULF'], referencePieces: ['UF', 'UR', 'UB', 'UL', 'U'] },
  },
  {
    id: 'lbl/top-corners-orient',
    name: 'Virar os cantos amarelos',
    objective: 'Vire cada canto ate o amarelo ficar para cima e o cubo se fechar sozinho no final.',
    observe: 'A REGRA DE OURO: com o canto alvo na frente/direita, repita o movimento em pares ate o amarelo subir; depois gire SOMENTE a camada de cima para trazer o proximo canto ao mesmo lugar. O resto do cubo vai parecer destruido no processo; esta certo assim e ele se recompoe no ultimo canto.',
    focus: { kind: 'pieces', pieces: ['UFR', 'URB', 'UBL', 'ULF'], referencePieces: ['UF', 'UR', 'UB', 'UL', 'U'] },
  },
];

const stageById = (id: string) => {
  const stage = LBL_STAGES.find(candidate => candidate.id === id);
  if (!stage) throw new Error(`Etapa LBL ausente da tabela: ${id}`);
  return stage;
};

const SLICE2_CURATION: ContentProvenance = {
  title: 'Curadoria por exercicio da fatia 2 LBL',
  url: 'docs/expansion-curation/lbl-slice2-textos.md',
  author: 'Nexus Cube, curadoria Trama',
  license: 'MIT (Nexus Cube)',
  notes: 'Nomes, descricoes e dicas consumidos verbatim; vocabulario unico com lbl-pedagogia.md.',
};

/** Slice 2 (recognition + per-piece); Prisma's generator consumes it alongside the stage
 * fixtures. Names, objectives and observe texts are consumed verbatim from Trama's per-exercise
 * curation. Piece-selection recognition uses focus.pieces
 * as the app-verified key; option recognition declares the 8a classifier by contract. The
 * u-corner-placed-spot classifier is a proposal pending Prisma's registration. Working slot of
 * the per-piece exercises is the front-right one, a declared beginner cut like the Roux frontal
 * square; the physical cube may be rotated to bring any slot there.
 */
export const LBL_SLICE2_FIXTURES: readonly TrainerFixtureSpec[] = [
  {
    ...stagePartial('lbl/corners'), id: 'lbl/corners/one', kind: 'execution',
    name: 'Um canto por vez',
    objective: 'Leve um canto branco ate o posto de trabalho da frente/direita e encaixe-o com o movimento magico, sem desmontar a cruz.',
    observe: 'Antes de girar, leia as tres cores do canto: o lugar dele e onde esses tres lados se encontram. Traga-o ao posto de trabalho e repita o movimento magico com calma; ele sempre acaba encaixando.',
    goal: { predicate: 'any-legal', preserve: ['DFR'] },
    focus: { kind: 'pieces', pieces: ['DFR'], referencePieces: ['DF', 'DR', 'DB', 'DL', 'D'] },
  },
  {
    ...stagePartial('lbl/middle'), id: 'lbl/middle/one', kind: 'execution',
    name: 'Uma aresta do meio por vez',
    objective: 'Insira a aresta do posto da frente/direita pelo lado que a cor indicar, sem desmontar a primeira camada.',
    observe: 'Case primeiro a cor da frente da aresta com o centro da mesma cor; a cor que sobra aponta o lado da insercao. Aresta presa no lugar errado: insira outra ali para solta-la.',
    goal: { predicate: 'any-legal', preserve: ['FR'] },
    focus: { kind: 'pieces', pieces: ['FR'], referencePieces: ['DF', 'DR', 'DB', 'DL', 'DFR', 'DFL', 'DBR', 'DBL', 'D'] },
  },
  {
    ...stagePartial('lbl/cross'), id: 'lbl/cross/pieces', kind: 'recognition', precondition: null, preserve: [],
    name: 'Reconhecer as arestas da cruz',
    objective: 'Encontre e selecione as quatro arestas brancas no cubo embaralhado.',
    observe: 'Aresta tem duas cores; nao confunda com canto, que tem tres. Procure o branco tambem nas laterais e na camada de baixo, nao so em cima.',
    goal: { predicate: 'any-legal' },
    focus: { kind: 'pieces', pieces: ['DF', 'DR', 'DB', 'DL'], referencePieces: ['D'] },
  },
  {
    ...stagePartial('lbl/corners'), id: 'lbl/corners/pieces', kind: 'recognition',
    name: 'Reconhecer os cantos brancos',
    objective: 'Selecione os quatro cantos brancos e repare no que precisa sobreviver: a cruz pronta.',
    observe: 'Canto tem tres cores. Ao encontrar cada um, ja repare quais dois centros ele devera tocar quando estiver no lugar.',
    goal: { predicate: 'any-legal' },
    focus: { kind: 'pieces', pieces: ['DFR', 'DFL', 'DBR', 'DBL'], referencePieces: ['DF', 'DR', 'DB', 'DL', 'D'] },
  },
  {
    ...stagePartial('lbl/middle'), id: 'lbl/middle/pieces', kind: 'recognition',
    name: 'Reconhecer as arestas do meio',
    objective: 'Selecione as quatro arestas da segunda camada: sao as arestas sem amarelo.',
    observe: 'O amarelo denuncia: qualquer aresta com amarelo pertence a ultima camada, nao ao meio. Sobram exatamente quatro sem amarelo.',
    goal: { predicate: 'any-legal' },
    focus: { kind: 'pieces', pieces: ['FR', 'FL', 'BR', 'BL'], referencePieces: ['DF', 'DR', 'DB', 'DL', 'DFR', 'DFL', 'DBR', 'DBL', 'D'] },
  },
  {
    ...stagePartial('lbl/top-cross'), id: 'lbl/top-cross/pattern', kind: 'recognition',
    name: 'Reconhecer o padrao da cruz amarela',
    objective: 'Olhe so as arestas de cima e responda qual padrao aparece: ponto, gancho ou linha.',
    observe: 'Ignore os cantos por completo, mesmo os amarelos. So as quatro arestas contam: nenhuma virada e ponto, duas vizinhas e gancho, duas opostas e linha.',
    goal: { predicate: 'any-legal' },
    recognition: { classifierId: 'll-edge-orientation-pattern', optionIds: ['dot', 'hook', 'line'] },
    focus: { kind: 'pieces', pieces: ['UF', 'UR', 'UB', 'UL'], referencePieces: ['U'] },
  },
  {
    ...stagePartial('lbl/top-edges'), id: 'lbl/top-edges/match', kind: 'recognition',
    name: 'Reconhecer as arestas que casam',
    objective: 'Encontre as arestas amarelas que ja casam com os centros e responda: vizinhas ou opostas?',
    observe: 'Gire so a camada de cima, devagar, e pare onde MAIS arestas casam com os centros das laterais. Duas casando lado a lado sao vizinhas; duas de frente uma para a outra sao opostas.',
    goal: { predicate: 'any-legal' },
    recognition: { classifierId: 'u-edge-match-shape', optionIds: ['adjacent', 'opposite'] },
    focus: { kind: 'pieces', pieces: ['UF', 'UR', 'UB', 'UL'], referencePieces: ['U'] },
  },
  {
    ...stagePartial('lbl/top-corners-position'), id: 'lbl/top-corners-position/spot', kind: 'recognition',
    name: 'Achar o canto ja no lugar',
    objective: 'Responda qual canto amarelo ja esta no lugar certo, mesmo torto, ou se nenhum esta.',
    observe: 'Canto no lugar certo mostra as mesmas tres cores dos lados que ele toca, mesmo girado. Compare canto por canto com os centros vizinhos; pode nao haver nenhum, e isso tambem e resposta.',
    goal: { predicate: 'any-legal' },
    recognition: { classifierId: 'u-corner-placed-spot', optionIds: ['ufr', 'urb', 'ubl', 'ulf', 'none'] },
    focus: { kind: 'pieces', pieces: ['UFR', 'URB', 'UBL', 'ULF'], referencePieces: ['UF', 'UR', 'UB', 'UL', 'U'] },
  },
];

function stagePartial(stageId: string) {
  const stage = stageById(stageId);
  return {
    trainerId: 'lbl',
    methodId: 'lbl',
    stageId: stage.stageId,
    groupId: 'lbl',
    precondition: stage.precondition,
    preserve: stage.preserve,
    referenceFrame: 'fixed',
    setupSubgroup: null,
    difficulty: null,
    provenance: [PROPOSAL, SLICE2_CURATION] as readonly ContentProvenance[],
  } satisfies Partial<TrainerFixtureSpec>;
}

export const LBL_TRAINER_FIXTURES: readonly TrainerFixtureSpec[] = LBL_STAGES.map(stage => {
  const text = STAGE_TEXTS.find(candidate => candidate.id === stage.id);
  if (!text) throw new Error(`Etapa LBL sem texto curado: ${stage.id}`);
  return {
    id: stage.id,
    trainerId: 'lbl',
    methodId: 'lbl',
    stageId: stage.stageId,
    groupId: 'lbl',
    kind: 'execution',
    name: text.name,
    objective: text.objective,
    observe: text.observe,
    precondition: stage.precondition,
    goal: stage.goal,
    preserve: stage.preserve,
    referenceFrame: 'fixed',
    setupSubgroup: stage.id === 'lbl/cross' ? ['U', 'D', 'L', 'R', 'F', 'B'] : null,
    difficulty: null,
    focus: text.focus,
    provenance: [PROPOSAL, CURATION],
  };
});
