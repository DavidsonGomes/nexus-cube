import type {ScopedChartResult} from '../domain';
import {formatTime} from '../domain';
import {modeLabel} from './ModePicker';
export default function HistoryChart({chart}:{chart:ScopedChartResult}) {
 const series=chart.series.filter(s=>s.points.length);
 return <section className="panel chart-panel"><div className="panel-heading"><h2>Evolução · {modeLabel(chart.mode)}</h2><span className="muted small">● Single · ○ ao5</span></div>{series.length?series.map(series=>{
  const max=Math.max(1000,...series.points.flatMap(p=>[p.single,p.ao5]).filter((v):v is number=>v!==null))*1.15;
  const x=(index:number)=>40+index/Math.max(1,series.points.length-1)*820;
  const y=(value:number)=>175-value/max*140;
  return <div className="chart-series" key={series.sessionId}><h3>{series.sessionName}</h3><svg viewBox="0 0 900 210" role="img" aria-label={`Tempos e média de cinco da sessão ${series.sessionName}, ${modeLabel(series.mode)}`}>
   {[0,1,2,3].map(i=><g key={i}><line x1="40" x2="880" y1={35+i*46.67} y2={35+i*46.67} stroke="var(--border)"/><text x="40" y={29+i*46.67} fill="var(--muted)" fontSize="10">{formatTime(max*(1-i/3))}</text></g>)}
   {series.points.map((p,i)=><g key={p.id}>{p.single!==null&&<circle cx={x(i)} cy={y(p.single)} r="4" fill="var(--accent)"><title>#{p.index} · {formatTime(p.single)} · {new Date(p.createdAt).toLocaleDateString('pt-BR')}</title></circle>}{i>0&&p.ao5!==null&&series.points[i-1].ao5!==null&&<line x1={x(i-1)} x2={x(i)} y1={y(series.points[i-1].ao5!)} y2={y(p.ao5)} stroke="#d8a74b" strokeWidth="2"/>}</g>)}
  </svg></div>;
 }):<div className="empty-inline"><p className="muted">Seu gráfico começa com a primeira resolução deste recorte.</p></div>}<p className="muted small">Cada sessão tem sua própria série. As médias não atravessam sessões nem modalidades.</p></section>;
}
