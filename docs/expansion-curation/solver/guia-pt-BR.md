# Solucionador 3×3: do seu cubo ao próximo giro

Informe as cores do seu cubo e acompanhe uma sequência para resolvê-lo, um movimento por vez. A sequência é uma solução geral para o estado informado. Ela não é uma aula de CFOP ou Roux e não tem garantia de ser a mais curta.

## Comece por aqui

1. Segure o cubo com o centro amarelo em cima, o verde à frente, o vermelho à esquerda e o laranja à direita.
2. Para começar a entrada pela face amarela, gire o cubo inteiro até ela ficar à sua frente, com o centro azul acima.
3. Preencha uma face por vez, seguindo os seis passos e os centros vizinhos indicados.
4. Na revisão, confira as seis faces e corrija os avisos antes de selecionar **Resolver**.
5. Volte à referência amarelo em cima, verde à frente e vermelho à esquerda, compare o cubo físico com o passo inicial e acompanhe a solução um giro por vez.

## Oriente o cubo pelos centros

Os centros identificam as faces, mesmo quando os outros adesivos estão misturados. Nesta versão, a referência é fixa:

| Letra | Face | Cor do centro |
| --- | --- | --- |
| U | Cima | Amarelo |
| R | Direita | Laranja |
| F | Frente | Verde |
| D | Baixo | Branco |
| L | Esquerda | Vermelho |
| B | Trás | Azul |

Confira também os centros que ficam atrás, embaixo e à esquerda. Se o esquema do seu cubo for diferente, ele não é compatível com esta versão. Não troque as cores na transcrição para fazer a entrada passar na validação.

O solucionador considera um 3×3 de seis cores. A orientação de desenhos ou logotipos nos centros não faz parte do resultado.

## Preencha uma face por vez

O estado tem 54 adesivos: seis centros fixos e 48 posições para preencher. Em cada passo, olhe diretamente para a face indicada, escolha as cores da paleta e pinte as oito posições ao redor do centro. Leia a grade da esquerda para a direita, começando pela linha de cima. Para corrigir uma posição, escolha a cor certa e marque-a novamente.

O percurso começa pela amarela e segue uma ordem fixa. Os quatro centros vizinhos ajudam a segurar o cubo na mesma orientação da grade:

| Passo | Face à sua frente | Acima | À direita | Abaixo | À esquerda |
| --- | --- | --- | --- | --- | --- |
| 1 de 6 | Amarela, U | Azul | Laranja | Verde | Vermelho |
| 2 de 6 | Verde, F | Amarelo | Laranja | Branco | Vermelho |
| 3 de 6 | Laranja, R | Amarelo | Azul | Branco | Verde |
| 4 de 6 | Azul, B | Amarelo | Vermelho | Branco | Laranja |
| 5 de 6 | Vermelha, L | Amarelo | Verde | Branco | Azul |
| 6 de 6 | Branca, D | Vermelho | Verde | Laranja | Azul |

Selecione **Próximo** quando as oito posições da face estiverem preenchidas. Siga a instrução e as setas para **girar o cubo inteiro nas mãos, sem girar uma camada**. Confira a face de destino e os quatro centros vizinhos antes de pintar. A animação mostra a rotação; o aplicativo não move o seu cubo físico.

Na face branca, mantenha o centro vermelho acima da grade e o verde à direita. Essa é a pose do sexto passo. Não a substitua pela orientação usada ao olhar a face inferior na referência inicial.

Durante o preenchimento, a vista acompanha a pose de cada passo. Com redução de movimento, as instruções e setas continuam indicando a mesma ação, mesmo sem a animação completa.

## Voltar, editar e revisar a entrada

**Anterior**, durante o preenchimento, retorna a outra face sem apagar suas cores. Gire o cubo inteiro conforme a indicação de retorno e confira seus vizinhos. Esse controle não pede para desfazer um giro de camada.

Para editar uma face já preenchida, selecione essa face e siga a orientação mostrada. Um salto entre faces pode exigir uma rotação diferente da usada no avanço sequencial. Se retomar um rascunho compatível parcialmente preenchido, confira as cores existentes e complete as posições vazias; não é necessário apagar as faces para percorrer os passos.

Na revisão final, veja o cubo inteiro, use a câmera livre para inspecioná-lo e abra qualquer face que precise de correção. Arrastar a câmera não altera o preenchimento nem executa um movimento no cubo físico. Confira os avisos de contagem e legalidade antes de resolver.

Para executar a solução, recupere a referência inicial indicada: amarelo em cima, verde à frente e vermelho à esquerda. A aparência da prévia ajuda a comparar as cores, mas não confirma sozinha que o estado seja possível. Um aviso de versão incompatível exige uma decisão explícita sobre a entrada; esta orientação não promete conversão automática de um rascunho antigo.

## Revise as cores e as peças

Cada cor deve aparecer nove vezes, contando o centro. Confira também as peças: uma aresta tem dois adesivos e um canto tem três. As cores que pertencem a uma mesma peça precisam concordar nas duas ou três faces em que ela aparece.

Se houver um aviso, revise a entrada antes de tentar resolver:

| Aviso | O que conferir |
| --- | --- |
| Posições sem cor | Complete as casas vazias. |
| Contagem de cores | Compare cada total com nove e procure cores trocadas ou omitidas. |
| Centros fora da referência | Confira o esquema dos seis centros e a orientação do cubo. |
| Peça inválida ou repetida | Compare as cores da mesma peça nas faces vizinhas. A ordem das três cores de um canto também importa. |
| Orientação dos cantos, chamada twist | Revise os três adesivos de cada canto e a orientação das grades. |
| Orientação das arestas, chamada flip | Revise os dois adesivos de cada aresta e a orientação das grades. |
| Combinação impossível de posições, chamada paridade | Revise as seis faces e as peças completas, inclusive a face de trás. |

Os avisos de twist, flip e paridade descrevem uma inconsistência no conjunto informado. Eles não identificam sozinhos uma peça culpada. Quando houver posições destacadas, elas estão associadas ao conflito; o destaque não significa que todas precisem ser alteradas.

Se a transcrição estiver fiel e a inconsistência persistir, o estado informado não pode ser resolvido apenas com giros na referência aceita pelo editor. Alterar cores ao acaso para remover o aviso produziria uma solução para outro estado.

## Leia os 18 giros possíveis

A letra indica qual face girar. Sem marca, faça um quarto de volta no sentido horário. Com apóstrofo, faça um quarto de volta no sentido anti-horário. Com `2`, faça meia volta.

O sentido horário ou anti-horário é sempre observado olhando diretamente para a face que será girada, inclusive B e D. Mantenha os nomes das faces definidos pela orientação inicial.

| Face | 90° horário | 90° anti-horário | 180°, meia volta |
| --- | --- | --- | --- |
| Cima | `U` | `U'` | `U2` |
| Direita | `R` | `R'` | `R2` |
| Frente | `F` | `F'` | `F2` |
| Baixo | `D` | `D'` | `D2` |
| Esquerda | `L` | `L'` | `L2` |
| Trás | `B` | `B'` | `B2` |

Por exemplo, `R'` gira a face de centro laranja 90° no sentido anti-horário quando você olha diretamente para ela. `F2` gira a face de centro verde 180°. Esses exemplos explicam a notação; não são uma solução para qualquer cubo. [Referência de notação](https://kociemba.org/math/faceletlevel.htm).

## Execute a sequência no cubo físico

Antes do primeiro movimento, confira se o cubo físico corresponde às cores informadas. Não faça a montagem inversa de um caso da biblioteca: esta solução começa no seu próprio estado.

Use **Próximo**, observe o giro destacado e execute o mesmo giro no cubo físico. Compare as cores após cada passo. **Reproduzir**, **Pausar** e **Velocidade** controlam a animação; escolha um ritmo que permita acompanhar os movimentos.

Arrastar a câmera muda a vista do modelo, sem executar um giro. Se você reposicionar o cubo inteiro nas mãos para inspecioná-lo, recupere a referência dos centros antes de continuar.

**Anterior**, no player da solução, volta um movimento na visualização. Se você já executou esse movimento no cubo físico, desfaça o último giro para que ambos voltem a coincidir: o inverso de `R` é `R'`, o de `R'` é `R`, e o de `R2` é `R2`. Essa ação é diferente de voltar uma face durante o preenchimento.

**Reiniciar** volta a visualização ao estado informado e ao passo zero. O botão não devolve o cubo físico àquela posição. Se você perdeu a sequência, pause e compare os estados. Você pode transcrever o estado atual do cubo e calcular outra solução.

Ao editar uma cor ou refazer a entrada, a solução anterior deixa de corresponder ao novo pedido. Calcule novamente. Se o estado validado já estiver resolvido, nenhum movimento será necessário.

## Durante o cálculo

As etapas exibidas são preparar o solucionador, procurar uma sequência e conferir a solução. Não há percentual ou tempo restante garantido.

**Cancelar** descarta a solicitação ativa e permite continuar no editor. Isso não representa uma promessa de interrupção instantânea de todo processamento interno.

Uma falha de cálculo é diferente de um erro de preenchimento: siga a mensagem exibida e tente novamente quando indicado. Ao concluir a sequência, confira as seis faces do cubo físico, cada uma com a cor do seu centro.

Textos autorais Nexus Cube. As referências conceituais, permissões e limites de integração estão em [Fontes e integração](fontes-e-integracao.md).
