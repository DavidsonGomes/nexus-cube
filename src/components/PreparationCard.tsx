import React from 'react';
import {useData} from './AppContext';
import PreparationCardView from './PreparationCardView';
import type {PreparationCardViewProps} from './PreparationCardView';
export default function PreparationCard(props:Omit<PreparationCardViewProps,'notify'>){const {notify}=useData();return <PreparationCardView {...props} notify={notify}/>;}
