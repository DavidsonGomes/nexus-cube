import { applyAlgorithm, invertAlgorithm, solvedCube } from './cube';
import { getContentPlayback } from './playback';
import { getPLLPermutation } from './pll-permutation';
import type { PLLPermutation } from './pll-permutation';
import type { AlgorithmCase, AlgorithmPlayback, CubeState, PlaybackMode } from './types';

export type PLLRecognitionCriterion = 'edges-only'|'corners-only'|'adjacent-swap'|'diagonal-swap'|'double-three-cycles';
export type PLLAdjustment = ''|'U'|"U'"|'U2';
type ReadyPermutation = Extract<PLLPermutation,{status:'ready'}>;
export interface PLLRecognition {
 rawState:CubeState;rawPermutation:ReadyPermutation;
 recognitionState:CubeState;recognitionPermutation:ReadyPermutation;
 adjustment:PLLAdjustment;undoAdjustment:string;
 rawPreparation:string;preparation:string;
 originalAlgorithm:string;selectedAlgorithm:string;solution:string;
 criterion:PLLRecognitionCriterion;source:string;
}
export type PLLRecognitionPlayback = AlgorithmPlayback & PLLRecognition;
export const PLL_RECOGNITION_SOURCE='https://www.cubeskills.com/uploads/pdf/tutorials/pll-algorithms.pdf';
const profiles:Record<string,PLLRecognitionCriterion>={
 Ua:'edges-only',Ub:'edges-only',H:'edges-only',Z:'edges-only',
 Aa:'corners-only',Ab:'corners-only',E:'corners-only',
 F:'adjacent-swap',Ja:'adjacent-swap',Jb:'adjacent-swap',Ra:'adjacent-swap',Rb:'adjacent-swap',T:'adjacent-swap',
 V:'diagonal-swap',Y:'diagonal-swap',Na:'diagonal-swap',Nb:'diagonal-swap',
 Ga:'double-three-cycles',Gb:'double-three-cycles',Gc:'double-three-cycles',Gd:'double-three-cycles',
};
const join=(...parts:string[])=>parts.filter(Boolean).join(' ');
function hasProfile(p:ReadyPermutation,name:string,criterion:PLLRecognitionCriterion):boolean {
 const corners=p.cycles.filter(c=>c.kind==='corner'),edges=p.cycles.filter(c=>c.kind==='edge');
 const lengths=(cycles:typeof corners)=>cycles.map(c=>c.positions.length).sort().join(',');
 if(criterion==='edges-only')return !corners.length&&lengths(edges)===(name==='H'||name==='Z'?'2,2':'3');
 if(criterion==='corners-only')return !edges.length&&lengths(corners)===(name==='E'?'2,2':'3');
 if(criterion==='double-three-cycles')return lengths(corners)==='3'&&lengths(edges)==='3';
 if(lengths(corners)!=='2'||lengths(edges)!=='2')return false;
 const [a,b]=corners[0].positions,distance=Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
 return distance===(criterion==='adjacent-swap'?2:4);
}
/** Nominal class profile from CubeSkills, with an explicit AUF in the displayed state.
 * Ties retain the current pose if eligible, then choose U, U', U2. This selects a
 * stable pose within the same class; it does not minimize the number of arrows.
 */
export function getPLLRecognition(item:AlgorithmCase,selectedAlgorithm:string=item.algorithm):PLLRecognition {
 const name=item.id.startsWith('PLL-')?item.id.slice(4):'',criterion=profiles[name];
 if(item.family!=='PLL'||!criterion)throw new Error('Reconhecimento disponível somente para os 21 casos PLL registrados.');
 const raw=getContentPlayback(item,selectedAlgorithm),rawPermutation=getPLLPermutation(raw.caseState);
 if(rawPermutation.status!=='ready')throw new Error('A alternativa não prepara um estado PLL válido.');
 for(const adjustment of ['', 'U',"U'",'U2'] as const){
  const recognitionState=applyAlgorithm(raw.caseState,adjustment),recognitionPermutation=getPLLPermutation(recognitionState);
  if(recognitionPermutation.status!=='ready'||!hasProfile(recognitionPermutation,name,criterion))continue;
  const undoAdjustment=invertAlgorithm(adjustment),preparation=join(raw.preparation,adjustment),solution=join(undoAdjustment,raw.solution);
  return {rawState:raw.caseState,rawPermutation,recognitionState,recognitionPermutation,adjustment,undoAdjustment,rawPreparation:raw.preparation,preparation,originalAlgorithm:raw.solution,selectedAlgorithm:raw.solution,solution,criterion,source:PLL_RECOGNITION_SOURCE};
 }
 throw new Error('Nenhum ajuste U corresponde ao perfil nominal deste PLL.');
}
/** Effective playback includes the visible adjustment and keeps the corpus untouched. */
export function getPLLRecognitionPlayback(item:AlgorithmCase,selectedAlgorithm:string=item.algorithm,mode:PlaybackMode='solve'):PLLRecognitionPlayback {
 if(mode!=='prepare'&&mode!=='solve')throw new Error('Modo de reprodução inválido.');
 const recognition=getPLLRecognition(item,selectedAlgorithm);
 return {...recognition,setup:mode==='prepare'?'':recognition.preparation,algorithm:mode==='prepare'?recognition.preparation:recognition.solution,initialState:mode==='prepare'?solvedCube():recognition.recognitionState,caseState:recognition.recognitionState,solution:recognition.solution,inverseSolution:invertAlgorithm(recognition.solution),usesAuthoredSetup:false,mode};
}
