# Curadoria da expansão CFOP e Roux

Curadoria: Nexus Cube. Data: 2026-09-08. Os formatos dos dados são definidos pelos tipos `ExpansionAlgorithmSource` e `ExpansionExerciseSource` em `src/domain/types.ts`. Dados declarativos em `src/data/expansion-sources/cmll.ts` e `exercises.ts`. A camada de domínio integra e valida o conteúdo; verificações independentes conferem sua identidade e semântica. Este documento registra a curadoria, não substitui a validação integrada de interface, persistência e offline.

## Entrega e recorte

São 42 classes CMLL não triviais e 24 exercícios autorais: cruz 4, fundamentos F2L 4, primeiro bloco 4, segundo bloco 4 e LSE 8. Há conteúdo para todos os subobjetivos solicitados, com setup, solução, marcos, foco por identidade de peça e preservação. Os 41 casos básicos F2L integram o catálogo algorítmico complementar; os 57 OLL e 21 PLL permanecem na biblioteca existente. As 42 classes CMLL são uma etapa do Roux; blocos e LSE têm seu próprio percurso.

Os 24 exercícios são exemplos finitos e verificáveis de uma progressão. Não enumeram todas as construções intuitivas de cruz, FB ou SB, nem todas as distribuições de EO ou permutações LSE. O usuário aprende a localizar peças, formar pares/quadrados, preservar o que construiu e conferir objetivos. Não há alegação de que memorizar essas 24 sequências resolva qualquer embaralhamento sem decisões adicionais. Não se promete neutralidade de cores, lookahead treinado, EOLR avançado, CMLLEO, blocos não correspondentes ou execução com uma mão.

Referência geométrica do corpus: U amarelo, D branco, F verde, B azul, R vermelho e L laranja. Câmera não muda essa referência. Os exercícios F2L usam o slot FR; não publicamos espelhos, outros slots ou variantes AUF como conteúdo adicional sem validação. CMLL reconhece a equivalência por ajuste U e renomeação cíclica das cores laterais; o playback principal oferece um representante concreto de cada classe.

## Origem e permissões

| Material | Origem verificada e uso |
| --- | --- |
| Sementes algorítmicas | [Cube Coach, Luke Jackson, dados no commit 856b269c63715fbd164b90aee1de5f4725fd277a](https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts). O [README nesse commit](https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/README.md) declara MIT. O projeto já preserva atribuição e termos integrais em `docs/sources-and-licenses.md` e `src/data/catalog-source.ts`. Não inventamos ano de copyright nem licença de arquivo ausente. |
| CMLL produzido nesta entrega | Busca própria sobre transformações das sementes licenciadas já presentes, com composição, inversão e simplificação de movimentos. `cmll-proof.json` registra as sementes de cada resultado. Autoria da seleção, geração, coordenadas, explicações e nomes editoriais: curadoria do Nexus Cube. Isso não afirma que os algoritmos matemáticos sejam inéditos. Não copiamos uma coleção CMLL de terceiros. |
| Cobertura e função de CMLL | [Kian Mansour](https://sites.google.com/view/kianroux/cmll) confirma 42 casos e a tarefa de orientar/permutar cantos. Referência factual; sua planilha, vídeos, imagens, textos e seleção de algoritmos não foram incorporados. |
| Grupos e reconhecimento | [Roux Method VN, página CMLL](https://sites.google.com/view/rouxmethodvn/cmll) documenta O, H, Pi, T, U, As, L e S. [Roux Reader](https://book.rouxers.com/en/cmll.html) discute reconhecimento pelas relações entre cores dos cantos. Consultas de nomenclatura e conceito; nenhum diagrama ou texto copiado. |
| Cruz e pares F2L | [Sistema de Jessica Fridrich](https://ws.binghamton.edu/fridrich/system.html) e [exemplos da autora](https://ws.binghamton.edu/fridrich/examples.html). Síntese pedagógica própria. Os estados dos exercícios não são transcrições dos exemplos dessas páginas. |
| Blocos Roux | [Primeiro bloco de Gilles Roux](http://grrroux.free.fr/method/Step_1.html) e [segundo bloco](http://grrroux.free.fr/method/Step_2.html). Definição das peças e progressão por pares/quadrados. Páginas lidas por HTTP porque o leitor HTTPS recusou o domínio. Applets, figuras e tabelas de sequências não foram usados. |
| LSE | [Passo 4 original de Gilles Roux](http://grrroux.free.fr/method/Step_4.html) e [tutorial Rouxers](https://tutorial.rouxers.com/beginners/lse.html). O primeiro usa cores diferentes; nosso referencial está explicitado abaixo. A progressão EO, UL/UR e conclusão foi descrita em texto próprio, com estados montados localmente. |
| Exercícios | Montagens, decomposição em marcos e texto produzidos para o Nexus Cube. O resíduo Sune usado nos quatro fundamentos F2L e quatro exercícios SB é a semente OLL-27 já licenciada em MIT, indicada também no campo `provenance` desses registros. Movimentos elementares e as demais composições foram elaborados localmente. |
| Oráculo | `cubing` instalado, versão 0.63.4, KPuzzle/KPattern, sem modificação. O projeto usa a opção MPL-2.0 da licença dual da biblioteca e preserva seus avisos. Ver `docs/sources-and-licenses.md`. Não foi adicionada dependência nem alterada a licença do produto. |

As páginas pedagógicas consultadas não foram tratadas como autorização para redistribuir seus materiais. Só as sementes com permissão MIT já estabelecida entram como material adaptado. Todas as miniaturas e visualizações devem ser produzidas pelo modelo local do cubo. Não há imagem, planilha ou coleção CMLL externa nesta pasta.

## CMLL: identidade, grupos e nomes

Representação: quatro cantos na ordem Reid `UFR URB UBL ULF`, peças 0 a 3 e orientações 0 a 2. Há 24 permutações e 27 orientações com soma zero módulo 3, totalizando 648 estados de cantos. A paridade das arestas livres compensa qualquer paridade dos cantos; não se descartam as permutações ímpares dos quatro cantos.

A equivalência remove ajustes U na entrada/saída e a escolha cíclica das cores laterais. A enumeração encontra 43 classes, das quais uma é o caso já resolvido até U. Restam 42 classes. As arestas livres não participam da identidade. Os IDs são estáveis do Nexus Cube, não números universais de outra coleção.

| Grupo | IDs Nexus | Quantidade | Assinatura de orientação mínima por rotação | Âncora de orientação licenciada |
| --- | --- | --- | --- | --- |
| O | `roux/cmll/01` a `02` | 2 | `0000` | Quatro cantos orientados |
| H | `roux/cmll/03` a `06` | 4 | `1212` | Orientação dos cantos de OLL-21 |
| Pi | `roux/cmll/07` a `12` | 6 | `1122` | Orientação dos cantos de OLL-22 |
| U | `roux/cmll/13` a `18` | 6 | `0012` | Orientação dos cantos de OLL-23 |
| T | `roux/cmll/19` a `24` | 6 | `0021` | Orientação dos cantos de OLL-24 |
| S | `roux/cmll/25` a `30` | 6 | `0222` | Orientação dos cantos de OLL-27, Sune |
| AS | `roux/cmll/31` a `36` | 6 | `0111` | Orientação dos cantos de OLL-26, Antisune |
| L | `roux/cmll/37` a `42` | 6 | `0102` | Orientação dos cantos de OLL-25 |

A referência a OLL na última coluna é apenas uma âncora já licenciada para a orientação dos quatro cantos. A validação CMLL exige orientação **e** permutação desses cantos e preservação dos dois blocos; não exige orientar ou permutar as seis arestas livres.

Os títulos são descritivos, como “U: dois cantos vizinhos 1”, e `nameKind` é `descriptive`. O ordinal interno de cada grupo vem da assinatura ordenada de cantos. Nomes ou aliases com grupo e número referem-se a essa convenção editorial Nexus e não devem ser apresentados como equivalência a H1/U1 de outra planilha. O reconhecimento completo está em `recognition`, com as três cores de cada canto visíveis no modelo. O grupo sozinho não identifica o caso.

Algoritmos finais: mínimo **6**, mediana **11,5**, máximo **16 movimentos**. A métrica conta cada token como um movimento, inclusive dupla, camada interna, larga ou rotação. A busca seleciona caminhos curtos no conjunto de geradores licenciados, depois combina movimentos consecutivos da mesma face. Seis sequências foram encurtadas por essa simplificação, com equivalência comprovada no estado completo. Não há alegação de ótimo global, fingertricks profissionais ou avaliação física de ergonomia. Nenhum solver geral de cubo foi usado para produzir a lista CMLL.

## Percurso CFOP do corpus

Prefixos: `cfop/cross/` e `cfop/f2l/`. A solução de cada exercício chega ao objetivo da etapa. O estado residual conserva uma tarefa seguinte, em vez de apresentar o cubo inteiro resolvido por coincidência.

| ID final | Subobjetivo e marcos principais |
| --- | --- |
| `cross/alinhar-uma-aresta` | Localizar branca/verde, conferir centro F e inserir DF com F2. |
| `cross/arestas-vizinhas` | Planejar DR e DF; primeiro R2, depois F2; conferir toda a cruz. |
| `cross/arestas-opostas` | Planejar DB e DF com referência fixa; inserir sem trocar frente e fundo. |
| `cross/planejar-quatro` | Localizar quatro arestas, inserir DL, DB, DR e DF em marcos separados; verificar cores laterais. |
| `f2l/par-pronto` | Reconhecer canto DFR e aresta FR conectados pelas cores comuns; inserir o conjunto. |
| `f2l/formar-par` | Peças separadas; abrir slot, conectar com U e fechar o slot. |
| `f2l/conexao-incorreta` | Peças vizinhas com cores comuns discordantes; separar, reposicionar e conectar corretamente. |
| `f2l/extrair-canto` | Canto DFR girado no slot e aresta em U; extrair, ajustar, formar e inserir. |

Cruz protege as arestas já corretas declaradas por exercício. F2L começa com cruz e outros três pares resolvidos e os preserva ao terminar. O slot alvo é sempre FR. Os quatro fundamentos mostram relações distintas; o catálogo de 41 casos básicos oferece a consulta complementar. Depois de F2L, o percurso segue pelos 57 OLL e 21 PLL existentes, com suas seleções introdutórias em duas etapas.

## Percurso Roux do corpus

FB resolve `DL FL BL DFL DBL`. SB acrescenta `DR FR BR DFR DBR` mantendo FB. CMLL resolve os quatro cantos de U. LSE conclui `UF UR UB UL DF DB` e os centros móveis. O foco acompanha essas identidades, não uma posição recalculada a cada quadro.

| ID após `roux/` | Subobjetivo e marcos principais |
| --- | --- |
| `fb/aresta-base` | Localizar DL. Exemplo com peças já agrupadas, assentar base e bloco com L2. |
| `fb/quadrado-frontal` | Usar DL como apoio; inserir DFL/FL e reconhecer o quadrado 1×2×2. |
| `fb/par-traseiro` | Preservar a frente e adicionar DBL/BL para completar 1×2×3. |
| `fb/construir-bloco` | Construção guiada com marcos de base, par frontal e par traseiro. |
| `sb/aresta-base` | Localizar DR com FB protegido; exemplo com peças direitas agrupadas. |
| `sb/quadrado-frontal` | Construir DR/DFR/FR mantendo FB como referência. |
| `sb/par-traseiro` | Completar DBR/BR mantendo FB e a frente direita. |
| `sb/construir-bloco` | Percurso completo de DR, frente e fundo; terminar dois blocos e passar a CMLL. |
| `cmll/01` a `cmll/42` | Reconhecer orientação e relações de cores dos quatro cantos; executar e conferir cantos/blocos antes de LSE. |
| `lse/referencia-centros` | Começa com M ímpar; restaurar o eixo vertical antes de avaliar EO. |
| `lse/eo-duas` | Exemplo com exatamente duas arestas ruins; transformar e concluir EO. |
| `lse/eo-quatro` | Exemplo com exatamente quatro arestas ruins; concluir EO e realinhar cantos. |
| `lse/eo-seis` | Exemplo com exatamente seis arestas ruins; acompanhar três blocos de movimentos até EO. |
| `lse/ul-ur-trocas` | Rastrear UL/UR entre U e D, usar trocas e ajustes U e terminar ambas corretamente. |
| `lse/ul-ur-meias-voltas` | Outra construção concreta de UL/UR, usando M2 e U para manter EO. |
| `lse/quatro-arestas` | Com EO e UL/UR prontos, resolver quatro arestas de M e restaurar centros/cantos. |
| `lse/fechar-centros` | Estado final com M2 pendente; resolver simultaneamente quatro arestas e os centros móveis. |

Todos os exemplos de blocos terminam o bloco da etapa, mesmo quando o foco é um subobjetivo: nos exemplos de quadrado/par final, as demais peças já estão prontas; nos exemplos de base, as peças estão agrupadas. Isso é declarado no texto. Os exemplos “construir bloco” mostram os três marcos em sequência. Nenhuma pequena lista é apresentada como enumeração universal das construções de bloco.

### Referência EO e conclusão LSE

O recorte iniciante usa centros U/D no eixo vertical, permitindo M2 pendente, e considera boa a aresta livre cujo adesivo branco ou amarelo aponta para cima ou para baixo. Um estado com M ímpar não satisfaz o objetivo final EO neste corpus. Antes de contar arestas ruins, normalize os centros conforme o primeiro exercício. A quantidade 2/4/6 descreve os exemplos com referência normalizada; não se deve aplicar essa contagem cegamente durante qualquer marco intermediário com centros deslocados.

Todos os finais LSE do corpus têm os cantos alinhados exatamente à referência fixa, sem AUF pendente. EO pode terminar com permutação de arestas incorreta; UL/UR pode terminar com quatro arestas de M incorretas. Os dois exercícios finais exigem todas as arestas, cantos e centros resolvidos. M2 pode ser aceitável no referencial de EO, mas não encerra a resolução quando desloca centros/arestas. O campo `validation.referenceFrame` é `fixed` nos oito exercícios LSE: ele controla a preservação de blocos/cantos e não redefine EO. Os objetivos `lse-eo` e `lse-lr` verificam explicitamente os centros U/D no eixo vertical e a orientação das arestas. Comparar os cantos aos centros móveis com `referenceFrame: centers` rejeitaria incorretamente um final EO válido com M2 residual; essa ambiguidade foi corrigida sem alterar setups ou soluções.

## Setup, solução, marcos e foco

Cada exercício tem `setup` autoral desde o cubo resolvido e `solution` que conclui sua tarefa. Em geral `setup = residual + inversa(solution)`. O residual é escolhido para deixar a próxima etapa pendente. Portanto a inversa isolada da solução não é necessariamente o preparo daquele exercício. A interface deve mostrar `preparation` para montar o estado e `inverseSolution` como reverso da solução, conforme os campos do tipo `AlgorithmPlayback` em `src/domain/types.ts`.

Em CMLL, a inversa do algoritmo selecionado monta seu representante físico. A coordenada `recognition` foi conferida contra esse estado. As provas independentes constroem os cantos diretamente e variam arestas; não se limitam a cancelar algoritmo e inversa.

Marcos usam a quantidade de movimentos já aplicada, começando em zero. Cada marco combina uma explicação pedagógica com a posição/orientação real das peças alvo naquele estado. `verification.json` registra os estados cubie nos marcos. As listas `focus.pieces` e `referencePieces` contêm identidades resolvidas, inclusive centros quando relevantes. Elas devem ser convertidas em IDs estáveis de adesivos. O foco não altera o estado matemático.

## Verificação reproduzível

Os comandos de geração e verificação podem ser executados individualmente da raiz do projeto:

```sh
node --import tsx docs/expansion-curation/generate-cmll.mjs
node --import tsx docs/expansion-curation/generate-exercises.mjs
node --import tsx docs/expansion-curation/verify-corpus.mjs
```

Os dois primeiros comandos escrevem os dados em `src/data/expansion-sources/` e as provas de geração em `docs/expansion-curation/`. O terceiro lê o modelo de domínio e o oráculo e escreve `verification.json` nesta pasta. Nenhum deles executa a suíte completa, build, navegador ou alteração de servidor.

Prova focada final: 648 coordenadas independentes, 644 não triviais resolvidas pela classe correspondente com ajustes U, quatro estados skip, 42 classes disjuntas e 504 fixtures adicionais com arestas livres variadas. Fixtures incluem permutações/orientações legais compensatórias e variações M/M2, preservando blocos. O modelo geométrico e KPuzzle concordaram em 607 passos de movimento de CMLL/exercícios. Os 24 exercícios começam sem atingir seu objetivo, satisfazem as pré-condições declaradas e terminam aprovados pelo oráculo e pelo validador de domínio. As peças declaradas protegidas começam e terminam corretas.

`cmll-proof.json` conserva assinatura, sementes, preparo e comprimento por classe. `verification.json` conserva métricas, estados de marco e SHA-256 dos dois arquivos de dados. Esses resultados são evidência da curadoria. A validação integrada também abrange interface, backup, câmera e funcionamento offline.
