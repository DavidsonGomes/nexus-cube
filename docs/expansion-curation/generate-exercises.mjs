// Run from the project root with node --import tsx.
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { Alg } from 'cubing/alg';

const k=await puzzles['3x3x3'].kpuzzle();
const edgeNames='UF UR UB UL DF DR DB DL FR FL BR BL'.split(' ');
const cornerNames='UFR URB UBL ULF DRF DFL DLB DBR'.split(' ');
const centerNames='U L F R B D'.split(' ');
const norm=s=>s.split('').sort().join('');
const inverse=a=>new Alg(a).invert().toString().replace(/2'/g,'2');
const clean=a=>a.trim().replace(/\s+/g,' ').replace(/2'/g,'2');
const left=['DL','FL','BL','DFL','DBL'];
const right=['DR','FR','BR','DFR','DBR'];
const cross=['DF','DR','DB','DL'];
const corners=['UFR','URB','UBL','ULF'];
const free=['UF','UR','UB','UL','DF','DB'];
const sune="R U R' U R U2 R'";
const arrow="M U M' U'";
const lr="M U2 M' U M U2 M' U'";
const four='M2 U2 M2 U2';
const sixSetup="M U' M' U2 M U M U M' U' M' U2";

function locate(p,id){
 const names=id.length===1?centerNames:id.length===2?edgeNames:cornerNames;
 const orbit=id.length===1?'CENTERS':id.length===2?'EDGES':'CORNERS';
 const piece=names.findIndex(n=>norm(n)===norm(id));
 assert(piece>=0,`unknown ${id}`);
 const slot=p.patternData[orbit].pieces.indexOf(piece);
 return {slot:names[slot],orientation:p.patternData[orbit].orientation[slot],solved:slot===piece&&(orbit==='CENTERS'||p.patternData[orbit].orientation[slot]===0)};
}
function snapshot(p,ids){return ids.map(id=>{const q=locate(p,id);return `${id} em ${q.slot}${q.solved?' (correto)':id.length>1&&q.orientation?' (girado)':''}`;}).join('; ')+'.';}
function solved(p,ids){return ids.filter(id=>locate(p,id).solved);}
const definitions=[
 ['cross','alinhar-uma-aresta','Alinhar a última aresta da cruz','Alinhamento',
 ['F2'],"R U R'",['DF'],
 'Compare a cor verde da aresta branca com o centro F antes de levar branco para D.',
 ['Aresta alinhada','Gire a face frontal meia volta. O branco desce junto com sua cor lateral correta.']],
 ['cross','arestas-vizinhas','Duas arestas vizinhas da cruz','Planejamento',
 ['R2','F2'],"R U R'",['DR','DF'],
 'Localize branco/vermelho e branco/verde. Resolva uma sem retirar a outra de seu caminho de inserção.',
 ['Primeira inserção','Compare DR com os centros D e R. A segunda aresta continua disponível.'],['Cruz alinhada','Complete DF e confira também as duas arestas que já estavam corretas.']],
 ['cross','arestas-opostas','Duas arestas opostas da cruz','Planejamento',
 ['B2','F2'],"R U R'",['DB','DF'],
 'Planeje as arestas opostas branca/azul e branca/verde com D embaixo, sem trocar sua referência de frente.',
 ['Fundo alinhado','A face B leva a aresta ao centro azul; a frente continua livre.'],['Frente alinhada','Feche a cruz verificando as quatro cores laterais, não apenas o branco.']],
 ['cross','planejar-quatro','Planejar as quatro arestas da cruz','Cruz completa',
 ['L2','B2','R2','F2'],"R U R'",cross,
 'Rastreie as quatro arestas brancas antes de executar. Este exemplo usa quatro inserções independentes, não representa todos os embaralhamentos.',
 ['Esquerda pronta','Confira a aresta branca/laranja ao lado do centro L.'],['Fundo pronto','Mantenha a orientação do cubo enquanto identifica a aresta de trás.'],['Direita pronta','Acompanhe a branca/vermelha até DR.'],['Cruz completa','Confira os quatro centros laterais. Os pares F2L continuam sendo a próxima tarefa.']],
 ['f2l','par-pronto','Reconhecer e inserir um par pronto','Fundamentos',
 ["R U' R'"],sune,['DFR','FR'],
 'O canto branco/vermelho/verde e a aresta vermelho/verde estão unidos: suas cores comuns apontam para as mesmas faces. Insira o conjunto no slot FR.',
 ['Par inserido','Confira canto e aresta juntos no slot FR. A cruz e os outros três pares estão preservados.']],
 ['f2l','formar-par','Formar um par com peças separadas','Fundamentos',
 ['R','U',"R'"],sune,['DFR','FR'],
 'Encontre primeiro as duas peças pelo conjunto de cores, mesmo separadas na camada superior. Abra o slot para conectá-las antes de fechá-lo.',
 ['Abrir o slot','R coloca o canto na camada de trabalho. Observe onde ficou a aresta correspondente.'],['Conectar','U aproxima a aresta do canto com as duas cores laterais concordando.'],['Inserir','Feche R e confira o par FR e a cruz.']],
 ['f2l','conexao-incorreta','Desfazer uma conexão incorreta','Fundamentos',
 ["R U' R'",'U',"R U R'"],sune,['DFR','FR'],
 'As peças estão vizinhas, mas suas cores comuns não concordam. Separe a conexão, ajuste a camada superior e forme o par correto.',
 ['Separar','Compare novamente as cores comuns das duas peças; proximidade sozinha não significa par pronto.'],['Reposicionar','O ajuste U muda a relação entre canto e aresta antes da inserção.'],['Conexão correta','As duas peças terminam com as cores alinhadas aos centros F e R.']],
 ['f2l','extrair-canto','Extrair um canto preso no slot','Fundamentos',
 ["R U R'","U'", "R U R'"],sune,['DFR','FR'],
 'O canto correto está em DFR, mas girado; a aresta correspondente está em U. Retire o canto para trabalhar o par fora do slot.',
 ['Canto acessível','O canto sai do slot para a camada superior. Continue acompanhando sua identidade.'],['Ajustar o par','Use U para preparar a relação de cores exigida pela inserção.'],['Slot concluído','Canto e aresta agora têm posição e orientação corretas.']],
 ['fb','aresta-base','Localizar a aresta base DL','Base do primeiro bloco',
 ['L2'],"R U R'",['DL','DFL','DBL','FL','BL'],
 'Encontre a aresta branca/laranja e os centros D e L. Neste exemplo as outras peças já estão agrupadas na face L; uma meia volta coloca o bloco inteiro.',
 ['Base e bloco alinhados','Confira DL entre os centros branco e laranja e reconheça os dois pares que vieram junto.']],
 ['fb','quadrado-frontal','Completar o quadrado frontal esquerdo','Quadrados e pares',
 ["L' U' L"],"R U R'",['DL','DFL','FL'],
 'A aresta DL serve de apoio. Relacione o canto branco/laranja/verde à aresta laranja/verde e insira o par junto da base.',
 ['Quadrado 1×2×2','DL, DFL e FL formam o quadrado frontal. O par traseiro que já estava pronto completa o bloco deste exemplo.']],
 ['fb','par-traseiro','Adicionar o par traseiro esquerdo','Quadrados e pares',
 ["L U L'"],"R U R'",['DL','DBL','BL'],
 'Preserve o quadrado frontal e procure o canto branco/laranja/azul e a aresta laranja/azul. A referência B é azul.',
 ['Primeiro bloco 1×2×3','Confira os dois cantos e as três arestas do bloco esquerdo. A região direita permanece livre para SB.']],
 ['fb','construir-bloco','Construir o primeiro bloco por etapas','Bloco completo',
 ['L2',"L' U' L","L U L'"],"R U R'",left,
 'Planeje base DL, par frontal e par traseiro. Esta construção guiada mostra o percurso inteiro; outras posições exigem escolhas intuitivas diferentes.',
 ['Fixar a base','DL chega ao lugar correto. Procure o par frontal sem mudar os centros de referência.'],['Completar a frente','O quadrado frontal fica pronto; a próxima busca é pelo par de trás.'],['Fechar o bloco','Verifique as cinco peças do bloco esquerdo. Use o espaço livre à direita para construir SB.']],
 ['sb','aresta-base','Assentar a base DR preservando FB','Base do segundo bloco',
 ['R2'],sune,right,
 'Use o bloco esquerdo como referência fixa. As peças direitas estão agrupadas neste exemplo; R2 assenta DR e os dois pares.',
 ['Base direita assentada','Confira DR e os centros D/R. O bloco esquerdo retorna intacto e os cantos superiores ficam para CMLL.']],
 ['sb','quadrado-frontal','Montar o quadrado frontal direito','Quadrados e pares',
 ["R U R'"],sune,['DR','DFR','FR'],
 'Com FB pronto, encontre canto branco/vermelho/verde e aresta vermelho/verde. Use DR como apoio para o quadrado direito.',
 ['Quadrado direito pronto','DR, DFR e FR concordam com os centros. Confira também o bloco esquerdo preservado.']],
 ['sb','par-traseiro','Fechar o segundo bloco por trás','Quadrados e pares',
 ["R' U' R"],sune,['DR','DBR','BR'],
 'Trabalhe o canto branco/vermelho/azul com a aresta vermelho/azul. A conclusão deve preservar o primeiro bloco e o quadrado frontal direito.',
 ['Dois blocos completos','Confira os dois blocos 1×2×3. A camada M pode continuar livre; os quatro cantos de U definem CMLL.']],
 ['sb','construir-bloco','Construir SB sem perder FB','Bloco completo',
 ['R2',"R U R'","R' U' R"],sune,right,
 'Siga DR, par frontal e par traseiro, mantendo o bloco esquerdo como região protegida em cada marco.',
 ['Base DR','A aresta branca/vermelha chega à posição de apoio.'],['Frente direita','O quadrado frontal está pronto; procure a dupla vermelha/azul.'],['Segundo bloco completo','Ambos os blocos estão resolvidos. Reconheça os cantos superiores e siga para CMLL.']],
 ['lse','referencia-centros','Restaurar a referência dos centros','Orientação de arestas',
 ['M'],inverse(lr),[...free,'U','D','F','B'],
 'Antes de contar arestas ruins, coloque um centro branco ou amarelo no eixo vertical. Aqui um quarto de volta M restaura essa referência e já orienta as seis arestas.',
 ['Referência válida','Os centros U/D estão no eixo vertical e todos os adesivos brancos/amarelos das seis arestas apontam para cima ou para baixo. UL/UR ainda são a próxima tarefa.']],
 ['lse','eo-duas','EO com duas arestas ruins','Orientação de arestas',
 [arrow,arrow],inverse(lr),free,
 'Com centros U/D no eixo vertical, conte duas arestas cujo adesivo branco/amarelo aponta de lado. Um bloco de movimentos transforma a distribuição; o seguinte conclui EO.',
 ['Redistribuir a orientação','Reconte as arestas ruins ao fim deste bloco e acompanhe as identidades destacadas.'],['EO concluída','Todas as seis arestas têm branco/amarelo no eixo vertical. Permutação e UL/UR ainda podem estar erradas.']],
 ['lse','eo-quatro','EO com quatro arestas ruins','Orientação de arestas',
 [arrow],inverse(lr),free,
 'Identifique as quatro arestas ruins e observe como M leva duas posições para a camada superior. U muda a seleção antes de restaurar M.',
 ['EO concluída','O U final realinha os cantos aos blocos. Confira as seis arestas orientadas antes de tratar UL/UR.']],
 ['lse','eo-seis','EO com seis arestas ruins','Orientação de arestas',
 [inverse(sixSetup).split(' ').slice(0,4).join(' '),inverse(sixSetup).split(' ').slice(4,8).join(' '),inverse(sixSetup).split(' ').slice(8).join(' ')],inverse(lr),free,
 'As seis arestas estão ruins com os centros de referência já no eixo vertical. Siga este exemplo guiado por M/U e reconte nos marcos; não confunda orientação com posição final.',
 ['Primeira transformação','A distribuição muda. Observe os adesivos brancos/amarelos nas seis identidades, inclusive DF e DB.'],['Preparar a conclusão','M também movimenta centros; mantenha a referência inicial e confira novamente quando o eixo vertical estiver restaurado.'],['Seis arestas orientadas','EO termina com centros U/D no eixo vertical e cantos alinhados. Prossiga para UL/UR.']],
 ['lse','ul-ur-trocas','Posicionar UL e UR por trocas','Arestas esquerda e direita',
 ["M U2 M'",'U',"M U2 M'","U'"],inverse(four),['UL','UR'],
 'EO já está pronta. Rastreie amarelo/laranja (UL) e amarelo/vermelho (UR). As trocas M U2 M\' deslocam arestas entre U e D; os ajustes U alinham sua chegada.',
 ['Primeira troca','Observe qual aresta alvo mudou de camada e qual ocupou sua antiga posição.'],['Alinhar a próxima troca','U reposiciona os cantos e as arestas superiores em conjunto.'],['Segunda troca','M retorna à referência anterior; acompanhe ambas as identidades alvo.'],['UL/UR concluídas','O ajuste final realinha os cantos. UL e UR estão corretas, deixando quatro arestas em M para terminar.']],
 ['lse','ul-ur-meias-voltas','Posicionar UL e UR com M2','Arestas esquerda e direita',
 ["M2 U M2 U'","M2 U M2 U'"],inverse(four),['UL','UR'],
 'Use meias voltas de M para transportar arestas entre frente e fundo, mantendo EO. Acompanhe UL e UR por identidade, mesmo quando passam por D.',
 ['Transportar as duas arestas','As peças alvo mudam de posição enquanto os blocos permanecem protegidos.'],['UL/UR alinhadas','Confira as arestas laterais junto aos respectivos cantos. A camada M ainda precisa ser concluída.']],
 ['lse','quatro-arestas','Concluir as quatro arestas de M','Conclusão',
 ['M2 U2','M2 U2'],'',['UF','UB','DF','DB','U','D','F','B'],
 'Cantos, blocos, EO e UL/UR já estão corretos. Restam duas trocas de arestas em M neste exemplo. Siga também os centros até retornarem às faces originais.',
 ['Transportar em M','Os centros mudam com M2; U2 reposiciona o par superior temporariamente.'],['Cubo resolvido','Confira todas as arestas e os seis centros. O último U2 também restaura os cantos e UL/UR.']],
 ['lse','fechar-centros','Finalizar arestas e centros juntos','Conclusão',
 ['M2'],'',[...free,'U','D','F','B'],
 'EO e UL/UR estão prontas, mas os centros U/D e F/B estão trocados entre faces opostas. As quatro arestas de M acompanham os centros; uma meia volta final resolve ambos.',
 ['Resolução concluída','Todas as peças concordam com os centros originais. Centros corretos são parte da conclusão de LSE.']],
];

const provenance={
 cross:[{title:'CFOP, sistema da autora',url:'https://ws.binghamton.edu/fridrich/system.html',author:'Jessica Fridrich',license:'Referência factual; sem redistribuição de figuras ou texto'}],
 f2l:[{title:'F2L, exemplos comentados da autora',url:'https://ws.binghamton.edu/fridrich/examples.html',author:'Jessica Fridrich',license:'Referência pedagógica; sem cópia dos exemplos'}],
 fb:[{title:'Primeiro bloco, método original',url:'http://grrroux.free.fr/method/Step_1.html',author:'Gilles Roux',license:'Referência factual; sem cópia de exemplos ou assets'}],
 sb:[{title:'Segundo bloco, método original',url:'http://grrroux.free.fr/method/Step_2.html',author:'Gilles Roux',license:'Referência factual; sem cópia de exemplos ou assets'}],
 lse:[{title:'Últimas seis arestas, método original',url:'http://grrroux.free.fr/method/Step_4.html',author:'Gilles Roux',license:'Referência factual; sem cópia de exemplos ou assets'},{title:'LSE, referência vertical e progressão',url:'https://tutorial.rouxers.com/beginners/lse.html',author:'Rouxers',license:'Referência factual; explicação e estados próprios do Nexus Cube'}],
};
const data=definitions.map(([stage,slug,name,group,chunks,residual,pieces,description,...steps])=>{
 const method=['cross','f2l'].includes(stage)?'cfop':'roux';
 const solution=clean(chunks.join(' ')),setup=clean([residual,inverse(solution)].join(' '));
 const initial=k.defaultPattern().applyAlg(setup);
 const final=initial.applyAlg(solution);
 const expected=k.defaultPattern().applyAlg(residual);
 assert.deepEqual(final.patternData,expected.patternData);
 let goal=stage==='cross'?'cross':stage==='f2l'?'f2l-pair':stage==='fb'?'first-block':stage==='sb'?'second-block':slug.startsWith('ul-ur')?'lse-lr':['quatro-arestas','fechar-centros'].includes(slug)?'solved':'lse-eo';
 const region=stage==='cross'?cross:stage==='f2l'?[...cross,...left,...right].filter(p=>!['FR','DFR'].includes(p)):stage==='fb'?left:stage==='sb'?[...left,...right]:[...left,...right,...corners];
 const preserve=solved(initial,[...new Set(region)]);
 assert(preserve.every(p=>locate(final,p).solved));
 const milestones=[{step:0,title:'Reconhecer e planejar',explanation:description+' Estado inicial: '+snapshot(initial,pieces)}];
 let applied=0;
 chunks.forEach((chunk,i)=>{applied+=clean(chunk).split(' ').length;const [title,explanation]=steps[i];const state=initial.applyAlg(solution.split(' ').slice(0,applied).join(' '));milestones.push({step:applied,title,explanation:explanation+' Confira: '+snapshot(state,pieces)});});
 const references=stage==='cross'?['D','F','R','B','L']:stage==='f2l'?[...cross,'D','F','R']:stage==='fb'?['D','L']:stage==='sb'?[...left,'D','R']:stage==='lse'?[...left,...right,...corners,'U','D']:[];
 return {id:`${method}/${stage}/${slug}`,kind:'exercise',family:stage==='cross'?'CROSS':stage.toUpperCase(),methodId:method,stageId:stage,groupId:stage==='lse'?(goal==='lse-eo'?'eo':goal==='lse-lr'?'ul-ur':'finish'):stage==='f2l'?'fundamentals':stage==='cross'?'cross-practice':stage==='fb'?'first-block-practice':'second-block-practice',group,name,
 aliases:[slug,stage==='fb'?'primeiro bloco':stage==='sb'?'segundo bloco':stage==='lse'?'últimas seis arestas':stage==='cross'?'cruz branca':'fundamentos F2L'],nameKind:'descriptive',nameSource:'Títulos didáticos autorais Nexus Cube; não são nomes universais de casos.',
 setup,solution,alternatives:[],objective:description,
 preconditions:[stage==='lse'?'Dois blocos e todos os cantos resolvidos na referência fixa.':stage==='sb'?'Primeiro bloco esquerdo resolvido.':stage==='f2l'?'Cruz branca e os outros três pares resolvidos.':'U amarelo, D branco, F verde, R vermelho, B azul e L laranja.',...(stage==='lse'&&goal!=='lse-eo'?['EO concluída: centros U/D e adesivos U/D das seis arestas no eixo vertical.']:[]),`Peças já corretas que devem voltar corretas ao final: ${preserve.join(', ')||'nenhuma exigida neste exemplo'}.`],
 preservation:[`Ao concluir, preserve ${preserve.join(', ')||'a referência dos centros'}.`,'Alguns movimentos podem deslocar temporariamente peças protegidas; confira sua restauração no fim.'],
 milestones,focus:{kind:'pieces',pieces,referencePieces:references},validation:{goal,...(stage==='f2l'?{targetSlot:'FR'}:{}),preserve,referenceFrame:'fixed'},
 provenance:[{title:'Corpus didático Nexus Cube',url:'docs/expansion-curation/README.md',author:'Nexus Cube, curadoria Trama',license:'Produção autoral do projeto',notes:'Estados e sequências montados localmente e verificados com KPuzzle e modelo geométrico. Exemplos finitos, não catálogo universal de construções intuitivas.'},...(residual===sune?[{title:'Semente Sune para o estado residual',url:'https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts',author:'Luke Jackson, Cube Coach',license:'MIT',notes:'OLL-27 já presente no catálogo licenciado. Usado somente para deixar os cantos superiores pendentes após concluir a tarefa.'}]:[]),...provenance[stage]]};
});
assert.equal(data.length,24);
writeFileSync('src/data/expansion-sources/exercises.ts',"// Generated by docs/expansion-curation/generate-exercises.mjs.\nimport type { ExpansionExerciseSource } from '../../domain/types';\nexport const EXERCISE_SOURCES: readonly ExpansionExerciseSource[] = "+JSON.stringify(data,null,2)+';\n');
console.log(JSON.stringify({exercises:data.length,stages:Object.fromEntries(['cross','f2l','fb','sb','lse'].map(s=>[s,data.filter(d=>d.stageId===s).length]))}));
