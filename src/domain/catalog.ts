import { F2L_CASES } from '../data/f2l-compiled';
import { CMLL_SOURCES } from '../data/expansion-sources/cmll';
import { EXERCISE_SOURCES } from '../data/expansion-sources/exercises';
import { algorithmDescriptor } from './learning';
import { CASE_METADATA } from '../data/case-metadata';
import { COMPILED_CASES } from '../data/catalog-compiled';
import { applyAlgorithm, solvedCube, parseAlgorithm, invertAlgorithm } from './cube';
import type { AlgorithmCase, AlgorithmLearningCase, LearningExercise, LearningContent, ContentFamily, MethodId, StageId, CaseProgress } from './types';
export const CATALOG: readonly AlgorithmLearningCase[] = [...COMPILED_CASES.map(c=>({...c,...CASE_METADATA[c.id]})),...F2L_CASES].map(c=>{
 const item={...c,initialState:applyAlgorithm(solvedCube(),c.setup)};
 return {...item,...algorithmDescriptor(item),kind:'algorithm-case' as const};
}).concat(CMLL_SOURCES.map(c=>{
 const algorithm=parseAlgorithm(c.algorithm).join(' '),setup=invertAlgorithm(algorithm);
 const item={...c,algorithm,alternatives:(c.alternatives??[]).map(a=>parseAlgorithm(a).join(' ')),setup,initialState:applyAlgorithm(solvedCube(),setup),twoLook:false,source:c.provenance[0].url};
 return {...item,...algorithmDescriptor(item),...c,algorithm,alternatives:item.alternatives,kind:'algorithm-case' as const};
}));
export const EXERCISES:readonly LearningExercise[]=EXERCISE_SOURCES.map(c=>({...c,algorithm:parseAlgorithm(c.solution).join(' '),alternatives:c.alternatives??[],initialState:applyAlgorithm(solvedCube(),c.setup),twoLook:false,source:c.provenance[0].url}));
export const LEARNING_CONTENT:readonly LearningContent[]=[...CATALOG,...EXERCISES];
export const CONTENT=LEARNING_CONTENT;
export function getContent(id:string):LearningContent {const c=LEARNING_CONTENT.find(c=>c.id===id);if(!c)throw new Error('Conteudo desconhecido.');return c;}
export const getCase=getContent;
export interface CaseSelection {family?:ContentFamily;twoLook?:boolean;ids?:readonly string[];favorites?:boolean;learning?:boolean;query?:string}
export interface ContentSelection extends CaseSelection {methodId?:MethodId;stageId?:StageId;groupId?:string;kind?:LearningContent['kind']}
function selected(c:LearningContent,s:ContentSelection,p:Record<string,CaseProgress>):boolean {return (!s.family||c.family===s.family)&&(!s.twoLook||c.twoLook)&&(!s.ids||s.ids.includes(c.id))&&(!s.favorites||!!p[c.id]?.favorite)&&(!s.learning||p[c.id]?.status==='learning')&&(!s.methodId||c.methodId===s.methodId)&&(!s.stageId||c.stageId===s.stageId)&&(!s.groupId||c.groupId===s.groupId)&&(!s.kind||c.kind===s.kind)&&matchesCaseQuery(c,s.query??'');}
export function selectCases(s:CaseSelection={},p:Record<string,CaseProgress>={}):AlgorithmLearningCase[]{return CATALOG.filter(c=>selected(c,s,p));}
export function selectContent(s:ContentSelection={},p:Record<string,CaseProgress>={}):LearningContent[]{return LEARNING_CONTENT.filter(c=>selected(c,s,p));}
export const TWO_LOOK_GUIDE = {
  OLL: [{name:'1. Orientar arestas',ids:['OLL-01','OLL-44','OLL-45'],instruction:'Reconheca ponto, L ou linha. Oriente as arestas e reconheca novamente os cantos.'},{name:'2. Orientar cantos',ids:['OLL-21','OLL-22','OLL-23','OLL-24','OLL-25','OLL-26','OLL-27'],instruction:'Com a cruz pronta, reconheca os cantos; ajuste U para corresponder ao caso.'}],
  PLL: [{name:'1. Permutar cantos',ids:['PLL-Aa','PLL-E'],instruction:'Ajuste U e posicione os cantos. Arestas ainda podem estar permutadas.'},{name:'2. Permutar arestas',ids:['PLL-Ua','PLL-Ub','PLL-H','PLL-Z'],instruction:'Com cantos posicionados, reconheca as arestas; finalize com ajuste U se necessario.'}],
} as const;

/** Search is forgiving about accents and separators, including OLL30/Awkward2. */
export function normalizeCaseQuery(value: string): string {return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
export function matchesCaseQuery(item: Pick<AlgorithmCase,'id'|'name'|'group'|'aliases'>,query: string): boolean {const q=normalizeCaseQuery(query);return !q||[item.id,item.name,item.group,...item.aliases].some(s=>normalizeCaseQuery(s).includes(q));}
