# Solucionador didático: objetivos de CFOP e Roux

Texto autoral para os modos didáticos aprovados. Este documento descreve objetivos e orientação física; não declara os planejadores disponíveis ou aprovados. O [guia da solução Direta](guia-pt-BR.md) permanece válido para o modo geral. As instruções abaixo só acompanham planos realmente calculados e verificados para a entrada da pessoa.

## Escolha do modo

| Modo | Texto de apresentação |
| --- | --- |
| Direta | Acompanhe uma sequência geral para resolver o estado informado, um giro por vez. |
| CFOP | Acompanhe a construção da cruz e dos quatro pares, depois a orientação e a permutação da última camada. |
| Roux | Acompanhe a construção dos dois blocos, a resolução dos cantos e a conclusão das últimas seis arestas e dos centros. |

Nenhum modo promete a menor sequência ou reproduzir as escolhas de uma pessoa. Os modos didáticos precisam buscar os objetivos do método a partir do estado real. Dividir a sequência da solução Direta em trechos com nomes de etapas não demonstra que esses objetivos foram atendidos.

Uma opção ainda sem planejador integrado e validado não deve aparecer como solução disponível. Texto para esse estado: **“Este modo ainda está em implementação.”** Uma falha ao calcular um método também não deve apresentar uma solução Direta com o nome daquele método.

## A mesma entrada, uma sequência de estados reais

Segure o cubo na referência inicial: centro amarelo acima, verde à frente, vermelho à esquerda e laranja à direita. Os centros branco e azul ficam embaixo e atrás. Mantenha os nomes das faces definidos por essa referência durante a execução.

Essa é a referência para executar a solução. O preenchimento guiado começa com a face amarela à frente e usa seis poses próprias para copiar as cores; suas rotações movimentam o cubo inteiro nas mãos, sem girar camadas. Ao terminar a revisão, recupere a referência de resolução indicada antes de acompanhar qualquer método. Voltar uma face no editor é diferente de desfazer um movimento no player.

O primeiro estado é exatamente o preenchimento validado. Cada etapa começa onde a anterior terminou. Um marco corresponde ao estado após os movimentos efetivamente aplicados, sem trocar o cubo por uma imagem de um caso parecido. O encerramento do plano exige os 54 adesivos resolvidos na referência fixa.

**“Preservar” significa manter o resultado exigido no fim da etapa.** Uma sequência pode deslocar temporariamente peças que depois devolve ao lugar. Só se pode afirmar preservação durante todos os giros quando houver verificação específica desse comportamento.

Se uma etapa já estiver satisfeita na entrada, ela pode ter zero movimentos após a verificação do objetivo. Texto: **“Esta etapa já está concluída neste estado. Nenhum giro é necessário.”** Isso não dispensa a conferência das próximas etapas. Um plano inteiro vazio só corresponde a um estado já resolvido.

## CFOP: cruz, quatro pares e última camada

Neste recorte, a cruz fica em D, a face branca. Formar uma cruz branca exige também alinhar as cores laterais das quatro arestas com seus centros. Quatro adesivos brancos em torno do centro não bastam se as peças estiverem nas posições erradas.

Depois, cada par reúne um canto com branco e a aresta correspondente da camada do meio. As cores laterais identificam o destino. O contrato atual fixa a ordem FR, FL, BR e BL: frente à direita, frente à esquerda, atrás à direita e atrás à esquerda. Os quatro pares precisam ser concluídos, mesmo quando um deles já está correto e recebe zero movimentos.

| Etapa | Objetivo para a pessoa | O que conferir ao terminar | Resultado anterior a preservar |
| --- | --- | --- | --- |
| Cruz | Posicione as quatro arestas brancas ao redor do centro branco. | Branco embaixo e cada cor lateral alinhada ao centro correspondente. | Referência fixa dos centros. |
| Primeiro par F2L | Encontre o canto e a aresta indicados e complete o espaço entre seus centros laterais. | Canto e aresta na posição e orientação corretas. | Cruz. |
| Segundo par F2L | Complete o próximo par indicado pelo plano. | Novo par resolvido e primeiro par conferido. | Cruz e par anterior. |
| Terceiro par F2L | Complete o terceiro par indicado. | Novo par resolvido e os dois anteriores conferidos. | Cruz e dois pares anteriores. |
| Quarto par F2L | Complete o último espaço das duas primeiras camadas. | Quatro pares e cruz corretos, formando as duas primeiras camadas. | Cruz e três pares anteriores. |
| OLL | Oriente os cantos e as arestas da camada superior. | Os nove adesivos da face superior estão amarelos; as duas primeiras camadas continuam resolvidas. | Duas primeiras camadas. |
| PLL | Leve as peças superiores às posições correspondentes. | Peças superiores permutadas conforme o objetivo declarado; um eventual ajuste final de U permanece explícito. | Duas primeiras camadas e orientação da última camada. |
| Alinhamento final, AUF | Faça o ajuste de U indicado, se necessário. | As seis faces correspondem às cores fixas de seus centros. | Duas primeiras camadas e orientação superior; a posição da camada superior é ajustada. |

### Identidades dos pares e foco

As letras abaixo identificam as cores da peça na referência resolvida, mesmo quando ela está em outro lugar. São referências técnicas para vincular o destaque visual; a ajuda da interface deve preferir as cores e a posição do par.

| Destino | Canto e aresta | Texto para a pessoa |
| --- | --- | --- |
| FR | DFR e FR | Par branco, verde e laranja: frente à direita. |
| FL | DFL e FL | Par branco, verde e vermelho: frente à esquerda. |
| BR | DBR e BR | Par branco, azul e laranja: atrás à direita. |
| BL | DBL e BL | Par branco, azul e vermelho: atrás à esquerda. |

O destaque acompanha a identidade do par escolhido. Não deve saltar para outra peça só porque ela entrou na posição que o par ocupava. Os pares anteriores são os que o plano já concluiu na ordem contratada.

Na OLL, o foco é a orientação: observe os adesivos amarelos, inclusive os que começam nas laterais. Na PLL, mantenha a informação das cores laterais para reconhecer a permutação. Amarelo completo em cima não significa que o cubo esteja resolvido.

### AUF sem ajuste escondido

AUF é um ajuste da face U: nenhum giro, `U`, `U'` ou `U2`, conforme o estado. Se o planejador usar um ajuste para reconhecer ou executar um caso, esse movimento precisa aparecer na sequência real. Uma vista normalizada de reconhecimento não pode substituir silenciosamente o estado em reprodução.

Texto para um ajuste final necessário: **“As peças da última camada estão organizadas entre si. Faça o ajuste indicado em U para alinhá-las às cores laterais.”** Só usar essa explicação quando o objetivo intermediário estiver comprovado. Se a etapa PLL já incluir o ajuste, sua explicação deve indicá-lo e a etapa final pode ter zero movimentos após validação.

## Roux: blocos, cantos e últimas seis arestas

Este recorte constrói primeiro o bloco esquerdo e depois o direito. Ambos têm dimensões 1×2×3 e compartilham a mesma referência de cores. A faixa central entre eles permanece disponível para a parte final do método.

| Etapa | Objetivo para a pessoa | O que conferir ao terminar | Resultado anterior a preservar |
| --- | --- | --- | --- |
| Primeiro bloco, FB | Complete o bloco inferior do lado vermelho. | Três arestas e dois cantos corretos em torno do centro esquerdo. | Referência fixa dos centros laterais. |
| Segundo bloco, SB | Complete o bloco inferior do lado laranja. | Os dois blocos estão corretos, com suas cores alinhadas. | Primeiro bloco e centros laterais. |
| CMLL | Oriente e organize os quatro cantos superiores. | Cantos resolvidos até um possível ajuste de U, explicitamente tratado na etapa seguinte. | Dois blocos. |
| Alinhar cantos, AUF de CMLL | Faça o ajuste de U indicado, se necessário. | Quatro cantos nas posições e orientações fixas antes de entrar em LSE. | Dois blocos. |
| LSE: orientar arestas, EO | Oriente as seis arestas restantes na referência indicada. | Centros amarelo e branco no eixo vertical; adesivos amarelos ou brancos dessas seis arestas voltados para cima ou para baixo. | Dois blocos e cantos alinhados. |
| LSE: completar esquerda e direita, LR | Posicione as arestas superiores dos lados vermelho e laranja. | UL e UR corretas na referência fixa, com orientação das demais arestas mantida no fim da etapa. | Dois blocos e cantos; objetivo EO. |
| LSE: concluir arestas e centros | Resolva as quatro arestas restantes e alinhe os centros. | As seis faces correspondem às cores fixas de seus centros. | Dois blocos, cantos e arestas UL/UR no fim da etapa. |

### Peças e referências do recorte Roux

| Conjunto | Identidades usadas para a conferência |
| --- | --- |
| Primeiro bloco | DL, FL, BL, DFL e DBL; centro L correto. |
| Segundo bloco | DR, FR, BR, DFR e DBR; centro R correto. |
| Cantos superiores | UFR, URB, UBL e ULF. |
| Seis arestas finais | UF, UR, UB, UL, DF e DB. |
| Arestas LR | UL e UR, pelas próprias identidades e posições fixas. |

A construção dos blocos não é uma cruz CFOP seguida de quatro inserções renomeadas. Pode haver pares ou pequenos blocos intermediários, mas a interface só deve anunciar um deles quando o estado daquele marco comprovar sua formação.

CMLL trata os cantos superiores enquanto conserva os dois blocos. As arestas livres podem mudar. Não exigir OLL ou PLL de CFOP como condição para chamar esses cantos resolvidos. O contrato separa CMLL, que admite um ajuste U pendente, de “Alinhar cantos”, que termina com os cantos na referência fixa. Esse ajuste precisa aparecer antes da entrada em LSE; quando desnecessário, a etapa permanece com zero movimentos e objetivo verificado.

Na implementação Roux lida, a busca CMLL utiliza o corpus autoral existente, podendo executar um ajuste U prévio e uma rotação y antes do algoritmo, seguida da rotação de retorno. Esses movimentos e eventuais rotações internas aparecem na sequência e em `adjustments`; não são uma troca invisível de referência. O ajuste U anterior prepara a execução, enquanto o AUF da etapa seguinte alinha os cantos ao terminar. Texto de ajuda: **“Execute o ajuste ou a rotação indicados antes do algoritmo. Continue na orientação mostrada até a rotação de retorno; o alinhamento final dos cantos aparece na etapa seguinte.”**

### Centros e orientação em LSE

Os movimentos da faixa M também deslocam centros. Por isso, o critério de EO deve ser explicado junto da referência usada. Aqui, o amarelo e o branco dos centros ficam no eixo vertical, e os adesivos amarelos ou brancos das seis arestas também apontam para cima ou para baixo. Os blocos e cantos são conferidos pelas suas identidades na referência fixa.

Um deslocamento residual `M2` pode ser aceito ao concluir EO ou LR: os centros amarelo e branco podem estar invertidos nesse eixo. Isso **não** satisfaz o objetivo final. Um deslocamento ímpar de M que leve esses centros para frente e trás também não satisfaz EO neste recorte.

Texto para EO: **“A orientação das seis arestas está correta nesta referência. Ainda pode ser necessário posicionar arestas e alinhar centros.”** Texto para LR: **“As arestas superiores esquerda e direita estão no lugar. Confira agora as quatro arestas restantes e os centros.”** As mensagens só aparecem depois da verificação dos respectivos estados.

### Ler M sem girar o cubo inteiro

A implementação atual de `planRoux` usa giros das faces externas no primeiro bloco, U/R/M/r no segundo bloco e somente U/M em LSE, incluindo inversos e duplos. CMLL pode incluir os movimentos do corpus e ajustes explícitos de referência. O contrato comum admite também outras camadas e rotações; essa capacidade do parser não afirma que todas sejam usadas pelo planejador. Nenhuma rotação global implícita deve mudar a referência física.

`M` move somente a faixa do meio entre L e R, no mesmo sentido de `L`. Olhando diretamente para o lado esquerdo, é um quarto de volta horário dessa faixa. `M'` faz o inverso; `M2`, meia volta. As faces externas L e R não são giradas por esse token. A convenção foi conferida por leitura do motor do projeto.

Se um algoritmo da biblioteca usar camadas largas ou rotações, sua presença na biblioteca não autoriza enviá-lo ao player didático. É necessário provar reconhecimento, transformação de referência, movimentos e objetivo no contrato do planejador. O guia não fornece uma tradução silenciosa desses tokens.

Quando aparecerem no plano validado, a ajuda de movimento pode usar estas descrições, com apóstrofo para inverso e `2` para meia volta:

| Família | Instrução física |
| --- | --- |
| U, R, F, D, L, B | Gire a face externa indicada, conforme a notação do guia Direta. |
| M | Gire a faixa central entre L e R no sentido de L. |
| E | Gire a faixa central entre U e D no sentido de D. |
| S | Gire a faixa central entre F e B no sentido de F. |
| r, l, u, d, f, b | Gire juntas a face indicada e a faixa central adjacente, no sentido da letra maiúscula correspondente. |
| x, y, z | Gire o cubo inteiro no sentido de R, U ou F, respectivamente; a rotação é uma ação explícita da sequência. |

Uma rotação de todo o cubo na sequência é diferente de arrastar a câmera. A interface deve identificar a rotação e representar seu estado resultante, mantendo o vínculo com a referência do plano e seus centros finais. O guia Direta permanece restrito aos 18 giros de faces externas.

## Marcos e controles para acompanhar fisicamente

No começo de cada etapa, mostre o estado de entrada e a meta. No fim, mostre o estado após todos os giros daquela etapa, o objetivo atingido e as peças preservadas. Marcos internos, como um par formado, precisam ser derivados do estado real, não de uma porcentagem do comprimento da sequência.

| Situação | Texto pronto para a interface |
| --- | --- |
| Entrada da etapa | Confira este estado no seu cubo antes de começar a etapa. |
| Objetivo confirmado | Objetivo desta etapa conferido. Compare as peças destacadas antes de continuar. |
| Etapa já satisfeita | Esta etapa já está concluída neste estado. Nenhum giro é necessário. |
| Voltar um giro | Anterior muda apenas a visualização. Se já executou o giro no cubo físico, desfaça-o para acompanhar. |
| Saltar etapa ou movimento | A visualização mudou de ponto. Antes de continuar, confira se o cubo físico corresponde ao estado exibido. |
| Reiniciar | Reiniciar volta a visualização às cores informadas. Isso não restaura o cubo físico. |
| Trocar de método | O novo plano parte das cores informadas no editor. Se você já moveu o cubo físico, confira a entrada antes de executar outro plano. |
| Perdeu o acompanhamento | Pause e compare os estados. Você pode transcrever o estado atual do cubo e calcular um novo plano. |

Arrastar a câmera altera apenas a vista. Movimentar o cubo inteiro nas mãos para inspecioná-lo também exige recuperar a referência antes de seguir as instruções. Os controles não detectam o que a pessoa executou no cubo físico.

## Vínculo com o contrato executável

Contrato lido em [types.ts](../../../src/solver/methods/types.ts) e [plan.ts](../../../src/solver/methods/plan.ts): `MethodPlan` versão 1, com `method`, `inputKey`, `referenceFrame`, `initialState`, `finalState`, `algorithm`, `tokens` e `stages`. O referencial corrigido é `URFDLB-fixed-v2`, com R laranja e L vermelho; a versão do plano não é a versão do esquema de cores. O tipo de método deste contrato contém `cfop` e `roux`; Direta conserva seu contrato próprio.

A integração está exportada no [barrel do solucionador](../../../src/solver/index.ts). A chamada é `solve({requestId, validated, method}, options)`, com `method` opcional: `direct`, `cfop` ou `roux`; sua ausência mantém Direta. Em um resultado `kind: 'solution'`, `method: 'direct'` não contém `plan`, enquanto CFOP e Roux entregam `plan: MethodPlan` completo. O cliente confere o método solicitado e revalida o plano contra a entrada original, seus estados e objetivos antes de entregá-lo à interface.

O progresso conserva as fases `initializing`, `solving` e `verifying`, com `method` e `stageId` opcionais no tipo. Um identificador de etapa pode contextualizar o cálculo, mas não significa plano concluído nem percentual de progresso. A publicação dessa API não substitui a conclusão dos testes focados nem autoriza apresentar resultados de UI ainda não verificados.

O perfil atual contém **oito etapas CFOP e sete Roux**. Esses são passos do plano, não quantidades de algoritmos do catálogo:

| ID real | Título sugerido | Objetivo do contrato |
| --- | --- | --- |
| `cfop.cross` | Cruz branca | `cross` |
| `cfop.f2l.FR` | Primeiro par: frente à direita | `f2l-pair`, slot FR |
| `cfop.f2l.FL` | Segundo par: frente à esquerda | `f2l-pair`, slot FL |
| `cfop.f2l.BR` | Terceiro par: atrás à direita | `f2l-pair`, slot BR |
| `cfop.f2l.BL` | Quarto par: atrás à esquerda | `f2l-pair`, slot BL |
| `cfop.oll` | Orientar a última camada | `oll` |
| `cfop.pll` | Permutar a última camada | `pll-up-to-auf` |
| `cfop.auf` | Alinhamento final | `solved` |
| `roux.fb` | Primeiro bloco: lado esquerdo | `first-block` |
| `roux.sb` | Segundo bloco: lado direito | `second-block` |
| `roux.cmll` | Resolver os cantos superiores | `cmll-up-to-auf` |
| `roux.cmll-auf` | Alinhar os cantos superiores | `cmll` |
| `roux.eo` | Orientar as seis arestas | `lse-eo` |
| `roux.lr` | Completar os lados esquerdo e direito | `lse-lr` |
| `roux.finish` | Concluir arestas e centros | `solved` |

`MethodStage` fornece `title` e `explanation` para os textos, `goal` para o objetivo, `preservedPieces` para identidades a conservar e os estados inicial/final reais. A preservação compara a posição e a orientação da mesma peça entre os dois extremos da etapa. `centerPolicy` é `fixed` nos perfis atuais, exceto EO e LR, que usam `m-slice-even`: centros exatamente na referência fixa ou exatamente no estado M2 permitido. A opção de tipo `free` não está selecionada nesses perfis.

`startStep` e `endStep` contam movimentos já aplicados na sequência global. O trecho da etapa é `tokens[startStep:endStep]`, incluindo o início e excluindo o fim. Por exemplo, limites 3 e 5 significam entrada após três movimentos e saída após cinco, com dois movimentos naquela etapa. Este é um exemplo de indexação, não uma fixture nem um estado de cubo inventado.

Os itens de `adjustments` têm `kind` (`auf` ou `rotation`), `algorithm`, `explanation` e limites do trecho correspondente. Na especificação passada ao builder, esses limites são locais à etapa; no plano emitido, são globais. `matchedCaseId`, quando presente, identifica um caso realmente reconhecido; não implica que todo passo pertença ao catálogo.

A leitura de [planRoux](../../../src/solver/methods/roux/index.ts) confirmou a emissão das sete etapas e dos ajustes descritos. O autor reportou aprovação das primeiras fixtures comparadas ao KPuzzle e ampliação da validação em andamento. Essa evidência inicial não anuncia disponibilidade na UI nem aceite completo do planejador.

O contrato atual não publica uma lista genérica de `milestones`. As fronteiras de `stages` e os trechos explícitos de `adjustments` são os marcos disponíveis. Um destaque didático adicional exige um estado derivado do prefixo real e uma condição verificável, sem inventar um campo ou uma prova já existente.

O builder começa na entrada revalidada, aplica cada sequência ao estado anterior e verifica objetivo, preservação e política de centros. `finish` exige todas as etapas na ordem e os 54 adesivos resolvidos; `verifyMethodPlan` recompõe os estados desde a entrada. Essas verificações do produto não substituem o oráculo independente.

`methodTokens` aceita os giros externos, M/E/S, rotações x/y/z e camadas largas em minúsculas, com inverso ou duplo, até 2048 movimentos no plano completo. Esse limite de contrato não é meta didática nem promessa de desempenho. A solução Direta conserva seus 18 tokens possíveis de faces externas e limite de 256 movimentos.

O player de CFOP/Roux deve aplicar o prefixo de `plan.tokens` ao `initialState` real pelo motor de movimentos, ou consumir um estado equivalente já verificado. Não encaminhar esses planos a `solverTokens` ou `solverStateAtStep`, que possuem as restrições de Direta: M, camadas largas e rotações são movimentos reais do plano, não tokens a descartar.

Não reutilizar índices de uma alternativa em outra sequência. Uma etapa vazia conserva o mesmo estado de entrada e saída. A conferência de uma etapa precisa distinguir objetivo final, preservação ao final e eventual condição de um marco interno. Os planejadores e a QA independente devem validar essas condições antes de anunciar o modo como disponível.

`MethodPlannerOptions` permite cancelamento e notificações `onStage`. Uma etapa emitida não significa que o plano completo terminou ou foi aceito. Limite de busca atingido é uma falha de cálculo daquele planejador, não prova de que a entrada válida seja impossível. Texto sugerido: **“Não foi possível concluir este plano dentro do limite de busca. O estado informado continua válido.”** Não preencher as etapas restantes com trechos da solução Direta.

## Fontes e licença do texto

As descrições foram redigidas para a referência fixa deste produto. As fontes abaixo fundamentam a estrutura dos métodos, sem fornecer sequências ou assets copiados para este documento.

| Fonte primária | Uso e limite |
| --- | --- |
| [Jessica Fridrich, sistema de resolução](https://ws.binghamton.edu/fridrich/system.html) | Cruz, quatro pares, orientação e permutação da última camada. Não se reproduzem tabelas de algoritmos, imagens ou promessas de tempo da página. |
| [Gilles Roux, primeiro bloco](http://grrroux.free.fr/method/Step_1.html) | Objetivo do bloco esquerdo e construção dependente do estado. |
| [Gilles Roux, segundo bloco](http://grrroux.free.fr/method/Step_2.html) | Bloco oposto e relação com o bloco já construído. |
| [Gilles Roux, cantos superiores](http://grrroux.free.fr/method/Step_3.html) | Cantos com arestas U e faixa M livres; necessidade de ajustes explícitos. |
| [Gilles Roux, últimas seis arestas](http://grrroux.free.fr/method/Step_4.html) | Orientação, UL/UR e conclusão das arestas e centros. A página usa outra referência de cores; o critério local de EO está declarado acima. |
| [Validação de etapas do projeto](../../../src/domain/stage-validation.ts) e [motor de movimentos](../../../src/domain/cube.ts) | Identidades, objetivos existentes, referência de centros e sentido de M, conferidos por leitura. Os validadores de planos por método precisam garantir o encadeamento adicional. |

Páginas primárias consultadas em 8 de setembro de 2026. As páginas Roux foram lidas por HTTP porque o leitor web não concluiu a abertura em HTTPS. Não foi identificada autorização para redistribuir as tabelas ou imagens dessas páginas; foram usadas somente como referência para síntese autoral. Este texto original segue a [licença MIT do projeto](../../../LICENSE), sem alterar as licenças das fontes ou dependências.

Nenhum algoritmo, dataset, imagem, fixture ou prova do corpus anterior foi renovado para escrever este guia. Não foram executados solver, geradores, testes, build ou navegador nesta tarefa documental.
