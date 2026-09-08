import { getCase } from './catalog';
import type { AlgorithmCase, AppData, CaseProgress, StudyAttempt } from './types';
import { assertTime } from './timer';
export function newId(): string { return crypto.randomUUID(); }
export function drawStudyCase<T>(cases: readonly T[]): T {if(!cases.length)throw new Error('Selecione pelo menos um caso.');const n=cases.length,limit=Math.floor(0x100000000/n)*n;const b=new Uint32Array(1);do{crypto.getRandomValues(b);}while(b[0]>=limit);return cases[b[0]%n];}
export function updateCaseProgress(data: AppData, caseId: string, patch: Partial<Omit<CaseProgress,'caseId'>>): AppData {
  getCase(caseId); const progress={...(data.progress[caseId]??{caseId,favorite:false,status:'new' as const,note:''}),...patch};
  if(typeof progress.favorite!=='boolean'||!['new','learning','mastered'].includes(progress.status)||typeof progress.note!=='string'||progress.note.length>10000)throw new Error('Progresso invalido.');
  return {...data,progress:{...data.progress,[caseId]:progress}};
}
export function recordStudyAttempt(data: AppData,input: Omit<StudyAttempt,'id'|'createdAt'>): AppData {getCase(input.caseId);if(!['again','good'].includes(input.recognition)||!['again','good'].includes(input.execution))throw new Error('Autoavaliacao invalida.');if(input.durationMs!==null)assertTime(input.durationMs);return {...data,studyAttempts:[...data.studyAttempts,{...input,id:newId(),createdAt:new Date().toISOString()}]};}
