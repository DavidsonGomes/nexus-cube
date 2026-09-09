import { useState, useEffect, useRef } from 'react';
import { Timer, History, Library, Settings, Box, WandSparkles, ArrowUpRight, Moon, Sun, Sparkles } from 'lucide-react';
import {DataProvider,useData} from './components/AppContext';
import TimerPage from './features/Timer';
import HistoryPage from './features/History';
import AlgorithmsPage from './features/Algorithms';
import SettingsPage from './features/Settings';
import SolverPage from './features/Solver';
import ModalFocus from './components/ModalFocus';
import GuestRecovery from './components/GuestRecovery';
import DraftRecovery from './components/DraftRecovery';
import AccountPanel from './components/AccountPanel';
import PersistenceStatus from './components/PersistenceStatus';
import type {ContextHandle} from './cloud/types';
import {areaFromHash,listenAreaHash,revertAreaHash,writeAreaHash} from './components/hashRoute';
type Area = 'timer' | 'history' | 'algorithms' | 'solver' | 'settings';
const navigation = [{id:'timer',label:'Timer',icon:Timer},{id:'history',label:'Histórico',icon:History},{id:'algorithms',label:'Algoritmos',icon:Library},{id:'solver',label:'Solucionar',icon:WandSparkles},{id:'settings',label:'Configurações',icon:Settings}] as const;
const areaRoute={areas:navigation.map(item=>item.id),fallback:'timer'} as const;
export default function App(){return <DataProvider><ModalFocus/><Shell/></DataProvider>}
export function Shell(){
 const [requestedArea,setArea]=useState<Area>(()=>areaFromHash(location.hash,areaRoute)); const {data,cloud,service,update,error,notice,notify,notifyForContext,timerBusy,saving,localSaving}=useData();
 const heading=useRef<HTMLHeadingElement>(null);
 const currentBusy=useRef(timerBusy);currentBusy.current=timerBusy;
 function authenticated(context:ContextHandle,message:string){
   const current=service.getSnapshot();
   if(current.status!=='authenticated'||!current.context||current.context.projectRef!==context.projectRef||current.context.userId!==context.userId||current.context.generation!==context.generation)return;
   if(currentBusy.current){setArea('timer');message+=' Conclua o registro antes de abrir outra área.';}
   notifyForContext(message,context);setAccountOpen(false);
   requestAnimationFrame(()=>heading.current?.focus({preventScroll:true}));
 }
 const fullAccess=cloud.status==='authenticated'||cloud.status==='offline-account';
 const area=fullAccess?requestedArea:'timer';
 const routeState=useRef({busy:false,area:'timer' as Area,fullAccess:false});
 routeState.current={busy:timerBusy||saving,area,fullAccess};
 useEffect(()=>listenAreaHash(areaRoute,next=>{const current=routeState.current;if(current.busy){revertAreaHash(current.area);return;}setArea(next);if(!current.fullAccess&&next!=='timer')setAccountOpen(true);}),[]);
 function navigate(next:Area){if(timerBusy||saving)return;setArea(next);writeAreaHash(next);if(!fullAccess&&next!=='timer')setAccountOpen(true);}
 const [accountOpen,setAccountOpen]=useState(()=>location.pathname==='/auth/callback');
 const identityKey=cloud.context?`${cloud.context.projectRef}:${cloud.context.userId??'guest'}:${cloud.context.generation}`:'locked';
 useEffect(()=>{if(cloud.status==='recovery')setAccountOpen(true);},[cloud.status]);
 const [systemDark,setSystemDark]=useState(matchMedia('(prefers-color-scheme: dark)').matches);
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const change=()=>setSystemDark(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 const dark=data.settings.theme==='dark'||(data.settings.theme==='system'&&systemDark);
 useEffect(()=>{const root=document.documentElement;root.style.colorScheme=dark?'dark':'light';root.dataset.theme=dark?'dark':'light';},[dark]);
 function theme(){update(p=>({...p,settings:{...p.settings,theme:dark?'light':'dark'}}));}
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>notify(''),5000);return()=>clearTimeout(timer);},[notice]);
 return <div className={`app ${dark?'dark':''}`} data-area={area}><aside className="sidebar"><a className="brand" href="#timer" onClick={e=>{if(timerBusy)e.preventDefault();else navigate('timer');}}><img src="/icon.svg" alt=""/><span>Nexus<span className="brand-light"> Cube</span><small>UM MOVIMENTO À FRENTE</small></span></a><div className="nav-label">SEU ESPAÇO DE TREINO</div><nav>{navigation.map(({id,label,icon:Icon})=><button key={id} className={area===id?'nav-item active':'nav-item'} disabled={timerBusy} onClick={()=>navigate(id)}><Icon size={20}/><span>{label}</span>{area===id&&<span className="nav-dot"/>}</button>)}</nav><div className="sidebar-bottom"><div className="practice-note"><Sparkles size={19}/><strong>Consistência vira evolução.</strong><p>Um scramble de cada vez.<br/>No seu ritmo.</p></div><button className="theme-button" onClick={theme}>{dark?<Sun size={18}/>:<Moon size={18}/>}<span>Tema {dark?'claro':'escuro'}</span><span className="theme-switch"/></button><div className="local-badge"><PersistenceStatus phase={cloud.sync} guest={!fullAccess} localSaving={localSaving} pendingCount={cloud.syncPendingCount}/></div></div></aside><main className="main"><header className="topbar"><div className="topbar-context"><div className="breadcrumb">Seu treino <span>/</span> <strong>{navigation.find(n=>n.id===area)?.label}</strong></div>{fullAccess&&<PersistenceStatus phase={cloud.sync} localSaving={localSaving} pendingCount={cloud.syncPendingCount} error={cloud.syncError}/>}</div><div className="topbar-right"><span className="puzzle-badge"><Box size={15}/> Cubo 3×3</span><button className="icon-button mobile-theme" onClick={theme} aria-label="Alternar tema">{dark?<Sun size={18}/>:<Moon size={18}/>}</button><button className="avatar account-trigger" aria-label="Abrir conta" data-testid="account-open" disabled={timerBusy||saving} onClick={()=>setAccountOpen(true)}>{cloud.identity?cloud.identity.email?.slice(0,2).toUpperCase()??'EU':'Entrar'}</button></div></header><div className="page"><div className="page-heading"><div><div className="eyebrow">ENCONTRE SEU RITMO</div><h1 ref={heading} tabIndex={-1}>{area==='timer'?'Seu próximo melhor tempo.':area==='history'?'Cada solve conta.':area==='algorithms'?'Entenda. Pratique. Domine.':area==='solver'?'Cada cor, um próximo passo.':'Do seu jeito.'}</h1><p>{area==='timer'?'Respire, concentre-se e faça cada movimento valer.':area==='history'?'Seu progresso, uma resolução de cada vez.':area==='algorithms'?'CFOP e Roux, da primeira peça ao último movimento.':area==='solver'?'Informe seu estado e acompanhe uma solução para o cubo 3×3.':'Prepare seu espaço para o próximo treino.'}</p></div>{area==='timer'&&<button className="button secondary" disabled={timerBusy} onClick={()=>navigate('history')}><History size={16}/> Ver histórico <ArrowUpRight size={16}/></button>}</div>{error&&<div className="error-banner" role="alert">Não foi possível concluir: {error}<button className="text-button" disabled={timerBusy} onClick={()=>{if(fullAccess)navigate('settings');else document.getElementById('guest-recovery')?.scrollIntoView({block:'center'});}}>Recuperar dados</button></div>}<fieldset className="workspace-fields" key={identityKey} aria-busy={saving}>{!fullAccess&&<GuestRecovery/>}{cloud.data&&<DraftRecovery/>}{cloud.data?(!fullAccess||area==='timer'?<TimerPage navigate={navigate}/>:area==='history'?<HistoryPage/>:area==='algorithms'?<AlgorithmsPage/>:area==='solver'?<SolverPage/>:<SettingsPage/>):<section className="panel account-gate"><span className="eyebrow">SEU ESPAÇO DE TREINO</span><h2>{cloud.status==='initializing'?'Preparando seu espaço…':'Abra seu espaço com segurança.'}</h2><p className="muted">{cloud.status==='initializing'?'Conferindo o armazenamento deste dispositivo.':'Entre novamente ou escolha continuar como visitante. Os dados de cada conta permanecem separados.'}</p>{cloud.status!=='initializing'&&<button className="button" onClick={()=>setAccountOpen(true)}>Acessar minha conta</button>}</section>}</fieldset>{notice&&<div className="toast" role="status">{notice}<button aria-label="Dispensar aviso" onClick={()=>notify('')}>×</button></div>}<footer className="page-footer"><span>NEXUS CUBE</span> Feito para o seu próximo passo.<span className="footer-right">3×3 · CFOP & Roux · Seu ritmo</span></footer></div></main>{accountOpen&&<AccountPanel onAuthenticated={authenticated} onClose={()=>setAccountOpen(false)} requestedFeature={!fullAccess&&requestedArea!=='timer'?navigation.find(item=>item.id===requestedArea)?.label:undefined}/>}</div>
}
