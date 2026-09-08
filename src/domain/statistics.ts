import type { AppData, AverageSize, Metric, ModeRecords, ScopedChartResult, Solve, SolveMode, SolveScope, Statistics, StoredSolveMode } from './types';
import { effectiveMs } from './timer';
import { assertSolveMode, assertStoredSolveMode, selectSessions, selectSolves } from './modes';
export const AVERAGE_SIZES: readonly AverageSize[]=[5,12,50,100];
export const AVERAGE_TRIM: Record<AverageSize,number>={5:1,12:1,50:3,100:5};
const missing=():Metric=>({kind:'insufficient'});
const value=(ms: number):Metric=>Number.isFinite(ms)?{kind:'value',ms}:{kind:'dnf'};
export function chronological(solves: readonly Solve[]): Solve[] {return [...solves].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));}
function windowAverage(solves: readonly Solve[],size: AverageSize): Metric {if(solves.length<size)return missing();const trim=AVERAGE_TRIM[size];if(trim===undefined)throw new Error('Tamanho de media invalido.');const times=solves.slice(-size).map(s=>effectiveMs(s)??Infinity).sort((a,b)=>a-b).slice(trim,size-trim);return value(times.reduce((a,b)=>a+b,0)/times.length);}
function assertSingleMode(solves: readonly Solve[]): void {for(const solve of solves)assertStoredSolveMode(solve.mode);if(new Set(solves.map(s=>s.mode)).size>1)throw new Error('Não misture modalidades nas estatísticas.');}
export function average(solves: readonly Solve[],size: AverageSize): Metric {assertSingleMode(solves);return windowAverage(chronological(solves),size);}
export function bestMetric(metrics: readonly Metric[]): Metric {const nums=metrics.filter((m):m is {kind:'value';ms:number}=>m.kind==='value');return nums.length?value(nums.reduce((best,m)=>Math.min(best,m.ms),Infinity)):metrics.some(m=>m.kind==='dnf')?{kind:'dnf'}:missing();}
function summarize(solves: readonly Solve[],windows=true): Statistics {
  const sorted=chronological(solves), times=sorted.map(s=>effectiveMs(s)??Infinity), averages={} as Record<AverageSize,Metric>,bestAverages={} as Record<AverageSize,Metric>;
  for(const n of AVERAGE_SIZES) {averages[n]=windows?windowAverage(sorted,n):missing();const metrics:Metric[]=[];if(windows)for(let i=n;i<=sorted.length;i++) metrics.push(windowAverage(sorted.slice(i-n,i),n));bestAverages[n]=bestMetric(metrics);}
  return {count:sorted.length,dnfCount:sorted.filter(s=>s.penalty==='DNF').length,totalRawMs:sorted.reduce((a,s)=>a+s.rawMs,0),last:times.length?value(times.at(-1)!):missing(),best:times.length?value(times.reduce((a,b)=>Math.min(a,b),Infinity)):missing(),mean:times.length?value(times.reduce((a,b)=>a+b,0)/times.length):missing(),averages,bestAverages};
}
export function statistics(solves: readonly Solve[]): Statistics {assertSingleMode(solves);return summarize(solves);}
export function globalStatistics(data: AppData,mode: StoredSolveMode): Statistics {
  const solves=selectSolves(data,{kind:'mode',mode}),result=summarize(solves,false);
  const perSession=selectSessions(data,mode).map(s=>statistics(solves.filter(v=>v.sessionId===s.id)));
  for(const n of AVERAGE_SIZES)result.bestAverages[n]=bestMetric(perSession.map(s=>s.bestAverages[n]));
  return result;
}
export function sessionStatistics(data: AppData,sessionId:string): Statistics {
  const session=data.sessions.find(s=>s.id===sessionId);if(!session)throw new Error('Sessão não encontrada.');
  return statistics(selectSolves(data,{kind:'session',sessionId,mode:session.mode}));
}
export function scopedStatistics(data: AppData,scope:SolveScope): Statistics {
  const solves=selectSolves(data,scope);
  return scope.kind==='session'?statistics(solves):globalStatistics(data,scope.mode);
}
export function globalRecords(data: AppData,mode:SolveMode): ModeRecords {
  assertSolveMode(mode);const result=globalStatistics(data,mode);return {mode,bestSingle:result.best,bestAverages:result.bestAverages};
}
export function chartData(solves: readonly Solve[]): {id:string;index:number;single:number|null;ao5:number|null}[] {assertSingleMode(solves);const sorted=chronological(solves);return sorted.map((s,i)=>{const a=windowAverage(sorted.slice(Math.max(0,i-4),i+1),5);return {id:s.id,index:i+1,single:effectiveMs(s),ao5:a.kind==='value'?a.ms:null};});}
export function scopedChartData(data:AppData,scope:SolveScope):ScopedChartResult {
  const solves=selectSolves(data,scope);
  const sessions=selectSessions(data,scope.mode).filter(s=>scope.kind==='mode'||s.id===scope.sessionId);
  return {scope:{...scope},mode:scope.mode,series:sessions.map(session=>{
    const ordered=chronological(solves.filter(s=>s.sessionId===session.id));
    return {sessionId:session.id,sessionName:session.name,mode:session.mode,points:chartData(ordered).map((point,i)=>({...point,createdAt:ordered[i].createdAt}))};
  })};
}
