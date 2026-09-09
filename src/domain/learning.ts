import { parseAlgorithm } from './cube';
import type { AlgorithmCase, LearningDescriptor, MethodDefinition, StageDefinition } from './types';
import { CROSS_PIECES, FIRST_BLOCK_PIECES, SECOND_BLOCK_PIECES, U_CORNERS } from './stage-validation';
export const METHODS:readonly MethodDefinition[]=[
{id:'lbl',name:'Camadas',description:'Método iniciante camada por camada, da cruz branca ao cubo resolvido em sete etapas.',stageIds:['white-cross','first-corners','middle-edges','top-cross','top-edges','top-corners-position','top-corners-orient']},
{id:'cfop',name:'CFOP',description:'Cruz, pares das duas primeiras camadas, orientação e permutação final.',stageIds:['cross','f2l','oll','pll']},
{id:'roux',name:'Roux',description:'Dois blocos, cantos superiores e seis arestas com seus centros.',stageIds:['fb','sb','cmll','lse']}];
// LBL names and descriptions are Trama's curated texts, consumed verbatim from the approved
// trainer fixtures; a drift guard in tests/domain/trainers keeps them in sync.
export const STAGES:readonly StageDefinition[]=[
{id:'white-cross',methodId:'lbl',name:'Cruz branca',description:'Monte a cruz branca: quatro arestas brancas em volta do centro branco, cada uma casando com o centro lateral da sua cor.',order:0},
{id:'first-corners',methodId:'lbl',name:'Cantos da primeira camada',description:'Complete a primeira camada: leve cada canto branco para o seu lugar, entre as cores que ele mostra.',order:1},
{id:'middle-edges',methodId:'lbl',name:'Meios da segunda camada',description:'Complete a segunda camada: encaixe as quatro arestas do meio, uma por vez, sem desmontar a primeira camada.',order:2},
{id:'top-cross',methodId:'lbl',name:'Cruz amarela',description:'Forme a cruz amarela no topo. Ignore os cantos e ignore se as arestas casam dos lados; aqui so importa o amarelo para cima.',order:3},
{id:'top-edges',methodId:'lbl',name:'Alinhar as arestas amarelas',description:'Gire e troque as arestas amarelas ate cada uma casar com o centro lateral da sua cor.',order:4},
{id:'top-corners-position',methodId:'lbl',name:'Posicionar os cantos amarelos',description:'Leve cada canto amarelo para o SEU lugar, mesmo que torto: as tres cores do canto devem bater com os tres lados que ele toca.',order:5},
{id:'top-corners-orient',methodId:'lbl',name:'Virar os cantos amarelos',description:'Vire cada canto ate o amarelo ficar para cima e o cubo se fechar sozinho no final.',order:6},
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
