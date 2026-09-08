import { parseAlgorithm } from './cube';
import type { AlgorithmCase, LearningDescriptor, MethodDefinition, StageDefinition } from './types';
import { CROSS_PIECES, FIRST_BLOCK_PIECES, SECOND_BLOCK_PIECES, U_CORNERS } from './stage-validation';
export const METHODS:readonly MethodDefinition[]=[
{id:'cfop',name:'CFOP',description:'Cruz, pares das duas primeiras camadas, orientação e permutação final.',stageIds:['cross','f2l','oll','pll']},
{id:'roux',name:'Roux',description:'Dois blocos, cantos superiores e seis arestas com seus centros.',stageIds:['fb','sb','cmll','lse']}];
export const STAGES:readonly StageDefinition[]=[
{id:'cross',methodId:'cfop',name:'Cruz',description:'Construir quatro arestas alinhadas aos centros.',order:0},
{id:'f2l',methodId:'cfop',name:'F2L',description:'Reconhecer, formar e inserir pares de canto e aresta.',order:1},
{id:'oll',methodId:'cfop',name:'OLL',description:'Orientar a última camada preservando F2L.',order:2},
{id:'pll',methodId:'cfop',name:'PLL',description:'Permutar a última camada e concluir o cubo.',order:3},
{id:'fb',methodId:'roux',name:'Primeiro bloco',description:'Construir o bloco esquerdo 1 x 2 x 3.',order:0},
{id:'sb',methodId:'roux',name:'Segundo bloco',description:'Construir o bloco direito preservando o esquerdo.',order:1},
{id:'cmll',methodId:'roux',name:'CMLL',description:'Orientar e posicionar os quatro cantos superiores.',order:2},
{id:'lse',methodId:'roux',name:'LSE',description:'Orientar seis arestas, posicionar UL/UR e concluir arestas e centros.',order:3}];
export function algorithmDescriptor(c:AlgorithmCase):LearningDescriptor {
 const f=c.family,isF2L=f==='F2L',isCMLL=f==='CMLL';
 const preserve=isF2L?[...CROSS_PIECES,'FL','DFL','BR','DBR','BL','DBL']:isCMLL?[...FIRST_BLOCK_PIECES,...SECOND_BLOCK_PIECES]:[...FIRST_BLOCK_PIECES,...SECOND_BLOCK_PIECES,'DF','DB'];
 return {methodId:isCMLL?'roux':'cfop',stageId:f.toLowerCase() as 'f2l'|'oll'|'pll'|'cmll',groupId:c.group.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-'),
 objective:isF2L?'Formar e inserir o par branco, verde e vermelho no slot FR.':isCMLL?'Orientar e posicionar os cantos superiores preservando os dois blocos.':f==='OLL'?'Orientar todos os adesivos superiores para amarelo preservando as duas primeiras camadas.':'Permutar a última camada e concluir o cubo, incluindo o ajuste U.',
 preconditions:isF2L?['Cruz inferior alinhada aos centros.','Slot alvo FR, os outros três pares já inseridos.']:isCMLL?['Dois blocos Roux completos.']:f==='OLL'?['Duas primeiras camadas completas.']:['Duas primeiras camadas completas e face superior orientada.'],
 preservation:[isF2L?'Cruz e outros três pares completos ao terminar.':isCMLL?'Os dois blocos completos ao terminar.':'As duas primeiras camadas completas ao terminar.'],milestones:[{step:0,title:'Reconhecer o caso',explanation:isF2L?'Localize o canto branco, verde e vermelho e a aresta verde/vermelha. Observe como suas cores se alinham antes da inserção.':'Compare o padrão superior e as cores laterais com o estado preparado.'},{step:parseAlgorithm(c.algorithm).length,title:isF2L?'Par inserido':'Etapa concluída',explanation:isF2L?'Confira o par no slot FR, a cruz e os outros três pares. Continue com o próximo par ou com OLL.':'Confira o objetivo da etapa e as peças preservadas antes de continuar.'}],
 focus:isF2L?{kind:'pieces',pieces:['DFR','FR'],referencePieces:CROSS_PIECES}:isCMLL?{kind:'pieces',pieces:U_CORNERS,referencePieces:preserve}:{kind:f==='OLL'?'oll-orientation':'last-layer'},
 validation:{goal:isF2L?'f2l-pair':isCMLL?'cmll':f==='OLL'?'oll':'pll',...(isF2L?{targetSlot:'FR' as const}:{}),preserve,referenceFrame:'fixed'},
 provenance:[{title:'Cube Coach, algoritmos',url:c.source,author:'Luke Jackson',license:'MIT'}]};
}
