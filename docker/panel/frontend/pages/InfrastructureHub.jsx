import React,{useState} from 'react';
import {Icon,Stats,ServiceAttention} from '../ui.jsx';
const colors=['blue','violet','green','amber','cyan','rose','indigo','slate'];
export function InfrastructureHub({groups,tabs,navigate,snapshot}){
 const [query,setQuery]=useState(''),[attention,setAttention]=useState(false);
 const normal=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const sections=groups.map(([name,ids],index)=>({name,color:colors[index%colors.length],ids:ids.filter(id=>id!=='overview'&&normal(name+' '+tabs[id].join(' ')).includes(normal(query.trim())))})).filter(g=>g.ids.length);
 const data=snapshot.data;
 return <div className="infrastructure-hub">
  <div className="hub-welcome"><div><span className="hub-label">SEU WORKSPACE</span><h2>O que vamos gerenciar hoje?</h2><p>Escolha um módulo para acessar suas ferramentas.</p></div><label className="hub-search"><Icon name="search"/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar módulo ou ferramenta…" aria-label="Buscar módulo na central"/></label></div>
  {data&&<Stats items={[["Serviços ativos",data.services.filter(s=>s.state==='running').length,null,false,()=>navigate('services')],["Aplicações habilitadas",data.config.applications.filter(a=>a.enabled).length,null,false,()=>navigate('apps')],["Volumes",data.volumes.length,null,false,()=>navigate('volumes')],["Pontos de atenção",data.services.filter(s=>s.health==='unhealthy'||s.state==='restarting').length,null,false,()=>setAttention(true)]]}/>}
  {attention&&data&&<ServiceAttention services={data.services} onClose={()=>setAttention(false)} onServices={()=>navigate('services')}/>}
  {!sections.length&&<div className="empty">Nenhum módulo encontrado. Tente outro termo.</div>}
  {sections.map(group=><section className={`hub-group hub-${group.color}`} key={group.name} aria-label={group.name}><div className="hub-group-heading"><h2>{group.name}</h2><span>{group.ids.length} ferramentas</span></div><div className="hub-grid">{group.ids.map(id=><button key={id} className="hub-tile" data-hub-tab={id} onClick={()=>navigate(id)}><span className="hub-tile-icon"><Icon name={id}/></span><span className="hub-tile-content"><strong>{tabs[id][0]}</strong><span>{tabs[id][1]}</span></span><span className="hub-arrow" aria-hidden="true">↗</span></button>)}</div></section>)}
 </div>;
}
