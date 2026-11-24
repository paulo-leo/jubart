import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fromEnv,parseEnv} from '../core.mjs';
import {proxyHostRoutes} from '../proxy-hosts.mjs';
import {inspectProxies} from '../proxy-cli.mjs';

async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'jubart-proxy-cli-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const text='APP_DOMAIN=api.example.com\nAPP_DIRECTORY=./app\nTRAEFIK_TLS_ENABLED=true\nACME_EMAIL=admin@example.com\nHTTP_PORT=80\nHTTPS_PORT=443\nCOMPOSE_PROFILES=app2,app4\nAPP_2_DOMAIN=old.example.com\nAPP_4_DIRECTORY=./app4\nPANEL_PASSWORD=PRIVATE-LOGIN\nPOSTGRES_PASSWORD=PRIVATE-DATABASE\nPANEL_VAULT_KEY=PRIVATE-VAULT\n';
 const config=fromEnv(parseEnv(text));
 config.applications=config.applications.filter(a=>a.id!=='app4');
 config.proxy.httpPort=8080;
 config.applications[1].domain='new.example.com';
 config.applications[0].websocket={...config.applications[0].websocket,enabled:true,routing:'domain',domain:'ws.example.com'};
 config.password='PRIVATE-CONFIG';
 const hosts=[{id:'proxy-112233445566',name:'Relatórios',domains:['reports.example.com'],scheme:'https',host:'2001:db8::2',port:8443,methods:['POST','get'],enabled:true,tls:true,forceHttps:true,passHostHeader:false,allowedIPs:['10.0.0.0/8'],password:'PRIVATE-HOST'},
  {id:'proxy-aabbccddeeff',name:'Inativo',domains:['disabled.example.com'],scheme:'http',host:'reports',port:3000,enabled:false,tls:false,forceHttps:false,passHostHeader:true,allowedIPs:[]}];
 const files={'.env':text,'config/apps.json':JSON.stringify(config),'config/proxy-hosts.json':JSON.stringify({version:1,hosts}),
  'docker/traefik/proxy-hosts.yml':proxyHostRoutes(hosts),'.panel-state/security.json':JSON.stringify({
   groups:[{id:'office',name:'Escritório',networks:['192.168.0.0/16'],password:'PRIVATE-GROUP'}],
   policies:[{app:'main',enabled:true,defaultAccess:'deny',rate:20,burst:30,inflight:5,rules:[
    {name:'Expediente',effect:'allow',groups:['office'],networks:[],schedule:{days:[1,2,3,4,5],start:'08:00',end:'18:00',timezone:'America/Sao_Paulo'}}]}]})};
 for(const [file,data]of Object.entries(files)){await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),data);}
 return {root,files};
}

test('inventário inclui aplicações, painel, WebSocket, hosts desativados e rotas presentes apenas no ambiente',async t=>{
 const {root}=await fixture(t),data=await inspectProxies(root);
 assert.deepEqual(new Set(data.routes.map(r=>r.kind)),new Set(['Aplicação','Painel','WebSocket','Host de proxy']));
 assert.equal(data.routes.find(r=>r.id==='app3').enabled,false);
 assert.equal(data.routes.find(r=>r.id==='app4').registered,false);
 assert.equal(data.routes.find(r=>r.id==='app4').configured.enabled,true);
 const host=data.routes.find(r=>r.id==='proxy-112233445566');
 assert.equal(host.destination,'https://[2001:db8::2]:8443');
 assert.deepEqual(host.methods,['GET','POST']);
 assert.equal(host.passHostHeader,false);
 assert.deepEqual(host.allowedIPs,['10.0.0.0/8']);
 assert.match(host.rule,/Method\(`GET`\).*Method\(`POST`\)/);
 assert.equal(data.routes.find(r=>r.id==='proxy-aabbccddeeff').enabled,false);
 assert.deepEqual(data.routes.find(r=>r.id==='proxy-aabbccddeeff').methods,[]);
 assert.equal(data.hostFileMatches,true);
});

test('detalhes distinguem cadastro e ambiente e incluem política de IP, horário e limites',async t=>{
 const {root,files}=await fixture(t),data=await inspectProxies(root);
 assert.deepEqual(data.settings.find(r=>r[0]==='Porta HTTP no host'),['Porta HTTP no host',8080,80]);
 const app=data.routes.find(r=>r.id==='app2');
 assert.deepEqual(app.domains,['new.example.com']);
 assert.deepEqual(app.configured.domains,['old.example.com']);
 const main=data.routes.find(r=>r.id==='main'),policy=main.settings.find(r=>r[0]==='Política de acesso')[1];
 assert.equal(policy.rate,20);
 assert.equal(policy.rules[0].schedule.timezone,'America/Sao_Paulo');
 assert.equal(main.settings.find(r=>r[0]==='Grupos de IP')[1][0].id,'office');
 assert.equal(data.routes.find(r=>r.id==='websocket-main').destination,'http://websocket-main:8080');
 assert.match(data.routes.find(r=>r.id==='websocket-main').rule,/ws\.example\.com/);
 for(const secret of ['PRIVATE-LOGIN','PRIVATE-DATABASE','PRIVATE-VAULT','PRIVATE-CONFIG','PRIVATE-HOST','PRIVATE-GROUP'])assert.ok(!JSON.stringify(data).includes(secret));
 for(const [file,before]of Object.entries(files))assert.equal(await fs.readFile(path.join(root,file),'utf8'),before);
});

test('rotas divergentes são indicadas sem publicar arquivos nem criar cadastro ausente',async t=>{
 const {root}=await fixture(t);
 await fs.writeFile(path.join(root,'docker/traefik/proxy-hosts.yml'),'{}\n');
 assert.equal((await inspectProxies(root)).hostFileMatches,false);
 const empty=await fs.mkdtemp(path.join(os.tmpdir(),'jubart-proxy-empty-'));
 t.after(()=>fs.rm(empty,{recursive:true,force:true}));
 const data=await inspectProxies(empty);
 assert.match(data.source,/cadastro ainda inexistente/);
 assert.equal(data.hostFileMatches,true);
 assert.deepEqual(await fs.readdir(empty),[]);
});

test('cadastros malformados falham em vez de aparecer como lista vazia',async t=>{
 const {root}=await fixture(t);
 await fs.writeFile(path.join(root,'config/proxy-hosts.json'),'{"version":1,"hosts":"invalid"}');
 await assert.rejects(inspectProxies(root),/Formato de hosts/);
});
