import {normalizeHTTPMethods} from './public/http-methods.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {isIP,BlockList} from 'node:net';
import {atomicWrite,fromEnv,parseEnv} from './core.mjs';

const registryPath='config/proxy-hosts.json',routePath='docker/traefik/proxy-hosts.yml';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const idOK=id=>typeof id==='string'&&/^proxy-[a-f0-9]{12}$/.test(id);
const hostname=value=>typeof value==='string'&&value.length<=253&&value.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
const text=async file=>fs.readFile(file,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
export function proxyDomains(config){
 const domains=(config.applications||[]).flatMap(app=>[app.domain,...(app.websocket?.enabled&&app.websocket.routing==='domain'?[app.websocket.domain]:[])]);
 if(config.proxy?.panel?.domain)domains.push(config.proxy.panel.domain);
 return [...new Set(domains.filter(Boolean).map(d=>d.toLowerCase()))].sort();
}
export function validateProxyHost(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Host de proxy inválido.');
 if(input.id!==undefined&&!idOK(input.id))fail('Identificador de proxy inválido.');
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>80||/[\x00-\x1f]/.test(input.name))fail('Informe um nome de até 80 caracteres.');
 if(!Array.isArray(input.domains)||!input.domains.length||input.domains.length>20||input.domains.some(d=>!hostname(d)||isIP(d)))fail('Informe de 1 a 20 domínios, sem protocolo, porta ou curinga.');
 const methods=normalizeHTTPMethods(input.methods);
 const domains=input.domains.map(d=>d.toLowerCase());if(new Set(domains).size!==domains.length)fail('Domínio repetido neste host.');
 if(!['http','https'].includes(input.scheme)||!Number.isInteger(input.port)||input.port<1||input.port>65535)fail('Informe protocolo HTTP/HTTPS e porta entre 1 e 65535.');
 if(typeof input.host!=='string'||!(isIP(input.host)||hostname(input.host)))fail('Destino inválido. Use IP ou nome DNS/container, sem protocolo, porta, caminho ou credenciais.');
 for(const field of ['enabled','tls','forceHttps','passHostHeader'])if(typeof input[field]!=='boolean')fail('Opção de proxy inválida: '+field);
 if(input.forceHttps&&!input.tls)fail('Ative HTTPS antes de forçar o redirecionamento.');
 if(!Array.isArray(input.allowedIPs)||input.allowedIPs.length>100)fail('Informe até 100 IPs ou redes permitidas.');
 for(const value of input.allowedIPs){
  if(typeof value!=='string'||value.length>64)fail('IP/rede inválido.');
  const [ip,prefix,...extra]=value.split('/'),version=isIP(ip);
  if(!version||extra.length||/^::ffff:/i.test(ip)||prefix!==undefined&&(!/^\d+$/.test(prefix)||Number(prefix)>(version===4?32:128)))fail('IP/rede inválido: '+value);
  const list=new BlockList();if(prefix!==undefined)list.addSubnet(ip,Number(prefix),version===4?'ipv4':'ipv6');
 }
 return { ...(input.id?{id:input.id}:{}),name:input.name.trim(),domains,methods,scheme:input.scheme,host:input.host.toLowerCase(),port:input.port,enabled:input.enabled,tls:input.tls,forceHttps:input.forceHttps,passHostHeader:input.passHostHeader,allowedIPs:[...new Set(input.allowedIPs)]};
}
async function readRegistry(root){
 const raw=await text(path.join(root,registryPath));if(raw===null)return {raw,value:{version:1,hosts:[]}};
 let value;try{value=JSON.parse(raw);}catch{fail('Cadastro de hosts de proxy inválido. Revise config/proxy-hosts.json.');}
 if(value?.version!==1||!Array.isArray(value.hosts)||value.hosts.length>100)fail('Formato de hosts de proxy inválido.');
 const hosts=value.hosts.map(validateProxyHost);if(hosts.some(h=>!idOK(h.id))||new Set(hosts.map(h=>h.id)).size!==hosts.length)fail('IDs de hosts de proxy inválidos ou duplicados.');
 const domains=hosts.flatMap(h=>h.domains);if(new Set(domains).size!==domains.length)fail('Domínio repetido no cadastro de proxy.');
 return {raw,value:{version:1,hosts}};
}
export async function assertProxyHostDomains(root,config){
 const reserved=new Set(proxyDomains(config)),{value}=await readRegistry(root);
 for(const host of value.hosts)for(const domain of host.domains)if(reserved.has(domain))fail('Domínio '+domain+' já cadastrado em Hosts de proxy. Edite ou remova esse host antes de usar o domínio na aplicação/painel.');
}
export function proxyHostRoutes(hosts){
 const routers={},services={},middlewares={};
 for(const host of hosts.filter(h=>h.enabled)){
  const h=validateProxyHost(host);if(!idOK(h.id))fail('Identificador de proxy inválido.');
  const name='jubart-'+h.id,domainRule=h.domains.map(domain=>'Host(`'+domain+'`)').join(' || '),chain=[];
  const rule=h.methods.length?'('+domainRule+') && ('+h.methods.map(method=>'Method(`'+method+'`)').join(' || ')+')':domainRule;
  const destination=isIP(h.host)===6?'['+h.host+']':h.host;
  services[name]={loadBalancer:{passHostHeader:h.passHostHeader,servers:[{url:`${h.scheme}://${destination}:${h.port}`}]}};
  if(h.allowedIPs.length){middlewares[name+'-allow']={ipAllowList:{sourceRange:h.allowedIPs}};chain.push(name+'-allow');}
  if(h.forceHttps)middlewares[name+'-redirect']={redirectScheme:{scheme:'https',permanent:true}};
  const http={rule,entryPoints:['web'],service:name};if(chain.length||h.forceHttps)http.middlewares=[...chain,...(h.forceHttps?[name+'-redirect']:[])];
  routers[name+'-http']=http;
  if(h.tls){const https={rule,entryPoints:['websecure'],service:name,tls:{certResolver:'letsencrypt'}};if(chain.length)https.middlewares=[...chain];routers[name+'-https']=https;}
 }
 const http={};if(Object.keys(routers).length)http.routers=routers;if(Object.keys(services).length)http.services=services;if(Object.keys(middlewares).length)http.middlewares=middlewares;
 return JSON.stringify(Object.keys(http).length?{http}:{},null,2)+'\n';
}
export function createProxyHosts({root,readEnv,loadConfig,startOperation,audit,write=atomicWrite}){
 async function context(){
  const registry=await readRegistry(root),saved=await loadConfig(),env=parseEnv(await readEnv()),reserved=[...new Set([...proxyDomains(saved.config),...proxyDomains(fromEnv(env))])].sort();
  const routes=await text(path.join(root,routePath)),expected=proxyHostRoutes(registry.value.hosts),tlsReady=env.TRAEFIK_TLS_ENABLED==='true'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ACME_EMAIL||'');
  return {registry,routes,expected,reserved,tlsReady,ports:{http:Number(env.HTTP_PORT||8080),https:Number(env.HTTPS_PORT||8443)},revision:hash([registry.raw,routes,reserved,tlsReady])};
 }
 async function plan(action,data){
  if(!['save','toggle','remove','apply'].includes(action))fail('Operação de proxy inválida.');
  const c=await context();if(data.revision!==c.revision)fail('Hosts ou configuração de proxy alterados. Atualize a lista.',409);
  let hosts=c.registry.value.hosts,host=null;
  if(action==='save'){
   host=validateProxyHost(data.host);
   if(host.id&&!hosts.some(h=>h.id===host.id))fail('Host de proxy não encontrado.',404);
   if(!host.id&&hosts.length>=100)fail('Limite de 100 hosts de proxy.');
  }else if(action==='toggle'||action==='remove'){
   if(!idOK(data.id))fail('Identificador de proxy inválido.');host=hosts.find(h=>h.id===data.id);if(!host)fail('Host de proxy não encontrado.',404);
   if(action==='toggle'){if(typeof data.enabled!=='boolean')fail('Informe o estado do host.');host={...host,enabled:data.enabled};}
  }
  if(host&&action!=='remove'&&!(action==='toggle'&&!host.enabled)){
   for(const domain of host.domains)if(c.reserved.includes(domain)||hosts.some(h=>h.id!==host.id&&h.domains.includes(domain)))fail('Domínio '+domain+' já utilizado por uma aplicação, painel, WebSocket ou outro host de proxy.');
   if(host.enabled&&host.tls&&!c.tlsReady)fail('Configure e aplique HTTPS e email ACME em Acessos web antes de habilitar este host com HTTPS.');
  }
  if(action==='save'){host={...host,id:host.id||'proxy-'+randomBytes(6).toString('hex')};hosts=hosts.some(h=>h.id===host.id)?hosts.map(h=>h.id===host.id?host:h):[...hosts,host];}
  if(action==='toggle')hosts=hosts.map(h=>h.id===host.id?host:h);
  if(action==='remove')hosts=hosts.filter(h=>h.id!==host.id);
  if(action==='apply')for(const h of hosts.filter(h=>h.enabled)){if(h.domains.some(d=>c.reserved.includes(d)))fail('Há um domínio em conflito. Edite ou desative o host antes de reaplicar.');if(h.tls&&!c.tlsReady)fail('Configure HTTPS antes de reaplicar hosts TLS ativos.');}
  return {...c,host,next:{version:1,hosts}};
 }
 return {
  async read(){const c=await context();return {hosts:c.registry.value.hosts,revision:c.revision,tlsReady:c.tlsReady,ports:c.ports,fileMatches:c.routes===c.expected||c.routes===null&&!c.registry.value.hosts.some(h=>h.enabled),reservedDomains:c.reserved};},
  async endpoints(){return (await readRegistry(root)).value.hosts.filter(h=>h.enabled&&h.tls).flatMap(h=>h.domains.map((domain,i)=>({id:h.id+':'+i,domain,port:443})));},
  async confirmation(action,data){const p=await plan(action,data);return {title:action==='remove'?'Remover host de proxy?':'Aplicar host de proxy?',summary:p.host?[['Nome',p.host.name],['Domínios',p.host.domains.join(', ')],['Destino',`${p.host.scheme}://${p.host.host}:${p.host.port}`],['Métodos HTTP',p.host.methods.join(', ')||'Todos'],['HTTPS',p.host.tls?'Let’s Encrypt':'Desativado'],['IPs permitidos',p.host.allowedIPs.join(', ')||'Todas as origens'],['Habilitado',p.host.enabled?'Sim':'Não']]:[['Hosts cadastrados',p.next.hosts.length]],execution:'Salvar os hosts e publicar as rotas para recarga automática do Traefik.',impact:action==='remove'?'Os domínios deste host deixam de encaminhar ao destino. Dados e certificados são preservados.':'As requisições aos domínios configurados passam a usar o destino e as regras escolhidas. Métodos fora da seleção não são encaminhados. Conexões em andamento podem ser afetadas. HTTPS depende de DNS e ACME disponíveis.',commands:[{kind:'internal',text:'Validar domínios, destino e revisão; guardar cópia anterior; gravar config/proxy-hosts.json e docker/traefik/proxy-hosts.yml atomicamente. O Traefik observa a pasta dinâmica; não recria containers.'}],note:'A publicação do arquivo não comprova DNS, conectividade com o destino ou emissão do certificado. O destino deve ser alcançável pelo container Traefik.'};},
  async change(action,data,actor){await plan(action,data);return {operation:startOperation('Atualizar hosts de proxy',async()=>{
   const p=await plan(action,data),files=[[registryPath,p.registry.raw,JSON.stringify(p.next,null,2)+'\n',0o600],[routePath,p.routes,proxyHostRoutes(p.next.hosts),0o644]];
   await fs.mkdir(path.join(root,'.panel-state/proxy-hosts'),{recursive:true,mode:0o700});
   await write(path.join(root,'.panel-state/proxy-hosts/before.json'),JSON.stringify({at:new Date().toISOString(),files:files.map(([file,before])=>({file,before}))},null,2)+'\n');
   if((await context()).revision!==data.revision)fail('Configuração alterada durante a validação. Atualize a lista.',409);
   await audit({actor,event:'proxy-hosts.'+action,id:p.host?.id,result:'requested'});
   const written=[];
   try{
    for(const [file,before,after,mode]of files){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await write(path.join(root,file),after,mode);written.push([file,before,mode]);}
   }catch(error){
    for(const [file,before,mode]of written.reverse()){if(before===null)await fs.unlink(path.join(root,file));else await atomicWrite(path.join(root,file),before,mode);}
    await audit({actor,event:'proxy-hosts.'+action,id:p.host?.id,result:'failed'});fail('Não foi possível publicar as rotas. Os arquivos alterados foram restaurados.');
   }
   await audit({actor,event:'proxy-hosts.'+action,id:p.host?.id,result:'success'});
  })};},
 };
}
