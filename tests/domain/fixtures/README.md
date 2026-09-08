# Fixtures de migração

Dados sintéticos, sem dados pessoais ou exportação de usuário. `backup-v1.json` arquiva o schema original: progresso dos 78 IDs, sessão, tempo bruto com +2, tentativa de estudo e preferências. `backup-v2.json` preserva esse conteúdo e acrescenta referências F2L, CMLL, cruz e LSE. Os dois arquivos históricos permanecem imutáveis durante a implementação de modalidades.

Os testes comparam o JSON original diretamente com o resultado v3. As únicas mudanças permitidas são version:3 e mode:null em cada sessão/solve. Não usam a própria função de migração para produzir o expected. O gerador histórico `write-backup-fixtures.ts` usa somente o JSON v1 e o schema v2, sem chamar o migrador corrente; não foi executado nesta fase.

`backup-v3.json` é exemplo sintético novo: mantém o legado não classificado e todo o estudo v2, e acrescenta duas sessões/resoluções com modalidades explicitamente conhecidas. Seu envelope/data são v3, mas a chave local continua `nexus-cube:v1`. Nenhuma sessão real foi classificada para gerar essa fixture.

Armazenamento de teste é em memória com contador de escritas e quota simulada. Não lê nem altera localStorage do navegador.
