# Proposta conjunta Dobra+Trama: metodo Camadas (LBL, iniciante)

Data: 2026-09-09. Para aprovacao do Mestre ANTES de dados (Prisma) e UI (Matiz), conforme adendo de docs/trainers-spec.md e docs/trainers-plan.md. Metades completas com referencia cruzada: estrutura formal em docs/solver-methods/lbl-trainer-plan.md (Dobra) e pedagogia, nomes, textos e fontes em docs/expansion-curation/lbl-pedagogia.md (Trama). Objetivo declarado do usuario: ensinar qualquer pessoa do zero. Grupo proprio no catalogo, antes de CFOP.

DESTINO DUPLO: as sete etapas abaixo servem ao treinador (fixtures TrainerFixtureSpec, com observe e checkpoints) e ao futuro modo Camadas do solucionador (MethodPlan `lbl/*` na estrutura do planRoux), com predicados definidos uma unica vez no dominio. Referencial `URFDLB-fixed-v2`; cruz do iniciante na face D branca.

## As sete etapas

| Etapa | Nome (Trama) | Precondicao | Objetivo | Preservacao ao concluir |
| --- | --- | --- | --- | --- |
| `lbl/cross` | Cruz branca | Estado legal | Quatro arestas brancas alinhadas aos centros | Centros |
| `lbl/corners` | Cantos da primeira camada | Cruz branca | Camada 1 completa, canto a canto (F2L simplificado, parte 1: canto primeiro) | Cruz e centros |
| `lbl/middle` | Meios da segunda camada | Camada 1 | Quatro arestas do meio, uma por vez (parte 2: aresta lateral depois, separadamente) | Camada 1 |
| `lbl/top-cross` | Cruz amarela | Duas camadas | Arestas de U orientadas, cantos ignorados | Duas camadas |
| `lbl/top-edges` | Alinhar as arestas amarelas | Cruz amarela | Arestas de U nos lugares exatos | Duas camadas e cruz amarela |
| `lbl/top-corners-position` | Posicionar os cantos amarelos | Arestas de U alinhadas | Cantos de U nos lugares, mesmo tortos | Tudo anterior |
| `lbl/top-corners-orient` | Virar os cantos amarelos | Cantos posicionados | Cubo resolvido | Verificada nos extremos; o meio parece desarrumado e se recompoe no ultimo canto, aviso pedagogico declarado |

## Pontos de decisao ja fundamentados

- Ordem posicionar-antes-de-orientar decidida com 4 razoes e fonte primaria (secao propria da metade Trama); o R' D' R D precisa ser a etapa final.
- Predicados: um unico NOVO (`ll-corners-placed`, posicao sem exigir orientacao); `cross`, `f2l` e `finish` reusam o dominio existente e `lbl/top-cross` reusa o `oll-edges` do 2-look OLL de P2 que Prisma ja esta criando, com sinergia declarada aos casos `cfop/eo-ll/*` sem duplicar conteudo nem contagem.
- Seis algoritmos no recorte iniciante, licenca resolvida por producao autoral com fontes citadas (Ruwix e J Perm como referencia, nada copiado); "repita ate dar certo" e mecanica declarada, validada na fase de dados.
- Exercicios: trio reconhecimento/isolado/encadeado por etapa, 16 a 20 fixtures estimadas, contagens de UI somente por casos aprovados em teste; dificuldade por tamanho de preparo, minimo apenas com prova do gerador.
- Ponte pedagogica declarada para CFOP no texto do grupo, sem prometer treinadores inexistentes.

## Sequencia apos aprovacao

1. Prisma: `MethodId`/`StageId`/`TrainerCatalogSection` com o grupo `lbl` antes de CFOP, predicado `ll-corners-placed`, fixtures e geradores nos criterios da trilha Roux; modo Camadas do solver como marco separado sobre os mesmos predicados.
2. Matiz: grupo no catalogo e cards, mesmo padrao validado dos cards Roux.
3. Trama: curadoria final dos textos no formato de consumo; Dobra consome verbatim como no ciclo Roux.
4. Sonda: aceite independente; nenhuma cobertura ativa antes disso.
