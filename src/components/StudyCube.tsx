import {useMemo,useState} from 'react';
import {getContentFocus} from '../domain';
import type {LearningContent,CubeState,MoveInfo} from '../domain';
import CubeView,{COLORS} from './CubeView';

export function useContentPalette(item:LearningContent,referenceState:CubeState) {
  return useMemo(()=>{
    const focus=getContentFocus(item,referenceState);
    const targets=new Set(focus.stickerIds);
    const references=new Set(focus.referenceStickerIds);
    return new Map(referenceState.map(sticker=>[
      sticker.id,targets.has(sticker.id)?COLORS[sticker.color]:references.has(sticker.id)?`color-mix(in srgb, ${COLORS[sticker.color]} 45%, var(--cube-neutral))`:'var(--cube-neutral)',
    ]));
  },[item,referenceState]);
}
export default function StudyCube({item,state,size=260,motion,angle=0,label,referenceState=item.initialState}: {
  item:LearningContent;state:CubeState;size?:number;motion?:MoveInfo;angle?:number;label?:string;referenceState?:CubeState;
}) {
  const [fullColors,setFullColors]=useState(false);
  const palette=useContentPalette(item,referenceState);
  const caption=item.focus.kind==='oll-orientation'?'Foco na orientação dos adesivos amarelos':item.focus.kind==='last-layer'?'Foco nas peças da última camada':item.focus.kind==='full'?'Observe as peças e sua relação com os centros':'Peças alvo em cores; referências em tons suaves';
  return <div className="study-cube-view">
    <CubeView state={state} size={size} motion={motion} angle={angle} label={label} palette={fullColors?undefined:palette}/>
    <label className="checkbox-label cube-color-toggle"><input type="checkbox" checked={fullColors} onChange={event=>setFullColors(event.target.checked)}/> Cores completas</label>
    <span className="cube-focus-caption">{fullColors?'Todas as peças visíveis em suas cores reais':caption}</span>
  </div>;
}
