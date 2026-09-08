import type { AppData, SessionClassificationPreview, Solve, SolveMode } from '../domain/types';
import { validateData } from './store';
import { assertSolveMode } from '../domain/modes';
function requireSession(data: AppData,id: string): void {if(!data.sessions.some(s=>s.id===id))throw new Error('Sessao nao encontrada.');}
function name(value: string): string {if(typeof value!=='string'||!value.trim()||value.trim().length>100)throw new Error('Nome deve ter entre 1 e 100 caracteres.');return value.trim();}
export function createSession(data: AppData,sessionName: string,mode:SolveMode): AppData {assertSolveMode(mode);const session={id:crypto.randomUUID(),name:name(sessionName),createdAt:new Date().toISOString(),mode};return validateData({...data,sessions:[...data.sessions,session],activeSessionId:session.id});}
export function renameSession(data: AppData,id: string,sessionName: string): AppData {requireSession(data,id);const n=name(sessionName);return {...data,sessions:data.sessions.map(s=>s.id===id?{...s,name:n}:s)};}
export function setActiveSession(data: AppData,id: string): AppData {requireSession(data,id);return {...data,activeSessionId:id};}
export function deleteSession(data: AppData,id: string): AppData {requireSession(data,id);const mode=data.sessions.find(s=>s.id===id)!.mode;const sessions=data.sessions.filter(s=>s.id!==id);return validateData({...data,sessions,solves:data.solves.filter(s=>s.sessionId!==id),activeSessionId:data.activeSessionId===id?(sessions.find(s=>s.mode===mode)?.id??null):data.activeSessionId});}
export function addSolve(data: AppData,input: Omit<Solve,'id'|'createdAt'|'note'|'mode'> & {mode:SolveMode;note?:string;createdAt?:string}): AppData {assertSolveMode(input.mode);const solve:Solve={...input,id:crypto.randomUUID(),createdAt:input.createdAt??new Date().toISOString(),note:input.note??''};return validateData({...data,solves:[...data.solves,solve]});}
export function updateSolve(data: AppData,id: string,patch: Partial<Pick<Solve,'rawMs'|'penalty'|'note'>>): AppData {if(!data.solves.some(s=>s.id===id))throw new Error('Solve nao encontrado.');if(Object.keys(patch).some(k=>!['rawMs','penalty','note'].includes(k)))throw new Error('Campo de solve imutavel.');return validateData({...data,solves:data.solves.map(s=>s.id===id?{...s,...patch}:s)});}
export function deleteSolve(data: AppData,id: string): {data:AppData;removed:Solve} {const removed=data.solves.find(s=>s.id===id);if(!removed)throw new Error('Solve nao encontrado.');return {data:{...data,solves:data.solves.filter(s=>s.id!==id)},removed};}
export function restoreSolve(data: AppData,solve: Solve): AppData {requireSession(data,solve.sessionId);if(data.solves.some(s=>s.id===solve.id))throw new Error('Solve ja existe.');return validateData({...data,solves:[...data.solves,solve].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt))});}

export function previewSessionClassification(data:AppData,sessionId:string,targetMode:SolveMode):SessionClassificationPreview {
  assertSolveMode(targetMode);
  const checked=validateData(data),session=checked.sessions.find(s=>s.id===sessionId);
  if(!session)throw new Error('Sessão não encontrada.');
  if(session.mode!==null)throw new Error('Somente sessões não classificadas podem ser classificadas.');
  const solves=checked.solves.filter(s=>s.sessionId===sessionId);
  return Object.freeze({sessionId,sessionName:session.name,fromMode:null,targetMode,solveIds:Object.freeze(solves.map(s=>s.id)),solveCount:solves.length,plus2Count:solves.filter(s=>s.penalty==='+2').length,dnfCount:solves.filter(s=>s.penalty==='DNF').length,isActiveSession:checked.activeSessionId===sessionId,sourceSnapshot:JSON.stringify({session,solves,targetMode})});
}

export function applySessionClassification(data:AppData,preview:SessionClassificationPreview):AppData {
  if(!preview||typeof preview!=='object')throw new Error('Prévia de classificação inválida.');
  const fresh=previewSessionClassification(data,preview.sessionId,preview.targetMode);
  const fields=Object.keys(fresh) as (keyof SessionClassificationPreview)[];
  if(Object.keys(preview).length!==fields.length||fields.some(key=>!Object.hasOwn(preview,key))||typeof preview.isActiveSession!=='boolean'||fields.some(key=>key!=='isActiveSession'&&JSON.stringify(preview[key])!==JSON.stringify(fresh[key])))throw new Error('A sessão mudou ou a prévia é inválida. Revise a classificação antes de confirmar.');
  // The UI confirms homogeneity; this pure mutation does not persist or change selection.
  return validateData({...data,sessions:data.sessions.map(s=>s.id===fresh.sessionId?{...s,mode:fresh.targetMode}:s),solves:data.solves.map(s=>s.sessionId===fresh.sessionId?{...s,mode:fresh.targetMode}:s)});
}
