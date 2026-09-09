# Curadoria por exercicio da fatia 2 LBL: nomes, descricoes e dicas

Autor: Trama (Curadoria Cubo). Data: 2026-09-09. Consumidor: Dobra (troca dos provisorios em src/solver/methods/lbl/trainer-fixtures.ts, citando este arquivo na proveniencia) e catalogo i18n (pt-BR base; es/en derivam daqui depois). Lista confirmada contra docs/solver-methods/lbl-trainer-plan.md secao Fatia 2 e LBL_SLICE2_FIXTURES: 8 exercicios, 2 execution por peca e 6 recognition. Mesmo ciclo verbatim das curadorias anteriores.

Escopo do gate: textos pedagogicos nao exigem provenance verified (o gate verified protege pegada/dedos); a proveniencia aqui e autoral com base declarada. Regra dos gates de honestidade do plano atendida: toda dica diz o que OLHAR antes de tentar.

## Execution por peca

### lbl/corners/one

- Nome: "Um canto por vez" (confirma provisorio)
- Descricao: "Leve um canto branco ate o posto de trabalho da frente/direita e encaixe-o com o movimento magico, sem desmontar a cruz."
- Dica: "Antes de girar, leia as tres cores do canto: o lugar dele e onde esses tres lados se encontram. Traga-o ao posto de trabalho e repita o movimento magico com calma; ele sempre acaba encaixando."

### lbl/middle/one

- Nome: "Uma aresta do meio por vez" (confirma)
- Descricao: "Insira a aresta do posto da frente/direita pelo lado que a cor indicar, sem desmontar a primeira camada."
- Dica: "Case primeiro a cor da frente da aresta com o centro da mesma cor; a cor que sobra aponta o lado da insercao. Aresta presa no lugar errado: insira outra ali para solta-la."

## Reconhecimento

### lbl/cross/pieces

- Nome: "Reconhecer as arestas da cruz" (confirma)
- Descricao: "Encontre e selecione as quatro arestas brancas no cubo embaralhado."
- Dica: "Aresta tem duas cores; nao confunda com canto, que tem tres. Procure o branco tambem nas laterais e na camada de baixo, nao so em cima."

### lbl/corners/pieces

- Nome: "Reconhecer os cantos brancos" (confirma)
- Descricao: "Selecione os quatro cantos brancos e repare no que precisa sobreviver: a cruz pronta."
- Dica: "Canto tem tres cores. Ao encontrar cada um, ja repare quais dois centros ele devera tocar quando estiver no lugar."

### lbl/middle/pieces

- Nome: "Reconhecer as arestas do meio" (confirma)
- Descricao: "Selecione as quatro arestas da segunda camada: sao as arestas sem amarelo."
- Dica: "O amarelo denuncia: qualquer aresta com amarelo pertence a ultima camada, nao ao meio. Sobram exatamente quatro sem amarelo."

### lbl/top-cross/pattern

- Nome: "Reconhecer o padrao da cruz amarela" (confirma)
- Descricao: "Olhe so as arestas de cima e responda qual padrao aparece: ponto, gancho ou linha."
- Dica: "Ignore os cantos por completo, mesmo os amarelos. So as quatro arestas contam: nenhuma virada e ponto, duas vizinhas e gancho, duas opostas e linha."

### lbl/top-edges/match

- Nome: "Reconhecer as arestas que casam" (confirma)
- Descricao: "Encontre as arestas amarelas que ja casam com os centros e responda: vizinhas ou opostas?"
- Dica: "Gire so a camada de cima, devagar, e pare onde MAIS arestas casam com os centros das laterais. Duas casando lado a lado sao vizinhas; duas de frente uma para a outra sao opostas."

### lbl/top-corners-position/spot

- Nome: "Achar o canto ja no lugar" (confirma)
- Descricao: "Responda qual canto amarelo ja esta no lugar certo, mesmo torto, ou se nenhum esta."
- Dica: "Canto no lugar certo mostra as mesmas tres cores dos lados que ele toca, mesmo girado. Compare canto por canto com os centros vizinhos; pode nao haver nenhum, e isso tambem e resposta."

## Proveniencia

Producao autoral Trama, continuidade de vocabulario com docs/expansion-curation/lbl-pedagogia.md (posto de trabalho, movimento magico, ponto/gancho/linha, mesmo torto), cujas fontes pedagogicas estao la declaradas (Ruwix, metodo iniciante, acesso 2026-09-09; referencia citada, nada copiado). Nomes dos padroes ponto/gancho/linha coerentes com os optionIds dot/hook/line do classificador ll-edge-orientation-pattern e com a curadoria 2-look (casos cfop/eo-ll/*), vocabulario unico.

## Notas de consumo

1. Dobra: descricoes substituem o campo objective; dicas entram por observe, verbatim. Divergencias minimas dos provisorios: "lugar de trabalho" virou "posto de trabalho" (uniformiza com a metade pedagogica) e a descricao de middle/one explicita "do posto da frente/direita".
2. i18n: strings acima sao a base pt-BR; es/en traduzem DESTE arquivo, preservando os pares padrao/opcao (ponto=dot, gancho=hook, linha=line; vizinhas=adjacent, opostas=opposite).
3. Edicoes futuras destes textos partem deste arquivo, como nos ciclos anteriores.
