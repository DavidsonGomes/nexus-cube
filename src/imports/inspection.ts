import { inspectImportBytes } from './bytes';
import { MAX_IMPORT_SOURCE_BYTES } from './shared';
import { IMPORT_PARSER_VERSION, semanticSourceSHA256 } from './source-identity';
import { canonicalText } from '../cloud/codec';
import { DataV4LimitError, preflightDataV4 } from '../data/imported-model';
import { buildAppendPlan } from './planner';
import type { BuiltAppendPlan, FrozenImportPlan, PlanningSource } from './planner';
import { buildCompletionPlan } from './completion';
import type { ImportPlanHandle } from './plan-types';
import { issue } from './shared';
import { parseCubeTimerProjection } from './cube-timer';
import type { SQLiteReader } from './sqlite-client';
import type { SQLiteReadLimits } from './sqlite-reader';
import type { ImportInspectionService, ImportParseResult, ImportSourceHandle } from './types';

interface SourceEntry { bytes:Uint8Array; result:ImportParseResult;rawSHA256:string;semanticSHA256:string|null }

/** File custody and parsing only. No persistent snapshot, identity or consent.
 * Retention counts exact source bytes, including inspections awaiting SHA256.
 * This is not a bound on total JS heap, parsing time or WebCrypto allocations.
 */
export function createImportInspectionService(options: {maxRetainedSourceBytes?:number;now?:()=>string;nonce?:()=>string;sqliteReader?:SQLiteReader;sqliteLimits?:SQLiteReadLimits} = {}):ImportInspectionService {
  const budget = options.maxRetainedSourceBytes ?? MAX_IMPORT_SOURCE_BYTES;
  if (!Number.isSafeInteger(budget) || budget < 0 || budget > MAX_IMPORT_SOURCE_BYTES) throw new Error('Orçamento de fontes inválido.');
  const sources = new Map<ImportSourceHandle,SourceEntry>();
  const plans = new Map<ImportPlanHandle,{source:ImportSourceHandle;plan:FrozenImportPlan}>();
  const now=options.now??(()=>new Date().toISOString()),nonce=options.nonce??(()=>crypto.randomUUID());
  const sqliteReader=options.sqliteReader,sqliteLimits=options.sqliteLimits?{...options.sqliteLimits}:undefined;
  if(!!sqliteReader!==!!sqliteLimits)throw new Error('Leitor SQLite exige limites explícitos.');
  let previewGeneration=0;
  let retainedBytes = 0, closed = false;
  async function runPreview(target:Parameters<ImportInspectionService['previewAppend']>[0],handle:ImportSourceHandle,build:(target:Parameters<ImportInspectionService['previewAppend']>[0],source:PlanningSource,technical:{importedAt:string;nonce:string})=>Promise<BuiltAppendPlan>):Promise<Awaited<ReturnType<ImportInspectionService['previewAppend']>>> {
    const source=sources.get(handle);
    if(closed||!source||source.result.kind!=='parsed'||!source.semanticSHA256)return {kind:'source-unavailable',issues:[issue('source-unavailable','A fonte não está disponível para prévia.',null,'blocking')]};
    const generation=++previewGeneration;plans.clear();
    try {
      // Snapshot and choices are captured before the first await in preparation.
      const capturedTarget=structuredClone(target);
      const technical={importedAt:now(),nonce:nonce()};
      if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(technical.importedAt)||new Date(technical.importedAt).toISOString()!==technical.importedAt||typeof technical.nonce!=='string'||technical.nonce.length<1||technical.nonce.length>100)throw new Error('Invalid technical metadata');
      const built=await build(capturedTarget,{bytes:source.bytes,parsed:source.result,rawSHA256:source.rawSHA256,semanticSHA256:source.semanticSHA256},technical);
      if(closed||sources.get(handle)!==source||generation!==previewGeneration)return {kind:'source-unavailable',issues:[issue('preview-superseded','Fonte liberada ou prévia substituída.',null,'blocking')]};
      if(built.kind==='ready'){
        const plan=Object.freeze({}) as ImportPlanHandle;
        plans.set(plan,{source:handle,plan:built.plan});
        return {...structuredClone(built.details),kind:'ready',plan};
      }
      if(built.kind==='needs-decisions')return {...built.details,kind:'needs-decisions',plan:null};
      return built;
    }catch(error){
      if(error instanceof DataV4LimitError)return {kind:'limit-exceeded',issues:[issue('preview-limit','O alvo ou a projeção excede um limite V4. Nenhum dado foi descartado.',null,'blocking')]};
      return {kind:'invalid',issues:[issue('invalid-preview','Não foi possível validar a fonte, o alvo ou as escolhas.',null,'blocking')]};
    }
  }
  return {
    async inspect(source, options = {}) {
      const signal = options.signal;
      if (closed) return {kind:'closed'};
      if (signal?.aborted) return {kind:'cancelled'};
      if (!(source instanceof Uint8Array) || source.byteLength === 0 || source.byteLength > MAX_IMPORT_SOURCE_BYTES) return {kind:'source-limit'};
      if (source.byteLength > budget - retainedBytes) return {kind:'retention-limit'};
      // SharedArrayBuffer permits concurrent writes while copying. Do not promise
      // an exact selected snapshot for such input.
      if (typeof SharedArrayBuffer !== 'undefined' && source.buffer instanceof SharedArrayBuffer) return {kind:'source-limit'};
      let bytes:Uint8Array<ArrayBuffer>;
      try { bytes = new Uint8Array(source); } catch { return {kind:'inspection-error'}; }
      retainedBytes += bytes.byteLength;
      let stored = false;
      try {
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        if (closed) return {kind:'closed'};
        if (signal?.aborted) return {kind:'cancelled'};
        // Existing synchronous parsers cannot be interrupted mid-call. A future
        // worker must provide termination before advertising immediate cancellation.
        let result = inspectImportBytes(bytes);
        if(result.kind==='requires-sqlite-reader'&&sqliteReader&&sqliteLimits){
          const read=await sqliteReader.read(bytes,{limits:sqliteLimits,signal});
          if(closed)return {kind:'closed'};
          if(signal?.aborted||read.kind==='cancelled')return {kind:'cancelled'};
          result=read.kind==='projection'?parseCubeTimerProjection(read.projection):{kind:'invalid',issues:[issue('sqlite-'+read.kind,'O leitor SQLite não concluiu uma projeção válida; os bytes originais permanecem disponíveis.',null,'blocking')]};
        }
        const semanticSHA256 = result.kind === 'parsed' ? await semanticSourceSHA256(result) : null;
        if (closed) return {kind:'closed'};
        if (signal?.aborted) return {kind:'cancelled'};
        const publicResult = structuredClone(result);
        const handle = Object.freeze({}) as ImportSourceHandle;
        const rawSHA256 = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2,'0')).join('');
        sources.set(handle,{bytes,result,rawSHA256,semanticSHA256});
        stored = true;
        return {kind:'inspected',sourceHandle:handle,byteLength:bytes.byteLength,rawSHA256,semanticSHA256,parserVersion:IMPORT_PARSER_VERSION,result:publicResult};
      } catch { return {kind:'inspection-error'}; }
      finally { if (!stored) retainedBytes -= bytes.byteLength; }
    },
    readSourceBytes(handle) { const entry = sources.get(handle); return entry ? new Uint8Array(entry.bytes) : null; },
    readParseResult(handle) { const entry = sources.get(handle); return entry ? structuredClone(entry.result) : null; },
    async previewAppend(target,handle,input) {
      return runPreview(target,handle,(capturedTarget,planningSource,technical)=>buildAppendPlan(capturedTarget,planningSource,structuredClone(input),technical));
    },
    async previewCompletePending(target,handle,input) {
      return runPreview(target,handle,(capturedTarget,planningSource,technical)=>buildCompletionPlan(capturedTarget,planningSource,structuredClone(input),technical));
    },
    applyPlan(target,handle) {
      const registered=plans.get(handle);
      if(closed||!registered||!sources.has(registered.source))return {kind:'invalid',issues:[issue('invalid-plan','Plano indisponível nesta instância.',null,'blocking')]};
      try{
        if(!Number.isSafeInteger(target.localRevision)||target.localRevision<0)throw new Error('Invalid revision');
        const current=preflightDataV4(target.data),plan=registered.plan;
        const receipt=current.data.imports.batches.find(batch=>batch.id===plan.batch.id);
        const sameArchive=()=>{
          const source=current.data.imports.sources.find(source=>source.id===plan.batch.sourceId);
          const expected=plan.data.imports.sources.find(source=>source.id===plan.batch.sourceId);
          return canonicalText(source??null)===canonicalText(expected??null);
        };
        if(plan.mode==='complete'){
          // A completion replays against its own updated receipt; the pre-completion
          // plan of the same batch stops matching and requires a fresh preview.
          if(receipt&&canonicalText(receipt)===canonicalText(plan.batch)){
            if(!sameArchive())return {kind:'invalid',issues:[issue('receipt-mismatch','Recibo divergente do plano congelado.',null,'blocking')]};
            return {kind:'already-applied',data:structuredClone(current.data),planId:plan.planId};
          }
          if(!receipt)return {kind:'invalid',issues:[issue('receipt-missing','O lote a completar não existe mais no destino.',null,'blocking')]};
          if(target.localRevision!==plan.expectedRevision||current.snapshotJSON!==plan.expectedJSON)return {kind:'stale',issues:[issue('stale-target','O destino mudou; gere uma nova prévia.',null,'blocking')]};
          return {kind:'applied',data:preflightDataV4(plan.data).data,planId:plan.planId};
        }
        if(receipt){
          if(canonicalText(receipt)!==canonicalText(plan.batch)||!sameArchive())return {kind:'invalid',issues:[issue('receipt-mismatch','Recibo divergente do plano congelado.',null,'blocking')]};
          return {kind:'already-applied',data:structuredClone(current.data),planId:plan.planId};
        }
        if(target.localRevision!==plan.expectedRevision||current.snapshotJSON!==plan.expectedJSON)return {kind:'stale',issues:[issue('stale-target','O destino mudou; gere uma nova prévia.',null,'blocking')]};
        return {kind:'applied',data:preflightDataV4(plan.data).data,planId:plan.planId};
      }catch(error){
        if(error instanceof DataV4LimitError)return {kind:'limit-exceeded',issues:[issue('projection-limit','O snapshot excede um limite V4. Nenhum dado foi descartado.',null,'blocking')]};
        return {kind:'invalid',issues:[issue('invalid-projection','Snapshot ou plano não passou pela validação V4.',null,'blocking')]};
      }
    },
    releasePlan(handle) {return plans.delete(handle);},
    readPlanManifest(handle) {const entry=plans.get(handle);return entry?structuredClone(entry.plan.manifest):null;},
    releaseSource(handle) {
      const entry = sources.get(handle);
      if (!entry) return false;
      sources.delete(handle);
      for(const [plan,entry] of plans)if(entry.source===handle)plans.delete(plan);
      retainedBytes -= entry.bytes.byteLength; return true;
    },
    dispose() {
      closed = true;
      sqliteReader?.dispose();
      previewGeneration++;plans.clear();
      for (const entry of sources.values()) retainedBytes -= entry.bytes.byteLength;
      sources.clear();
    },
  };
}
