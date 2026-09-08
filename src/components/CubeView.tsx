import {useState} from 'react';
import type {CubeState, MoveInfo} from '../domain/types';
import {FACE_COLORS} from '../domain/cube';
export const COLORS = FACE_COLORS;
type Vector = [number, number, number];
// Camera and mesh transforms only. Final cube states are always supplied by the domain.
function rotate(vector: Vector, axis: number, degrees: number): Vector {
  const angle = degrees * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
  const [x,y,z] = vector;
  return axis === 0 ? [x,y*cosine-z*sine,y*sine+z*cosine]
    : axis === 1 ? [x*cosine+z*sine,y,-x*sine+z*cosine]
    : [x*cosine-y*sine,x*sine+y*cosine,z];
}
const normals: Vector[] = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
export default function CubeView({state,size=180,motion,angle=0,label='Cubo 3D interativo',palette,interactive=true,cameraOrbit}: {
  state: CubeState; size?: number; motion?: MoveInfo; angle?: number; label?: string; palette?: ReadonlyMap<string,string>; interactive?:boolean; cameraOrbit?:readonly [number,number];
}) {
  const [freeOrbit,setOrbit] = useState([24,-34]);
  const orbit = cameraOrbit ?? freeOrbit;
  const [drag,setDrag] = useState<{x:number;y:number;orbit:readonly number[]}|null>(null);
  const camera = (vector: Vector) => rotate(rotate(vector,1,orbit[1]),0,orbit[0]);
  function face(id: string, position: Vector, normal: Vector, color: string, extent: number, offset: number, sticker: boolean) {
    const center = position.map((value,index) => value+normal[index]*offset) as Vector;
    const axes = [0,1,2].filter(index => normal[index]===0);
    const moving = motion && motion.layers.includes(position[motion.axis]);
    const transform = (vector: Vector) => camera(moving ? rotate(vector,motion.axis,angle) : vector);
    const n = transform(normal), c = transform(center);
    // Perspective-facing test uses the actual eye position, not just the camera's Z axis.
    const visible = n[0]*-c[0]+n[1]*-c[1]+n[2]*(10-c[2]) > 0.001;
    const points = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b]) => {
      const corner = [...center] as Vector;
      corner[axes[0]] += a*extent;
      corner[axes[1]] += b*extent;
      const [x,y,z] = transform(corner), scale = 34*10/(10-z);
      return `${100+x*scale},${100-y*scale}`;
    });
    return {id,visible,depth:c[2],points:points.join(' '),color,sticker};
  }
  // Opaque plastic surfaces keep interior pieces occluded during partial turns.
  const positions = new Map<string, Vector>(state.map(sticker => [sticker.position.join(','),[...sticker.position] as Vector]));
  positions.set('0,0,0',[0,0,0]);
  const bodies = [...positions].flatMap(([id,position]) => normals.map((normal,index) => face(`body-${id}-${index}`,position,normal,'#26352d',0.49,0.49,false)));
  const stickers = state.map(sticker => face(sticker.id,[...sticker.position] as Vector,[...sticker.normal] as Vector,palette?.get(sticker.id)??COLORS[sticker.color],0.46,0.505,true));
  const polygons = [...bodies,...stickers].filter(polygon => polygon.visible).sort((a,b) => a.depth-b.depth);
  return <div className="cube-viewport" tabIndex={interactive ? 0 : undefined} aria-label={interactive ? `${label}. Arraste ou use as setas para girar a câmera.` : label} style={{width:size,height:size,touchAction:interactive?'none':'auto',userSelect:'none'}}
    onKeyDown={event => {if(!interactive)return;const deltas: Record<string,number[]> = {ArrowLeft:[0,-10],ArrowRight:[0,10],ArrowUp:[10,0],ArrowDown:[-10,0]};if(deltas[event.key]){event.preventDefault();setOrbit(previous => [previous[0]+deltas[event.key][0],previous[1]+deltas[event.key][1]]);}}}
    onPointerDown={event => {if(!interactive||!event.isPrimary)return;event.preventDefault();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);setDrag({x:event.clientX,y:event.clientY,orbit});}}
    onPointerMove={event => {if(drag){event.preventDefault();setOrbit([drag.orbit[0]+(event.clientY-drag.y)*0.6,drag.orbit[1]+(event.clientX-drag.x)*0.6]);}}}
    onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={label}>
      <g strokeLinejoin="round">{polygons.map(polygon => <polygon key={polygon.id} data-sticker-id={polygon.sticker?polygon.id:undefined} points={polygon.points} fill={polygon.color} stroke="#26352d" strokeWidth={polygon.sticker?0.65:0.3}/>)}</g>
    </svg>
  </div>;
}
