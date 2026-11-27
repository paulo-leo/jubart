import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {atomicWrite,parseEnv} from './core.mjs';

export const proxyComposeFile='config/proxy-network.compose.yaml';
export const proxyAddressKey='JUBART_TRAEFIK_IPV4';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const nameOK=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value);
export function proxyComposeArgs(root){return [proxyComposeFile,'compose.production.yaml','config/jubart-release.compose.yaml'].filter(file=>existsSync(path.join(root,file))).flatMap(file=>['-f',path.join(root,file)]);}
export function ipv4Number(ip){
 if(typeof ip!=='string'||!/^\d+\.\d+\.\d+\.\d+$/.test(ip))fail('IPv4 inválido.');
 const parts=ip.split('.');if(parts.some(p=>!/^0$|^[1-9]\d*$/.test(p)||Number(p)>255))fail('IPv4 inválido.');
 return parts.reduce((n,p)=>n*256+Number(p),0);
}
const ipString=n=>[Math.floor(n/16777216),Math.floor(n/65536)%256,Math.floor(n/256)%256,n%256].join('.');
export function cidrRange(cidr){
 if(typeof cidr!=='string')fail('CIDR inválido.');const [ip,prefix,...extra]=cidr.split('/');
 if(extra.length||!/^\d+$/.test(prefix||'')||Number(prefix)>32)fail('CIDR inválido.');
 const size=2**(32-Number(prefix)),start=Math.floor(ipv4Number(ip)/size)*size;
 return {start,end:start+size-1,prefix:Number(prefix)};
}
export function overlaps(a,b){return a.start<=b.end&&b.start<=a.end;}
export function chooseProxySubnet(networks,hostRoutes){
 if(!Array.isArray(hostRoutes))fail('Não foi possível consultar as rotas IPv4 do host; nenhuma faixa foi escolhida.');
 const occupied=[];
 for(const network of networks)for(const config of network.IPAM?.Config||[]){if(config.Subnet&&!config.Subnet.includes(':'))occupied.push(cidrRange(config.Subnet));}
 for(const route of hostRoutes){const dst=route.dst;if(!dst||dst==='default'||dst==='0.0.0.0/0'||dst.includes(':'))continue;occupied.push(cidrRange(dst.includes('/')?dst:dst+'/32'));}
 const candidates=[];
 for(let second=28;second<=31;second++)for(let third=0;third<256;third++)candidates.push(`172.${second}.${third}.0/24`);
 for(let third=0;third<256;third++)candidates.push(`10.240.${third}.0/24`);
 for(const cidr of candidates){const range=cidrRange(cidr);if(occupied.every(n=>!overlaps(range,n)))return {subnet:cidr,gateway:ipString(range.start+1),ipv4:ipString(range.start+2),dynamicRange:ipString(range.start+128)+'/25'};}
 fail('Nenhuma faixa privada disponível sem sobreposição com as redes e rotas observadas.');
}
export function setEnvValues(text,values){
 for(const [key,value]of Object.entries(values)){
  const expression=new RegExp('^'+key+'=.*$','gm');
  if(value===null){text=text.replace(expression,'');continue;}
  if(/[\r\n]/.test(value))fail('Valor de ambiente inválido.');
  const line=key+'='+value;
  text=expression.test(text)?text.replace(expression,()=>line):text.replace(/\n?$/,'\n')+line+'\n';
 }
 return text;
}
export async function initializeProxyNetwork(root,{networks,containers,hostRoutes}){
 const envFile=path.join(root,'.env'),text=await fs.readFile(envFile,'utf8'),env=parseEnv(text),project=env.COMPOSE_PROJECT_NAME||'laravel';
 if(!nameOK(project))fail('Projeto Compose inválido.');
 if(env[proxyAddressKey])return {status:'configured',ipv4:env[proxyAddressKey]};
 if(containers.length||networks.some(n=>n.Name===project+'_proxy'||n.Labels?.['com.docker.compose.project']===project))return {status:'migration_required'};
 const allocation=chooseProxySubnet(networks,hostRoutes),file=path.join(root,proxyComposeFile);
 const old=await fs.readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return '{}';throw e;});
 if(Object.keys(JSON.parse(old)).length)fail('Configuração de rede existente: use a migração explícita.');
 const compose={networks:{proxy:{ipam:{driver:'default',config:[{subnet:allocation.subnet,gateway:allocation.gateway,ip_range:allocation.dynamicRange}]}}}};
 const values={[proxyAddressKey]:allocation.ipv4,COMPOSE_FILE:[...new Set([...(env.COMPOSE_FILE||'compose.yaml:config/automation.compose.json:config/apps.compose.yaml').split(':'),proxyComposeFile])].join(':')};
 await fs.mkdir(path.dirname(file),{recursive:true});
 await atomicWrite(file,JSON.stringify(compose,null,2)+'\n');
 try{await atomicWrite(envFile,setEnvValues(text,values));}catch(error){await atomicWrite(file,old);throw error;}
 return {status:'prepared',...allocation};
}
// Installer reads Docker through its local Unix socket; no shell or external network is needed.
export function readDockerNetworkState(socketPath='/var/run/docker.sock'){
 const get=resource=>new Promise((resolve,reject)=>{
  const req=http.get({socketPath,path:'/v1.47/'+resource,timeout:10000},res=>{
   let text='';res.on('data',chunk=>{text+=chunk;if(text.length>8*1024*1024)req.destroy(new Error('Resposta Docker excedeu o limite.'));});
   res.on('end',()=>{if(res.statusCode!==200)return reject(new Error('Docker recusou consulta de rede.'));try{resolve(JSON.parse(text));}catch{reject(new Error('Resposta de rede Docker inválida.'));}});
  });req.on('timeout',()=>req.destroy(new Error('Consulta Docker expirou.')));req.on('error',reject);
 });
 return {networks:()=>get('networks'),containers:project=>get('containers/json?all=1&filters='+encodeURIComponent(JSON.stringify({label:['com.docker.compose.project='+project]})))};
}
export function probeTraefik(ip){
 ipv4Number(ip);
 return new Promise((resolve,reject)=>{const req=http.get({host:ip,port:80,path:'/',headers:{Host:'jubart-proxy-check.invalid'},timeout:3000},res=>{res.resume();res.on('end',()=>res.statusCode===404?resolve():reject(new Error('Resposta inesperada do proxy.')));});req.on('timeout',()=>req.destroy(new Error('Proxy não respondeu.')));req.on('error',reject);});
}

export function createProxyNetwork({root,readEnv,composeConfig,compose,docker,startOperation,audit,probe=probeTraefik}){
 const stateFile=path.join(root,'.panel-state/proxy-network.json');
 const readState=()=>fs.readFile(stateFile,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 const save=async state=>{await fs.mkdir(path.dirname(stateFile),{recursive:true,mode:0o700});await atomicWrite(stateFile,JSON.stringify(state,null,2)+'\n');};
 async function context(){
  const text=await readEnv(),env=parseEnv(text),definition=await composeConfig(),project=definition.name,networkName=definition.networks?.proxy?.name;
  if(!nameOK(project)||!nameOK(networkName))fail('Rede proxy/projeto não identificados.');
  const networks=JSON.parse(await docker(['network','inspect',networkName])),network=networks[0];
  if(!network?.Id||network.Name!==networkName||network.Driver!=='bridge'||network.Labels?.['com.docker.compose.project']!==project)fail('A rede precisa ser uma bridge pertencente a este projeto Compose.');
  const ids=(await docker(['ps','-aq','--filter','label=com.docker.compose.project='+project,'--filter','label=com.docker.compose.service=traefik'])).trim().split(/\s+/).filter(Boolean);
  if(ids.length!==1||!/^[a-f0-9]{12,64}$/.test(ids[0]))fail('É necessário um único container Traefik neste projeto.');
  const container=JSON.parse(await docker(['inspect',ids[0]]))[0],labels=container?.Config?.Labels;
  if(labels?.['com.docker.compose.project']!==project||labels?.['com.docker.compose.service']!=='traefik'||!container.State?.Running)fail('Traefik precisa estar em execução e identificado neste projeto.');
  const endpoint=container.NetworkSettings?.Networks?.[networkName];
  if(endpoint?.NetworkID!==network.Id)fail('Traefik não está conectado à rede proxy identificada.');
  if(endpoint.GlobalIPv6Address)fail('Esta migração suporta redes IPv4; uma rede com IPv6 ativo requer planejamento específico.');
  const ipv4=endpoint.IPAddress,n=ipv4Number(ipv4),subnet=(network.IPAM?.Config||[]).find(c=>c.Subnet&&!c.Subnet.includes(':')&&(()=>{const r=cidrRange(c.Subnet);return n>r.start&&n<r.end;})());
  if(!subnet||ipv4===subnet.Gateway)fail('IP do Traefik não pertence a uma faixa utilizável da rede.');
  if(Object.entries(network.Containers||{}).some(([id,c])=>id!==container.Id&&c.IPv4Address?.split('/')[0]===ipv4))fail('O IP observado tem outro proprietário na rede.');
  const configured=env[proxyAddressKey]||null;
  if(configured&&configured!==ipv4)fail('IP configurado difere do observado. Resolva a divergência antes de migrar.');
  const fixed=configured===ipv4&&endpoint.IPAMConfig?.IPv4Address===ipv4;
  const state=await readState();
  return {text,env,definition,network,container,ipv4,configured,fixed,subnet:subnet.Subnet,state,
   revision:hash([text,network.Id,container.Id,ipv4,endpoint.IPAMConfig,state])};
 }
 async function read(){
  try{const c=await context();return {available:true,revision:c.revision,network:c.network.Name,subnet:c.subnet,ipv4:c.ipv4,configured:c.configured,fixed:c.fixed,canApply:!c.fixed,canRollback:c.state?.phase==='applied'&&c.state.networkId===c.network.Id&&c.configured===c.state.ipv4,envLine:'TRUSTED_PROXIES='+c.ipv4,lastOperation:c.state?{phase:c.state.phase,at:c.state.at,message:c.state.message}:null};}
  catch(error){return {available:false,canApply:false,canRollback:false,message:error.status?error.message:'Não foi possível consultar a rede e o Traefik. Nenhuma configuração foi alterada.'};}
 }
 async function plan(data,rollback=false){
  const c=await context();if(data?.revision!==c.revision)fail('A rede ou configuração mudou. Atualize a prévia.',409);
  if(rollback){if(c.state?.phase!=='applied'||c.state.networkId!==c.network.Id||c.configured!==c.state.ipv4)fail('Não há migração compatível para reverter.');}
  else if(c.fixed)fail('O Traefik já usa o IP fixo observado.');
  return c;
 }
 const recreate=()=>compose(['up','-d','--no-deps','--no-build','--force-recreate','--wait','--wait-timeout','60','traefik']);
 async function verify(c,fixed){
  // Re-read identities after recreation; never reuse the old container ID.
  const next=await context();
  if(next.network.Id!==c.network.Id||!next.container.State.Running)fail('A rede mudou durante a operação.');
  if(fixed&&(!next.fixed||next.ipv4!==c.ipv4))fail('O IP fixo não foi confirmado no Docker.');
  let error;
  for(let attempt=0;attempt<3;attempt++){try{await probe(next.ipv4);return next;}catch(e){error=e;if(attempt<2)await new Promise(r=>setTimeout(r,500));}}
  throw error;
 }
 async function restorePin(value,expected){
  const latest=await readEnv();if((parseEnv(latest)[proxyAddressKey]||null)!==expected)fail('A variável foi alterada externamente; restauração automática interrompida.',409);
  await atomicWrite(path.join(root,'.env'),setEnvValues(latest,{[proxyAddressKey]:value}));
 }
 async function run(data,actor,rollback){
  const c=await plan(data,rollback),before=c.configured,target=rollback?c.state.before:c.ipv4;
  await compose(['--profile','*','config','--quiet']);
  const state={phase:'prepared',at:new Date().toISOString(),networkId:c.network.Id,ipv4:c.ipv4,before:rollback?c.state.before:before,message:'Preparando alteração somente do Traefik.'};
  await save(state);await audit({actor,event:rollback?'proxy-network.rollback':'proxy-network.apply',ipv4:c.ipv4,result:'requested'});
  let touched=false;
  try{
   await restorePin(target,before);
   await compose(['--profile','*','config','--quiet']);
   touched=true;await recreate();
   const next=await verify(c,!rollback);
   await save({...state,phase:rollback?'rolled_back':'applied',at:new Date().toISOString(),message:rollback?'Configuração anterior restaurada. Confira TRUSTED_PROXIES='+next.ipv4:'IP fixo confirmado: '+next.ipv4});
   await audit({actor,event:rollback?'proxy-network.rollback':'proxy-network.apply',ipv4:next.ipv4,result:'success'});
  }catch(error){
   let recovered=false;
   try{await restorePin(before,target);if(touched){await recreate();await verify(c,!!before);}recovered=true;}catch{}
   await save({...state,phase:recovered?'restored_after_error':'recovery_required',at:new Date().toISOString(),message:recovered?'A operação falhou e a configuração anterior foi restaurada. Confira o IP observado.':'A operação falhou; use o acesso direto/SSH para recuperar somente o Traefik. Backup da variável preservado.'});
   await audit({actor,event:rollback?'proxy-network.rollback':'proxy-network.apply',result:'failed',recovered});
   fail(recovered?'Migração não concluída; configuração anterior restaurada. Confira o IP do Traefik.':'Falha de recuperação do Traefik. Consulte o procedimento de recuperação por SSH.');
  }
 }
 return {read,async confirmation(data,rollback=false){const c=await plan(data,rollback);return {title:rollback?'Reverter a reserva do IP do Traefik?':'Fixar o IP atual do Traefik?',summary:[['Rede preservada',c.network.Name],['Faixa',c.subnet],['IP atual',c.ipv4],['Variável Laravel','TRUSTED_PROXIES='+c.ipv4]],execution:rollback?'Restaurar a configuração anterior da variável do proxy e recriar somente o Traefik.':'Persistir o IP atual no Compose desta instalação e recriar somente o Traefik.',commands:[{kind:'shell',text:'docker compose up -d --no-deps --no-build --force-recreate --wait --wait-timeout 60 traefik'}],impact:'HTTP/HTTPS, Mercure e WebSocket podem desconectar brevemente durante a recriação do proxy. PHP, bancos, painel, redes e volumes não são recriados. O .env das aplicações não é alterado. A reversão ao modo dinâmico pode gerar outro IP; confira TRUSTED_PROXIES. Tenha acesso direto ao painel ou SSH antes de aplicar.'};},async apply(data,actor){await plan(data);return {operation:startOperation('Fixar IP do Traefik',()=>run(data,actor,false))};},async rollback(data,actor){await plan(data,true);return {operation:startOperation('Reverter IP fixo do Traefik',()=>run(data,actor,true))};}};
}
