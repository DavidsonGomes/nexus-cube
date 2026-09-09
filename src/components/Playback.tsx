import React from 'react';
import {useData} from './AppContext';
import PlaybackView from './PlaybackView';
import type {PlaybackViewProps} from './PlaybackView';
export default function Playback(props:Omit<PlaybackViewProps,'ports'>){
  const {data,update,notify}=useData();
  return <PlaybackView {...props} ports={{notify,animationSpeed:data.settings.animationSpeed,onAnimationSpeedChange:animationSpeed=>{void update(previous=>({...previous,settings:{...previous.settings,animationSpeed}}));}}}/>;
}
