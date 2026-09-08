# Contribuir com o Nexus Cube

Use Node.js 22.3 ou superior, instale com `npm ci` e leia o [README](README.md). O código original do projeto usa a [licença MIT](LICENSE). Preserve esse aviso e as atribuições existentes. Dependências, algoritmos e outros materiais de terceiros continuam sujeitos às respectivas licenças; não os relicencie como parte de uma contribuição.

## Mudanças de código

1. Delimite o problema e preserve os dados existentes. UI fica em `src/components`, `src/features` e `src/styles`; regras do cubo, estatísticas e validação ficam em `src/domain`; persistência e conteúdo ficam em `src/data`.
2. Não duplique o motor do cubo ou as estatísticas na interface. O renderer recebe estados e movimentos do domínio. O foco visual acompanha identidades estáveis de adesivos.
3. Para conteúdo novo, documente fonte/permissão, nome, objetivo, preparo, solução, preservação e marcos. Valide a identidade e o objetivo com oráculo independente; cancelar uma sequência com sua inversa não prova a classe do caso.
4. Rode `npm run typecheck` e os testes focados afetados. Exercite o fluxo em desktop e mobile, claro e escuro, incluindo teclado e falhas de persistência quando relevantes. Nunca apresente dados sintéticos como histórico real do usuário.
5. Entregue uma descrição curta do problema, comportamento resultante, verificações feitas e limites observados. Mudanças de schema exigem migração e compatibilidade de backup verificadas.

A suíte completa e o build precisam de repositório estável. Em ambiente compartilhado, combine uma janela com escritores parados e um único consumidor de integração. Preserve processos/portas existentes. Neste projeto, a automação de navegador da equipe usa portais exclusivos; Playwright não faz parte do fluxo autorizado.

## Fontes e arquivos gerados

Mantenha `package-lock.json`, fixtures sintéticas e provas públicas da curadoria versionados. Não inclua `.maestri`, `.env`, dados reais, backups, logs, PIDs, flags, caches, `node_modules`, `dist` ou capturas locais de QA. `.gitignore` separa esses artefatos; não contorne as regras com `git add -f`.

Se modificar os documentos de fontes/curadoria, atualize as cópias correspondentes em `public/third-party-notices.txt` e `public/sources/`. Preserve os avisos integrais de terceiros. Os geradores de curadoria e suas pré-condições estão documentados em [docs/expansion-curation/README.md](docs/expansion-curation/README.md); rode-os somente quando a regeneração for intencional, pois alteram dados e provas.

Publicações e releases devem seguir as autorizações e revisões do projeto. Um checkpoint no Git não representa aceite final ou aplicação publicada. Consulte o README para distinguir funcionalidades implementadas dos fluxos de autenticação, sincronização e importação ainda em desenvolvimento.
