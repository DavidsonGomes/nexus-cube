# Planejador Roux

`planRoux(input, options): Promise<MethodPlan>` está em `src/solver/methods/roux/index.ts`. Recebe `ValidatedSolverInput` e o contrato comum `MethodPlannerOptions` de Prisma. Deve ser chamado no worker do solucionador. Não modifica entrada, corpus, armazenamento ou resultados de treino. Integração worker/client/player e prova independente de QA são marcos separados.

O plano usa sete etapas na referência `URFDLB-fixed-v2`: amarelo U, verde F, vermelho L e laranja R. Começa nas 54 cores revalidadas pelo builder comum. Cada sequência é aplicada ao estado final da anterior. Uma etapa vazia exige seu predicado já satisfeito. O final exige as seis faces e centros nas cores fixas, sem aceitar uma rotação global residual.

| Etapa | Construção e objetivo | Preservação nos extremos |
| --- | --- | --- |
| `roux.fb` | Busca das arestas DL/FL/BL e cantos DFL/DBL, formando bloco esquerdo 1×2×3 com centro L. | Centros fixos. |
| `roux.sb` | Busca DR/FR/BR/DFR/DBR e retorno do centro U usando U/R/M/r. | Bloco esquerdo e centro L; centros fixos ao terminar. |
| `roux.cmll` | Reconhecimento completo dos quatro cantos; algoritmo do corpus local, com ajustes e rotações explícitos. Admite AUF restante. | Dois blocos e centros L/R, centros fixos. |
| `roux.cmll-auf` | U, U', U2 ou vazio para fixar os quatro cantos. | Dois blocos. |
| `roux.eo` | Busca U/M que termina com adesivos U/D das seis arestas e centros U/D no eixo vertical, cantos alinhados. | Dois blocos e quatro cantos; centros exatos ou M2. |
| `roux.lr` | Busca U/M para colocar UL/UR mantendo EO ao terminar. | Dois blocos e quatro cantos; centros exatos ou M2. |
| `roux.finish` | Busca U/M para concluir quatro arestas, cantos e centros na referência original. | Blocos, cantos e UL/UR. |

As preservações são comparações por identidade nos dois extremos. Em SB, o alfabeto preserva adicionalmente FB durante os giros. Em CMLL e LSE pode haver deslocamentos temporários. M2 é uma condição intermediária permitida em EO/LR, nunca um cubo concluído com centros trocados.

## Busca e reconhecimento

FB e SB usam IDA* com tabelas de distâncias de subconjuntos das cinco peças. Arestas e cantos usam `createAnchorModel` comum, com 24 poses por adesivo âncora; a geometria e os giros vêm do domínio existente. As tabelas Roux misturam duas âncoras de canto e uma de aresta, além das três arestas juntas. Centros possuem seis poses locais derivadas do mesmo motor. Não existe segunda implementação das regras de giros.

A função de custo trata cada token como uma ação. A construção é orientada ao objetivo do bloco e não procura a resolução completa como atalho. Não se promete ótimo global, escolha ergonômica ou reprodução do raciocínio de um especialista. O planejamento não busca cruz CFOP e não corta uma resposta min2phase em etapas renomeadas.

CMLL indexa o corpus licenciado pelas quatro identidades e orientações de cantos, com quatro ajustes U, conjugação por y e ajuste final U. As rotações aparecem na sequência e em `adjustments`; o prefixo U também é explícito. O encaixe é novamente aplicado ao estado real e conferido, incluindo os blocos. O cache só é publicado após a construção completa; um cancelamento não publica uma tabela parcial. O uso de inversas aqui constrói índices de reconhecimento de casos, não reconstrói a entrada do usuário.

LSE faz três buscas independentes no subgrupo U/M. Cada uma para em seu próprio objetivo EO, LR ou final. O estado compacto rastreia seis arestas, um canto superior que determina o alinhamento U e um centro que determina a orientação da faixa M. Os demais cantos e centros têm movimento determinado nesse subgrupo. O builder comum verifica novamente o estado completo resultante.

## Recursos, cancelamento e falhas

- Limite nominal: 30 milhões de expansões, incluindo BFS das tabelas de blocos, IDA* e BFS LSE. A construção finita do índice CMLL é limitada por 42 casos × 4 conjugações × 4 ajustes iniciais × 4 ajustes finais e participa do prazo cooperativo.
- Prazo cooperativo de 90 segundos desde o início; não é interrupção rígida. Trabalho síncrono entre checkpoints pode ultrapassar o instante nominal.
- Checkpoints a cada 4096 expansões de tabela, 8192 visitas IDA* e 2048 expansões LSE, além das transições entre fases e dos 42 casos CMLL. `methodCheckpoint` cede ao event loop e verifica `AbortSignal` antes/depois.
- Profundidade de busca dos blocos até 23 tokens; fila LSE limitada nominalmente a 400 mil estados. Contagens e memória são verificadas por amostragem, admitindo pequeno excedente do lote corrente. Essas restrições são limites de cálculo, não provas de impossibilidade.
- Falha por limite lança `RouxSearchLimit` com mensagem que preserva a validade da entrada. Cancelamento rejeita a promessa. Não há fallback Direta sob o rótulo Roux e não há plano parcial retornado como concluído.
- `onStage` recebe fronteiras verificadas durante o cálculo. Isso não significa sucesso final; identidade de solicitação, descarte de resultados antigos e publicação visual pertencem ao protocolo comum.

Tabelas de blocos são locais à solicitação. Somente o índice completo e imutável de reconhecimento CMLL é reutilizado. Não se instala dependência, não se faz acesso à rede durante o cálculo e não se modifica o corpus.

## Verificação autoral

Testes exclusivos: `tests/domain/solver/roux/plan.test.ts` e `stages.test.ts`. Execução focada:

```sh
node node_modules/tsx/dist/cli.mjs --test tests/domain/solver/roux/plan.test.ts tests/domain/solver/roux/stages.test.ts
node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck src/solver/methods/roux/index.ts tests/domain/solver/roux/plan.test.ts tests/domain/solver/roux/stages.test.ts
```

As fixtures usam KPuzzle da biblioteca instalada como oráculo de movimentos. Incluem estado resolvido, sequência mista e estado construído diretamente por permutação/orientação de peças. Cada extremo do plano é confrontado com o prefixo efetivo aplicado pelo oráculo à entrada original, e o final com todos os 54 adesivos resolvidos. A entrada permanece intacta. Há cobertura de cancelamento antes/durante cálculo e mensagem de limite.

CMLL enumera independentemente as 24 permutações × 27 orientações dos quatro cantos, compensando paridade em arestas livres: 648 estados, com preservação independente dos blocos, centros e quatro cantos até AUF. Os testes LSE distinguem M ímpar, M2 parcial, EO/LR e conclusão fixa. Essas provas autorais não substituem signoff de Sonda/Vigia nem comprovam integração, desempenho de celular, offline ou interface.

## Fontes e licença

As quatro páginas primárias de Gilles Roux foram consultadas em 8 de setembro de 2026 por HTTP: [primeiro bloco](http://grrroux.free.fr/method/Step_1.html), [segundo bloco](http://grrroux.free.fr/method/Step_2.html), [cantos](http://grrroux.free.fr/method/Step_3.html) e [últimas seis arestas](http://grrroux.free.fr/method/Step_4.html). Fundamentam a estrutura e os objetivos. Nenhuma tabela de sequências, imagem, applet ou texto foi copiado dessas páginas. A convenção de cores da fonte difere da referência fixa do produto.

CMLL reutiliza somente `src/data/expansion-sources/cmll.ts`, produção autoral Nexus Cube derivada de sementes Cube Coach de Luke Jackson sob MIT, com proveniência e termos preservados em [curadoria](../expansion-curation/README.md) e [fontes e licenças](../sources-and-licenses.md). Nenhuma coleção externa nova foi incorporada. O oráculo de testes usa `cubing@0.63.4` sem alterações sob a opção MPL-2.0 já adotada pelo projeto. Implementação e texto novos seguem a licença MIT original do Nexus Cube.

As instruções físicas e mensagens estão alinhadas ao [guia pedagógico](../expansion-curation/solver/metodos-pedagogia.md), de Trama. Voltar, reiniciar ou saltar na visualização não altera o cubo físico; rotações na sequência são ações distintas de mover a câmera.
