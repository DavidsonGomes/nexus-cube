# Treinador Roux, fases P3 e P4: proposta de exercicios

Autor: Dobra. Data: 2026-09-09. Status: P3 APROVADA pelo Mestre e registrada no Board; secao P4 e detalhamento do intro-set em proposta. Escopo: spec item 13 (docs/trainers-spec.md), fases P3 e P4 do plano (docs/trainers-plan.md). Base tecnica: planejador Roux existente (docs/solver-methods/roux.md) e criterios de docs/method-research.md.

## Referencial e convencoes

Todos os exercicios usam a referencia `URFDLB-fixed-v2` do planejador: amarelo U, verde F, vermelho L, laranja R. Bloco esquerdo cobre DL/FL/BL, DFL/DBL e centro L; bloco direito cobre DR/FR/BR, DFR/DBR e centro R. Em EO/LR o referencial de centros e o eixo vertical U/D, com M2 admitido como estado intermediario; a conclusao exige centros exatos, sem rotacao global residual. Preservacao e verificada por identidade nos dois extremos da solucao; um algoritmo pode desfazer e restaurar pecas temporariamente.

Cobertura e sempre declarada por recorte: nenhuma lista abaixo e chamada de catalogo completo de FB, SB ou LSE, pois as fontes primarias nao definem contagem universal para essas etapas. Contagens exibidas na UI derivam de exercicios aprovados em teste, nunca de totais fixos.

## Preparos validos

Cada exercicio define `precondition`, `goal`, `preserve` e `referenceFrame`, reutilizando os predicados de etapa do planejador Roux por contrato com Prisma. Preparo e gerado partindo de um estado que satisfaz a precondicao e aplicando movimentos restritos ao subgrupo que nao viola a precondicao (ou inverso de uma solucao valida), com validacao posterior pelo validador de etapa. Preparos variados mantem o objetivo. Dificuldade e declarada pelo tamanho do preparo; nenhum minimo de movimentos e anunciado sem prova pelo gerador. Reproducao da solucao preserva as etapas anteriores nos extremos, conforme aceite 2 a 4 do method-research.

## Submodo Primeiro Bloco (FB)

Recorte declarado: trilha construtiva de 4 exercicios mais o exercicio full, do reconhecimento ao bloco completo. Nao e um catalogo de casos FB.

| ID proposto | Exercicio | Precondicao | Objetivo | Preservacao |
| --- | --- | --- | --- | --- |
| `roux/fb/pieces` | Reconhecer as 5 pecas do bloco esquerdo em estado embaralhado; resposta por selecao no cubo virtual | Estado legal qualquer | Selecionar DL, FL, BL, DFL, DBL corretos | Sem execucao; exercicio de reconhecimento |
| `roux/fb/edge-dl` | Levar a aresta DL ao lugar com orientacao correta | Estado legal qualquer | Aresta DL resolvida em relacao aos centros | Centros fixos |
| `roux/fb/square` | Formar o quadrado 1x2x2 (DL + par DFL/FL ou DBL/BL) | Aresta DL resolvida (preparo garante) | Quadrado escolhido concluido | Aresta DL e centros |
| `roux/fb/block` | Completar o bloco com o ultimo par canto/aresta | Quadrado 1x2x2 resolvido (preparo garante) | Bloco esquerdo 1x2x3 completo | Quadrado e centros |

Exercicio adicional `roux/fb/full`: bloco completo a partir de preparo com tamanho declarado (niveis por quantidade de movimentos do preparo, sem alegar minimo). Conferencia pelo predicado `roux.fb` do planejador; solucao de referencia pelo proprio planejador, apresentada como uma construcao possivel, nunca como escolha humana ideal.

## Submodo Segundo Bloco (SB)

Recorte declarado: 4 exercicios mais o exercicio full. A pedagogia apresenta U/R/M/r como ferramenta que nao afeta o bloco esquerdo, sem enunciar proibicao universal de outros movimentos, conforme fonte original.

| ID proposto | Exercicio | Precondicao | Objetivo | Preservacao |
| --- | --- | --- | --- | --- |
| `roux/sb/pieces` | Reconhecer as 5 pecas do bloco direito e o que deve sobreviver | FB resolvido | Selecao correta de DR, FR, BR, DFR, DBR | Sem execucao |
| `roux/sb/edge-dr` | Resolver a aresta DR sem quebrar FB nos extremos | FB resolvido | DR resolvida | FB e centro L |
| `roux/sb/square` | Formar quadrado 1x2x2 do lado direito | FB e DR resolvidos (preparo garante) | Quadrado direito concluido | FB, DR e centro L |
| `roux/sb/block` | Completar o bloco direito | FB e quadrado direito resolvidos | Bloco direito 1x2x3 completo; centros fixos ao terminar | FB e centro L |

Exercicio adicional `roux/sb/full`: SB inteiro a partir de FB resolvido, preparo restrito a movimentos que preservam FB, com validacao. Conferencia pelo predicado `roux.sb`.

## Submodo CMLL, cobertura introdutoria declarada

GATE mantido: CMLL completo 42 entra somente apos prova 42/42 por identidade com aceite independente de Sonda/Vigia e licenca confirmada no fluxo de curadoria. O corpus local licenciado (`src/data/expansion-sources/cmll.ts`, autoral derivado de Cube Coach MIT) e a prova autoral de 648 estados do planejador existem, mas prova de autor nao e signoff. Ate la a UI declara cobertura introdutoria com o numero exato de casos validados.

| ID proposto | Exercicio | Precondicao | Objetivo | Preservacao |
| --- | --- | --- | --- | --- |
| `roux/cmll/orientation-recognition` | Reconhecer o grupo de orientacao dos 4 cantos superiores; resposta por selecao | Dois blocos resolvidos, cantos no caso, arestas U/M livres variadas | Identificar o grupo corretamente | Sem execucao |
| `roux/cmll/oriented-swaps` | Casos com cantos ja orientados: permutacao adjacente e diagonal (2 casos + reconhecimento de ja resolvido a menos de AUF) | Dois blocos, cantos orientados | Cantos resolvidos, AUF explicito admitido | Blocos e centros L/R |
| `roux/cmll/intro-set` | Subconjunto introdutorio: 1 caso por grupo de orientacao, IDs exatos do corpus declarados na implementacao | Dois blocos, cantos no caso escolhido | Cantos resolvidos com AUF explicito | Blocos e centros L/R |

Preparos CMLL variam arestas de U e da camada M, pois elas nao pertencem ao objetivo; a mascara visual de foco segue cantos por identidade e nao reutiliza a mascara OLL. A lista exata de casos do `intro-set` sai do corpus com identidades provadas caso a caso; a quantidade final e a que passar em teste.

### Detalhamento do intro-set (selecao provisoria)

O corpus local tem 42 casos distribuidos em O(2), H(4), Pi(6), U(6), T(6), L(6), S(6) e AS(6). Selecao provisoria: os 2 casos O completos mais 1 caso por grupo restante, escolhido pelo criterio declarado de menor sequencia no corpus, total 9 casos. Criterio e IDs sao provisorios ate prova de identidade em teste e alinhamento pedagogico com Trama.

| Grupo | Caso provisorio | Sequencia do corpus |
| --- | --- | --- |
| O | `roux/cmll/01` e `roux/cmll/02` | 11 e 16 tokens |
| H | `roux/cmll/03` | 11 tokens |
| Pi | `roux/cmll/07` | 9 tokens |
| U | `roux/cmll/18` | 6 tokens |
| T | `roux/cmll/21` | 8 tokens |
| L | `roux/cmll/38` | 8 tokens |
| S | `roux/cmll/25` | 7 tokens |
| AS | `roux/cmll/31` | 7 tokens |

Uso pedagogico em dois olhares: reconhecer o grupo, ajustar U para o angulo de referencia do caso, executar o caso do grupo e entao os cantos ficam orientados; o estado resultante cai no grupo O (ou resolvido a menos de AUF) e fecha com um dos casos O. Essa afirmacao dependia de uma propriedade que devia ser provada em teste, nao presumida: aplicar o caso escolhido a cada variante de permutacao do mesmo grupo, no angulo reconhecido, termina com os quatro cantos orientados e blocos preservados. PROVADA por Prisma em tests/domain/trainers/cmll-group-property.test.ts: cada caso do intro-set aplicado as 24 variantes de permutacao do grupo, 168 verificacoes verdes; a selecao dos 7 casos deixa de ser provisoria (aceite independente Sonda segue pendente, como em tudo). O treinador confere o objetivo intermediario com um predicado proprio de cantos orientados, que nao existe hoje no planejador e entra no contrato com Prisma. Nao se promete que o caso do grupo resolva a permutacao de outra variante, e o fluxo de dois olhares e apresentado como alternativa introdutoria, nunca como o CMLL completo.

### Subetapas do adendo (expansao pedagogica aprovada)

O adendo da spec pede subetapas praticaveis isoladas na trilha Roux, no raciocinio dos modos 2-look de OLL/PLL. Mapa da trilha: FB e SB ja nascem granulares (aresta, quadrado, bloco); LSE ja pratica 4a/4b/4c isoladas; CMLL ja tinha orientacao isolada (intro-*) e permutacao isolada (oriented-1/2). O que faltava era o encadeado guiado, adicionado como fixture `roux/cmll/two-look`: precondicao SB, objetivo CMLL completo, praticado em duas subetapas verificaveis com o marco intermediario `cmll-oriented` conferido entre os olhares. Nome e objetivo provisorios ate curadoria Trama. A prova de propriedade de grupo (item 5) foi entregue pelos geradores de Prisma, entao o encadeado pode partir de qualquer variante dos 7 grupos, com cobertura declarada e aceite Sonda pendente. Ajuste do ponto de partida APLICADO por Prisma: o setup do two-look sorteia dos 42 casos do corpus (mesma rota do orientation-recognition), com inversa mais caminhada U/M e revalidacao intactas; cada sorteio e uma variante de permutacao real de algum grupo, o primeiro olhar orienta e o segundo tem permutacao genuina, e sorteios dos casos O viram o aprendizado de ir direto a segunda olhada. Prova do dono: teste garantindo sorteio fora do intro-set, 5/5 focados do gerador Roux e tsc exit 0. Item de contrato futuro sugerido a Prisma, sem urgencia: campo opcional `checkpoints?: readonly StageCondition[]` no TrainerFixtureSpec, para a UI conferir o marco intermediario da pratica guiada; hoje o marco esta documentado aqui e no objetivo.

## Submodo LSE

Recorte declarado: trilha 4a/4b/4c da fonte original, 4 exercicios ate o cubo resolvido.

| ID proposto | Exercicio | Precondicao | Objetivo | Preservacao |
| --- | --- | --- | --- | --- |
| `roux/lse/eo` | Orientar as seis arestas com M/U; referencial de centros U/D no eixo vertical declarado na tela | Blocos e cantos resolvidos (pos CMLL+AUF) | EO concluida; centros exatos ou M2 | Blocos e 4 cantos |
| `roux/lse/lr` | Colocar UL/UR mantendo EO | EO satisfeita (preparo garante) | UL/UR resolvidas, EO mantida; centros exatos ou M2 | Blocos, cantos e EO |
| `roux/lse/finish` | Concluir 4 arestas de M e centros | UL/UR e EO satisfeitas | Cubo resolvido na referencia original, sem rotacao residual | Tudo anterior |
| `roux/lse/full` | LSE inteira encadeada a partir de estado pos CMLL | Blocos e cantos resolvidos | Cubo resolvido | Blocos e cantos |

A verificacao de EO nao copia a mascara de amarelos de OLL: usa a definicao propria com referencial de centros, como no predicado `roux.eo` existente. Preparos sao gerados no subgrupo U/M sobre estado valido, o que garante precondicao por construcao, com validacao posterior.

## Reproducao e fluxo comum

Fluxo Selecionar, Preparar, Tentar, Conferir, Repetir da spec. Solucao oculta na tentativa; consulta marca execucao assistida. Reproducao em 3D usa o player existente; a solucao apresentada e verificada contra o estado real do preparo e preserva as etapas anteriores nos extremos. Apos erro fisico, a reconstrucao orientada reaplica o preparo desde o estado inicial exibido. Cronometragem segue os seis modos comuns, preparo sempre fora do tempo; historico separado por submodo/exercicio, nunca misturado com solves.

## Fase P4, recorte Roux

A fase P4 do plano cobre as ferramentas 9, 10, 15, 16 e 17 da spec. Minha parte e o recorte Roux de cada uma; a infraestrutura comum das ferramentas e dos donos delas.

1. Continue daqui (17) nas etapas Roux: cada fronteira do MethodPlan (fb, sb, cmll, cmll-auf, eo, lr, finish) vira exercicio com o estado da fronteira, objetivo igual a etapa seguinte e conferencia pelo predicado dela. Dicas progressivas usam prefixos da solucao ja calculada pelo planejador; preservacoes conforme as tabelas P3. Nenhum calculo novo alem do plano ja produzido.
2. Laboratorio (15) com objetivos Roux: validar alternativa digitada contra um objetivo de etapa (por exemplo, CMLL valido para um caso preservando blocos), reaplicando ao estado real e conferindo goal e preservacao nos extremos. Resposta honesta em tres estados: cumpre, nao cumpre, ou cumpre com efeitos colaterais declarados (AUF restante, arestas movidas onde permitido).
3. Editor visual (16) para casos Roux: alvos permitidos sao as precondicoes das tabelas P3 (FB resolvido, blocos resolvidos, pos CMLL). O validador de legalidade fisica e o existente do solucionador, por contrato; o editor adiciona a checagem da precondicao da etapa escolhida e mensagens que apontam qual peca viola o alvo.
4. Inspecao (10) recorte Roux: planejar o primeiro bloco. Exibir estado por periodo configuravel, ocultar, executar o FB planejado e conferir pelo predicado fb. Analogia direta do treino de inspecao da cruz, com a diferenca declarada de que FB nao tem minimo anunciado sem prova.
5. Lookahead (9) recorte Roux, 2 exercicios declarados: acompanhar as pecas de SB durante a reproducao do FB e prever onde terminarao; reconhecer o grupo de orientacao CMLL durante a conclusao do SB. Cada exercicio define o que observar e valida a previsao contra o estado real ao pausar.

Ordem sugerida dentro do P4: 17 e 15 primeiro (reutilizam plano e predicados existentes), depois 16, 10 e 9. Sem novos submodos alem destes recortes.

STATUS P4: fixtures do recorte Roux MATERIALIZADAS em src/solver/methods/roux/trainer-fixtures-p4.ts (9 fixtures: 6 continue-here nas fronteiras fb/sb/cmll/eo/lr/finish com encadeamento provado, 2 lookahead de reconhecimento, 1 inspecao de FB), com prova autoral em tests/domain/solver/roux/trainer-fixtures-p4.test.ts (4/4 focados e strict focado exit 0). Continue-here nao tem gerador: o estado vem da solucao real do usuario na fronteira declarada, injetado pelo contrato comum da ferramenta, com a precondicao validando antes da tentativa. Nomes e objetivos provisorios ate curadoria Trama; itens 15 e 16 seguem como contrato de validacao, sem fixture propria.

## Contrato necessario com Prisma

STATUS: entrega das fixtures CONFERIDA E ACEITA por Prisma de forma independente (focados 5/5 e strict com escopo nos arquivos do contrato, exit 0); as quatro convencoes abaixo estao confirmadas como contrato, incluindo que os centros U/D/F/B ficam fora do preserve das fixtures LSE por coerencia com o M2 intermediario, e que o quadrado FB fixado no par frontal DL/FL/DFL e escolha pedagogica declarada. Itens 1, 2 e 4 atendidos pelo P0 de Prisma (`src/data/trainers/types.ts`, `stage-validators.ts`, `registry.ts`). Minhas definicoes estao materializadas no formato `TrainerFixtureSpec` em `src/solver/methods/roux/trainer-fixtures.ts` (24 fixtures: FB 5, SB 5, CMLL 10, LSE 4), com prova autoral em `tests/domain/solver/roux/trainer-fixtures.test.ts` (5/5 focados e strict exit 0): IDs namespaced, objetivo/precondicao validos no cubo resolvido, rejeicao de estados que violam a etapa, `cmll-oriented` admitindo permutacao e rejeitando desorientacao com blocos intactos, e intro-set conferido contra o corpus por ID e grupo. `setupSubgroup` nulo significa geracao por inversa/filtragem com validacao posterior; preparos LSE devem normalizar o deslocamento liquido de U para satisfazer a precondicao `cmll`. Itens 3 e 5 seguem abertos na fase dos geradores.

CURADORIA CONSUMIDA INTEGRALMENTE: nomes e objetivos das 24 fixtures atualizados verbatim de docs/expansion-curation/roux-trainer-names.md (Trama), com o arquivo citado na proveniencia de todas as fixtures e conferencia dos 9 nomes de casos do corpus. Os quatro textos observar (quadrado frontal, ferramenta U/R/M/r, honestidade de cobertura do intro e EO nao e mascara OLL) foram consumidos verbatim no campo opcional `observe` que Prisma adicionou ao TrainerFixtureSpec; o texto do intro cobre as sete fixtures intro-*, total de 10 fixtures com observe. Prova pos consumo: 7/7 focados (citacao da curadoria em toda fixture e cobertura exata do observe) e strict focado exit 0.

Dados e geradores vivem em `src/data/trainers/**` (Prisma). Minha parte entra por contrato, sem edicao concorrente:

1. Prisma expoe os predicados de etapa do planejador Roux (fb, sb, cmll, eo, lr, finish) como validadores reutilizaveis de precondition/goal/preserve/referenceFrame; nao duplicarei essas regras.
2. Prisma define o formato de fixture/registro (methodId/stageId/coverage etc. do method-research); eu forneco as definicoes pedagogicas acima (objetivos, preservacoes, textos, progressao e selecao de casos CMLL introdutorios) no formato combinado.
3. Geradores de preparo por subgrupo com validacao ficam com Prisma; eu especifico o subgrupo e a precondicao de cada exercicio (tabelas acima) e aceito ajuste conjunto.
4. Predicado novo de cantos orientados (orientacao dos 4 cantos superiores sem exigir permutacao, blocos preservados) para o objetivo intermediario do fluxo de dois olhares do intro-set; hoje o planejador so tem o goal CMLL completo.
5. Prova em teste da propriedade de grupo do intro-set: caso escolhido aplicado a cada variante de permutacao do grupo termina orientado com blocos preservados.
6. Prova independente e de Sonda; nomes e metas pedagogicas coordenados com Trama.

## Fora deste recorte

Sem EOLR avancado, CMLLEO, blocos nao correspondentes, uma mao (item 14, fora do meu pacote) e sem autofill de cores. Nada aqui ativa Sync V4, toca o incidente de producao, suite ampla, build ou Git.
