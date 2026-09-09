import React from 'react';
import {useData} from '../components/AppContext';
import SolverView from './SolverView';
import type {SolverViewProps} from './SolverView';
export default function SolverPage(props:Omit<SolverViewProps,'authority'>){
  const {cloud,service,notifyForContext}=useData();
  return <SolverView {...props} authority={{owner:service,context:cloud.context,authorized:cloud.status==='authenticated'||cloud.status==='offline-account',current:()=>{const snapshot=service.getSnapshot();return {context:snapshot.context,authorized:snapshot.status==='authenticated'||snapshot.status==='offline-account'};},notifyForContext}}/>;
}
