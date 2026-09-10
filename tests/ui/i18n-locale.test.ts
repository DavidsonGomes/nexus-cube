import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AVAILABLE_LOCALES,DEFAULT_LOCALE,dictionaryFor,localeReady} from '../../src/i18n';
import {ptBR} from '../../src/i18n/pt-BR';

test('locale surface: pt-BR ready, es/en declared but honestly pending until curated content lands',()=>{
  assert.deepEqual([...AVAILABLE_LOCALES],['pt-BR','es','en']);
  assert.equal(localeReady('pt-BR'),true);
  assert.equal(localeReady('es'),false);
  assert.equal(localeReady('en'),false);
  assert.equal(dictionaryFor('es'),ptBR);
  assert.equal(DEFAULT_LOCALE,'pt-BR');
});

test('loadLocale falls back to the default on unknown, unready or blocked storage',async()=>{
  const prior=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  try{
    let value:string|null='es';
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>value,setItem:()=>{throw new Error('blocked');}}});
    const {loadLocale,persistLocale}=await import('../../src/i18n');
    assert.equal(loadLocale(),'pt-BR');
    value='pt-BR';
    assert.equal(loadLocale(),'pt-BR');
    value='xx';
    assert.equal(loadLocale(),'pt-BR');
    persistLocale('pt-BR');
  }finally{if(prior)Object.defineProperty(globalThis,'localStorage',prior);else Reflect.deleteProperty(globalThis,'localStorage');}
});

test('the app shell renders every string through the dictionary, never hardcoded nav labels or headings',()=>{
  const source=readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
  assert.match(source,/I18nProvider value=\{dictionaryFor\(locale\)\}/);
  assert.match(source,/t\.shell\.nav\[id\]/);
  assert.match(source,/t\.shell\.headings\[area\]\.title/);
  assert.match(source,/language-picker/);
  assert.doesNotMatch(source,/label:'Treinadores'|'Seu próximo melhor tempo\.'/);
});
