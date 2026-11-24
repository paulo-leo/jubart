import {HTTP_METHODS} from '../../public/http-methods.js';
import React,{useState} from 'react';
import {usePanel,useResource,Load,Section,Table,Stats,Badge,Button,IconButton,Editor} from '../ui.jsx';
const split=value=>String(value||'').split(/[\s,]+/).filter(Boolean);
const defaults={name:'',domains:'',scheme:'http',host:'',port:8080,enabled:true,tls:false,forceHttps:true,passHostHeader:true,allowedIPs:'',methodMode:'all'};
const address=h=>`${h.scheme}://${h.host.includes(':')?'['+h.host+']':h.host}:${h.port}`;
export function ProxyHosts({active,dirty=false}){
 const panel=usePanel(),resource=useResource('/proxy-hosts',active,0),[editing,setEditing]=useState(null);
 return <Load resource={resource}>{data=><>
  <Stats items={[["Hosts de proxy",data.hosts.length],["Habilitados",data.hosts.filter(h=>h.enabled).length],["HTTPS",data.hosts.filter(h=>h.enabled&&h.tls).length],["Restritos por IP",data.hosts.filter(h=>h.allowedIPs.length).length]]}/>
  <Section title="Hosts de proxy" description="Encaminhe domínios para serviços por IP ou nome de container e porta." actions={<><Button icon="refresh" onClick={resource.refresh}>Atualizar</Button><Button id="proxy-host-create" icon="plus" primary onClick={()=>setEditing({...defaults})}>Novo host de proxy</Button></>}>
   {dirty&&<p className="alert theme-warning">Há alterações de aplicações ou proxy no rascunho. Revise os domínios e as configurações de HTTPS antes de publicar um host.</p>}
   {!data.fileMatches&&<p className="alert theme-warning">O arquivo publicado diverge do cadastro. <Button icon="refresh" onClick={()=>panel.mutate('/proxy-hosts/apply',{revision:data.revision})}>Reaplicar rotas</Button></p>}
   <Table id="proxy-host-list" label="hosts de proxy" rows={data.hosts} states={h=>[h.enabled?'Habilitado':'Desativado',h.tls?'HTTPS':'HTTP']}
    columns={[
     {title:'NOME / DOMÍNIOS',render:h=><><strong>{h.name}</strong>{h.domains.map(domain=>{const port=h.tls?data.ports.https:data.ports.http;return <div key={domain}><a href={`${h.tls?'https':'http'}://${domain}${port===(h.tls?443:80)?'':':'+port}`} target="_blank" rel="noreferrer">{domain}</a></div>;})}</>},
     {title:'DESTINO',render:h=><code>{address(h)}</code>},
     {title:'SSL / ACESSO',render:h=><><Badge tone={h.tls?'success':'secondary'}>{h.tls?'Let’s Encrypt':'HTTP'}</Badge><div className="muted">{h.allowedIPs.length?`${h.allowedIPs.length} IPs/redes permitidos`:'Todas as origens'}</div></>},
     {title:'MÉTODOS',render:h=>h.methods?.length?h.methods.join(', '):'Todos'},
     {title:'ESTADO',render:h=><Badge tone={h.enabled?'success':'secondary'}>{h.enabled?'Habilitado':'Desativado'}</Badge>},
     {title:'AÇÕES',render:h=><div className="action-group">
      <IconButton icon="settings" label={`Editar proxy ${h.name}`} data-proxy-host-edit={h.id} onClick={()=>setEditing({...h,methodMode:h.methods?.length?'selected':'all',...Object.fromEntries(HTTP_METHODS.map(method=>['method_'+method,!!h.methods?.includes(method)])),domains:h.domains.join('\n'),allowedIPs:h.allowedIPs.join('\n')})}/>
      <IconButton icon={h.enabled?'stop':'play'} tone={h.enabled?'orange':'green'} label={`${h.enabled?'Desativar':'Habilitar'} proxy ${h.name}`} data-proxy-host-toggle={h.id} onClick={()=>panel.mutate('/proxy-hosts/toggle',{id:h.id,enabled:!h.enabled,revision:data.revision})}/>
      <IconButton icon="trash" tone="red" label={`Remover proxy ${h.name}`} data-proxy-host-remove={h.id} description="Remove o encaminhamento; preserva o serviço de destino e os certificados." onClick={()=>panel.mutate('/proxy-hosts/remove',{id:h.id,revision:data.revision})}/>
     </div>},
    ]}/>
  </Section>
  <p className="info-line">Os estados indicam a configuração publicada. DNS, acesso ao destino e emissão do certificado precisam estar disponíveis. Use Certificados → Verificar HTTPS para consultar o certificado servido. WebSocket utiliza o encaminhamento HTTP do Traefik automaticamente.</p>
  {editing&&<Editor id="proxy-host-editor" title={editing.id?'Editar host de proxy':'Novo host de proxy'} initial={editing} large submitLabel="Revisar e aplicar"
   description="Informe os domínios e o destino. O Traefik recarrega as rotas após a confirmação. O serviço de destino deve estar acessível a partir da rede do proxy."
   fields={values=>[
    {name:'name',label:'Nome',required:true,maxLength:80},
    {name:'domains',label:'Domínios',type:'textarea',rows:3,help:'Um domínio por linha, sem http://, porta ou curinga. Exemplo: sistema.exemplo.com. Configure o DNS apontando para este servidor.'},
    {name:'scheme',label:'Protocolo do destino',type:'select',options:[{value:'http',label:'HTTP'},{value:'https',label:'HTTPS'}]},
    {name:'host',label:'IP ou nome do destino',required:true,maxLength:253,help:'Ex.: 192.168.1.20 ou meu-container. 127.0.0.1 aponta para o próprio container Traefik. Containers precisam compartilhar uma rede com ele. HTTPS no destino exige certificado confiável.'},
    {name:'port',label:'Porta do destino',type:'number',required:true,min:1,max:65535},
    {name:'methodMode',label:'Métodos HTTP (verbos)',type:'select',options:[{value:'all',label:'Permitir todos'},{value:'selected',label:'Permitir somente os selecionados'}],help:'A restrição vale para os domínios deste host em HTTP e HTTPS. Métodos fora da seleção não são encaminhados.'},
    ...(values.methodMode==='selected'?HTTP_METHODS.map(method=>({name:'method_'+method,label:method,type:'checkbox',help:method==='HEAD'?'HEAD é independente de GET; selecione se a aplicação usa verificações sem corpo.':method==='OPTIONS'?'Inclua OPTIONS se sua aplicação depende de preflight CORS.':undefined})):[]),
    {name:'enabled',label:'Habilitar este host',type:'checkbox'},
    {name:'tls',label:'HTTPS com Let’s Encrypt',type:'checkbox',help:data.tlsReady?'A emissão ocorre após publicar a rota e depende de DNS e das portas HTTP/HTTPS acessíveis.':'Configure e aplique HTTPS e email ACME em Acessos web antes de habilitar HTTPS neste host.'},
    ...(values.tls?[{name:'forceHttps',label:'Redirecionar HTTP para HTTPS',type:'checkbox'}]:[]),
    {name:'passHostHeader',label:'Enviar o domínio original ao destino',type:'checkbox',help:'Ativado: preserva o cabeçalho Host solicitado pelo visitante.'},
    {name:'allowedIPs',label:'IPs/redes permitidos (vazio = todas as origens)',type:'textarea',rows:3,help:'Um IP ou CIDR por linha. Ex.: 192.168.1.0/24. A regra usa o IP que chega diretamente ao Traefik; um CDN/proxy anterior pode aparecer como origem.'},
   ]}
   onClose={()=>setEditing(null)} onSave={values=>{
    const methods=values.methodMode==='selected'?HTTP_METHODS.filter(method=>values['method_'+method]):[];
    if(values.methodMode==='selected'&&!methods.length)throw new Error('Selecione ao menos um método HTTP ou escolha Permitir todos.');
    const {methodMode,...host}=values;for(const method of HTTP_METHODS)delete host['method_'+method];
    return panel.mutate('/proxy-hosts/save',{revision:data.revision,host:{...host,methods,domains:split(values.domains),allowedIPs:split(values.allowedIPs),forceHttps:values.tls&&values.forceHttps}});
   }}/>}
 </>}</Load>;
}
