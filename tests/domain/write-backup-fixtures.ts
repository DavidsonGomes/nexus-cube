import { readFileSync, writeFileSync } from 'node:fs';
// Historical generator uses the archived schema, never the current migrator.
const data=JSON.parse(readFileSync('tests/domain/fixtures/backup-v1.json','utf8')).data;
data.version=2;
for(const [i,caseId] of ['cfop/f2l/01','roux/cmll/01','cfop/cross/alinhar-uma-aresta','roux/lse/fechar-centros'].entries()){
 data.progress[caseId]={caseId,favorite:true,status:'learning',note:'Novo conteudo preservado'};
 data.studyAttempts.push({id:`expansion-study-${i}`,caseId,createdAt:'2026-09-08T14:00:00.000Z',recognition:'good',execution:'good',durationMs:6000});
}
writeFileSync('tests/domain/fixtures/backup-v2.json',JSON.stringify({format:'nexus-cube',version:2,exportedAt:'2026-09-08T15:00:00.000Z',data},null,2)+'\n');
