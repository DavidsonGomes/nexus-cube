# Matriz QA local AUTH + CORE R1

Escopo local da primeira release MIT. Sync, adoção avançada e importadores permanecem indisponíveis e não são tratados como sucesso.

| ID | Fluxo | Prova de tela | Prova de armazenamento/efeito | Estado |
| --- | --- | --- | --- | --- |
| AUTH-01 | Cadastro e confirmação | Campos, validação, estado pendente/confirmado e retorno | Identidade criada no contexto correto; nenhum dado de outro usuário | PENDENTE contrato |
| AUTH-02 | Login e refresh | Login, refresh, loading e erro observável | Contexto local particionado pela identidade; reload mantém somente o próprio contexto | PENDENTE contrato |
| AUTH-03 | Recuperação | Solicitação, confirmação e redirect aprovado | Token/resposta não abre contexto de outra identidade; erros não revelam conta | PENDENTE contrato |
| AUTH-04 | Logout voluntário | Captura ativa bloqueia logout até salvar/cancelar; logout confirmado é visível | Contexto anterior não aparece para visitante ou outra identidade; cache/local storage particionados | PENDENTE contrato |
| AUTH-05 | Expiração/invalidação | Gate imediato, erro recuperável e retorno autenticado | Draft original em quarentena por identidade; nenhuma troca de `sessionId`/`mode` | PENDENTE contrato |
| AUTH-06 | Guest → conta | Estado local e sincronização indisponível claramente informados | Sem adoção automática; fonte visitante permanece recuperável e separada | PENDENTE contrato |
| CORE-01 | Timer e captura | Start/stop, scramble imutável, +2/DNF e erro de save | Solve mantém sessão/modo capturados, sem mutação por troca de seleção | PENDENTE baseline |
| CORE-02 | Modalidades | 2H/OH/null, sessão inteira, médias e recordes separados | Migração v1/v2→v3 preserva IDs e `mode:null`; scopes incompatíveis rejeitados | PASSA focado |
| CORE-03 | Estudos | Estudo, progresso, retorno e modo escopado | Tentativas não alteram solves, sessões ou estatísticas | PASSA domínio; UI pendente |
| CORE-04 | Backup/exportação | Estado local, erro e indisponibilidade de sync visíveis | Bytes, quota, CSV e backup v3 atômicos; exportação só do contexto autorizado | PENDENTE UI |

AUTH-CORE local: `beginCapture` exige origem `timer`/`manual`, `completeCapture` exige nota, e `finishCapture` anexa o solve congelado pelo serviço sem `change`/`addSolve`; retry não duplica o registro. O foco Node correspondente passou 6/6 com AuthDriver sintético. Isso não é prova de email, conta remota, UI ou IDB real.

Método: navegador real via Portal Sonda somente após contrato estável e sem HMR. Testes de domínio, builds e mocks não substituem prova de tela. AUTH/SYNC remoto, RLS e caixas de email ficam fora desta matriz R1.
