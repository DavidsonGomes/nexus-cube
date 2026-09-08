// Reproduce with: node --import tsx docs/expansion-curation/generate-cmll.mjs
// Authorial search over corner transformations. No external CMLL dataset.
import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { Alg } from 'cubing/alg';
import { COMPILED_CASES } from '../../src/data/catalog-compiled.ts';

const k = await puzzles['3x3x3'].kpuzzle();
const key = s => s.p.join('') + s.o.join('');
const rotate = (a,n) => a.map((_,i)=>a[(i+n)%4]);
const orientationKey = o => [0,1,2,3].map(n=>rotate(o,n).join('')).sort()[0];
const canonical = s => [0,1,2,3].flatMap(a=>[0,1,2,3].map(b=>key({p:rotate(s.p,a).map(n=>(n+b)%4),o:rotate(s.o,a)}))).sort()[0];
const inverse = a => new Alg(a).invert().toString();
function simplify(alg){
 const stack=[];
 for(const token of alg.split(/\s+/)){
  const face=token.replace(/[2']/g,''),n=token.includes('2')?2:token.endsWith("'")?3:1;
  const previous=stack.at(-1);
  if(previous?.face===face){const amount=(previous.n+n)%4;stack.pop();if(amount)stack.push({face,n:amount});}
  else stack.push({face,n});
 }
 return stack.map(({face,n})=>face+(n===2?'2':n===3?"'":'')).join(' ');
}
const seeds = new Map();
for (const row of [{id:'U',algorithm:'U',alternatives:['U2',"U'"]},...COMPILED_CASES]) {
  for (const alg of [row.algorithm,...row.alternatives]) {
    const c=k.defaultPattern().applyAlg(alg).patternData.CORNERS;
    assert(c.pieces.slice(4).every((v,i)=>v===i+4)&&c.orientation.slice(4).every(v=>v===0));
    const s={p:c.pieces.slice(0,4),o:c.orientation.slice(0,4),alg,n:alg.split(/\s+/).length,id:row.id};
    if(!seeds.has(key(s))||seeds.get(key(s)).n>s.n)seeds.set(key(s),s);
  }
}
const start={p:[0,1,2,3],o:[0,0,0,0],n:0,alg:'',seeds:[]};
const best=new Map([[key(start),start]]), done=new Map();
while(true){
  let s;for(const [id,v] of best)if(!done.has(id)&&(!s||v.n<s.n))s=v;
  if(!s)break;done.set(key(s),s);
  for(const t of seeds.values()){
    const x={p:t.p.map(i=>s.p[i]),o:t.p.map((i,j)=>(s.o[i]+t.o[j])%3),n:s.n+t.n,alg:[s.alg,t.alg].filter(Boolean).join(' '),seeds:[...s.seeds,t.id]};
    if(!best.has(key(x))||best.get(key(x)).n>x.n)best.set(key(x),x);
  }
}
assert.equal(done.size,648);
const classes=new Map();
for(const s of done.values())if(!classes.has(canonical(s)))classes.set(canonical(s),s);
assert.equal(classes.size,43);classes.delete(canonical(start));
const groupByOrientation=new Map([['0000','O']]);
for(const [id,group] of [[21,'H'],[22,'Pi'],[23,'U'],[24,'T'],[25,'L'],[26,'AS'],[27,'S']]){
 const r=COMPILED_CASES.find(r=>r.id===`OLL-${id}`);
 groupByOrientation.set(orientationKey(k.defaultPattern().applyAlg(r.setup).patternData.CORNERS.orientation.slice(0,4)),group);
}
const groupOrder=['O','H','Pi','U','T','S','AS','L'];
const groupLabels={O:'Cantos orientados',H:'H: dois pares laterais',Pi:'Pi: quatro cantos inclinados',U:'U: dois cantos vizinhos',T:'T: dois cantos vizinhos',S:'Sune',AS:'Antisune',L:'L: dois cantos diagonais'};
const groupCounts={};
const rows=[...classes.entries()].map(([signature,s])=>({...s,signature,group:groupByOrientation.get(orientationKey(s.o))})).sort((a,b)=>groupOrder.indexOf(a.group)-groupOrder.indexOf(b.group)||a.signature.localeCompare(b.signature));
const sourceURL='https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts';
const proof=[];
const data=rows.map((s,index)=>{
 const ordinal=(groupCounts[s.group]??0)+1;groupCounts[s.group]=ordinal;
 const algorithm=simplify(inverse(s.alg));
 const moveCount=algorithm.split(' ').length;
 const id=`roux/cmll/${String(index+1).padStart(2,'0')}`;
 assert.deepEqual(k.defaultPattern().applyAlg(algorithm).patternData,k.defaultPattern().applyAlg(inverse(s.alg)).patternData);
 proof.push({id,signature:s.signature,seedIds:s.seeds,setup:s.alg,moveCount,rawMoveCount:s.n,recognition:{pieces:s.p,orientation:s.o}});
 return {id,family:'CMLL',methodId:'roux',stageId:'cmll',groupId:s.group,group:s.group,
 name:`${groupLabels[s.group]} ${ordinal}`,aliases:[`CMLL ${s.group}${ordinal}`,`CMLL ${index+1}`,`${s.group} configuração ${ordinal}`],nameKind:'descriptive',
 nameSource:'Grupos convencionais CMLL; títulos e ordinais editoriais Nexus Cube, ordenados pela assinatura de cantos. Ver docs/expansion-curation/README.md.',
 algorithm,alternatives:[],recognition:{pieces:s.p,orientation:s.o},
 objective:'Orientar e posicionar os quatro cantos superiores, mantendo os dois blocos Roux. As seis arestas livres ficam para LSE.',
 preconditions:['Blocos esquerdo e direito 1×2×3 completos.','Amarelo em U e verde em F; observe os quatro cantos, incluindo suas cores laterais.'],
 preservation:['Blocos DL/FL/BL/DFL/DBL e DR/FR/BR/DFR/DBR ao terminar.'],
 milestones:[{step:0,title:'Reconhecer os cantos',explanation:`Identifique o grupo ${s.group} pelos amarelos. Compare depois as três cores de cada canto com o modelo; as arestas não definem este caso.`},{step:moveCount,title:'Cantos concluídos',explanation:'Confira as cores laterais dos quatro cantos em relação aos blocos. Continue em LSE para resolver arestas e centros.'}],
 focus:{kind:'pieces',pieces:['UFR','URB','UBL','ULF'],referencePieces:['DL','FL','BL','DFL','DBL','DR','FR','BR','DFR','DBR']},
 provenance:[{title:'Geração de classes CMLL do Nexus Cube',url:'docs/expansion-curation/README.md',author:'Nexus Cube, curadoria Trama',license:'Produção autoral; sementes MIT com atribuição preservada',notes:`Busca própria por transformações de cantos; sementes ${s.seeds.join(', ')}. Não é cópia de coleção CMLL externa nem promessa de algoritmo ótimo.`},{title:'Cube Coach, sementes algorítmicas',url:sourceURL,author:'Luke Jackson',license:'MIT',notes:'Commit 856b269c63715fbd164b90aee1de5f4725fd277a. Atribuição integral em docs/sources-and-licenses.md.'},{title:'CMLL, definição de cobertura',url:'https://sites.google.com/view/kianroux/cmll',author:'Kian Mansour',license:'Referência factual; nenhum texto, imagem ou coleção redistribuído'}]};
});
assert.deepEqual(groupCounts,{O:2,H:4,Pi:6,U:6,T:6,S:6,AS:6,L:6});
mkdirSync('src/data/expansion-sources',{recursive:true});
writeFileSync('src/data/expansion-sources/cmll.ts',"// Generated by docs/expansion-curation/generate-cmll.mjs.\nimport type { ExpansionAlgorithmSource } from '../../domain/types';\nexport const CMLL_SOURCES: readonly ExpansionAlgorithmSource[] = "+JSON.stringify(data,null,2)+';\n');
writeFileSync('docs/expansion-curation/cmll-proof.json',JSON.stringify({states:done.size,nontrivialClasses:42,groupCounts,convention:'U before/after, lateral cyclic relabeling; Reid UFR URB UBL ULF',cases:proof},null,2)+'\n');
const finalLengths=data.map(row=>row.algorithm.split(' ').length).sort((a,b)=>a-b);
console.log(JSON.stringify({states:648,classes:42,groupCounts,minMoves:finalLengths[0],medianMoves:(finalLengths[20]+finalLengths[21])/2,maxMoves:finalLengths.at(-1)}));
