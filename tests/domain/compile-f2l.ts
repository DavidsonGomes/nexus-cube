/** MIT Cube Coach source snapshot, adaptation validated by independent cubie fixtures. */
import { cases } from '../../src/data/f2l-source';
import { writeFileSync } from 'node:fs';
import { applyAlgorithm, canonicalOrientation, invertAlgorithm, parseAlgorithm, solvedCube } from '../../src/domain/cube';
import { arePiecesSolved, CROSS_PIECES, f2lSignature } from '../../src/domain/stage-validation';
const source='https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts';
const protectedPieces=[...CROSS_PIECES,'FL','DFL','BR','DBR','BL','DBL'];
const groups:Record<string,string>={'Basic Insert':'Inserção básica','Different Facing Up':'Cores superiores diferentes','Same Facing Up':'Cores superiores iguais','White Facing Up':'Branco para cima','Incorrectly Connected':'Par conectado incorretamente','Corner In Edge Out':'Canto no slot, aresta fora','Edge In Corner Out':'Aresta no slot, canto fora','Both In Slot':'Ambas as pecas no slot'};
const data=cases.filter(c=>c.type==='f2l').map(c=>{
 const normalize=(a:string)=>canonicalOrientation(a.replace(/[()]/g,''));
 const algorithm=normalize(c.moves[0]);
 const setup=invertAlgorithm(algorithm),state=applyAlgorithm(solvedCube(),setup);
 if(!arePiecesSolved(state,protectedPieces))throw new Error(`Invalid principal slot ${c.name}`);
 const signature=f2lSignature(state),alternatives:string[]=[];
 for(const raw of c.moves.slice(1)){
  let found:string|undefined;
  for(const y of ['', 'y','y2',"y'"])for(const u of ['', 'U','U2',"U'"]){
   const candidate=normalize([y,u,raw.replace(/[()]/g,'')].filter(Boolean).join(' '));
   const candidateState=applyAlgorithm(solvedCube(),invertAlgorithm(candidate));
   if(arePiecesSolved(candidateState,protectedPieces)&&f2lSignature(candidateState)===signature&&arePiecesSolved(applyAlgorithm(state,candidate),[...protectedPieces,'FR','DFR'])){found=candidate;break;}
  }
  if(!found)throw new Error(`Unaligned alternative ${c.name}: ${raw}`);
  if(found!==algorithm&&!alternatives.includes(found))alternatives.push(found);
 }
 return {id:`cfop/f2l/${String(c.name).padStart(2,'0')}`,family:'F2L',name:`${groups[c.group]} ${cases.filter(x=>x.type==='f2l'&&x.group===c.group).findIndex(x=>x.name===c.name)+1}`,aliases:[`F2L ${c.name}`,`F2L${c.name}`,c.group],nameKind:'descriptive',nameSource:source,group:groups[c.group],algorithm,alternatives,setup,twoLook:false,source};
});
writeFileSync('src/data/f2l-compiled.ts',`// Adapted from Cube Coach, MIT. See docs/sources-and-licenses.md.\nimport type { AlgorithmCase } from '../domain/types';\nexport const F2L_CASES: readonly Omit<AlgorithmCase,'initialState'>[] = ${JSON.stringify(data,null,2)};\n`);
console.log(`Compiled ${data.length} F2L cases, ${data.reduce((n,c)=>n+c.alternatives.length,0)} alternatives.`);
