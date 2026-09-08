import {Copy} from 'lucide-react';
import {useData} from './AppContext';
export default function PreparationCard({preparation,orientation='amarelo em cima e verde à frente',explanation,title='Preparar o caso'}: {
  preparation: string; orientation?: string; explanation?: string; title?: string;
}) {
  const {notify}=useData();
  return <section className="preparation-card" aria-label={title}>
    <div className="panel-heading"><h2>{title}</h2><button className="text-button" onClick={()=>navigator.clipboard.writeText(preparation).then(()=>notify('Preparo copiado.'),()=>notify('Não foi possível copiar o preparo.'))}><Copy size={15}/> Copiar preparo</button></div>
    <p className="algorithm-text preparation-algorithm">{preparation || 'Cubo resolvido'}</p>
    <p className="muted small">{explanation??`Comece resolvido, com ${orientation}. A sequência corresponde à alternativa selecionada.`}</p>
  </section>;
}
