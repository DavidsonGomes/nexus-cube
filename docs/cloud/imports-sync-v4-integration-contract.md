# Contrato de integração Imports + Sync V4 (proposta Elo)

Proposta de contrato para ligar um import commitado localmente ao caminho de
upload do Sync V4. Autorizado pelo Mestre; ownership: Elo em `src/cloud/**`
(import-commit e a costura ao Sync V4), Lastro em `src/imports/**`
(parsers/preview/plano), Prisma no modelo/representação V4 e bytes, Matiz em
UI/AppContext/package/Git. Este documento é a base a fechar com Lastro e Prisma
antes de qualquer código de costura.

## Guardas inegociáveis (Mestre)

1. A integração NÃO ativa Sync V4 nem liga upload real ao target. O caminho de
   upload permanece DESLIGADO até o gate de RLS de dois owners e a janela remota.
   `import-commit-v4` mantém `sync: 'unavailable'` como estado observável até lá.
2. ZERO regressão do SyncV3 publicado em `7302919`. Provado por teste de que
   ligar a costura de imports não altera o fold/adoção/conflito que foi ao ar.
3. Contrato de bytes/representação fechado com o Prisma ANTES de Elo depender do
   shape (`semanticSHA256`/`rawSHA256`/`duplicateOf`), sem edição concorrente no
   modelo.

## A costura (onde as duas metades se encontram)

Hoje `src/cloud/import-commit-v4.ts` é um reducer de transação local que aplica
um plano a `AppData4` em IDB e retorna `sync: 'unavailable'`. A integração
adiciona, no MESMO ownership de Elo, a projeção de um import commitado para as
tabelas privadas do ledger V4 (Frente 2), sem ligar o dispatch real.

### Mapa manifest de import → ledger V4 (servidor)

| ImportPlanManifest (Lastro/Prisma) | Ledger V4 (Elo, Frente 2) |
|---|---|
| `planId` = `imp_<planSHA256>` | `frame_batches.batch_id` (regex `imp_[0-9a-f]{64}`) |
| `rawSHA256` | `frame_sources.raw_sha256`, `source_id` = `src_<rawSHA256>` |
| `semanticSHA256` | `frame_batches.semantic_sha256` |
| `planSHA256` | `frame_batches.plan_sha256` |
| `duplicateOf` | `frame_batches.duplicate_of` (null ou `imp_<hash>`; cópia intencional) |
| `completesBatchId` | `frame_batches.completes_batch_id` (coluna DEDICADA, ver co-assinatura) |
| `records[]` = `{key, ordinal, disposition}` | `frame_references` (chave composta) |
| `records[].disposition` (kind) | `frame_references.disposition` |
| `entity`/`targetId` (dentro de included/already-present) | `frame_references.entity`/`target_id` |
| `idMappings[]` (entity/recordKey/targetId/reason) | preenche a chave composta quando preciso |
| `parserVersion` | `frame_batches.parser_version` |

CORREÇÃO MATERIAL (Prisma+Lastro): `records[]` é `ImportRecordDecisionV4` =
`{key, ordinal, disposition}`. NÃO há `entity`/`id`/`parent` no topo do record;
`entity` e `targetId` vivem DENTRO da disposition (só em `included`/`already-present`),
a relação de pai vive nos dados (`solve.sessionId`), e `idMappings` fornece
`entity`/`recordKey`/`targetId`/`reason`. Alinhamento por construção nos demais
campos; o schema do ledger foi corrigido para refletir isto.

## O que Elo precisa fechar com o Prisma (guarda 3)

Confirmação, sem edição concorrente no modelo, de que estes campos do manifest
são estáveis e canônicos (mesma serialização byte-a-byte usada no
`planSHA256`/`targetDigest`):
- `rawSHA256`: SHA-256 dos bytes brutos da fonte (hex minúsculo, 64 chars).
- `semanticSHA256`: SHA-256 da projeção semântica canônica do batch.
- `duplicateOf`: `null` ou `imp_<planSHA256de um batch anterior do mesmo owner>`.
- `records[].disposition`: EXATAMENTE quatro kinds — `included | already-present |
  pending | excluded`. `recorded`/`imported` NÃO são disposition (são `kind` de
  sessão/solve no AppData4) e foram removidos do check de `frame_references`.
- Regra de `pending.reason`: um de
  `unknown-time|unknown-penalty|unknown-puzzle|unsupported-puzzle|unmapped-fields|unresolved-parent`.
- Regra de `excluded`: sempre `reason: 'user-confirmed'` (imposto no ledger).

## O que Elo precisa fechar com o Lastro

- Fronteira: Lastro entrega o `ImportPlanManifest` congelado + `AppData4`
  resultante do `applyPlan`; Elo não reparseia nem replaneja, só projeta para o
  ledger e (no futuro) monta a operação de upload. Preview/plano seguem de Lastro.
- `completesBatchId`: como um import que completa um batch pendente anterior
  referencia o batch original no ledger (provável `duplicate_of` ou uma coluna
  de completude a decidir juntos).

## Co-assinatura Lastro (fronteira confirmada)

Lastro co-assina os dois pontos abaixo, sem ambiguidade de dono. Nada aqui ativa
sync, liga upload ou toca o target; feature OFF e gates do Mestre preservados.

1. Codec: o `semanticSHA256` é computado em `src/imports/source-identity.ts`
   (`semanticSourceSHA256`, usado pela inspeção e consumido pelo planner) sobre o
   codec canônico CONGELADO (`digest`/`CANONICAL_VERSION` de
   `src/cloud/codec.ts`), fechado na guarda 3 com o Prisma. Lastro define somente
   o framing versionado `nexus-cube/import-source/v1` e os localizadores
   ordenados; NÃO redefine, duplica nem parametriza a canonicalização. Mudança de
   codec ou de framing exige novo `parserVersion` e nova prévia, nunca
   reinterpretação de lotes existentes.
2. Fronteira com Elo: Lastro entrega o `ImportPlanManifest` congelado (evidência,
   nunca autoridade; handles não cruzam a fronteira) e o `AppData4` resultante do
   `applyPlan`; a projeção de Elo parte do par committed `ImportReceiptV4` +
   manifesto em `pendingImports`, pois `applied` puro não é committed. Elo não
   reparseia nem replaneja; preview/plano seguem de Lastro em `src/imports/**`.
3. `completesBatchId`: referencia o `batch_id` ORIGINAL (`imp_<hash>` do lote com
   pendências); é null em append e não nulo somente em conclusão, com exclusão
   mútua garantida com `duplicateOf`. Decisão co-assinada: coluna DEDICADA no
   ledger (ex.: `completes_batch_id`), nunca reuso de `duplicate_of`, que
   significa cópia intencional (lote irmão). A conclusão NÃO cria lote novo em
   `AppData4.imports.batches`: muta somente disposições `records` do lote
   existente, e o `planId` da conclusão existe apenas como recibo/manifesto.
   Projeção de estado chaveia `frame_batches` pelos ids de `imports.batches`,
   jamais por `planId` de recibo. Disposições válidas em `records[]`:
   `included | already-present | pending | excluded` (com `entity`/`targetId`
   dentro da disposition; `recorded|imported` são `kind` de entidade, não
   disposição). Semântica completa na seção "Marco executável: conclusão de
   pendências por lote" de `docs/imports-contract.md`.

FECHAMENTO DA CO-ASSINATURA (Lastro): Lastro verificou contra o modelo real
(`ImportRecordDispositionV4` em `src/data/imported-model.ts`) e ENDOSSA a
correção material do Prisma como está redigida acima, incluindo o mapa
manifest→ledger corrigido (records `{key, ordinal, disposition}`, entity/targetId
dentro de included/already-present, idMappings para a chave composta,
`completes_batch_id` dedicada). Com os pontos 1 a 3 desta seção, a co-assinatura
tripla do lado de Lastro está FECHADA e o projetor de Elo está destravado no que
depende desta fronteira. Feature OFF; nada toca o target.

## Co-assinatura tripla FECHADA

Os três donos fecharam a fronteira; o projetor de Elo está destravado.
- **Prisma (codec)**: `digest()`/`canonicalText()`/`CANONICAL_VERSION=1` de
  `src/cloud/codec.ts` são a canonicalização congelada e autoritativa. Nada na
  fila do Prisma (LBL/Camadas/finger tricks) toca `codec.ts` nem muda
  `CANONICAL_VERSION`; mudança futura seria versão nova com janela e review.
- **Lastro (computa)**: `semanticSHA256` é computado em
  `src/imports/source-identity.ts` (`semanticSourceSHA256`) sobre esse codec,
  definindo só o framing `nexus-cube/import-source/v1` e localizadores ordenados.
- **Elo (consome)**: projeta ao ledger consumindo o `ImportPlanManifest`
  congelado verbatim, sem reparse/replan.

Nota de mapeamento verificada no modelo congelado (`ImportRecordDispositionV4`):
`entity` do modelo é `session|solve|study-attempt|progress`; o ledger usa `study`
para study-attempt, então o projetor mapeia `study-attempt` → `study`. `excluded`
sempre `reason:'user-confirmed'`; `included`/`already-present` sempre têm
`targetId`; `pending` tem `reason`.

## Primeiro marco testável (proposto)

Uma função em `src/cloud/**` que, dado um `ImportReceiptV4` + o manifest, produz
a projeção de ledger V4 (batches/sources/references) equivalente ao que o
servidor validaria, verificada por teste de domínio contra as invariantes de
`link_parser_ledger` (contagens, ordem de batch, referências), SEM dispatch e
SEM tocar o caminho de sync de produção. Prova da guarda 2: teste que instancia
o caminho de sync V3 com a costura presente e assere fold/adoção/conflito
idênticos.

## Fora de escopo deste marco

Dispatch real ao target, ativação de Sync V4, RLS de dois owners, janela remota.
Tudo permanece atrás dos gates do Mestre.
