import type { Metric, Penalty, Solve } from './types';
export const MAX_TIME_MS = 7 * 24 * 60 * 60 * 1000;
export function assertTime(ms: number): void { if(!Number.isFinite(ms)||ms<0||ms>MAX_TIME_MS) throw new Error('Tempo invalido (limite: sete dias).'); }
export function effectiveMs(solve: Pick<Solve,'rawMs'|'penalty'>): number|null { assertTime(solve.rawMs); if(!['none','+2','DNF'].includes(solve.penalty))throw new Error('Penalidade invalida.');return solve.penalty==='DNF'?null:solve.rawMs+(solve.penalty==='+2'?2000:0); }
export function inspectionPenalty(elapsedMs: number): Penalty { assertTime(elapsedMs);return elapsedMs>=17000?'DNF':elapsedMs>=15000?'+2':'none'; }
export function inspectionCue(elapsedMs: number): 0|8|12 { assertTime(elapsedMs); return elapsedMs>=12000?12:elapsedMs>=8000?8:0; }
export function parseManualTime(text: string): number { const t=text.trim().replace(',','.'); if(!/^(?:\d+:)?\d+(?:\.\d{1,3})?$/.test(t)) throw new Error('Use segundos ou m:ss, com ate 3 casas decimais.'); const parts=t.split(':');if(parts.length===2&&Number(parts[1])>=60)throw new Error('Segundos devem ser menores que 60 em m:ss.'); const ms=Math.round((parts.length===2?Number(parts[0])*60+Number(parts[1]):Number(parts[0]))*1000);assertTime(ms);return ms; }
export function formatTime(ms: number|null): string { if(ms===null)return 'DNF'; if(!Number.isFinite(ms)||ms<0)return '...';const cs=Math.floor(ms/10+1e-7),seconds=Math.floor(cs/100),fraction=String(cs%100).padStart(2,'0');return seconds>=60?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')},${fraction}`:`${seconds},${fraction}`; }
export function formatMetric(metric: Metric): string { return metric.kind==='value'?formatTime(metric.ms):metric.kind==='dnf'?'DNF':'...'; }
