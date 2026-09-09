import type {Plugin} from 'vite';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';

/** Delivery hardening: the app shell (navigations, /index.html) and /sw.js are
 * network-first so a new deploy is picked up without DevTools or hard refresh;
 * the cache stays the offline fallback. Versioned assets remain cache-first. */
export function swSource(version:string,urls:readonly string[]):string{return `const CACHE='nexus-cube-${version}';
const ASSETS=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('nexus-cube-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||/^\\/(auth|rest|rpc|api|functions)(\\/|$)/.test(url.pathname)||url.searchParams.has('code')||url.searchParams.has('token_hash')||url.searchParams.has('access_token'))return;
const shell=event.request.mode==='navigate'||url.pathname==='/'||url.pathname==='/index.html'||url.pathname==='/sw.js';
event.respondWith((async()=>{const cache=await caches.open(CACHE);
if(shell){try{const fresh=await fetch(event.request);if(fresh.ok&&url.pathname!=='/sw.js')await cache.put('/index.html',fresh.clone());return fresh;}catch(error){const cached=await cache.match('/index.html');if(cached&&url.pathname!=='/sw.js')return cached;throw error;}}
const cached=await cache.match(event.request,{ignoreSearch:true});if(cached)return cached;
try{return await fetch(event.request);}catch(error){if(event.request.mode==='navigate')return (await cache.match('/index.html'))||Response.error();throw error;}})());});
`;}

export function offlinePlugin():Plugin{let directory='';return {name:'nexus-offline-assets',apply:'build',configResolved(config){directory=resolve(config.root,config.build.outDir);},async closeBundle(){async function walk(path:string):Promise<string[]>{const entries=await readdir(path,{withFileTypes:true});return (await Promise.all(entries.map(entry=>entry.isDirectory()?walk(resolve(path,entry.name)):Promise.resolve([resolve(path,entry.name)])))).flat();}const files=(await walk(directory)).filter(file=>!file.endsWith('/sw.js')).sort();const hash=createHash('sha256');for(const file of files)hash.update(await readFile(file));const version=hash.digest('hex').slice(0,16);const urls=files.map(file=>'/'+relative(directory,file));await writeFile(resolve(directory,'sw.js'),swSource(version,urls));console.log('Nexus offline: '+urls.length+' arquivos, incluindo chunks de workers e solver.');}};}
