# Metodo Camadas (LBL, iniciante): estrutura formal, metade Dobra da proposta conjunta

Autor: Dobra. Data: 2026-09-09. Status: RASCUNHO da metade estrutural da proposta conjunta Dobra+Trama exigida pelo adendo (docs/trainers-spec.md e docs/trainers-plan.md). A metade pedagogica (nomes, objetivos, textos observar, boas praticas de ensino com fontes e licencas) e de Trama, em arquivo proprio em docs/expansion-curation/ com referencia cruzada a este. A proposta conjunta vai ao Mestre para aprovacao ANTES de dados (Prisma) e UI (Matiz). Nada aqui e codigo nem contrato vigente.

## Destino duplo: treinador E modo Camadas do solver

Por ordem do Mestre, as etapas abaixo servem aos dois consumidores: o treinador (fixtures TrainerFixtureSpec) e um futuro modo Camadas do solucionador (MethodPlan com etapas `lbl.*`, na estrutura do planRoux existente). Os predicados de etapa sao definidos uma unica vez no dominio e reutilizados pelos dois, como ja ocorre com fb/sb/cmll/eo/lr/finish; o planejador do modo Camadas emitiria as sete fronteiras com preservacao verificada por identidade nos extremos, algoritmos do recorte iniciante e o mesmo gate de honestidade (nenhum min2phase fatiado sob rotulo LBL, nenhuma promessa de otimo).

## Principios herdados das trilhas existentes

Referencial `URFDLB-fixed-v2` (amarelo U, verde F, vermelho L, laranja R; cruz do iniciante na face D branca). Recorte declarado por exercicio, nunca rotulo de metodo completo. Precondicao, objetivo e preservacao verificaveis por predicado, com preservacao por identidade nos dois extremos. Dificuldade pelo tamanho do preparo, minimo anunciado somente com prova do gerador. Contagens de UI derivam de exercicios aprovados em teste. Grupo proprio no catalogo ANTES de CFOP, na ordem pedagogica.

## Etapas propostas (7), alinhadas a metade pedagogica de Trama

Ordem e nomes conforme docs/expansion-curation/lbl-pedagogia.md, que fundamenta com fontes a decisao de fechar o cubo na orientacao dos cantos (o R' D' R D desarruma o meio do processo e so recompoe no ultimo canto, entao precisa ser a etapa final).

| Etapa | Objetivo | Predicado | Preservacao ao concluir |
| --- | --- | --- | --- |
| `lbl/cross` | Cruz branca: DF/DR/DB/DL alinhadas aos centros | `cross` (REUSO, ja existe) | Centros |
| `lbl/corners` | Cantos da camada de baixo, um por vez (F2L simplificado, parte 1) | `any-legal` + preserve por canto; encadeado por preserve da camada 1 | Cruz e centros |
| `lbl/middle` | Meios da segunda camada, um por vez (F2L simplificado, parte 2) | `any-legal` + preserve por aresta; encadeado `f2l` (REUSO) | Camada 1 completa |
| `lbl/top-cross` | Cruz amarela: orientar as arestas de U ignorando cantos | `oll-edges` (REUSO do 2-look OLL da fase P2, em pouso por Prisma) | Duas camadas |
| `lbl/top-edges` | Alinhar as arestas amarelas com os centros laterais | `any-legal` + preserve UF/UR/UB/UL exatas | Duas camadas e cruz amarela |
| `lbl/top-corners-position` | Posicionar os cantos de U, mesmo tortos | NOVO `ll-corners-placed` (posicao por identidade sem exigir orientacao, analogo invertido do `cmll-oriented`) | Tudo anterior e arestas de U |
| `lbl/top-corners-orient` | Virar os cantos ate o cubo fechar | `finish` (REUSO) | Cubo resolvido |

Um unico predicado novo (`ll-corners-placed`); os demais reusam dominio existente ou o `oll-edges` que Prisma ja esta criando para o 2-look de P2, sem duplicacao. Honestidade da etapa final: a preservacao e verificada nos extremos, nunca movimento a movimento, exatamente a semantica do checkStageTransition; isso formaliza o aviso pedagogico de Trama de que o cubo parece desarrumado no meio e se recompoe no ultimo canto.

## Exercicios por etapa

Cada etapa oferece o trio da trilha Roux: reconhecimento (selecionar pecas alvo, sem execucao), isolado (uma peca ou subcaso, preparo que garante a precondicao) e encadeado (etapa inteira com dificuldade declarada). IDs propostos namespaced `lbl/<etapa>/<exercicio>`, por exemplo `lbl/cross/pieces`, `lbl/corners/one`, `lbl/corners/all`, `lbl/middle/one`, `lbl/middle/all`, `lbl/top-cross/apply`, `lbl/top-edges/align`, `lbl/top-corners-position/place`, `lbl/top-corners-orient/finish`. Recorte inicial estimado de 16 a 20 fixtures; o numero final e o que passar em teste. Encadeados guiados usam o campo `checkpoints` ja existente no TrainerFixtureSpec para os marcos intermediarios verificaveis. Subgrupos de preparo: face moves para camada 1; preparos por inversa validada nas etapas com precondicao composta; ultima camada admite preparo restrito a U mais o inverso dos algoritmos do recorte, sempre com validacao posterior.

## Algoritmos minimos do recorte

O iniciante usa um conjunto pequeno e repetivel; a selecao exata, nomes e proveniencia licenciada sao da curadoria de Trama. Estruturalmente o recorte precisa de: insercao de canto (com repeticao ate orientar), insercao de aresta lateral para os dois lados, orientacao das arestas de U, posicionamento de cantos de U, orientacao de cantos no lugar e ciclo final de arestas. Nenhum algoritmo entra sem identidade provada contra o predicado da etapa e licenca resolvida; sem dataset copiado.

## Contrato futuro com Prisma (apos aprovacao do Mestre e do P1)

1. `MethodId` ganha `lbl` e `StageId` as etapas novas; `TrainerCatalogSection` ganha o grupo proprio ordenado antes de CFOP.
2. Predicado novo unico `ll-corners-placed`; `oll-edges` compartilhado com o 2-look OLL da fase P2, sem duplicar regra.
3. Fixtures no `TrainerFixtureSpec` vigente, com `observe` para os textos de Trama e `checkpoints` (ja existente) para os encadeados guiados.
4. Geradores de preparo com validacao por etapa, mesmos criterios da trilha Roux.

## Fatia 2: reconhecimento e exercicios por peca (plano para registro no ledger)

Estado: fatia 1 entregue (7 fixtures encadeadas sobre LBL_STAGES, geradores por etapa de Prisma prontos com provenMinimumMoves real na cruz). Esta fatia adiciona 8 fixtures, recorte declarado:

1. Reconhecimento (kind recognition, 6): `lbl/cross/pieces` (selecionar as 4 arestas brancas), `lbl/corners/pieces` (4 cantos brancos e o que preservar), `lbl/middle/pieces` (4 arestas do meio), `lbl/top-cross/pattern` (reconhecer ponto/L/linha), `lbl/top-edges/match` (arestas que ja casam: vizinhas ou opostas), `lbl/top-corners-position/spot` (canto ja no lugar, mesmo torto). Estes exercicios sao CONTEUDO que pluga no motor generico de reconhecimento do item 8 da spec (8a, dono Prisma); nada de motor proprio aqui.
2. Por peca (kind execution, 2): `lbl/corners/one` (um canto por vez) e `lbl/middle/one` (uma aresta por vez), com goal any-legal mais preserve da peca alvo e precondicao da etapa. Fora do recorte, declarado: exercicio por canto isolado em top-corners-orient, porque virar um unico canto deixa o cubo ilegal de fechar sem os pares completos e a preservacao por extremos nao e verificavel peca a peca nessa mecanica; o encadeado guiado cobre a etapa. Lookahead LBL tambem fora: e tecnica (item 9), nao trilha iniciante; o conteudo lookahead existente e o Roux ja materializado.

Contrato de arquivos da fatia:
- Dobra (reserva concedida): src/solver/methods/lbl/trainer-fixtures.ts (estende com as 8 fixtures), tests/domain/solver/lbl/trainer-fixtures.test.ts, esta secao.
- Prisma: estrategias de setup das fixtures novas em src/data/trainers/lbl-generator.ts, motor generico 8a (apresentacao, variacao de angulo/AUF, resposta verificada vs autoavaliada) e o formato pelo qual uma fixture recognition declara o gabarito (aberto: se focus.pieces basta como gabarito de selecao, e como declarar resposta por opcao tipo ponto/L/linha; possivel campo novo no TrainerFixtureSpec, decisao de Prisma).
- Trama: curadoria por exercicio das 8 novas (nomes/objetivos/observar), mesmo ciclo verbatim.

CONTRATO FECHADO com Prisma e fatia MATERIALIZADA: gabarito por selecao de pecas e o proprio focus.pieces (sem campo novo); resposta por opcao usa o campo recognition {classifierId, optionIds} com classificadores registrados no motor 8a de Prisma (ll-edge-orientation-pattern com dot/hook/line; u-edge-match-shape com adjacent/opposite); sem colisao com 8a (motor + fixtures CFOP dele) nem com 9a (lookahead, outro eixo). As 8 fixtures estao em LBL_SLICE2_FIXTURES (export separado ate Prisma ligar as estrategias, para nao quebrar a superficie do gerador): lbl/corners/one, lbl/middle/one, lbl/cross/pieces, lbl/corners/pieces, lbl/middle/pieces, lbl/top-cross/pattern, lbl/top-edges/match, lbl/top-corners-position/spot. Slot de trabalho frente/direita declarado nos por peca, espelho do quadrado frontal Roux. Precondicoes e preservacoes reusam a tabela LBL_STAGES por referencia, provado em teste (6/6 focados, strict exit 0). Pendencias: Prisma liga estrategias das 8 no lbl-generator.ts e registra os classificadores, incluindo o PROPOSTO u-corner-placed-spot (opcoes ufr/urb/ubl/ulf/none) para o spot, cujo gabarito e dependente do estado e nao cabe em focus.pieces; Trama cura nomes/objetivos/observar por exercicio (provisorios meus ate la); verificacao das tres por opcao aguarda os classificadores no 8a.

FATIA 2 CONCLUIDA: estrategias e classificadores ligados por Prisma (incluindo u-corner-placed-spot com multiple excluido por regeneracao), verde combinado 25/25, e curadoria por exercicio de Trama (docs/expansion-curation/lbl-slice2-textos.md) CONSUMIDA verbatim: 8 nomes confirmados, dois ajustes de descricao (posto de trabalho; middle/one explicita o posto frente/direita) e dicas novas em observe nas 8 fixtures, proveniencia citando o arquivo. Revalidacao pos consumo: 14/14 (meus 6 + gerador 4 + reconhecimento 4) e strict focado exit 0. Auditoria i18n aceita pelo Mestre: display 100 por cento via dicionario i18n, fixture.name segue dado canonico, nenhuma conversao. Pronta para o fecho conjunto do pacote de treinadores.

## Gates de honestidade

Sem prometer que o LBL ensinado aqui e o unico ou o melhor caminho; declarar que e o recorte iniciante escolhido. Nao anunciar minimo de movimentos. Nao rotular o conjunto de algoritmos como completo. Cobertura na UI derivada de testes. O objetivo declarado do usuario, ensinar qualquer pessoa do zero, exige que cada exercicio diga o que olhar antes de tentar; esse conteudo e da metade de Trama e entra por `observe`.
