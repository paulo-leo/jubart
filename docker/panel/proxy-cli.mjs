// Read-only projection of the same configuration used by the panel.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fromEnv,parseEnv,slots,validateConfig} from './core.mjs';
import {websocketFromEnv} from './websocket-config.mjs';
import {createProxyHosts} from './proxy-hosts.mjs';
import {validateSecurity} from './security.mjs';

const read=async file=>fs.readFile(file,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
const destination=(scheme,host,port)=>`${scheme}://${host.includes(':')?'['+host+']':host}:${port}`;
const yes=value=>value?'Sim':'Não';
const hostRule=domains=>domains.map(domain=>'Host(`'+domain+'`)').join(' || ');

function routes(config){
 const result=[];
 for(const app of config.applications){
  const service=slots[app.id].service,domains=[app.domain],tls=config.proxy.tls;
  result.push({id:app.id,name:app.name,kind:'Aplicação',domains,enabled:app.enabled,
   destination:destination('http',service,app.port),methods:[],tls,forceHttps:tls,passHostHeader:true,
   allowedIPs:[],rule:hostRule(domains),settings:[['Tipo da aplicação',app.type],['Serviço',service],
    ['Middlewares',`app-security-${app.id}; jubart-errors nas rotas de navegador GET/HEAD`],
    ['Prioridade','10; 50 nas rotas de navegador']]});
  const w=app.websocket;
  if(w.enabled){
   const domain=w.routing==='domain'?w.domain:app.domain;
   const routePath=w.routing==='path'?(w.provider==='reverb'?'/app/, /apps/':w.nodePath):'nenhum';
   const paths=w.provider==='reverb'?'(PathPrefix(`/app/`) || PathPrefix(`/apps/`))':`PathPrefix(\`${w.nodePath}\`)`;
   result.push({id:'websocket-'+app.id,name:app.name+' · WebSocket',kind:'WebSocket',domains:[domain],
    destination:destination('http','websocket-'+app.id,w.port),enabled:app.enabled,tls:w.tls,
    forceHttps:w.tls,passHostHeader:true,methods:[],allowedIPs:[],
    rule:hostRule([domain])+(w.routing==='path'?' && '+paths:''),
    settings:[['Aplicação',app.id],['Provedor',w.provider],['Roteamento',w.routing==='domain'?'Domínio':'Caminho'],
     ['Caminhos',routePath],['Origens permitidas',w.origins],['Prioridade',100],['Middlewares','app-security-'+app.id]]});
  }
 }
 const p=config.proxy.panel;
 result.push({id:'panel',name:'Painel administrativo',kind:'Painel',domains:p.domain?[p.domain]:[],
  destination:'http://panel:3000',enabled:p.proxyEnabled,tls:p.tls,forceHttps:p.tls,
  passHostHeader:true,methods:[],allowedIPs:[],rule:p.domain?hostRule([p.domain]):'Domínio não configurado',
  settings:[['Porta direta no host',`${p.bindAddress}:${p.port}`],['Cookie seguro',yes(p.secureCookie)]]});
 return result;
}

function globalSettings(proxy,env){
 const access=value=>`${value.bindAddress}:${value.port}`;
 return [
  ['Endereço HTTP/HTTPS',proxy.bindAddress],['Porta HTTP no host',proxy.httpPort],
  ['Porta HTTPS no host',proxy.httpsPort],['HTTPS / ACME',yes(proxy.tls)],['Email ACME',proxy.email||'não configurado'],
  ['Painel · porta direta',access(proxy.panel)],['Painel · domínio',proxy.panel.domain||'não configurado'],
  ['Painel · proxy habilitado',yes(proxy.panel.proxyEnabled)],['Painel · HTTPS',yes(proxy.panel.tls)],
  ['Painel · cookie seguro',yes(proxy.panel.secureCookie)],['phpMyAdmin · porta no host',access(proxy.phpmyadmin)],
  ...['mariadb','postgres'].flatMap(engine=>[[engine+' · porta no host',access(proxy.databases[engine])],
   [engine+' · habilitado',yes(env[engine.toUpperCase()+'_ENABLED']!=='false')]]),
 ];
}

export async function inspectProxies(root){
 root=path.resolve(root);
 const envText=await read(path.join(root,'.env'))||'',env=parseEnv(envText),configured=fromEnv(env);
 const raw=await read(path.join(root,'config/apps.json'));
 const saved=raw===null?structuredClone(configured):JSON.parse(raw);
 // Older saved registries omit access settings supplied by the environment.
 for(const key of ['panel','phpmyadmin','databases'])saved.proxy[key]??=structuredClone(configured.proxy[key]);
 for(const app of saved.applications){
  if(!slots[app.id])throw new Error('Aplicação inválida.');
  app.websocket??=websocketFromEnv(env,slots[app.id].prefix,app,saved.proxy);
 }
 validateConfig(saved);
 const api=createProxyHosts({root,readEnv:async()=>envText,loadConfig:async()=>({config:saved})});
 const hosts=await api.read(),warnings=[];
 const securityRaw=await read(path.join(root,'.panel-state/security.json')).catch(error=>{
  if(error.code!=='EACCES')throw error;
  warnings.push('Políticas de segurança indisponíveis por permissão de leitura. Consulte o painel ou execute com acesso aos arquivos privados.');
  return null;
 });
 const security=securityRaw===null?{groups:[],policies:[]}:validateSecurity(JSON.parse(securityRaw),Object.keys(slots).map(id=>({id})));
 const desired=routes(saved),actual=routes(configured),desiredIds=new Set(desired.map(r=>r.id));
 const list=desired.map(route=>({...route,configured:actual.find(r=>r.id===route.id)||null,registered:true}));
 for(const route of actual)if(route.enabled&&!desiredIds.has(route.id))list.push({...route,enabled:false,configured:route,registered:false});
 for(const route of list){
  const identity=route.id.startsWith('websocket-')?route.id.slice(10):route.id;
  const policy=security.policies.find(p=>p.app===identity);
  if(policy){
   const groupIds=new Set(policy.rules.flatMap(r=>r.groups));
   route.settings.push(['Política de acesso',policy],['Grupos de IP',security.groups.filter(g=>groupIds.has(g.id))]);
  }
 }
 for(const host of hosts.hosts){
  const domainRule=hostRule(host.domains),rule=host.methods.length?'('+domainRule+') && ('+host.methods.map(m=>'Method(`'+m+'`)').join(' || ')+')':domainRule;
  list.push({...host,kind:'Host de proxy',destination:destination(host.scheme,host.host,host.port),rule,registered:true,
   settings:[['Protocolo do destino',host.scheme],['Host do destino',host.host],['Porta do destino',host.port],
    ['Arquivo de rotas corresponde ao cadastro',yes(hosts.fileMatches)]],configured:null});
 }
 const wanted=globalSettings(saved.proxy,env),current=globalSettings(configured.proxy,env);
 return {routes:list,settings:wanted.map(([label,value],i)=>[label,value,current[i][1]]),
  environment:[['IP reservado do Traefik',env.JUBART_TRAEFIK_IPV4||'não configurado'],
   ['Versão configurada do Traefik',env.TRAEFIK_VERSION||'não configurada'],
   ['Nível de log',env.TRAEFIK_LOG_LEVEL||'INFO'],['Porta interna de métricas',env.TRAEFIK_METRICS_PORT||'8082']],
  source:raw===null?'.env (cadastro ainda inexistente)':'config/apps.json',hostFileMatches:hosts.fileMatches,warnings};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>8192)throw new Error('Requisição inválida.');}
  const data=JSON.parse(input);
  process.stdout.write(JSON.stringify(await inspectProxies(data.root))+'\n');
 }catch(error){
  process.stdout.write(JSON.stringify({error:'Não foi possível consultar os proxies. Confira os arquivos de configuração da instalação.',permissionDenied:error.code==='EACCES'})+'\n');
  process.exitCode=1;
 }
}
