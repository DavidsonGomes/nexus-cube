import { applyAlgorithm, invertAlgorithm, parseAlgorithm, solvedCube } from './cube';
import type { AlgorithmCase, AlgorithmPlayback, LearningContent, PlaybackMode } from './types';
/** Exercises retain their authored context; inverseSolution reverses only the solution. */
export function getContentPlayback(item: AlgorithmCase | LearningContent, selectedAlgorithm: string=item.algorithm, mode: PlaybackMode='solve'): AlgorithmPlayback {
  if(mode!=='prepare'&&mode!=='solve')throw new Error('Modo de reproducao invalido.');
  const normalize=(a:string)=>parseAlgorithm(a).join(' ');
  const solution=normalize(selectedAlgorithm);
  if(![item.algorithm,...item.alternatives].some(a=>normalize(a)===solution))throw new Error('Algoritmo nao pertence a este conteudo.');
  const inverseSolution=invertAlgorithm(solution);
  const usesAuthoredSetup='kind' in item && item.kind==='exercise';
  const preparation=usesAuthoredSetup?normalize(item.setup):inverseSolution;
  const caseState=applyAlgorithm(solvedCube(),preparation);
  return {preparation,setup:mode==='prepare'?'':preparation,algorithm:mode==='prepare'?preparation:solution,initialState:mode==='prepare'?solvedCube():caseState,caseState,solution,mode,inverseSolution,usesAuthoredSetup};
}
export const getAlgorithmPlayback=getContentPlayback;
