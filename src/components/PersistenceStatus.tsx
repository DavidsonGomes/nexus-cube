import {Check,Cloud,CloudOff,LoaderCircle,AlertCircle,ArrowRightLeft,HardDrive} from 'lucide-react';
import type {CloudSnapshot} from '../cloud/types';

type Props={
 phase:CloudSnapshot['sync'];
 localSaving?:boolean;
 pendingCount?:number;
 error?:string|null;
 guest?:boolean;
 expanded?:boolean;
 onReview?:()=>void;
};
const states:Record<string,{label:string;detail:string;icon:typeof Cloud;tone:string}>={
 unavailable:{label:'Somente neste dispositivo',detail:'A sincronização desta conta ainda não está disponível. Mantenha um backup dos seus dados.',icon:HardDrive,tone:'neutral'},
 pending:{label:'Alterações aguardando envio',detail:'A cópia local foi gravada. O envio ao servidor acontece automaticamente.',icon:Cloud,tone:'pending'},
 syncing:{label:'Salvando no servidor…',detail:'Seus dados locais estão preservados. A confirmação do servidor ainda está em andamento.',icon:LoaderCircle,tone:'pending'},
 synced:{label:'Salvo no servidor',detail:'As alterações foram confirmadas e reconciliadas com o servidor.',icon:Check,tone:'success'},
 offline:{label:'Offline',detail:'As alterações locais serão enviadas automaticamente quando a conexão voltar.',icon:CloudOff,tone:'pending'},
 conflict:{label:'Alterações precisam de revisão',detail:'Há mudanças diferentes entre dispositivos. Revise antes de escolher qual versão manter.',icon:ArrowRightLeft,tone:'warning'},
 error:{label:'Não foi possível sincronizar',detail:'Seus dados locais continuam preservados. O erro precisa ser resolvido para confirmar o envio.',icon:AlertCircle,tone:'warning'},
 'reconciliation-required':{label:'Revise seus dados para começar',detail:'Esta conta já tem dados neste dispositivo. Confira a prévia antes de combiná-los com o servidor.',icon:ArrowRightLeft,tone:'warning'},
};
export default function PersistenceStatus({phase,localSaving=false,pendingCount=0,error,guest=false,expanded=false,onReview}:Props){
 const base=states[phase]??{label:'Verificando armazenamento',detail:'Aguardando o estado de persistência da conta.',icon:Cloud,tone:'neutral'};
 const current=guest?{label:'Dados neste dispositivo',detail:'Os registros de visitante permanecem locais. Entrar em uma conta não os envia automaticamente.',icon:HardDrive,tone:'neutral'}:base;
 const label=localSaving?'Salvando neste dispositivo…':current.label;
 const Icon=localSaving?LoaderCircle:current.icon;
 const count=Number.isFinite(pendingCount)?Math.max(0,Math.floor(pendingCount)):0;
 const needsReview=['conflict','reconciliation-required'].includes(phase);
 return <div className={`persistence-status ${expanded?'expanded':''} tone-${current.tone}`} data-testid="persistence-status" data-sync-state={phase}>
  <span className="persistence-summary" role="status" aria-live="polite" aria-atomic="true"><Icon size={expanded?20:14} className={localSaving||['syncing'].includes(phase)?'persistence-spinner':''}/><span>{label}{!guest&&count>0&&<small> · {count} {count===1?'alteração pendente':'alterações pendentes'}</small>}</span></span>
  {expanded&&<p>{error||current.detail}</p>}
  {expanded&&needsReview&&onReview&&<button className="text-button" onClick={onReview}>Revisar alterações</button>}
 </div>;
}
