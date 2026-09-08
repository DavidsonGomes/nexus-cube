# Textos da interface do Solucionador 3×3

Pacote editorial pronto para integração. Os dez códigos e mensagens padrão abaixo correspondem a `SolverIssueCode` e `SOLVER_ISSUE_MESSAGES`, exportados por `src/solver/index.ts`. Chaves `ui.*` identificam trechos editoriais deste documento; não são novos códigos de erro do domínio. A integração deve vincular as mensagens aos eventos reais, sem simular estados ou resultados.

## Entrada e orientação

| Chave editorial | Texto |
| --- | --- |
| `ui.title` | Solucionador 3×3 |
| `ui.intro` | Informe as cores do seu cubo e acompanhe uma sequência para resolvê-lo, um movimento por vez. |
| `ui.frame` | Segure o cubo com o centro amarelo em cima, o verde à frente, o vermelho à esquerda e o laranja à direita. |
| `ui.fixed-centers` | Os 6 centros já estão definidos. Preencha as outras 48 posições para representar os 54 adesivos do cubo. |
| `ui.paint` | Escolha uma cor da paleta e marque a posição correspondente. Para corrigir, escolha outra cor e marque a mesma posição. |
| `ui.face-order` | Preencha uma face por vez: amarela, verde, laranja, azul, vermelha e branca. Leia cada grade da esquerda para a direita e de cima para baixo. |
| `ui.back-face` | No quarto passo, mantenha a face azul à sua frente, com o centro amarelo acima da grade e o vermelho à direita. |
| `ui.top-face` | No primeiro passo, mantenha a face amarela à sua frente, com o centro azul acima da grade e o laranja à direita. |
| `ui.bottom-face` | No sexto passo, mantenha a face branca à sua frente, com o centro vermelho acima da grade e o verde à direita. |
| `ui.scheme-unsupported` | Este esquema de centros não é compatível com esta versão. Confira os seis centros antes de preencher. |
| `ui.preview` | Prévia das cores informadas. A validação ainda precisa confirmar se o estado é possível. |
| `ui.general-solution` | Sequência geral para este estado, sem garantia de ser a mais curta. Não corresponde necessariamente às etapas de CFOP ou Roux. |

A paleta deve oferecer nomes além das amostras de cor: Amarelo, Laranja, Verde, Branco, Vermelho e Azul, na ordem URFDLB. A interface consome `FACE_COLORS` e `FACE_COLOR_LABELS` do domínio, sem criar outra associação de cores. A identificação de uma posição pode usar “Frente, linha 1, coluna 1”; índices internos começam em zero, mas linhas e colunas apresentadas à pessoa começam em um. O centro pode ser anunciado como “Frente, centro verde, fixo”.

### Entrada guiada em seis faces

`ui.frame` e `ui.physical-frame` descrevem a referência de resolução. O primeiro passo de preenchimento tem a face amarela voltada para a pessoa. As chaves abaixo são editoriais; os valores de face, vizinhos e transição vêm do contrato publicado em `src/solver/wizard.ts`.

| Chave editorial | Texto |
| --- | --- |
| `ui.wizard-start` | Gire o cubo inteiro para trazer a face amarela à sua frente, com o centro azul acima. Não gire uma camada. |
| `ui.wizard-progress` | Face {passo} de 6: {cor}. |
| `ui.wizard-neighbors` | Confira os centros vizinhos: {acima} acima, {direita} à direita, {abaixo} abaixo e {esquerda} à esquerda. |
| `ui.wizard-fill` | Pinte as oito posições ao redor do centro fixo. |
| `ui.wizard-incomplete` | Complete as posições vazias desta face para avançar. |
| `ui.wizard-rotate` | Gire o cubo inteiro conforme a indicação e confira os centros vizinhos antes de preencher a próxima face. |
| `ui.wizard-back` | Volte à face anterior sem apagar as cores. Faça a rotação do cubo inteiro indicada na tela. |
| `ui.wizard-edit` | Oriente o cubo pela face e pelos centros vizinhos mostrados antes de corrigir as cores. |
| `ui.wizard-resume` | Confira as cores já preenchidas e continue pelas posições vazias. |
| `ui.wizard-review` | Revise as seis faces. Você pode girar a câmera ou abrir uma face para corrigir o preenchimento. |
| `ui.wizard-reduced-motion` | Siga o texto e as setas para girar o cubo inteiro nas mãos. A indicação continua a mesma com movimento reduzido. |
| `ui.wizard-ready-to-solve` | Antes de executar a solução, volte à referência: amarelo em cima, verde à frente e vermelho à esquerda. |

Os índices do passo são apresentados como 1 a 6. As quatro cores vizinhas devem vir de `getWizardStep(face).neighbors` e `FACE_COLOR_LABELS`. Voltar, editar e saltar usam a transição real entre poses; não basta inverter o número do passo ou repetir a instrução de avanço. A interface deve associar o texto genérico de rotação à direção retornada pelo helper, às setas e à pose final. Não afirmar que clicar em um controle moveu o cubo físico.

Só usar `ui.wizard-resume` para um rascunho compatível efetivamente conservado. Versão ausente ou antiga não é autorização para reinterpretar cores. A navegação de faces preserva a pintura; não se confunde com limpar o editor ou desfazer movimentos do player.

## Dez mensagens de validação

| Código do contrato | Texto principal |
| --- | --- |
| `invalid-shape` | Não foi possível ler as seis faces. Revise as grades 3 × 3 e tente novamente. |
| `invalid-color` | Uma cor não foi reconhecida. Escolha uma das seis cores da paleta. |
| `incomplete` | Ainda há posições sem cor. Preencha as casas vazias antes de resolver. |
| `color-count` | Cada cor precisa aparecer 9 vezes, incluindo o centro. Confira a contagem e revise o preenchimento. |
| `center-mismatch` | Os centros não correspondem à referência do editor. Confira amarelo em cima, verde à frente e vermelho à esquerda. |
| `invalid-piece` | As cores ou sua ordem não formam uma peça deste cubo. Compare o preenchimento com o cubo físico. |
| `duplicate-piece` | Uma combinação de cores aparece em mais de uma peça. Confira as peças e revise o preenchimento. |
| `corner-twist` | A orientação dos cantos não corresponde a um estado possível por giros. Confira as três cores de cada canto e a orientação das faces. |
| `edge-flip` | A orientação das arestas não corresponde a um estado possível por giros. Confira as duas cores de cada aresta e a orientação das faces. |
| `permutation-parity` | A combinação de posições das peças não pode ser obtida apenas com giros. Confira as seis faces e as cores de cada peça. |

### Destaques e diagnósticos globais

`slots` contém posições associadas ao problema, não uma lista comprovada de adesivos culpados. Usar “posição indicada” ou “posições destacadas” somente quando a lista não estiver vazia e os destaques estiverem efetivamente visíveis.

Sem posições para destacar, usar as mensagens padrão. Se houver destaques visíveis, estas ajudas podem ser acrescentadas:

| Código | Ajuda contextual com destaque |
| --- | --- |
| `invalid-color` | Confira a posição indicada e escolha uma cor da paleta. |
| `invalid-piece` | Compare as posições destacadas com a mesma peça no cubo físico. |
| `duplicate-piece` | Confira as peças destacadas e suas cores nas faces vizinhas. |

Ajuda para `scope: cube`, especialmente twist, flip e paridade:

> O aviso descreve o conjunto informado; ele não identifica sozinho onde houve erro.

Ajuda para conflitos com posições associadas:

> Os destaques mostram posições relacionadas ao conflito. Compare-as com o cubo físico antes de alterar cores.

Não destacar a última posição editada por suposição. Um canto com as mesmas três cores em ordem espelhada é `invalid-piece`, não um diagnóstico de twist. Os avisos globais `corner-twist`, `edge-flip` e `permutation-parity` usam `scope: cube` e `slots` vazio no contrato alinhado.

### Contagens

Detalhe editorial: **“{cor}: {quantidade} de 9”**, por exemplo “Verde: 10 de 9”. Os valores devem vir da contagem validada, incluindo o centro. O tipo real `SolverIssue` expõe `counts?: Readonly<Record<Face, number>>` e `expected?: 9`; consumir esses campos quando presentes em `color-count`. O exemplo numérico é uma amostra de redação, não uma fixture ou resultado real.

Se esse detalhe não estiver disponível, usar somente a mensagem geral de `color-count`. Não inventar números nem atribuir excesso ou falta a um adesivo específico. Validar a estrutura e as cores antes de calcular ou exibir essa contagem.

## Cálculo e resultado

| Evento ou condição real | Chave editorial | Texto |
| --- | --- | --- |
| Fase `initializing` | `ui.initializing` | Preparando o solucionador… |
| Fase `solving` | `ui.solving` | Procurando uma sequência… |
| Fase `verifying` | `ui.verifying` | Conferindo a solução… |
| Solução verificada para a entrada atual | `ui.solution-ready` | Solução pronta. Confira o cubo no passo inicial antes de começar. |
| Estado validado já resolvido, zero movimentos | `ui.already-solved` | Este estado já está resolvido. Nenhum movimento é necessário. |
| Solicitação cancelada | `ui.cancelled` | Solicitação cancelada. Você pode continuar editando. |
| Entrada alterada após pedir ou obter solução | `ui.input-changed` | As cores mudaram. Calcule outra solução para este estado. |
| Falha de execução, sem diagnóstico de entrada inválida | `ui.calculation-error` | Não foi possível concluir o cálculo. Tente novamente. |
| Sequência não aprovada pela conferência final | `ui.verification-error` | Não foi possível confirmar a sequência. Tente novamente. |

Não converter uma falha de carregamento, execução ou conferência em “cubo impossível”. Preservar a distinção entre erro de entrada e erro do solucionador. Não exibir uma sequência que tenha falhado na validação final.

As fases não justificam percentuais, estimativas ou contagens regressivas inventadas. “Solicitação cancelada” descreve o descarte do pedido; não afirma que um worker interno encerrou imediatamente. Um resultado antigo não deve acionar “Solução pronta” depois de edição, reset, nova solicitação, logout ou mudança de contexto.

## Controles e acompanhamento físico

| Ação | Rótulo | Ajuda |
| --- | --- | --- |
| Pedir uma solução | Resolver | Calcular a partir das cores informadas. |
| Descartar a solicitação ativa | Cancelar | Cancelar esta solicitação e continuar no editor. |
| Avançar um movimento | Próximo | Avançar um giro na visualização. Execute o mesmo giro no cubo físico. |
| Voltar um movimento | Anterior | Voltar um giro na visualização. Se você já o fez no cubo físico, desfaça esse giro para acompanhar. |
| Iniciar animação | Reproduzir | Reproduzir a sequência a partir do passo atual. |
| Pausar animação | Pausar | Parar a animação para conferir o próximo giro. |
| Voltar ao início da sequência | Reiniciar | Voltar a visualização ao estado informado e ao passo zero. Isso não restaura o cubo físico. |
| Ajustar o ritmo | Velocidade | Ajustar a velocidade da animação. |

O reset do editor e o reinício da sequência são ações diferentes. O texto para apagar a entrada depende do comportamento implementado: usar “Limpar cores” somente se a ação realmente limpar as posições editáveis e preservar os centros; usar “Refazer entrada” se apenas abrir o editor. Não associar “Reiniciar” a apagar a transcrição.

Trechos para ajuda próxima ao player:

| Chave editorial | Texto |
| --- | --- |
| `ui.camera` | Arraste para mudar a vista. A câmera não executa movimentos no cubo. |
| `ui.physical-frame` | Antes de continuar, mantenha amarelo em cima, verde à frente e vermelho à esquerda. |
| `ui.physical-back` | Anterior muda apenas a visualização. No cubo físico, desfaça o último giro com seu inverso. |
| `ui.physical-reset` | Reiniciar não monta novamente o estado no cubo físico. Confira se ele corresponde ao passo zero antes de executar a sequência. |
| `ui.lost-step` | Perdeu o passo? Pause e compare os estados. Você pode informar as cores atuais do cubo e calcular outra solução. |

### Descrição dos 18 giros

Combinar uma das seis faces com uma das três descrições, preservando o token ao lado do texto:

| Letra | Nome da face |
| --- | --- |
| U | de cima |
| R | da direita |
| F | da frente |
| D | de baixo |
| L | da esquerda |
| B | de trás |

| Sufixo | Descrição |
| --- | --- |
| Sem sufixo | Gire a face {nome} 90° no sentido horário, olhando diretamente para ela. |
| `'` | Gire a face {nome} 90° no sentido anti-horário, olhando diretamente para ela. |
| `2` | Gire a face {nome} 180°, uma meia volta. |

As seis faces multiplicadas pelos três sufixos cobrem os 18 tokens do contrato. Não adaptar silenciosamente um token fora desse conjunto para uma descrição parecida.

Para o contador, “Passo {k} de {n}” deve representar os movimentos já concluídos. No passo zero, usar “Estado informado, antes do primeiro giro”. Distinguir o movimento em execução do último concluído ao sincronizar legenda e animação.

Textos autorais Nexus Cube, sob a licença do projeto. Ver [Fontes e integração](fontes-e-integracao.md).
