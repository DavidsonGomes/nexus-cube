import { CATALOG_SOURCE } from './catalog-source';
import type { CaseMetadata } from '../domain/types';
// Descriptive numbering is our editorial convention within each source group,
// ordered by OLL ID. It is not asserted to be a universal naming standard.
const source='https://github.com/lukejacksonn/cube/blob/856b269c63715fbd164b90aee1de5f4725fd277a/src/algorithms.ts';
const glossary='https://www.cubeskills.com/tools/glossary';
const pllNames='https://www.cubeskills.com/uploads/pdf/tutorials/pll-algorithms.pdf';
const names: Record<string,[string,string]>={
  Dot:['Ponto','Dot'], 'Square Shape':['Quadrado','Square'],
  'Small Lightning Bolt':['Raio pequeno','Small Lightning Bolt'],
  'Fish Shape':['Peixe','Fish'], 'Knight Move Shape':['Cavalo','Knight Move'],
  Cross:['Cruz','Cross'], 'Corners Oriented':['Cantos orientados','Corners Oriented'],
  'Awkward Shape':['Irregular','Awkward'], 'P Shape':['Forma P','P Shape'],
  'T Shape':['Forma T','T Shape'], 'C Shape':['Forma C','C Shape'],
  'W Shape':['Forma W','W Shape'], 'Big Lightning Bolt':['Raio grande','Big Lightning Bolt'],
  'Small L Shape':['L pequeno','Small L Shape'], 'I Shape':['Linha','I Shape'],
};
export const CASE_METADATA: Readonly<Record<string,CaseMetadata>>=Object.fromEntries(CATALOG_SOURCE.map(raw=>{
  if(raw.family==='PLL')return [`PLL-${raw.name}`,{name:`Permutação ${raw.name}`,aliases:[`${raw.name} perm`,`${raw.name}-perm`,`${raw.name} permutation`,`PLL ${raw.name}`],nameKind:'common',nameSource:pllNames} satisfies CaseMetadata];
  const members=CATALOG_SOURCE.filter(c=>c.family==='OLL'&&c.group===raw.group).sort((a,b)=>Number(a.name)-Number(b.name));
  const ordinal=members.findIndex(c=>c.name===raw.name)+1;
  const [pt,en]=names[raw.group];const id=`OLL-${raw.name.padStart(2,'0')}`;
  const aliases=[`${pt} ${ordinal}`,`${en} ${ordinal}`,`${raw.group} ${ordinal}`,`OLL ${raw.name}`,id];
  if(raw.name==='26')return [id,{name:'Antisune',aliases:[...aliases,'Anti-Sune','Anti Sune'],nameKind:'common',nameSource:glossary} satisfies CaseMetadata];
  if(raw.name==='27')return [id,{name:'Sune',aliases,nameKind:'common',nameSource:glossary} satisfies CaseMetadata];
  return [id,{name:`${pt} ${ordinal}`,aliases,nameKind:'descriptive',nameSource:source} satisfies CaseMetadata];
}));
