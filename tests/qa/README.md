# Testes e fixtures de QA

Os arquivos desta pasta sao artificiais e nao sao dados iniciais do produto. `fixtures.mjs` nao e um backup importavel: e uma especificacao semantica que sera adaptada ao schema publicado. Nomes de penalidade/status devem ser mapeados explicitamente, nunca impostos ao contrato de produto.

`cube-cases.mjs` fornece classes abstratas de OLL e PLL sem ler catalogo ou algoritmos do app. Cobertura abstrata não prova correspondência entre nome convencional e caso, nem funcionamento do motor. Os testes que usam KPuzzle, snapshots arquivados ou fontes declarativas indicam essa origem no próprio arquivo.

Comandos reproduzíveis, a partir da raiz do repositório:

```sh
node --test tests/qa/fixture-integrity.test.mjs
node --import tsx --test tests/qa/cmll-cpco-oracle.test.ts
node --import tsx --test tests/qa/exercises-kpuzzle-oracle.test.ts
node --import tsx --test tests/qa/backup-v1-v2-migration.test.ts
node --import tsx --test tests/qa/pll-endpoint-oracle.test.ts
node --import tsx --test tests/qa/pll-recognition-oracle.test.ts
```

Esses comandos são verificações proporcionais. O teste de setas PLL usa `getPLLPermutation` e um estado esperado construído pela inversa própria de cada alternativa; a aceitação visual continua pendente. A independência depende da fonte do oráculo, não do nome do teste.

Testes focados ligados ao contrato: `statistics-contract.test.ts`, `persistence-contract.test.ts`, `catalog-contract.test.ts` e `user-visual-reference.test.ts`. Executar um arquivo com `node --import tsx --test tests/qa/NOME.test.ts` durante desenvolvimento apenas na verificação proporcional permitida. A suíte conjunta, testes domain e build são operações separadas e aguardam autorização explícita; este README não depende de roles, portais ou de outro plano operacional.

`contract-fixtures.ts` contem snapshot v1 real e StorageLike isolado. `reference-classes.json` fixa fatos matematicos derivados de setups externos e setas PLL; `capture-reference-classes.mjs` so renova explicitamente essas fontes, nunca durante teste do produto. O teste de referencia visual usa mascaras transcritas das imagens fornecidas pelo usuario.

`capture-portal-evidence.py`, `motion-observer.js` e `capture-pause-evidence.py` são opcionais e específicos de ambientes que oferecem o CLI maestri; capturam estado/frames sem Playwright. `offline-origin-server.mjs` é um harness Node independente para uma origem estática já construída. Scripts de captura não entram no glob de testes.

Evidencias e status em `docs/qa/`. Nenhum script de QA altera arquivos de produto.
