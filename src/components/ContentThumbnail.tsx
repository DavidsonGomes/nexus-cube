import {memo,useMemo} from 'react';
import {lastLayerThumbnail,getPLLRecognition} from '../domain';
import type {LearningContent,Face,CubeState} from '../domain';
import CubeView,{COLORS} from './CubeView';
import {useContentPalette} from './StudyCube';
import PermutationArrows from './PermutationArrows';
function ContentThumbnail({item,state:explicitState}: {item:LearningContent;state?:CubeState}) {
  const recognition=useMemo(()=>item.kind==='algorithm-case'&&item.family==='PLL'&&!explicitState?getPLLRecognition(item):null,[item,explicitState]);
  const state=explicitState??recognition?.recognitionState??item.initialState;
  const palette=useContentPalette(item,state);
  if(item.family!=='OLL'&&item.family!=='PLL')return <CubeView state={state} size={112} palette={palette} interactive={false} label={`Peças em foco: ${item.name}`}/>;
  const mask=lastLayerThumbnail(state);
  const color=(face:Face)=>item.family==='OLL'&&face!=='U'?'var(--cube-neutral)':COLORS[face];
  return <div className="thumbnail-with-adjustment"><div className={`case-thumbnail-frame ${item.family==='PLL'?'pll-thumbnail':''}`} aria-label={`Padrão superior e laterais ${item.id}`}>
    <div className="thumb-side thumb-back">{[...mask.back].reverse().map((face,index)=><span key={index} style={{background:color(face)}}/>)}</div>
    <div className="thumb-side thumb-left">{mask.left.map((face,index)=><span key={index} style={{background:color(face)}}/>)}</div>
    <div className="case-thumbnail">{mask.top.map((face,index)=><span key={index} style={{background:color(face)}}/>)}</div>
    <div className="thumb-side thumb-right">{[...mask.right].reverse().map((face,index)=><span key={index} style={{background:color(face)}}/>)}</div>
    {item.family==='PLL'&&<PermutationArrows state={state} background={COLORS[mask.top[4]]}/>}
    <div className="thumb-side thumb-front">{mask.front.map((face,index)=><span key={index} style={{background:color(face)}}/>)}</div>
  </div>{recognition&&<span className="pll-adjustment-badge">{recognition.adjustment?`Padrão após ${recognition.adjustment}`:'Sem ajuste U'}</span>}</div>;
}

export default memo(ContentThumbnail);
