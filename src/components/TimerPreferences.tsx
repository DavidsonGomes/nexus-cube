import {useEffect,useState} from 'react';
import {SlidersHorizontal,Smartphone,X} from 'lucide-react';
import {useData} from './AppContext';
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export default function TimerPreferences(){
 const {data,update,timerBusy,saving,notify}=useData();
 const [open,setOpen]=useState(false);
 const [install,setInstall]=useState<InstallEvent|null>(()=>(window as Window&{nexusInstallPrompt?:InstallEvent}).nexusInstallPrompt??null);
 useEffect(()=>{const listener=(event:Event)=>{event.preventDefault();setInstall(event as InstallEvent);};window.addEventListener('beforeinstallprompt',listener);return()=>window.removeEventListener('beforeinstallprompt',listener);},[]);
 const settings=data.settings;
 const patch=(value:Partial<typeof settings>)=>void update(previous=>({...previous,settings:{...previous.settings,...value}}));
 return <><button className="text-button" aria-label="Preferências do Timer" disabled={timerBusy||saving} onClick={()=>setOpen(true)}><SlidersHorizontal size={16}/> Preferências</button>{open&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="Preferências do Timer"><div className="panel-heading"><h2>No seu ritmo.</h2><button className="icon-button" onClick={()=>setOpen(false)} aria-label="Fechar preferências"><X size={20}/></button></div><p className="muted">O essencial para preparar seu próximo treino.</p>
 <label>Tema<select value={settings.theme} onChange={event=>patch({theme:event.target.value as typeof settings.theme})}><option value="light">Claro</option><option value="dark">Escuro</option><option value="system">Sistema</option></select></label>
 <label className="check-label"><input type="checkbox" checked={settings.inspection} onChange={event=>patch({inspection:event.target.checked})}/>Inspeção de 15 segundos</label><p className="muted small">De 15 a 17 segundos: +2. A partir de 17: DNF.</p>
 <label className="check-label"><input type="checkbox" checked={settings.inspectionSound} onChange={event=>patch({inspectionSound:event.target.checked})}/>Avisos sonoros aos 8 e 12 segundos</label>
 <label>Tempo para preparar<select value={settings.holdMs} onChange={event=>patch({holdMs:Number(event.target.value)})}><option value={300}>0,3 segundo</option><option value={500}>0,5 segundo</option><option value={800}>0,8 segundo</option></select></label>
 <label className="check-label"><input type="checkbox" checked={settings.hideRunningTime} onChange={event=>patch({hideRunningTime:event.target.checked})}/>Ocultar tempo durante a resolução</label>
 <label className="check-label"><input type="checkbox" checked={settings.focus} onChange={event=>patch({focus:event.target.checked})}/>Modo foco durante a resolução</label>
 <button className="button secondary" disabled={!install||saving} onClick={async()=>{await install?.prompt();const result=await install?.userChoice;if(result?.outcome==='accepted')notify('Aplicativo instalado.');setInstall(null);}}><Smartphone size={17}/> Instalar aplicativo</button><p className="muted small">No iPhone ou iPad, use Compartilhar e Adicionar à Tela de Início. O Timer funciona offline após carregar a versão de produção.</p>
 </section></div>}</>;
}
