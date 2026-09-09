import { canonicalText, digest } from '../cloud/codec';
import { DataV4LimitError, preflightDataV4, verifyImportSourcesV4 } from '../data/imported-model';
import type { ImportRecordDispositionV4, ImportedSessionV4, ImportedSolveV4 } from '../data/imported-model';
import type { CaseProgress, StudyAttempt } from '../domain/types';
import { createImportEntityId, IMPORT_PARSER_VERSION } from './source-identity';
import { issue } from './shared';
import { duplicateAdvisoryIndex, possibleDuplicate, sessionProblem, solveProblem } from './planner';
import type { BuiltAppendPlan, PlanningSource } from './planner';
import type { ImportIssue } from './types';
import type { ImportChoice, ImportCompletionInput, ImportIdMapping, ImportPlanManifest, ImportPreviewDetails, ImportPreviewRow, ImportTarget } from './plan-types';

const equal=(a:unknown,b:unknown)=>canonicalText(a)===canonicalText(b);
const invalid=(code:string,message:string,recordKey:string|null=null):BuiltAppendPlan=>({kind:'invalid',issues:[issue(code,message,recordKey,'blocking')]});

/** Explicit completion of pending rows of one committed batch. It never revisits
 * included, already-present or excluded rows, never reclassifies committed sessions
 * and never recreates entities deleted after the original commit. The plan mutates
 * only record dispositions of the existing batch; sources and batch identity stay.
 */
export async function buildCompletionPlan(target:ImportTarget,source:PlanningSource,input:ImportCompletionInput,technical:{importedAt:string;nonce:string}):Promise<BuiltAppendPlan> {
  if(!Number.isSafeInteger(target.localRevision)||target.localRevision<0||!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).sort().join(',')!=='batchId,choices'||typeof input.batchId!=='string'||!Array.isArray(input.choices))return invalid('invalid-completion-input','Entrada de conclusão de lote inválida.');
  const baseline=preflightDataV4(target.data);
  await verifyImportSourcesV4(baseline.data);
  const parsed=source.parsed;
  const batch=baseline.data.imports.batches.find(b=>b.id===input.batchId);
  if(!batch)return invalid('unknown-batch','O lote indicado não existe no destino atual.');
  if(batch.duplicateOf!==null)return invalid('unsupported-duplicate-completion','Lotes de cópia intencional não admitem conclusão de pendências nesta versão.');
  if(batch.parserVersion!==IMPORT_PARSER_VERSION)return invalid('parser-divergence','O lote foi criado por outra versão do parser; uma nova prévia explícita é necessária.');
  if(batch.semanticSHA256!==source.semanticSHA256||batch.sourceId!=='src_'+source.rawSHA256)return invalid('source-mismatch','A fonte não corresponde aos bytes arquivados exatos do lote.');
  const expectedKeys=[
    ...parsed.sessions.map((_,i)=>'session/'+i),
    ...parsed.solves.map((_,i)=>'solve/'+i),
    ...parsed.auxiliary.map((_,i)=>'aux/'+i),
  ];
  if(batch.records.length!==expectedKeys.length||batch.records.some((r,i)=>r.key!==expectedKeys[i]||r.ordinal!==i))return invalid('receipt-structure','As linhas do lote não correspondem à fonte analisada.');
  const choices=new Map<string,ImportChoice>(),usedChoices=new Set<string>();
  for(const item of input.choices){
    if(!item||typeof item!=='object')return invalid('invalid-choice','Escolha inválida.');
    let key:string;
    switch(item.kind){
      case 'include-pending':case 'exclude':
        if(typeof item.recordKey!=='string'||Object.keys(item).sort().join(',')!=='kind,recordKey')return invalid('invalid-choice','Escolha inválida.');
        key='row:'+item.recordKey;break;
      case 'collision':
        if(typeof item.recordKey!=='string'||!['keep-existing','create-copy'].includes(item.action)||Object.keys(item).sort().join(',')!=='action,kind,recordKey')return invalid('invalid-choice','Escolha inválida.');
        key='collision:'+item.recordKey;break;
      case 'progress-field':
        if(typeof item.caseId!=='string'||!['favorite','status','note'].includes(item.field)||!['current','incoming'].includes(item.take)||Object.keys(item).sort().join(',')!=='caseId,field,kind,take')return invalid('invalid-choice','Escolha inválida.');
        key='progress:'+item.caseId+':'+item.field;break;
      default:return invalid('invalid-completion-choice','Somente include-pending, exclude, collision e progress-field valem na conclusão de lote.');
    }
    if(choices.has(key))return invalid('duplicate-choice','Escolhas repetidas para a mesma linha.');choices.set(key,item);
  }
  function choice(key:string){const found=choices.get(key);if(found)usedChoices.add(key);return found;}
  const targetDigest=(await digest(['nexus-cube/import-target/v1',target.localRevision,baseline.data])).slice(7);
  const current=structuredClone(baseline.data);
  const currentBatch=current.imports.batches.find(b=>b.id===input.batchId)!;
  const sessionsById=new Map(current.sessions.map(s=>[s.id,s])),solvesById=new Map(current.solves.map(s=>[s.id,s])),studyById=new Map(current.studyAttempts.map(s=>[s.id,s]));
  const advisoryKeys=duplicateAdvisoryIndex(baseline.data.solves,input.batchId);
  const rows:ImportPreviewRow[]=[],idMappings:ImportIdMapping[]=[],issues:ImportIssue[]=[],advisories:ImportIssue[]=[];
  const sessionMap=new Map<string,{id:string;mode:ImportedSessionV4['mode']}>();
  let transitions=0;
  const entityId=(entity:ImportIdMapping['entity'],key:string)=>createImportEntityId({semanticSHA256:source.semanticSHA256,entity,recordKey:key,occurrence:0});
  const copyId=async(entity:ImportIdMapping['entity'],key:string)=>{
    const identity=(await digest(['nexus-cube/import-copy/v1',source.semanticSHA256,technical.nonce])).slice(7);
    return createImportEntityId({semanticSHA256:identity,entity,recordKey:key,occurrence:0});
  };
  function keep(index:number,sourceKey:string){
    const record=currentBatch.records[index];
    rows.push({key:record.key,sourceKey,ordinal:record.ordinal,disposition:structuredClone(record.disposition)});
  }
  function transition(index:number,sourceKey:string,disposition:ImportRecordDispositionV4){
    const record=currentBatch.records[index];
    record.disposition=disposition;transitions++;
    rows.push({key:record.key,sourceKey,ordinal:record.ordinal,disposition:structuredClone(disposition)});
  }
  async function resolve(entity:ImportIdMapping['entity'],recordKey:string,sourceKey:string,originalId:string|null,incoming:unknown,existingValue:unknown,preferredId:string):Promise<{id:string;present:boolean}|null>{
    let id=preferredId,present=false,copied=false;
    if(existingValue!==undefined){
      if(equal(existingValue,incoming))present=true;
      else{
        const selected=choice('collision:'+recordKey);
        if(selected?.kind!=='collision'){
          keepPendingWithIssue(recordKey,sourceKey,'id-collision','Escolha manter o registro existente ou criar cópia.');return null;
        }
        if(selected.action==='keep-existing')present=true;
        else {id=await copyId(entity,recordKey);copied=true;}
      }
    }
    idMappings.push({entity,recordKey,sourceKey,originalId,targetId:id,reason:copied?'collision-remap':originalId===id?'preserved':'generated'});
    return {id,present};
  }
  function keepPendingWithIssue(recordKey:string,sourceKey:string,code:string,message:string){
    const index=expectedKeys.indexOf(recordKey);
    const record=currentBatch.records[index];
    rows.push({key:record.key,sourceKey,ordinal:record.ordinal,disposition:structuredClone(record.disposition)});
    issues.push(issue(code,message,recordKey));
  }
  for(let i=0;i<parsed.sessions.length;i++){
    const s=parsed.sessions[i],index=i,record=currentBatch.records[index],key=record.key;
    if(record.disposition.kind!=='pending'){
      if((record.disposition.kind==='included'||record.disposition.kind==='already-present')){
        const existing=sessionsById.get(record.disposition.targetId);
        if(existing)sessionMap.set(s.sourceKey,{id:existing.id,mode:existing.mode});
      }
      keep(index,s.sourceKey);continue;
    }
    const selected=choice('row:'+key);
    if(selected?.kind==='exclude'){transition(index,s.sourceKey,{kind:'excluded',reason:'user-confirmed'});continue;}
    if(selected?.kind!=='include-pending'){keep(index,s.sourceKey);continue;}
    if(sessionProblem(s,parsed.format))return invalid('unresolvable-row','A linha não tem semântica comprovada para ingresso; permanece pendente.',key);
    const originalId=parsed.format==='nexus-backup'?s.sourceKey:null;
    const preferredId=originalId??await entityId('session',key);
    const old=sessionsById.get(preferredId);
    const comparable=(item:{name:string|null;createdAt:string|null;mode:ImportedSessionV4['mode']})=>({name:item.name,createdAt:item.createdAt,mode:item.mode});
    const resolved=await resolve('session',key,s.sourceKey,originalId,comparable(s),old?comparable(old):undefined,preferredId);
    if(!resolved)continue;
    if(!resolved.present){
      if(sessionsById.has(resolved.id))return invalid('generated-id-collision','Colisão de identificador gerado.');
      const session:ImportedSessionV4={kind:'imported',id:resolved.id,name:s.name,createdAt:s.createdAt,mode:s.mode,importRef:{batchId:batch.id,recordKey:key}};
      current.sessions.push(session);sessionsById.set(session.id,session);
    }
    const actual=sessionsById.get(resolved.id)!;
    sessionMap.set(s.sourceKey,{id:resolved.id,mode:actual.mode});
    transition(index,s.sourceKey,{kind:resolved.present?'already-present':'included',entity:'session',targetId:resolved.id});
  }
  for(let i=0;i<parsed.solves.length;i++){
    const s=parsed.solves[i],index=parsed.sessions.length+i,record=currentBatch.records[index],key=record.key;
    if(record.disposition.kind!=='pending'){keep(index,s.sourceKey);continue;}
    const selected=choice('row:'+key);
    if(selected?.kind==='exclude'){transition(index,s.sourceKey,{kind:'excluded',reason:'user-confirmed'});continue;}
    if(selected?.kind!=='include-pending'){keep(index,s.sourceKey);continue;}
    if(solveProblem(s,parsed.format))return invalid('unresolvable-row','A linha não tem semântica comprovada para ingresso; permanece pendente.',key);
    const parent=s.sourceSessionKey===null?undefined:sessionMap.get(s.sourceSessionKey);
    // Committed parents keep their current mode; a pending solve never inherits a
    // classification decided after its preview, so a mismatch stays unresolvable.
    if(!parent||parent.mode!==s.mode)return invalid('unresolvable-row','A linha não tem sessão de destino compatível; permanece pendente.',key);
    if(s.rawMs===null||s.penalty===null||s.puzzle!=='333')return invalid('unresolvable-row','A linha não tem semântica comprovada para ingresso; permanece pendente.',key);
    const originalId=parsed.format==='nexus-backup'?s.sourceKey:null;
    const preferredId=originalId??await entityId('solve',key);
    const old=solvesById.get(preferredId);
    const incoming={sessionId:parent.id,mode:s.mode,rawMs:s.rawMs,penalty:s.penalty,createdAt:s.createdAt,note:s.note,scramble:s.scramble,captureSource:s.origin.captureSource};
    const comparable=old?{sessionId:old.sessionId,mode:old.mode,rawMs:old.rawMs,penalty:old.penalty,createdAt:old.createdAt,note:old.note,scramble:old.scramble,captureSource:old.kind==='imported'?old.captureSource:old.source}:undefined;
    const resolved=await resolve('solve',key,s.sourceKey,originalId,incoming,comparable,preferredId);
    if(!resolved)continue;
    if(!resolved.present){
      if(solvesById.has(resolved.id))return invalid('generated-id-collision','Colisão de identificador gerado.');
      const solve:ImportedSolveV4={kind:'imported',id:resolved.id,...incoming,puzzle:'333',source:'imported',scrambleNotation:s.scramble===null?'absent':parsed.format==='nexus-backup'?'nexus':'external-unverified',importRef:{batchId:batch.id,recordKey:key}};
      current.solves.push(solve);solvesById.set(solve.id,solve);
      if(possibleDuplicate(advisoryKeys,incoming))advisories.push(issue('possible-duplicate','Já existe no destino um registro com o mesmo tempo, penalidade e data ou scramble; revise antes de confirmar e exclua a linha se for duplicata.',key,'informational'));
    }
    transition(index,s.sourceKey,{kind:resolved.present?'already-present':'included',entity:'solve',targetId:resolved.id});
  }
  for(let i=0;i<parsed.auxiliary.length;i++){
    const row=parsed.auxiliary[i],index=parsed.sessions.length+parsed.solves.length+i,record=currentBatch.records[index],key=record.key;
    if(record.disposition.kind!=='pending'){keep(index,row.sourceKey);continue;}
    const selected=choice('row:'+key);
    if(selected?.kind==='exclude'){transition(index,row.sourceKey,{kind:'excluded',reason:'user-confirmed'});continue;}
    if(selected?.kind!=='include-pending'){keep(index,row.sourceKey);continue;}
    if(!parsed.nexusData||!(row.table==='studyAttempts'||row.table==='progress'))return invalid('unresolvable-row','A linha não tem semântica comprovada para ingresso; permanece pendente.',key);
    if(row.table==='studyAttempts'){
      const sourceIndex=Number(row.sourceKey.slice('studyAttempts/'.length)),incoming=parsed.nexusData.studyAttempts[sourceIndex];
      if(!incoming)return invalid('invalid-study-source','Registro de estudo ausente na fonte.');
      const old=studyById.get(incoming.id);
      const withoutId=({id:_,...value}:StudyAttempt)=>value;
      const resolved=await resolve('study-attempt',key,row.sourceKey,incoming.id,withoutId(incoming),old?withoutId(old):undefined,incoming.id);
      if(!resolved)continue;
      if(!resolved.present){
        if(studyById.has(resolved.id))return invalid('generated-id-collision','Colisão de identificador gerado.');
        const attempt={...incoming,id:resolved.id};current.studyAttempts.push(attempt);studyById.set(attempt.id,attempt);
      }
      transition(index,row.sourceKey,{kind:resolved.present?'already-present':'included',entity:'study-attempt',targetId:resolved.id});
    }else{
      const caseId=row.sourceKey.slice('progress/'.length),incoming=parsed.nexusData.progress[caseId],old=current.progress[caseId];
      if(!incoming)return invalid('invalid-progress-source','Registro de progresso ausente na fonte.');
      const next:CaseProgress=structuredClone(incoming);let unresolved=false;
      if(old)for(const field of ['favorite','status','note'] as const)if(old[field]!==incoming[field]){
        const selected=choice('progress:'+caseId+':'+field);
        if(selected?.kind!=='progress-field'){unresolved=true;continue;}
        if(selected.take==='current')Object.assign(next,{[field]:old[field]});
      }
      if(unresolved){keepPendingWithIssue(key,row.sourceKey,'progress-collision','Escolha o valor atual ou recebido para cada campo divergente.');continue;}
      const present=!!old&&equal(old,next);current.progress[caseId]=next;
      idMappings.push({entity:'progress',recordKey:key,sourceKey:row.sourceKey,originalId:caseId,targetId:caseId,reason:'preserved'});
      transition(index,row.sourceKey,{kind:present?'already-present':'included',entity:'progress',targetId:caseId});
    }
  }
  if(usedChoices.size!==choices.size)return invalid('unused-or-inapplicable-choice','Há escolhas que não se aplicam a linhas pendentes deste lote.');
  const counts:ImportPreviewDetails['counts']={included:0,alreadyPresent:0,pending:0,excluded:0,sessions:0,solves:0,study:0,plus2:0,dnf:0,twoHanded:0,oneHanded:0,unclassified:0,missingDate:0};
  for(const row of rows){
    const d=row.disposition;
    if(d.kind==='pending'){counts.pending++;continue;}if(d.kind==='excluded'){counts.excluded++;continue;}
    if(d.kind==='already-present'){counts.alreadyPresent++;continue;}counts.included++;
    if(d.entity==='session')counts.sessions++;if(d.entity==='study-attempt')counts.study++;
    if(d.entity==='solve'){
      counts.solves++;
      // A receipt may reference a solve deleted after commit; stats count entities only.
      const s=solvesById.get(d.targetId);if(!s)continue;
      if(s.penalty==='+2')counts.plus2++;if(s.penalty==='DNF')counts.dnf++;
      if(s.mode==='two-handed')counts.twoHanded++;else if(s.mode==='one-handed')counts.oneHanded++;else counts.unclassified++;
      if(s.createdAt===null)counts.missingDate++;
    }
  }
  const notices=parsed.issues.map(item=>({...item,severity:'informational' as const}));
  const details:ImportPreviewDetails={strategy:'append',sourceDigest:source.semanticSHA256,targetDigest,planDigest:null,rows,idMappings,issues:[...notices,...advisories,...issues],decisions:[],counts,sizes:null};
  if(issues.length)return {kind:'needs-decisions',details};
  if(transitions===0){
    // A batch with pending rows awaits a choice; only a fully settled batch is invalid.
    if(counts.pending>0){
      details.issues=[...details.issues,issue('no-effective-completion','Escolha incluir ou excluir ao menos uma linha pendente do lote.')];
      return {kind:'needs-decisions',details};
    }
    return invalid('no-effective-completion','O lote não tem linhas pendentes para completar.');
  }
  const records=rows.map(({sourceKey:_,...row})=>row);
  const normalizedInput={choices:input.choices,duplicateOf:null};
  const planSHA256=(await digest(['nexus-cube/import-plan/v1',source.semanticSHA256,source.rawSHA256,targetDigest,target.localRevision,normalizedInput,records,idMappings,technical.importedAt,technical.nonce])).slice(7);
  currentBatch.records=structuredClone(records);
  let final;
  try{final=preflightDataV4(current);}catch(error){
    if(error instanceof DataV4LimitError)return {kind:'limit-exceeded',issues:[issue('projection-limit','A projeção excede um limite V4. Nenhum dado foi descartado.',null,'blocking')]};
    return invalid('invalid-projection','Snapshot não passou pela validação V4.');
  }
  await verifyImportSourcesV4(final.data);
  details.planDigest=planSHA256;details.sizes={snapshotBytes:final.snapshotBytes,backupBytes:final.backupBytes,sourceBytes:source.bytes.length,archiveBytes:final.importsBytes};
  const planId='imp_'+planSHA256;
  const manifest:ImportPlanManifest={protocolVersion:1,domainVersion:4,canonicalVersion:1,parserVersion:IMPORT_PARSER_VERSION,planId,rawSHA256:source.rawSHA256,semanticSHA256:source.semanticSHA256,targetDigest,planSHA256,expectedLocalRevision:target.localRevision,strategy:'append',choices:input.choices,duplicateOf:null,completesBatchId:batch.id,importedAt:technical.importedAt,nonce:technical.nonce,idMappings,records};
  const frozenBatch=final.data.imports.batches.find(b=>b.id===input.batchId)!;
  return {kind:'ready',details,plan:{mode:'complete',planId,expectedJSON:baseline.snapshotJSON,expectedRevision:target.localRevision,data:final.data,batch:structuredClone(frozenBatch),manifest}};
}
