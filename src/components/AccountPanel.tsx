import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowRight,CloudOff,LockKeyhole,LogOut,Mail,RefreshCw,UserRound,X} from 'lucide-react';
import {useData} from './AppContext';
import PersistenceStatus from './PersistenceStatus';
import SyncReview from './SyncReview';
import type {AuthResult,LogoutResult,ContextHandle} from '../cloud/types';

type Screen='signin'|'signup'|'reset';
export default function AccountPanel({onClose,onAuthenticated,requestedFeature}:{onClose:()=>void;onAuthenticated?:(context:ContextHandle,message:string)=>void;requestedFeature?:string}){
 const {cloud,service,authAction,timerBusy,saving,localSaving}=useData();
 const [screen,setScreen]=useState<Screen>('signin');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState('');
 const [message,setMessage]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const [logoutFailed,setLogoutFailed]=useState(false);
 const mounted=useRef(true),submitting=useRef(false);
 const sameContext=(a:ContextHandle,b:ContextHandle|null)=>!!b&&a.projectRef===b.projectRef&&a.userId===b.userId&&a.generation===b.generation;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{setPassword('');setRepeat('');setEmail('');},[cloud.context?.userId,cloud.context?.generation]);
 const account=cloud.status==='authenticated'||cloud.status==='offline-account';
 const openedForAccount=useRef(account);
 const recovery=cloud.status==='recovery';
 const blocked=timerBusy||saving||pending||cloud.status==='initializing';
 async function perform(action:Parameters<typeof authAction<AuthResult|LogoutResult|{kind:'guest'}>>[0],completion:'signin'|'signup'|null=null){
   if(blocked||submitting.current)return;submitting.current=true;setError('');setMessage('');setPending(true);
   const result=await authAction(action);
   submitting.current=false;
   if(!mounted.current)return;
   setPending(false);setPassword('');setRepeat('');
   switch(result.kind){
    case 'error':setError(result.message);break;
    case 'authenticated':{
      const current=service.getSnapshot();
      if(!sameContext(result.context,current.context)||current.identity?.id!==result.identity.id)return;
      const text=completion==='signup'?'Conta criada. Você já está conectado.':'Você entrou na sua conta.';
      if(completion&&current.status==='authenticated'&&onAuthenticated)onAuthenticated(result.context,text);
      else setMessage(text);
      break;
    }
    case 'confirmation-required':setMessage('O serviço solicitou confirmação deste cadastro. O envio depende da configuração de e-mail; se receber o link, abra neste navegador para continuar.');break;
    case 'email-requested':setMessage('Solicitação recebida. Para uma conta existente, o envio depende da configuração de e-mail, ainda em andamento. Se receber as instruções, abra o link neste navegador.');break;
    case 'recovery-required':setMessage('Link validado. Escolha sua nova senha.');break;
    case 'password-updated':setMessage('Senha atualizada. Entre com a nova senha para continuar.');setScreen('signin');break;
    case 'logged-out':setLogoutFailed(false);setMessage(result.remote==='confirmed'?'Você saiu desta conta neste dispositivo.':'A conta foi bloqueada neste dispositivo. Não foi possível confirmar a revogação remota.');break;
    case 'logout-storage-error':setLogoutFailed(true);setError(result.message+' A saída não foi concluída. Esta tela está bloqueada; tente sair novamente. Outras abas podem continuar conectadas.');break;
    case 'guest':onClose();break;
    default:{const exhaustive:never=result;return exhaustive;}
   }
 }
 function submit(event:FormEvent){event.preventDefault();event.stopPropagation();if(blocked||submitting.current)return;
   if((recovery||screen==='signup')&&password!==repeat){setError('As senhas precisam ser iguais.');return;}
   if(recovery){const recoveryContextId=cloud.recoveryContextId;if(!recoveryContextId){setError('Este link não está mais disponível. Solicite outro e-mail.');return;}void perform(service=>service.completePasswordReset({recoveryContextId,password}));}
   else if(screen==='reset')void perform(service=>service.requestPasswordReset(email.trim()));
   else if(screen==='signup')void perform(service=>service.signUp({email:email.trim(),password}),'signup');
   else void perform(service=>service.signIn({email:email.trim(),password}),'signin');
 }
 function changeScreen(next:Screen){setScreen(next);setPassword('');setRepeat('');setError('');setMessage('');}
 return <div className="modal-backdrop account-backdrop"><section className="modal account-panel" role="dialog" aria-modal="true" aria-labelledby="account-title">
   <div className="panel-heading"><span className="account-symbol"><UserRound size={24}/></span><button className="icon-button" aria-label="Fechar conta" onClick={onClose} disabled={pending}><X size={20}/></button></div>
   <span className="eyebrow">SEU ESPAÇO NO NEXUS CUBE</span>
   <h2 id="account-title">{account?'Sua conta. Seu ritmo.':recovery?'Uma nova senha.':screen==='signup'?'Comece seu próximo capítulo.':screen==='reset'?'Vamos recuperar seu acesso.':'Bom ter você por aqui.'}</h2>
   {!account&&requestedFeature&&<p className="account-feedback">Entre na sua conta para acessar {requestedFeature}. O Timer continua disponível sem login.</p>}
   <p className="muted" data-testid="auth-status">{cloud.status==='offline-account'?'Conta disponível offline neste navegador.':account?'Conectado com segurança.':recovery?'O link foi validado para alterar a senha.':'Entre na sua conta ou continue treinando como visitante.'}</p>
   {message&&<div className="account-feedback" role="status">{message}</div>}
   {error&&<div className="error-banner" role="alert">{error}</div>}{logoutFailed&&<button className="button secondary" disabled={blocked} onClick={()=>void perform(service=>service.signOut())}>Tentar sair novamente</button>}
   {account&&(pending||!openedForAccount.current)?<p role="status">{pending?'Concluindo sua entrada…':'O contexto da conta mudou. Feche esta janela para continuar; abra a conta novamente quando quiser gerenciá-la.'}</p>:account?<>
    <div className="account-identity" data-testid="identity-status"><Mail size={18}/><strong>{cloud.identity?.email??'Conta conectada'}</strong></div>
    <PersistenceStatus phase={cloud.sync} localSaving={localSaving} pendingCount={cloud.syncPendingCount} error={cloud.syncError} expanded/>
    <SyncReview key={cloud.context?`${cloud.context.projectRef}:${cloud.context.userId}:${cloud.context.generation}`:'locked'} api={service} phase={cloud.sync}/>
    <button className="button secondary" disabled={blocked} onClick={()=>void perform(service=>service.refresh())}><RefreshCw size={16}/> Verificar conexão da conta</button>
    <button className="button secondary" data-testid="auth-signout" disabled={blocked} onClick={()=>void perform(service=>service.signOut())}><LogOut size={16}/> Sair desta conta</button>
   </>:<>
    {!recovery&&<div className="segmented account-tabs"><button data-testid="auth-signin" className={screen==='signin'?'active':''} disabled={blocked} onClick={()=>changeScreen('signin')}>Entrar</button><button data-testid="auth-signup" className={screen==='signup'?'active':''} disabled={blocked} onClick={()=>changeScreen('signup')}>Criar conta</button></div>}
    <form onSubmit={submit}>
     {!recovery&&<label>E-mail<input data-testid="auth-email" type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} required disabled={blocked} placeholder="voce@exemplo.com"/></label>}
     {(recovery||screen!=='reset')&&<label>{recovery?'Nova senha':'Senha'}<input data-testid="auth-password" type="password" autoComplete={recovery||screen==='signup'?'new-password':'current-password'} minLength={screen==='signin'?undefined:8} value={password} onChange={event=>setPassword(event.target.value)} required disabled={blocked}/></label>}
     {(recovery||screen==='signup')&&<label>Repita a senha<input type="password" autoComplete="new-password" minLength={8} value={repeat} onChange={event=>setRepeat(event.target.value)} required disabled={blocked}/><small>Use pelo menos 8 caracteres.</small></label>}
     <button className="button" data-testid="auth-submit" disabled={blocked}>{pending?'Aguarde…':recovery?'Salvar nova senha':screen==='signup'?'Criar minha conta':screen==='reset'?'Enviar instruções':'Entrar'}<ArrowRight size={17}/></button>
    </form>
    {!recovery&&screen==='signin'&&<button className="text-button" data-testid="auth-recovery" disabled={blocked} onClick={()=>changeScreen('reset')}>Esqueci minha senha</button>}
    {cloud.status==='locked'&&<button className="button secondary" disabled={blocked} onClick={()=>void perform(service=>service.resumeOffline())}>Retomar conta anterior offline</button>}
    <button className="text-button" disabled={blocked} onClick={()=>void perform(service=>service.openGuest())}>{recovery?'Cancelar recuperação':'Continuar como visitante'}</button>
    {screen==='reset'&&!recovery&&<p className="account-feedback">A recuperação depende do serviço de e-mail, cuja configuração pública ainda está em andamento. Envio e recebimento não estão garantidos nesta etapa.</p>}
    <p className="account-privacy"><LockKeyhole size={15}/> Entrar não transfere seus dados de visitante. Os dados de cada conta permanecem separados. Consulte o estado de armazenamento ao conectar.</p>
   </>}
   {timerBusy&&<p role="status" className="muted small">Conclua ou cancele o tempo em andamento antes de mudar sua conta.</p>}
 </section></div>;
}
