// Captura apenas fatos matematicos derivados. Nao incorpora JS ou imagens de terceiros.
// Rodar explicitamente para renovar referencias, nunca no teste offline do produto.
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { puzzles } from 'cubing/puzzles';
import { ollClass, pllClass } from './cube-cases.mjs';

const capturedAt=new Date().toISOString();
const sources={}; const references={};
const puzzle=await puzzles['3x3x3'].kpuzzle();
function readJSONArray(source, marker) {
  const start=source.indexOf(marker)+marker.length;
  if(start<marker.length||source[start]!=='[')throw new Error('Reference array missing');
  let depth=0,quoted=false,escaped=false;
  for(let p=start;p<source.length;p++) {
    const c=source[p];
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
    if(c==='"')quoted=true;else if(c==='[')depth++;else if(c===']'&&--depth===0)return JSON.parse(source.slice(start,p+1));
  }
  throw new Error('Reference array truncated');
}
for(const family of ['oll','pll']) {
  const url=`https://jperm.net/lib/${family}.js?v=20190924-1156`;
  const response=await fetch(url);if(!response.ok)throw new Error(`Reference HTTP ${response.status}`);
  const source=await response.text();sources[family]={url,sha256:createHash('sha256').update(source).digest('hex')};
  const matches=[...source.matchAll(/\{name:(\d+|"[A-Za-z]+"),alg:\[/g)];
  const setups=readJSONArray(source,'algsetScrambles=');
  if(setups.length!==matches.length)throw new Error('Setup/ID count mismatch');
  for(let i=0;i<matches.length;i++) {
    const match=matches[i],name=JSON.parse(match[1]);
    const block=source.slice(match.index, matches[i+1]?.index ?? source.length);
    const id=family==='oll'?`OLL-${String(name).padStart(2,'0')}`:`PLL-${name}`;
    const classes=setups[i].map(setup=>{
      // Setups publicados separados dos algoritmos. Sem inverter algoritmo de qualquer fonte.
      const pd=puzzle.defaultPattern().applyAlg(setup).patternData;
      if(pd.CENTERS.pieces.some((v,i)=>v!==i))throw new Error(`${id}: reference needs center normalization`);
      const coordinates=family==='oll'?{corners:pd.CORNERS.orientation.slice(0,4),edges:pd.EDGES.orientation.slice(0,4)}:{corners:pd.CORNERS.pieces.slice(0,4),edges:pd.EDGES.pieces.slice(0,4)};
      if(pd.CORNERS.pieces.slice(4).some((v,j)=>v!==j+4)||pd.CORNERS.orientation.slice(4).some(v=>v!==0)||pd.EDGES.pieces.slice(4).some((v,j)=>v!==j+4)||pd.EDGES.orientation.slice(4).some(v=>v!==0))throw new Error(`${id}: reference violates F2L`);
      if(family==='pll'&&(pd.CORNERS.orientation.some(v=>v!==0)||pd.EDGES.orientation.some(v=>v!==0)))throw new Error(`${id}: reference PLL un-oriented`);
      return family==='oll'?ollClass(coordinates):pllClass(coordinates);
    });
    if(new Set(classes).size!==1)throw new Error(`${id}: reference setups disagree`);
    references[id]={kind:'external-published-setups-independent-engine',class:classes[0],setupCount:setups[i].length,setupHash:createHash('sha256').update(JSON.stringify(setups[i])).digest('hex')};
    if(family==='pll') {
      // Setas publicadas no diagrama PLL, nao algoritmo invertido.
      const cp=[0,1,2,3],ep=[0,1,2,3];
      const cornerSlots=[8,2,0,6],edgeSlots=[7,5,1,3];
      const arrows=[...block.matchAll(/s1:\{face:0,n:(\d)\},s2:\{face:0,n:(\d)\}/g)];
      for(const arrow of arrows) {
        const from=Number(arrow[1]),to=Number(arrow[2]);
        const slots=cornerSlots.includes(from)?cornerSlots:edgeSlots;
        const values=slots===cornerSlots?cp:ep;
        const start=slots.indexOf(from),end=slots.indexOf(to);if(start<0||end<0)throw new Error('Invalid arrow');
        values[start]=end;
      }
      if(arrows.length) {
        const arrowClass=pllClass({corners:cp,edges:ep});
        if(arrowClass!==classes[0])throw new Error(`${id}: diagram arrows disagree with setups`);
        references[id].diagramClass=arrowClass;
        references[id].arrows=arrows.map(m=>[Number(m[1]),Number(m[2])]);
      }
    }
  }
}
if(Object.keys(references).length!==78)throw new Error(`Expected 78, got ${Object.keys(references).length}`);
await writeFile(new URL('./reference-classes.json',import.meta.url),JSON.stringify({capturedAt,sources,references},null,2)+'\n');
console.log('Captured 78 classes from independently published setups, plus available PLL diagram permutations.');
