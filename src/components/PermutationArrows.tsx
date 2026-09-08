import {useId,useMemo} from 'react';
import {getPLLPermutation} from '../domain';
import type {CubeState} from '../domain';

/** SVG layout only. Piece destinations and cycles are supplied by the domain. */
export default function PermutationArrows({state,background}: {state:CubeState;background:string}) {
  const markerId=`pll-head-${useId().replace(/[^a-zA-Z0-9_-]/g,'')}`;
  const permutation=useMemo(()=>getPLLPermutation(state),[state]);
  if(permutation.status!=='ready'||permutation.arrows.length===0)return null;
  const lines=permutation.arrows.map(arrow=>{
    const dx=arrow.to.x-arrow.from.x,dy=arrow.to.y-arrow.from.y,length=Math.hypot(dx,dy);
    const gap=0.12;
    return {...arrow,x1:arrow.from.x+dx/length*gap,y1:arrow.from.y+dy/length*gap,x2:arrow.to.x-dx/length*gap,y2:arrow.to.y-dy/length*gap};
  });
  const description=lines.map(arrow=>`${arrow.kind==='corner'?'Cantos':'Arestas'}: ${arrow.from.slot} ${arrow.bidirectional?'troca com':'vai para'} ${arrow.to.slot}`).join('. ');
  return <svg className="permutation-arrows" viewBox="0 0 3 3" role="img" aria-label={`Permutação para resolver. ${description}`} data-pll-arrows={lines.length}>
    <defs><marker id={markerId} viewBox="0 0 10 10" markerWidth="0.27" markerHeight="0.27" refX="8.8" refY="5" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9 Z" fill="#17271f" stroke={background} strokeWidth="0.6" paintOrder="stroke"/></marker></defs>
    <g stroke={background} strokeWidth="0.13" strokeLinecap="round">{lines.map((arrow,index)=><line key={index} x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2}/>)}</g>
    <g stroke="#17271f" strokeWidth="0.065" strokeLinecap="round">{lines.map((arrow,index)=><line key={index} x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} markerEnd={`url(#${markerId})`} markerStart={arrow.bidirectional?`url(#${markerId})`:undefined} data-from={arrow.from.slot} data-to={arrow.to.slot} data-bidirectional={arrow.bidirectional} data-cycle={arrow.cycleId}/>)}</g>
  </svg>;
}
