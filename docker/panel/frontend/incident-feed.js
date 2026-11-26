import {useEffect,useState} from 'react';
export function useIncidentFeed(session,notify){
 const [feed,setFeed]=useState({connection:'idle',summary:null,settings:null,eventId:0});
 useEffect(()=>{
  if(!session?.access?.admin){setFeed({connection:'idle',summary:null,settings:null,eventId:0});return;}
  const source=new EventSource('/api/monitor/events'),seen=new Set();
  const update=event=>{try{const data=JSON.parse(event.data);setFeed(current=>({...current,connection:'connected',summary:data.summary||data,settings:data.settings||current.settings}));}catch{}};
  source.addEventListener('open',()=>setFeed(current=>({...current,connection:'connected'})));
  source.addEventListener('error',()=>setFeed(current=>({...current,connection:'reconnecting'})));
  source.addEventListener('snapshot',update);source.addEventListener('status',update);source.addEventListener('settings',update);
  const incident=event=>{try{const data=JSON.parse(event.data);if(seen.has(data.id))return;seen.add(data.id);if(seen.size>1000)seen.delete(seen.values().next().value);const recovered=event.type==='recovery',item=data.incident,target=item.service||'Monitoramento';notify(recovered?`${target}: ${item.resolution==='recovered'?'as verificações voltaram a passar.':item.resolution==='disabled'?'o serviço foi desabilitado na configuração.':'o alvo saiu do inventário monitorado.'}`:`${target}: ${item.message}`,recovered?'success':item.severity==='critical'?'danger':'warning',{title:recovered?'Incidente encerrado':'Incidente na infraestrutura',duration:recovered?6500:14000});setFeed(current=>({...current,eventId:data.id}));}catch{}};
  source.addEventListener('incident',incident);source.addEventListener('recovery',incident);
  source.addEventListener('auth-expired',()=>{source.close();setFeed(current=>({...current,connection:'unauthorized'}));});
  source.addEventListener('monitor-error',()=>{setFeed(current=>({...current,connection:'error'}));});
  return()=>source.close();
 },[session,notify]);
 return feed;
}
