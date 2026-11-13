import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {chooseProxySubnet,cidrRange,overlaps,ipv4Number,initializeProxyNetwork,createProxyNetwork,proxyAddressKey,proxyComposeFile} from '../proxy-network.mjs';
import {parseEnv} from '../core.mjs';

test('seleção automática evita Docker e rotas do host e separa IP fixo da faixa dinâmica',()=>{
 const networks=[{IPAM:{Config:[{Subnet:'172.28.0.0/24'}]}}];
 const chosen=chooseProxySubnet(networks,[{dst:'default'},{dst:'172.28.1.0/24'},{dst:'172.28.2.25',type:'local'}]);
 assert.equal(chosen.subnet,'172.28.3.0/24');assert.equal(chosen.ipv4,'172.28.3.2');
 assert.equal(overlaps(cidrRange(chosen.ipv4+'/32'),cidrRange(chosen.dynamicRange)),false);
 assert.equal(overlaps(cidrRange(chosen.gateway+'/32'),cidrRange(chosen.dynamicRange)),false);
 assert.throws(()=>chooseProxySubnet([],null),/rotas/);
 assert.throws(()=>chooseProxySubnet([],[{dst:'172.16.0.0/12'},{dst:'10.0.0.0/8'}]),/Nenhuma faixa/);
 for(const ip of ['10.0.0.256','10.0.00.2','*','127.0.0.1\n'])assert.throws(()=>ipv4Number(ip));
});
async function directory(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'jubart-proxy-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.writeFile(path.join(root,'.env'),'COMPOSE_PROJECT_NAME=infra\nDB_PASSWORD=preserved-secret\n');return root;}
test('instalação nova persiste configuração, não inicia containers e não escolhe outro IP ao repetir',async t=>{
 const root=await directory(t);const first=await initializeProxyNetwork(root,{networks:[],containers:[],hostRoutes:[]});assert.equal(first.status,'prepared');
 const text=await fs.readFile(path.join(root,'.env'),'utf8'),env=parseEnv(text),compose=JSON.parse(await fs.readFile(path.join(root,proxyComposeFile),'utf8'));
 assert.equal(env[proxyAddressKey],first.ipv4);assert.equal(env.DB_PASSWORD,'preserved-secret');assert.ok(env.COMPOSE_FILE.endsWith(proxyComposeFile));assert.equal(compose.networks.proxy.ipam.config[0].ip_range,first.dynamicRange);
 assert.equal((await fs.stat(path.join(root,'.env'))).mode&0o777,0o600);
 assert.equal((await initializeProxyNetwork(root,{networks:[],containers:[],hostRoutes:[{dst:'172.16.0.0/12'}]})).status,'configured');assert.equal(await fs.readFile(path.join(root,'.env'),'utf8'),text);
});
test('reinstalação/atualização preserva instalação existente e exige migração explícita',async t=>{
 for(const evidence of [{networks:[{Name:'infra_proxy'}],containers:[]},{networks:[],containers:[{Id:'running-or-stopped'}]},{networks:[{Name:'custom',Labels:{'com.docker.compose.project':'infra'}}],containers:[]}]){
  const root=await directory(t),before=await fs.readFile(path.join(root,'.env'),'utf8');
  assert.equal((await initializeProxyNetwork(root,{...evidence,hostRoutes:[]})).status,'migration_required');assert.equal(await fs.readFile(path.join(root,'.env'),'utf8'),before);assert.equal(await fs.stat(path.join(root,proxyComposeFile)).catch(()=>null),null);
 }
});
async function fixture(t){
 const root=await directory(t),envFile=path.join(root,'.env'),calls=[],tasks=[];
 let currentIP='172.20.0.5',runtimePin=null,sequence=1,failConfig=false,failRecreate=0,foreign=false,probeFailures=0;
 const id=()=>sequence.toString(16).padStart(64,'a');
 const env=async()=>parseEnv(await fs.readFile(envFile,'utf8'));
 const container=()=>({Id:id(),Config:{Labels:{'com.docker.compose.project':'infra','com.docker.compose.service':'traefik'}},State:{Running:true},NetworkSettings:{Networks:{infra_proxy:{NetworkID:'network-1',IPAddress:currentIP,IPAMConfig:runtimePin?{IPv4Address:runtimePin}:null}}}});
 const network=()=>({Id:'network-1',Name:'infra_proxy',Driver:'bridge',Labels:{'com.docker.compose.project':foreign?'other':'infra'},IPAM:{Config:[{Subnet:'172.20.0.0/24',Gateway:'172.20.0.1'}]},Containers:{[id()]:{IPv4Address:currentIP+'/24'}}});
 const docker=async args=>{calls.push(args);if(args[0]==='network')return JSON.stringify([network()]);if(args[0]==='ps')return id();if(args[0]==='inspect')return JSON.stringify([container()]);throw Error('Comando Docker inesperado');};
 const compose=async args=>{calls.push(args);if(args.includes('config')){if(failConfig&&(await env())[proxyAddressKey])throw Error('invalid config');return '';}
  assert.deepEqual(args,['up','-d','--no-deps','--no-build','--force-recreate','--wait','--wait-timeout','60','traefik']);
  sequence++;runtimePin=(await env())[proxyAddressKey]||null;currentIP=runtimePin||'172.20.0.9';if(failRecreate-->0)throw Error('recreation interrupted');return '';
 };
 const api=createProxyNetwork({root,readEnv:()=>fs.readFile(envFile,'utf8'),composeConfig:async()=>({name:'infra',networks:{proxy:{name:'infra_proxy'}}}),docker,compose,startOperation:(label,task)=>{tasks.push(task);return {id:'test'};},audit:async()=>{},probe:async()=>{if(probeFailures-->0)throw Error('probe failed');}});
 return {root,api,calls,run:()=>tasks.shift()(),env,foreign:()=>{foreign=true;},failConfig:()=>{failConfig=true;},failRecreate:()=>{failRecreate=1;},failProbe:()=>{probeFailures=3;}};
}
test('prévia não altera ambiente e migração recria só Traefik mantendo rede/IP e segredo',async t=>{
 const f=await fixture(t),before=await fs.readFile(path.join(f.root,'.env'),'utf8'),read=await f.api.read();assert.equal(read.canApply,true);assert.equal(read.fixed,false);
 const plan=await f.api.confirmation({revision:read.revision});assert.match(plan.impact,/HTTP\/HTTPS/);assert.equal(await fs.readFile(path.join(f.root,'.env'),'utf8'),before);
 await f.api.apply({revision:read.revision},'admin');assert.equal(await fs.readFile(path.join(f.root,'.env'),'utf8'),before);await f.run();
 const after=await f.api.read();assert.equal(after.fixed,true);assert.equal(after.ipv4,'172.20.0.5');assert.equal(after.network,read.network);assert.equal(after.canRollback,true);assert.equal((await f.env()).DB_PASSWORD,'preserved-secret');
 assert.equal(f.calls.filter(a=>a[0]==='up').length,1);assert.ok(f.calls.every(a=>!['down','rm','stop'].includes(a[0])));
});
test('rollback restaura modo anterior sem sobrescrever outras variáveis e mostra IP dinâmico observado',async t=>{
 const f=await fixture(t);await f.api.apply({revision:(await f.api.read()).revision},'admin');await f.run();
 await fs.appendFile(path.join(f.root,'.env'),'OTHER=keep-new-value\n');
 await f.api.rollback({revision:(await f.api.read()).revision},'admin');await f.run();
 const after=await f.api.read();assert.equal(after.fixed,false);assert.equal(after.ipv4,'172.20.0.9');assert.equal(after.canRollback,false);assert.equal((await f.env())[proxyAddressKey],undefined);assert.equal((await f.env()).OTHER,'keep-new-value');assert.match(after.lastOperation.message,/TRUSTED_PROXIES=172\.20\.0\.9/);
});
test('revisão antiga, rede de outro projeto e divergência de IP não alteram containers',async t=>{
 const f=await fixture(t);await assert.rejects(f.api.apply({revision:'old'},'admin'),e=>e.status===409);assert.equal(f.calls.some(a=>a[0]==='up'),false);
 await fs.appendFile(path.join(f.root,'.env'),proxyAddressKey+'=172.20.0.77\n');assert.equal((await f.api.read()).available,false);
 const other=await fixture(t);other.foreign();assert.equal((await other.api.read()).available,false);
});
test('falha de validação restaura a variável sem recriar serviço',async t=>{
 const f=await fixture(t);f.failConfig();await f.api.apply({revision:(await f.api.read()).revision},'admin');await assert.rejects(f.run(),/restaurada/);
 assert.equal((await f.env())[proxyAddressKey],undefined);assert.equal(f.calls.some(a=>a[0]==='up'),false);assert.equal((await f.api.read()).lastOperation.phase,'restored_after_error');
});
test('falha de recriação tenta recuperar somente Traefik e não redes ou volumes',async t=>{
 const f=await fixture(t);f.failRecreate();await f.api.apply({revision:(await f.api.read()).revision},'admin');await assert.rejects(f.run(),/restaurada/);
 assert.equal((await f.env())[proxyAddressKey],undefined);assert.equal(f.calls.filter(a=>a[0]==='up').length,2);assert.equal((await f.api.read()).lastOperation.phase,'restored_after_error');
});
