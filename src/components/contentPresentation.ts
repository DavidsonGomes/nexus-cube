import {STAGES,getContentPlayback,getPLLRecognitionPlayback} from '../domain';
import type {LearningContent} from '../domain';
/** Human labels only. Persisted content IDs stay unchanged. */
export function contentReference(item:LearningContent):string {
  if(item.kind==='exercise')return `Exercício · ${STAGES.find(stage=>stage.id===item.stageId)?.name??item.family}`;
  return item.id.includes('/')?`${item.family}-${item.id.split('/').at(-1)}`:item.id;
}

export type PLLPresentation='recognition'|'original';
export function getPresentationPlayback(item:LearningContent,algorithm=item.algorithm,mode:'prepare'|'solve'='solve',presentation:PLLPresentation='recognition') {
  return item.kind==='algorithm-case'&&item.family==='PLL'&&presentation==='recognition'
    ?getPLLRecognitionPlayback(item,algorithm,mode):getContentPlayback(item,algorithm,mode);
}
