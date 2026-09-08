# Solucionador 3×3: fontes e integração do guia

Este pacote contém texto autoral para o editor manual e o acompanhamento da solução. Ele não altera algoritmos, corpus didático, bibliotecas ou provas anteriores. A materialização dos documentos não constitui prova de que a área Solucionador já esteja implementada ou aprovada em interface, worker e offline.

## Arquivos para integração

| Arquivo | Uso |
| --- | --- |
| [Guia em pt-BR](guia-pt-BR.md) | Ajuda para orientar o cubo, transcrever, revisar, ler os 18 giros e acompanhar fisicamente a solução. A seção “Comece por aqui” funciona como introdução curta. |
| [Mensagens em pt-BR](mensagens-pt-BR.md) | Texto dos dez códigos de validação, alternativas sem destaque, estados de cálculo, controles e descrições de movimento. |
| Este documento | Proveniência, permissões e limites técnicos que devem permanecer coerentes com a implementação. |

Os textos foram alinhados ao contrato de entrada e validação e conferidos com o barrel real `src/solver/index.ts`. Ele exporta os tipos, `SOLVER_FRAME`, `SOLVER_FACES`, `SOLVER_FACE_ORIENTATION`, `SOLVER_ISSUE_MESSAGES`, `validateDraft`, `getDraftPreview`, `createEmptyDraft` e `createSolvedDraft`, entre outros auxiliares. O preenchimento guiado usa os exports de wizard descritos abaixo. A existência de um auxiliar de rascunho resolvido não autoriza um botão de preenchimento automático na UI. Os textos públicos não precisam exibir caminhos de código, nomes de agentes ou o protocolo interno.

## Referencial acordado

`DraftFacelets` representa seis faces com nove valores `Face | null` por face. A ordem da serialização é `URFDLB`, com `SOLVER_FRAME = 'URFDLB-fixed-v2'`. Índices de cada face vão de 0 a 8, por linhas, vistos de fora; o centro é 4. Cores fixas: U amarelo, R laranja, F verde, D branco, L vermelho e B azul. São seis centros fixos e 48 posições editáveis, totalizando 54 adesivos. `FACE_COLORS` e `FACE_COLOR_LABELS`, no domínio, são as autoridades de paleta e nomes consumidas pela interface.

A correção mantém eixos, índices, identidades de peças e movimentos. O novo prefixo de `inputKey` usa o frame v2, e o rascunho da UI deve carregar sua versão em um envelope, sem alterar o formato interno de `DraftFacelets`. Um rascunho ou resultado do esquema anterior não pode ser reutilizado silenciosamente sob as novas cores. Novo preenchimento ou eventual conversão exige ação explícita; estes textos não prometem conversão automática, recuperação de rascunho que não foi persistido ou suporte a outros esquemas.

Não foi acrescentado um código a `SolverIssueCode` para essa transição. A fronteira do cliente rejeita uma chave antiga com `input-key-mismatch`; a UI bloqueia um rascunho sem versão antes de chamar `validateDraft`. A mensagem `center-mismatch` continua descrevendo centros incompatíveis com a referência atual, sem servir como promessa de migração do preenchimento.

Esta tabela descreve as grades canônicas armazenadas em `DraftFacelets`, não a pose de apresentação de cada passo do wizard:

| Face canônica | Cima da grade | Direita | Baixo | Esquerda |
| --- | --- | --- | --- | --- |
| U | B | R | F | L |
| R | U | B | D | F |
| F | U | R | D | L |
| D | F | R | B | L |
| L | U | F | D | B |
| B | U | L | D | R |

Exemplos de posição: `U0` é o adesivo de U no canto UBL; `U8`, no canto UFR; `D0`, no canto DFL; `D8`, no canto DBR. Esses nomes designam a posição da grade, não a identidade de uma peça enquanto a entrada ainda é inválida. A tabela corresponde à função de coordenadas de `src/domain/cube.ts` e ao contrato acordado para o editor.

O preview representa as cores pintadas nos slots geométricos. Somente após a validação o estado pode atribuir identidades físicas aos adesivos e às peças. Portanto a existência de uma prévia 3D não é sinal de entrada válida. Não remapear cores nem normalizar a orientação do cubo silenciosamente.

## Contrato do preenchimento guiado

[wizard.ts](../../../src/solver/wizard.ts), reexportado pelo barrel do solver, publica `SOLVER_WIZARD_STEPS`, `getWizardStep`, `wizardSlotToCanonical`, `canonicalSlotToWizard`, `getWizardFace`, `getWizardPreview` e `getWizardTransition`, com os tipos `WizardPose`, `WizardStep` e `WizardTransition`. O wizard mantém `DraftFacelets` e o frame v2; não redefine os índices armazenados nem o esquema físico.

Cada `WizardStep` contém `index`, `face`, `pose`, `neighbors` e nove `slots` canônicos. A pose fornece `algorithm`, `inverseAlgorithm` e as imagens dos eixos +X/+Y/+Z em `xAxis`, `yAxis` e `zAxis`. A tabela abaixo corresponde à saída publicada pelo autor do contrato:

| Passo | Face | Pose absoluta | Vizinhos: acima/direita/abaixo/esquerda | Índices canônicos na grade local |
| --- | --- | --- | --- | --- |
| 1 | U | `x'` | B/R/F/L | 0,1,2,3,4,5,6,7,8 |
| 2 | F | sequência vazia | U/R/D/L | 0,1,2,3,4,5,6,7,8 |
| 3 | R | `y` | U/B/D/F | 0,1,2,3,4,5,6,7,8 |
| 4 | B | `y2` | U/L/D/R | 0,1,2,3,4,5,6,7,8 |
| 5 | L | `y'` | U/F/D/B | 0,1,2,3,4,5,6,7,8 |
| 6 | D | `y' x` | L/F/R/B | 6,3,0,7,4,1,8,5,2 |

Os índices de passo são internos de 0 a 5 e visíveis de 1 a 6. O centro local é sempre a posição 4. Em D, a grade apresentada está girada em relação à grade canônica; ignorar esse mapeamento atribuiria as cores a posições erradas. Usar os helpers inversos para escrita, leitura e associação de avisos aos slots, sem inferir que índice local e canônico são iguais em todas as faces.

`getWizardTransition(from, to)` recebe uma face ou `null`; `null` representa a referência de resolução U acima e F à frente. O retorno contém `algorithm`, `inverseAlgorithm`, `tokens` e `moves` de rotações do cubo inteiro, somente x/y/z. A entrada inicial `null` para U usa `x'`; os avanços U→F→R→B→L→D usam, respectivamente, x, y, y, y, x. Retorno, edição de qualquer face e revisão usam a transição calculada para os destinos reais, sem inverter índices à mão.

A UI anima os movimentos sobre o preview da pose de origem até a pose de destino. `getWizardPreview` gira apenas a geometria do preview e mantém os IDs usados pela paleta; não modifica o rascunho. Usar a geometria já girada ou aplicar a base orientada no renderer, sem aplicar a pose duas vezes. Durante a entrada, a câmera segue o passo; a revisão permite órbita livre. Redução de movimento conserva direção, texto, setas e pose final.

O envelope de UI acordado é `{scheme: SOLVER_FRAME, draft}`. Voltar e editar um rascunho compatível preservam suas cores. Progresso depende da face completa, com oito posições editáveis, e a revisão final exige validação física antes de Resolver. O contrato e a orientação documental não substituem QA de transições, interface ou acessibilidade e não afirmam que o app movimenta o cubo físico.

## Erros e resultado

A checagem progride por estrutura, cores/centros, completude e contagens; em seguida, identidade e unicidade das peças; por fim, orientação dos cantos, orientação das arestas e paridade de permutação. Um canto espelhado falha na identidade/ordem das cores mesmo quando seu conjunto de três cores parece correto.

As restrições globais são soma das orientações dos cantos igual a zero módulo 3, soma das orientações das arestas par e igualdade entre as paridades das permutações de cantos e arestas. Elas detectam incompatibilidade do conjunto sem localizar automaticamente qual adesivo foi transcrito incorretamente. [Fundamento de coordenadas e invariantes, Herbert Kociemba](https://kociemba.org/math/coordlevel.htm).

`SolverIssue.slots` informa posições associadas a um conflito. Em twist, flip e paridade, o contrato usa `scope: cube` e lista vazia. O guia e as mensagens preservam essa distinção. O tipo real publica `counts?` e `expected?: 9`; o erro `color-count` fornece esses detalhes após validar a estrutura, as cores, os centros e a completude. Não reconstruir a contagem por suposição a partir da última edição.

A solução deve começar no estado realmente informado e validado, não no estado resolvido nem na inversa de um exemplo da biblioteca. Antes de publicar o resultado, a implementação deve aplicar a sequência à entrada original e conferir os 54 adesivos na referência fixa. Uma entrada já resolvida produz sequência vazia e zero movimentos, sem mensagem de falha.

O contrato do solucionador restringe os tokens a `^[URFDLB](2|')?$`: seis faces externas, três quantidades/sentidos por face, 18 possibilidades. Um token inesperado exige tratamento de erro de contrato, sem truncar a sequência. A notação ampla da biblioteca de estudo não amplia automaticamente o conjunto do solucionador manual.

## Cálculo, cancelamento e publicação

O vínculo de cada solicitação usa `requestId`, a codificação exata `inputKey` da entrada e o contexto ativo. Edição, reset, nova solicitação, logout ou troca de contexto invalidam respostas anteriores. As fases previstas são `initializing`, `solving` e `verifying`, sem progresso numérico inferido.

A API instalada `experimentalSolve3x3x3IgnoringCenters` utiliza um worker interno compartilhado pela biblioteca e não recebe um `AbortSignal` de cálculo nem fornece progresso percentual. Cancelamento lógico deve impedir imediatamente o uso de resultado obsoleto; afirmar o encerramento imediato de todo processamento exige evidência específica da implementação dos workers. O texto “Solicitação cancelada” não faz essa promessa. [API da versão instalada](https://github.com/cubing/cubing.js/blob/82d6034ae61da9aa1f3acbe84a0a8407e2fcd2a7/src/cubing/search/outside.ts).

O nome `IgnoringCenters` exige cuidado: o recorte só aceita centros de cores já fixados e validados. Não há objetivo de orientar desenhos ou logotipos dos centros. Nenhuma alegação de solução ótima, método CFOP/Roux, duração máxima ou limite de movimentos é derivada do nome da API.

O cálculo previsto é local, com recursos empacotados no aplicativo. A disponibilidade offline exige a inclusão e a disponibilidade efetiva de todos os chunks necessários; estas notas não substituem essa prova. A área segue a regra de acesso autenticado do app. Usar o solucionador não deve criar tempos, sessões, recordes ou tentativas de estudo.

## Fontes primárias e permissões

| Fonte | Evidência e uso neste pacote | Permissão e limite |
| --- | --- | --- |
| [Modelo local de cores e movimentos](../../../src/domain/cube.ts) | Convenção de cores, coordenadas das grades vistas de fora e movimentos. O guia foi derivado por leitura, sem alterar ou executar o modelo. | Código original Nexus Cube, sob a licença MIT do projeto. |
| [Herbert Kociemba, Facelet Level](https://kociemba.org/math/faceletlevel.htm) | Notação de giros, inverso e composição de movimentos nos adesivos. | Referência conceitual. Nenhuma figura, tabela, sequência de exemplo ou trecho de código foi copiado. Não se atribui licença de reutilização não verificada às páginas. |
| [Herbert Kociemba, Cubie Level](https://kociemba.org/math/cubielevel.htm) | Distinção entre 12 arestas e oito cantos, permutação e orientação das peças. | Síntese autoral em linguagem de uso; sem redistribuir imagens ou implementação. |
| [Herbert Kociemba, Coordinate Level](https://kociemba.org/math/coordlevel.htm) | Restrições de orientações e permutações que fundamentam a explicação de impossibilidade física. | Referência matemática, sem transcrição de código ou tabelas. |
| [cubing.js, API de busca no commit instalado](https://github.com/cubing/cubing.js/blob/82d6034ae61da9aa1f3acbe84a0a8407e2fcd2a7/src/cubing/search/outside.ts) | API `experimentalSolve3x3x3IgnoringCenters`, retorno `Alg` e uso de worker da biblioteca. Versão local conferida: `cubing@0.63.4`. | O pacote declara `MPL-2.0 OR GPL-3.0-or-later`; o projeto já utiliza a opção MPL-2.0. Sem modificação ou nova instalação neste trabalho. |
| [cubing.js, implementação de busca 3×3 no mesmo commit](https://github.com/cubing/cubing.js/blob/82d6034ae61da9aa1f3acbe84a0a8407e2fcd2a7/src/cubing/search/inside/solve/puzzles/3x3x3/index.ts) | Proveniência do caminho de solução reutilizado, com min2phase já incluído. | Mesmas obrigações da distribuição existente, preservadas. Não se escolhe uma nova licença para a dependência. |
| [cubing.js, LICENSE-MPL.md no commit fixado](https://github.com/cubing/cubing.js/blob/82d6034ae61da9aa1f3acbe84a0a8407e2fcd2a7/LICENSE-MPL.md) | Texto primário da licença escolhida para a biblioteca. | A licença MIT do código original do app não substitui a licença da biblioteca. |
| [min2phase, documentação e opção MIT](https://github.com/cs0x7f/min2phase/blob/master/README.md) | Implementação de solução 3×3 e declaração MIT de Chen Shuang, 2023. O README também apresenta a alternativa GPLv3. | A opção MIT e seu aviso já são preservados na documentação de terceiros do projeto. Não se copiam as sequências ou o diagrama do README para este guia. A página `master` é referência de consulta, não identificação de uma nova versão instalada. |

Autoria dos textos, seleção de explicações e redação das mensagens: Nexus Cube contributors. Licença: [MIT do projeto](../../../LICENSE). Os avisos completos das dependências permanecem em [Fontes e licenças do projeto](../../sources-and-licenses.md), sem alteração por este pacote. Não foram criados ou copiados assets externos.

## Estado da entrega editorial

Guia, mensagens e fontes foram materializados após liberação da janela documental. Não foram executados testes, geradores, build, solver ou navegador nesta tarefa. Nenhuma evidência anterior do corpus foi renovada. A revisão editorial confere o esquema físico v2, os 18 giros de Direta, as seis poses e os mapeamentos publicados do wizard, os diagnósticos globais e os limites do acompanhamento físico. A validação da funcionalidade integrada pertence aos testes de domínio e às verificações de interface correspondentes.
