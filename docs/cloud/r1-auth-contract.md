# Auth R1 e dados locais por identidade

Implementação React/Vite em `src/cloud/index.ts`, serviço testável em `src/cloud/service.ts`, contrato público em `src/cloud/types.ts`. SDK Supabase JS 2.116.0, instalado por Matiz, licença MIT preservada no pacote. Skills Supabase e Postgres Best Practices lidas integralmente e adotadas; nenhuma tabela, migration ou policy de produto foi criada nesta etapa.

## Escopo e composição

`createCloudService({url,publishableKey,redirectTo,guestStorage?})` é a composição de navegador. Target existente fixo: `xckxvxpiqgwqwoywtnqs`. Configuração ausente mantém visitante no mesmo namespace local e retorna `unavailable` nas operações Auth, sem criar cliente inválido.

`createCloudServiceWithPorts({projectRef,configured?,authFactory,store,guestStorage?,online?,redirectTo,now?,randomId?})` injeta Auth e persistência para QA. `AuthDriver` está em types; `CloudAtomicStore` em storage. `createMemoryCloudStore` serve apenas a testes. No navegador usa-se `createIndexedDBCloudStore`; não há fallback silencioso para memória.

`getSnapshot()` e `subscribe()` expõem status, identidade, contexto, dados, revisão local, erro e fluxo de recovery. `sync` e `accountImport` são sempre `unavailable`. `committed` significa transação local concluída; nunca significa upload ou sincronização. Não existem RPC, fila de envio, adoção ou transporte de dados de produto neste runtime.

## Auth

| Chamada | Retorno positivo | Precondição/efeito |
| --- | --- | --- |
| `initialize()` | `void`, snapshot atualizado | Idempotente; não processa callback. Verifica identidade online antes de abrir conta. |
| `signUp({email,password})` | `authenticated` ou `confirmation-required` | Segue sessão realmente retornada pelo servidor. Não presume posse do email ou privilégios. |
| `signIn({email,password})` | `authenticated` | Nova generation e verificação `getUser` no servidor. |
| `requestPasswordReset(email)` | `email-requested` | Resultado não comprova entrega de email. Fluxo PKCE separado, TTL local de uma hora. |
| `handleAuthCallback(url)` | `authenticated` ou `recovery-required` | Exige code, cloud_flow, verifier e fluxo atual. Callback antigo não ativa outra conta. |
| `completePasswordReset({recoveryContextId,password})` | `password-updated` | Consome fluxo antes do envio, verifica usuário e generation antes/depois. Erro ambíguo vira `outcome-unknown`. |
| `refresh()` | `authenticated` | Sessão nula ou erro explicitamente inválido fecha gate. Transporte transitório preserva dados locais. |
| `signOut()` | `logged-out` com local/remote | Gate durável antes da revogação remota. Falha de persistência retorna `logout-storage-error`, local `memory-only`. |
| `resumeOffline()` | `authenticated`, status `offline-account` | Ação explícita para identidade previamente estabelecida com gate ativo. Não reabre logout ou sessão comprovadamente inválida. |
| `openGuest()` | `guest` | Volta à partição visitante sem copiar dados da conta. |

UI captura a URL uma vez, remove query/hash sensíveis por `history.replaceState` antes de processá-la e chama `initialize().then(() => handleAuthCallback(url))` uma vez. SDK usa PKCE e `detectSessionInUrl:false`. Nenhum processamento duplo automático.

Sessão inválida usa `AuthSessionInvalidError`, discriminante confiável da seam. Adapter classifica `AuthSessionMissingError` e `AuthApiError` 4xx com codes de sessão/JWT/usuário inválidos documentados. Não classifica mensagens arbitrárias, transporte, 429 ou 5xx como revogação. Erro tardio só pode invalidar a instance/generation original. HTTP de logout autenticado usa exclusivamente token retido na instância antiga; `remote:confirmed` requer resposta bem-sucedida. Isso não afirma revogação instantânea de JWTs já emitidos.

## Persistência e corridas

IDB `nexus-cloud:<projectRef>`, store `state`, registro `root`: coordenador de generation/gate, instâncias Auth, contas, visitante e drafts na mesma transação. Callbacks da seam são síncronos; sucesso só após `transaction.oncomplete`. Abort não publica snapshot parcial. SDK storage é separado por instance; writes de instância revogada são recusados. BroadcastChannel notifica mudanças; a autoridade é o registro durável. Código mantém generation observada monotônica e descarta reads atrasados que antecedem invalidação já observada.

`ContextHandle={projectRef,userId,generation}` vincula `commit`, `recover`, `exportBackup`, drafts e respostas. Commit exige `expectedLocalRevision`; retorno `stale-local` preserva estado. Após await, retorno pessoal exige contexto ainda visível e generation válida; caso contrário retorna `identity-changed` sem data/text/drafts. Captura ativa bloqueia mutações comuns e trocas voluntárias. Invalidação externa oculta contexto imediatamente.

Logout com erro total de persistência bloqueia esta instância em memória, expõe falha e permite retry. Não promete garantia durável ou entre abas quando o gate não pôde ser gravado. Abas suspensas e IDB/Web Locks reais exigem prova de navegador independente.

Guest original `nexus-cube:v1` é lido sem reescrita; uma cópia validada separada alimenta o workspace IDB visitante. Signup/login nunca a adotam. Fonte corrompida preserva bytes originais e publica erro com dados iniciais somente para UI de recuperação; commits ficam bloqueados até `recover` explícito. Recuperação para conta retorna `import-unavailable`.

Os preflights usam `saveData` real em armazenamento de staging, com schema e serialização efetiva. Contrato do domínio: snapshot v3 47.955.088 bytes, envelope compacto +83, arquivo v3 47.955.171; fonte legada 20.971.520. Quota física continua independente. Backup normal contém AppData integral, sem credenciais, drafts, instâncias ou metadados cloud. UI visitante fica restrita ao Timer; recovery técnica de corrupção é exceção explícita dentro do Timer, coordenada por Matiz.

## Captura durável e retomada

1. `beginCapture({context,capture:{sessionId,mode,scramble},source:'timer'|'manual'})` retorna `armed` com capability somente após persistir metadados. UI só então libera preparo/manual/timer.
2. `completeCapture({capture,result:{rawMs,penalty,note}})` congela ID, createdAt, origem, vínculo e resultado completo uma vez. `rawMs` aceita frações finitas do domínio, -0 persiste como +0; nota mantém até 10.000 unidades UTF16 sem normalização. O candidato privado em memória é reaproveitado após quota/abort, mas só `draft-saved` afirma persistência confirmada.
3. `finishCapture({capture,expectedLocalRevision})` acrescenta exclusivamente o Solve armazenado, por append, na mesma transação que marca committed. Não recebe callback arbitrário. Pai/mode/ID/counts/bytes são revalidados. Retry após commit não duplica nem gera novos metadados.
4. `listDrafts(context)` retorna `RecoveryDraft` com `capture`, `result` e `solve`. Conta exige mesma identidade verificada nesta instância. `resumeCapture({context,draftId})` só aceita completed com metadados, troca capabilityId atomicamente e retorna `{kind:'resumed',capture,draft}`. A capability anterior deixa de valer inclusive em outra aba.
5. `discardDraft({context,draftId})` invalida capability e cancela sem criar solve. Draft armed após crash é `interrupted`; antigo sem source/solve é `discard-only`. Ambos só permitem descarte explícito. Nenhum tempo é inferido de relógio ou recuperação.

Capacidade privada da captura já iniciada pode completar uma vez o resultado em quarentena após invalidação externa. Não abre conta, lê/exporta conteúdo nem envia rede. Retry idêntico distingue já gravado; payload divergente falha. Reclaim/discard invalida nonce antigo. Dados A nunca aparecem em guest/B. Crash antes da persistência do resultado perde apenas o candidato de memória; não há promessa de recuperação desse resultado.

## Provas e limitações

Focados do dono: `node --import tsx --test tests/cloud/capture.test.ts tests/cloud/auth-errors.test.ts`, cinco casos passaram; strict typecheck cloud e esses testes passou. Usam store/Auth controlados, sem rede. Prisma concedeu parecer readonly restrito de append/metadata/bytes. Vigia reportou testes independentes de isolamento/SW; os resultados e eventuais achados posteriores pertencem a `docs/security`.

Ainda separados: IDB e SDK locks reais em navegador, UX de captura/recovery por Matiz/Sonda, Auth com contas autorizadas, email/SMTP/redirects, confirmação da configuração remota e RLS/SQL futuro. Não transformar mocks em aceite do target. Configuração de confirmação de email é decisão explícita por janela do Mestre; o runtime segue a resposta real do SDK.

Referências oficiais consultadas: [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [erros Auth](https://supabase.com/docs/guides/auth/debugging/error-codes), [refreshSession](https://supabase.com/docs/reference/javascript/auth-refreshsession), [configuração Auth administrativa](https://supabase.com/docs/reference/api/v1-update-auth-service-config). Credenciais administrativas nunca são expostas em UI/log/Git; publishable é gerida por Matiz.
