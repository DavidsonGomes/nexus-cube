# Curadoria de uma mao (OH): spec item 14

Autor: Trama (Curadoria Cubo). Data: 2026-09-09. Consumidor: Prisma (instanciar o treinador de uma mao a partir deste doc). Mesmo formato verificavel dos finger tricks P1: gate de exibicao por provenance.status, semantica POSICIONAL de ancora (slot no estado imediatamente anterior ao toque), vocabulario canonico Reid do dominio (U_CORNERS e blocos de src/domain/stage-validation.ts), tokens da gramatica do parseAlgorithm.

STATUS 2026-09-09: 14 registros JSON materializados em src/data/expansion-sources/one-hand/ e VERIFIED por revisao geometrica independente da Sonda (12 como estavam; 8 arquivos receberam correcao obrigatoria de mirrorOf para a convencao de espelho de GESTO do precedente P1, aplicada com reciprocidade conferida por script). Esquema confirmado por Prisma (solvingHand no tipo, IDs/categorias, token z). Familia M segue fora do gate aguardando decisao de produto sobre table abuse; z' sem registro proprio por cobertura declarada.

GATE DE HONESTIDADE: os itens do DOC abaixo nascem `proposed`. Pela regra vigente do Mestre, `verified` exige revisor independente (Dobra ou Sonda); curador nao se autoverifica. Nada exibe pegada ate a revisao. Itens sem fonte primaria confiavel estao marcados FORA DO GATE nesta rodada, cobertura declarada acima de completude.

## Convencoes OH

- Campo novo proposto ao esquema: `solvingHand: "right" | "left"` no registro (na execucao OH a mao que executa e a que estabiliza sao a MESMA; a estabilizacao e feita pelos dedos de presa, descritos em initialGrip). IDs propostos: `tricks-oh/...`, sujeitos ao registry do Prisma.
- Tokens canonicos usados: U, U', U2, R, R', D, D', M, M', M2, z, z' (todos na gramatica). Transicoes OH sao rotacoes z/z' no lugar de regrips de duas maos, registradas como toques de pulso.
- Ancoras: apenas onde a fonte da o ponto de contato; traducao para nomes canonicos ja aplicada (FUL da fonte = ULF; BUL = UBL; BRD = DBR; FRD = DFR).

## (a) Pegadas e movimentos isolados por mao

### Mao direita

Duas pegadas documentadas na fonte primaria (Speedsolving Wiki, verbete One-Handed Solving, acesso 2026-09-09):

PEGADA A (atribuida a Ryan Patricio na fonte): polegar e medio seguram o cubo; indicador e anular giram.

| Movimento | Dedo | Descricao | Ancora | Status |
| --- | --- | --- | --- | --- |
| U, U', R' | indicador | flicks do indicador conforme o movimento | sem ancora na fonte; texto apenas | proposed |
| R, D, D' | anular | empurroes do anular | sem ancora na fonte; texto apenas | proposed |

PEGADA B (atribuida na fonte a escola japonesa/Brian Loftus): tres dedos seguram; indicador e minimo giram. Forte em sequencias so de R e U; os demais movimentos exigem rotacao (a propria fonte declara mais rotacoes de cubo).

| Movimento | Dedo | Descricao | Ancora | Status |
| --- | --- | --- | --- | --- |
| U | indicador | empurra o canto ULF (frente/cima/esquerda) para a esquerda | ["ULF"] | proposed |
| U' | indicador | empurra o canto UBL (tras/cima/esquerda) para a esquerda | ["UBL"] | proposed |
| R | minimo | empurra o canto DBR (tras/baixo/direita) para a frente | ["DBR"] | proposed |
| R' | minimo | empurra o canto DFR (frente/baixo/direita) para tras | ["DFR"] | proposed |

Conferencia geometrica do curador (mesmo metodo dos P1): ULF para a esquerda = fileira da frente de U para a esquerda = U horario; UBL para a esquerda = fileira de tras para a esquerda = U'; DBR para a frente = coluna de baixo de R indo para F = R; DFR para tras = R'. As quatro batem.

| Movimento | Dedo | Descricao | Ancora | Status |
| --- | --- | --- | --- | --- |
| U2 | medio | dois flicks encadeados; fonte descreve o medio "pronto para flicks de U2" | sem ancora confiavel | proposed, confianca BAIXA (fonte secundaria) |
| M, M', M2 | anular, minimo ou medio + apoio da mesa | "table abuse": a mesa segura o cubo enquanto o dedo gira a camada central | sem ancora | proposed, confianca BAIXA; NOTA DE PRODUTO abaixo |
| transicoes | pulso (rotacoes z/z') | reagrupar a pegada girando o cubo, substituindo o regrip de duas maos | n/a | proposed |
| D2 | sem fonte localizada | FORA DO GATE nesta rodada | n/a | nao curado |

NOTA DE PRODUTO (table abuse): envolve apoiar o cubo na mesa; se o treinador exibir, a UI deve declarar que a tecnica usa a mesa, e a decisao de inclui-la e do Mestre/usuario, nao desta curadoria.

### Mao esquerda

A fonte registra que a mao ESQUERDA e a mais usada por destros (movimentos R e U mais faceis) e que a escolha e por conforto; os mecanismos porem sao descritos de forma generica. O conjunto abaixo e ESPELHO GEOMETRICO autoral da Pegada B (plano M), marcado como derivacao, nao como conteudo da fonte:

| Movimento | Dedo | Descricao | Ancora | Status |
| --- | --- | --- | --- | --- |
| U' | indicador | empurra UFR para a direita | ["UFR"] | proposed, espelho autoral |
| U | indicador | empurra URB para a direita | ["URB"] | proposed, espelho autoral |
| L | minimo | empurra DFL para tras | ["DFL"] | proposed, espelho autoral |
| L' | minimo | empurra DBL para a frente | ["DBL"] | proposed, espelho autoral |

Correcao do curador (2026-09-09, antes da revisao): a primeira versao desta tabela trazia L/L' trocados; conferencia pelo ciclo de adesivos (L: U vai a F, F a D, D a B; a base vai para TRAS) fixou L = DFL para tras e L' = DBL para a frente, coerente com o espelho de R = DBR para a frente.

Espelhar troca R por L e inverte sentidos; a revisao independente deve conferir o espelhamento como fez no sexy-left. Pegada A espelhada (polegar+medio seguram; indicador U/U'/L'; anular L/D/D') segue a mesma logica, texto apenas.

## (b) Variantes OH dos 14 finger tricks verified

| Registro 2H | Variante OH | Como | Status |
| --- | --- | --- | --- |
| u | SIM, direita | indicador em ULF (Pegada B) ou flick do indicador (Pegada A) | proposed |
| u-prime | SIM, direita | indicador em UBL (Pegada B) | proposed |
| u2 | SIM, direita | medio em dois flicks | proposed, baixa |
| d | SIM, direita | anular (Pegada A), sem ancora | proposed |
| d-prime | SIM, direita | anular (Pegada A), sem ancora | proposed |
| d2 | NAO nesta rodada | sem fonte | fora do gate |
| m | SIM, com ressalva | table abuse | proposed, baixa + nota de produto |
| m-prime | SIM, com ressalva | table abuse | proposed, baixa + nota de produto |
| m2 | SIM, com ressalva | table abuse | proposed, baixa + nota de produto |
| sexy-right | SIM, direita | R (minimo em DBR) U (indicador em ULF) R' (minimo em DFR) U' (indicador em UBL), Pegada B; composicao autoral de mapeamentos com fonte | proposed |
| sexy-left | SIM, esquerda | espelho autoral da linha acima com L/L' | proposed, baixa |
| sledgehammer-right | NAO nesta rodada | F de uma mao sem fonte confiavel; exigiria rotacao e pegada nao documentada | fora do gate |
| combo-sexy-bilateral | NAO, permanente | combo bilateral exige duas maos por definicao | n/a |
| combo-u2-d2 | NAO, permanente | idem | n/a |

Nota pedagogica com fonte: a fonte descreve a "amnesia de uma mao" (algoritmos decorados no motor de duas maos somem na execucao OH) e recomenda reaprender os algoritmos especificamente para uma mao; isso deve virar texto de objetivo/observar do treinador 14.

## Exemplo de registro no esquema estendido

```jsonc
{
  "id": "tricks-oh/sexy-right",
  "name": "Sexy move de uma mao (direita)",
  "moves": "R U R' U'",
  "solvingHand": "right",
  "handedness": "right",
  "mirrorOf": "tricks-oh/sexy-left",
  "category": "trigger",
  "initialGrip": {
    "summary": "Pegada B: polegar, medio e anular seguram; indicador e minimo giram.",
    "stabilizingHand": "right",
    "right": "Polegar em F, medio e anular atras; indicador livre sobre U, minimo livre na base de R."
  },
  "touches": [
    { "move": "R", "moveIndex": 0, "touchIndex": 1, "touchCount": 1, "hand": "right", "finger": "pinky", "action": "push", "contactPoint": "Minimo no canto tras/baixo/direita, empurrando para a frente.", "anchorPieces": ["DBR"], "direction": "Coluna de baixo de R vai para a frente (R horario visto da direita).", "regripAfter": null },
    { "move": "U", "moveIndex": 1, "touchIndex": 1, "touchCount": 1, "hand": "right", "finger": "index", "action": "push", "contactPoint": "Indicador no canto frente/cima/esquerda, empurrando para a esquerda.", "anchorPieces": ["ULF"], "direction": "Fileira da frente de U vai para a esquerda (U horario visto de cima).", "regripAfter": null },
    { "move": "R'", "moveIndex": 2, "touchIndex": 1, "touchCount": 1, "hand": "right", "finger": "pinky", "action": "push", "contactPoint": "Minimo no canto frente/baixo/direita, empurrando para tras.", "anchorPieces": ["DFR"], "direction": "Coluna da frente de R desce para tras (R anti-horario visto da direita).", "regripAfter": null },
    { "move": "U'", "moveIndex": 3, "touchIndex": 1, "touchCount": 1, "hand": "right", "finger": "index", "action": "push", "contactPoint": "Indicador no canto tras/cima/esquerda, empurrando para a esquerda.", "anchorPieces": ["UBL"], "direction": "Fileira de tras de U vai para a esquerda (U anti-horario visto de cima).", "regripAfter": "Nenhum; presa inalterada, proximo ciclo direto." }
  ],
  "loop": { "continuesFromPreviousState": true, "restoreCycles": null, "restoreCyclesNote": "Calculado pelo dominio." },
  "pedagogy": {
    "objective": "Executar o gatilho principal inteiro com uma mao, sem rotacao nem apoio.",
    "watchFor": "Indicador e minimo giram; polegar, medio e anular nunca soltam. Reaprenda devagar: o motor de duas maos nao transfere sozinho.",
    "commonErrors": ["Tentar velocidade de duas maos e perder a presa.", "Girar o cubo no ar em vez de manter os tres dedos de presa."]
  },
  "provenance": {
    "status": "proposed",
    "verifiedBy": null,
    "sources": [
      { "title": "Speedsolving Wiki, One-Handed Solving", "url": "https://www.speedsolving.com/wiki/index.php/One-Handed_Solving", "accessedAt": "2026-09-09", "license": "Licenca nao localizada na pagina; referencia citada, sem copia de texto.", "supports": "Mapeamentos indicador ULF/UBL para U/U' e minimo DBR/DFR para R/R' (pegada japonesa/Loftus)." }
    ],
    "authorialJustification": "Composicao autoral dos quatro mapeamentos da fonte em uma sequencia; direcoes conferidas geometricamente pelo curador.",
    "verificationMethod": "Pendente: revisao independente (Dobra ou Sonda), incluindo as ancoras."
  }
}
```

## (c) Fontes e licencas

| Fonte | Evidencia | Licenca | Uso |
| --- | --- | --- | --- |
| Speedsolving Wiki, One-Handed Solving (https://www.speedsolving.com/wiki/index.php/One-Handed_Solving, acesso 2026-09-09) | Duas pegadas com papeis de dedos, ancoras ULF/UBL/DBR/DFR, table abuse, amnesia OH, escolha de mao por conforto | Nao localizada na pagina consultada | Fonte primaria citada; descricoes reescritas, nada copiado |
| Ruwix, One-Handed (https://ruwix.com/the-rubiks-cube/one-handed/) | Mao nao dominante como escolha majoritaria | Sem licenca explicita | Referencia citada |
| Chris Hardwick (https://www.speedcubing.com/chris/3x3onehand.html) | Presa polegar+medio com indicador/anular girando | Nao verificada | Referencia citada |
| Cubelelo, blog OH (https://www.cubelelo.com/blogs/cubing/getting-from-3x3-to-oh-tips-and-tricks) | Medio para flicks de U2; minimo na camada R | Blog comercial, sem licenca | Fonte SECUNDARIA; sustenta apenas itens de confianca baixa |
| CubeSkills, Introduction to One-Handed (https://www.cubeskills.com/tutorials/introduction-to-one-handed-speedcubing/gripping-the-cube) | Modulo dedicado a pegada OH, em video | Conteudo proprietario | Referencia citada; nao transcrito |

## Pendencias

1. Mestre: rotear a revisao independente (Dobra ou Sonda). Prioridade: as 4 ancoras da Pegada B direita e o espelho esquerdo.
2. Mestre/usuario: decisao de produto sobre table abuse na UI (unico caminho documentado para M de uma mao).
3. Prisma: confirmar `solvingHand` no esquema e IDs `tricks-oh/*`; apos a revisao, gero os arquivos JSON individuais dos itens aprovados no mesmo diretorio de fontes, um por registro, como nos P1.
4. Fora do gate nesta rodada, reabriveis com fonte nova: D2 OH, sledgehammer OH, algoritmos OH alternativos por caso (variantes de PLL/OLL especificas de uma mao exigem rodada propria de fontes).
