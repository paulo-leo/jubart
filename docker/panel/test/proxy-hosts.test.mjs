import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {fromEnv,atomicWrite} from '../core.mjs';
import {validateProxyHost,proxyHostRoutes,createProxyHosts,assertProxyHostDomains} from '../proxy-hosts.mjs';
import {createCertificates} from '../certificates.mjs';

const host={name:'Relatórios',domains:['reports.example.com','www.reports.example.com'],scheme:'http',host:'reports',port:3000,enabled:true,tls:true,forceHttps:true,passHostHeader:true,allowedIPs:['192.168.1.0/24','2001:db8::/32']};
async function fixture(t,options={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'proxy-hosts-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 let env='APP_DOMAIN=main.example.com\nTRAEFIK_TLS_ENABLED=true\nACME_EMAIL=admin@example.com\nHTTP_PORT=80\nHTTPS_PORT=443\n';
 const config=fromEnv({APP_DOMAIN:'main.example.com'}),tasks=[],events=[];
 const api=createProxyHosts({root,loadConfig:async()=>({config}),readEnv:async()=>env,startOperation:(label,task)=>{tasks.push(task);return {state:'running',label};},audit:async e=>events.push(e),...options});
 async function run(action,data){const state=await api.read();const result=await api.change(action,{revision:state.revision,...data},'operator');await tasks.shift()();return result;}
 return {root,api,run,tasks,config,events,setEnv:value=>env=value};
}

test('validação delimita host, domínios, protocolo, porta e redes; não admite credenciais, regras ou caminhos',()=>{
 assert.equal(validateProxyHost({...host,domains:['REPORTS.example.com']}).domains[0],'reports.example.com');
 for(const value of [
  {...host,domains:['x`) || Host(`main.example.com']},{...host,domains:['*.example.com']},{...host,domains:['127.0.0.1']},
  {...host,domains:['x.example','X.example']},{...host,domains:[]},{...host,host:'user:password@10.0.0.1'},
  {...host,host:'http://10.0.0.1'},{...host,host:'10.0.0.1/path'},{...host,scheme:'file'},
  {...host,port:0},{...host,port:65536},{...host,enabled:'true'},{...host,tls:false},
  {...host,allowedIPs:['example.com']},{...host,allowedIPs:['10.1.1.1/33']},{...host,allowedIPs:['2001:db8::/129']},
  {...host,id:'../../etc/config'},
 ])assert.throws(()=>validateProxyHost(value));
});
test('rotas HTTP/HTTPS, cabeçalho Host, IPv6, IP allowlist e redirecionamento preservam configurações distintas',()=>{
 const id='proxy-aabbccddeeff',data=JSON.parse(proxyHostRoutes([{...host,id}])),prefix='jubart-'+id;
 assert.equal(data.http.services[prefix].loadBalancer.servers[0].url,'http://reports:3000');
 assert.equal(data.http.services[prefix].loadBalancer.passHostHeader,true);
 assert.equal(data.http.routers[prefix+'-https'].tls.certResolver,'letsencrypt');
 assert.deepEqual(data.http.routers[prefix+'-http'].middlewares,[prefix+'-allow',prefix+'-redirect']);
 assert.deepEqual(data.http.routers[prefix+'-https'].middlewares,[prefix+'-allow']);
 assert.deepEqual(data.http.middlewares[prefix+'-allow'].ipAllowList.sourceRange,host.allowedIPs);
 const plain=JSON.parse(proxyHostRoutes([{...host,id,host:'2001:db8::2',scheme:'https',tls:false,forceHttps:false,allowedIPs:[],passHostHeader:false}]));
 assert.equal(Object.keys(plain.http.routers).length,1);assert.equal(plain.http.services[prefix].loadBalancer.servers[0].url,'https://[2001:db8::2]:3000');assert.equal(plain.http.middlewares,undefined);
 assert.deepEqual(JSON.parse(proxyHostRoutes([{...host,id,enabled:false}])),{});
});

test('métodos preservam hosts antigos, validam seleção e agrupam o filtro para todos os domínios e protocolos',()=>{
 const id='proxy-aabbccddeeff',prefix='jubart-'+id;
 assert.deepEqual(validateProxyHost(host).methods,[]);
 assert.deepEqual(validateProxyHost({...host,methods:['post','GET','post','OPTIONS']}).methods,['GET','POST','OPTIONS']);
 for(const methods of [null,'GET',['INVALID'],['GET`) || Host(`evil.example'],[123],[' GET'],['GET\n'],['CONNECT']])assert.throws(()=>validateProxyHost({...host,methods}));
 const legacy=JSON.parse(proxyHostRoutes([{...host,id}]));
 assert.equal(legacy.http.routers[prefix+'-http'].rule,'Host(`reports.example.com`) || Host(`www.reports.example.com`)');
 const filtered=JSON.parse(proxyHostRoutes([{...host,id,methods:['GET','POST']}])).http.routers;
 for(const suffix of ['http','https'])assert.equal(filtered[prefix+'-'+suffix].rule,'(Host(`reports.example.com`) || Host(`www.reports.example.com`)) && (Method(`GET`) || Method(`POST`))');
 assert.ok(!filtered[prefix+'-http'].rule.includes('HEAD'));assert.ok(!filtered[prefix+'-https'].rule.includes('OPTIONS'));
});

test('edição e alternância persistem métodos e permitem retornar ao padrão sem restringir outros hosts',async t=>{
 const f=await fixture(t),before=await f.api.read(),restricted={...host,methods:['GET','POST','OPTIONS']};
 const preview=await f.api.confirmation('save',{host:restricted,revision:before.revision});assert.deepEqual(preview.summary.find(([key])=>key==='Métodos HTTP'),['Métodos HTTP','GET, POST, OPTIONS']);
 await f.run('save',{host:restricted});const first=(await f.api.read()).hosts[0];assert.deepEqual(first.methods,restricted.methods);
 await f.run('toggle',{id:first.id,enabled:false});await f.run('toggle',{id:first.id,enabled:true});assert.deepEqual((await f.api.read()).hosts[0].methods,restricted.methods);
 await f.run('save',{host:{...host,name:'Livre',domains:['free.example.com'],methods:[]}});
 const routes=JSON.parse(await fs.readFile(path.join(f.root,'docker/traefik/proxy-hosts.yml'),'utf8')).http.routers;
 const records=(await f.api.read()).hosts,free=records.find(h=>h.name==='Livre');assert.ok(!routes['jubart-'+free.id+'-http'].rule.includes('Method('));assert.ok(routes['jubart-'+first.id+'-http'].rule.includes('Method('));
 await f.run('save',{host:{...first,methods:[]}});assert.ok(!String(await fs.readFile(path.join(f.root,'docker/traefik/proxy-hosts.yml'),'utf8')).includes('Method('));
});

test('CRUD confirmado publica arquivos isolados; desativar/remover preserva aplicação, certificado e demais rotas',async t=>{
 const f=await fixture(t),before=await f.api.read();assert.equal(before.hosts.length,0);assert.equal(before.fileMatches,true);
 const preview=await f.api.confirmation('save',{host,revision:before.revision});assert.match(preview.execution,/Traefik/);assert.match(preview.commands[0].text,/não recria containers/);
 await f.api.change('save',{host,revision:before.revision},'operator');
 assert.equal((await f.api.read()).hosts.length,0,'não escreve antes da operação ser executada');
 await f.tasks.shift()();const created=await f.api.read();assert.equal(created.hosts.length,1);assert.equal(created.fileMatches,true);assert.deepEqual(created.ports,{http:80,https:443});
 const id=created.hosts[0].id;assert.match(id,/^proxy-/);const routes=path.join(f.root,'docker/traefik/proxy-hosts.yml');
 await fs.writeFile(path.join(f.root,'docker/traefik/other.yml'),'keep-other-route');
 await f.run('save',{host:{...created.hosts[0],port:8088}});assert.match(await fs.readFile(routes,'utf8'),/reports:8088/);
 await f.run('toggle',{id,enabled:false});assert.deepEqual(JSON.parse(await fs.readFile(routes,'utf8')),{});
 await f.run('toggle',{id,enabled:true});assert.equal((await f.api.endpoints()).length,2);
 await f.run('remove',{id});assert.equal((await f.api.read()).hosts.length,0);assert.equal(await fs.readFile(path.join(f.root,'docker/traefik/other.yml'),'utf8'),'keep-other-route');
 assert.equal(f.events.at(-1).result,'success');assert.ok(await fs.stat(path.join(f.root,'.panel-state/proxy-hosts/before.json')));
});

test('conflitos e revisões obsoletas são recusados antes de gravar; cadastro existente não é duplicado',async t=>{
 const f=await fixture(t);await f.run('save',{host});const original=await f.api.read(),data={revision:original.revision,host};
 await assert.rejects(f.api.change('save',data,'operator'),/já utilizado/);
 await assert.rejects(f.api.change('save',{...data,host:{...host,domains:['main.example.com']}},'operator'),/já utilizado/);
 await assert.rejects(f.api.change('remove',{revision:original.revision,id:'proxy-000000000000'},'operator'),/não encontrado/);
 await assert.rejects(assertProxyHostDomains(f.root,{applications:[{domain:host.domains[0]}]}),/Hosts de proxy/);
 await f.api.change('toggle',{revision:original.revision,id:original.hosts[0].id,enabled:false},'operator');
 f.config.applications.push({domain:host.domains[0]});await assert.rejects(f.tasks.shift()(),/alterados/);
 assert.equal((await f.api.read()).hosts[0].enabled,true);
});

test('HTTPS exige configuração aplicada; falha de publicação restaura o cadastro e mantém a rota anterior',async t=>{
 let failWrite=false;
 const f=await fixture(t,{write:async(file,content,mode)=>{if(failWrite&&file.endsWith('proxy-hosts.yml'))throw new Error('disk error');return atomicWrite(file,content,mode);}});
 f.setEnv('APP_DOMAIN=main.example.com\n');let state=await f.api.read();assert.equal(state.tlsReady,false);await assert.rejects(f.api.change('save',{host,revision:state.revision},'operator'),/Configure/);
 await f.run('save',{host:{...host,tls:false,forceHttps:false}});
 const file=path.join(f.root,'config/proxy-hosts.json'),route=path.join(f.root,'docker/traefik/proxy-hosts.yml'),old=await fs.readFile(file,'utf8'),oldRoute=await fs.readFile(route,'utf8');
 failWrite=true;state=await f.api.read();await f.api.change('save',{revision:state.revision,host:{...state.hosts[0],port:9000}},'operator');await assert.rejects(f.tasks.shift()(),/restaurados/);
 assert.equal(await fs.readFile(file,'utf8'),old);assert.equal(await fs.readFile(route,'utf8'),oldRoute);
 failWrite=false;await fs.writeFile(route,'{}');state=await f.api.read();assert.equal(state.fileMatches,false);await f.run('apply',{});assert.equal((await f.api.read()).fileMatches,true);
});

test('hosts HTTPS integram a consulta de certificados sem aceitar endereços arbitrários',async t=>{
 const f=await fixture(t);await f.run('save',{host});const calls=[];
 const certificates=createCertificates({root:f.root,readEnv:async()=>'',loadConfig:async()=>({config:f.config}),composeConfig:async()=>({name:'test'}),docker:async()=>'',proxyEndpoints:()=>f.api.endpoints(),storageFile:path.join(f.root,'absent'),probe:async target=>{calls.push(target);return {trusted:true};}});
 const endpoints=(await certificates.read()).endpoints,endpoint=endpoints.find(e=>e.id.startsWith('proxy-'));assert.ok(endpoint);
 await certificates.inspect(endpoint.id);assert.equal(calls[0].domain,host.domains[0]);await assert.rejects(certificates.inspect('https://other.example'),/cadastrado/);
});

test('API exige administrador e CSRF; prévia não publica e confirmações publicam via operação',async t=>{
 const {createPanel}=await import('../server.mjs'),{createPanelUsers}=await import('../panel-users.mjs');
 const f=await fixture(t);await fs.writeFile(path.join(f.root,'.env'),'APP_DOMAIN=main.example.com\nTRAEFIK_TLS_ENABLED=true\nACME_EMAIL=admin@example.com\n');
 const users=createPanelUsers({root:f.root,bootstrapUsername:'admin'}),listed=await users.list();await users.save({revision:listed.revision,user:{username:'viewer',name:'Consulta',admin:false,enabled:true,password:'viewer-password-long',permissions:[],services:[],databases:[]}},users.bootstrap());
 const server=createPanel({root:f.root,username:'admin',password:'administrator-password',executor:async()=>{throw new Error('Sem Docker para cadastro de proxy');}});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await server.shutdown();});const base='http://127.0.0.1:'+server.address().port;
 const login=async(username,password)=>{const r=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username,password})}),data=await r.json();return {Cookie:r.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':data.csrf};};
 assert.equal((await fetch(base+'/api/proxy-hosts')).status,401);const admin=await login('admin','administrator-password'),viewer=await login('viewer','viewer-password-long');
 assert.equal((await fetch(base+'/api/proxy-hosts',{headers:viewer})).status,403);
 const post=(route,data,headers=admin)=>fetch(base+'/api'+route,{method:'POST',headers,body:JSON.stringify(data)});
 const state=await(await fetch(base+'/api/proxy-hosts',{headers:admin})).json(),data={revision:state.revision,host};
 assert.equal((await post('/proxy-hosts/save',data,{Cookie:admin.Cookie})).status,403);assert.equal((await post('/proxy-hosts/save',data,viewer)).status,403);
 assert.equal((await post('/operation-preview',{route:'/proxy-hosts/save',data})).status,200);assert.equal((await f.api.read()).hosts.length,0);
 const saved=await post('/proxy-hosts/save',data);assert.equal(saved.status,202);
 for(let i=0;i<100;i++){const op=await(await fetch(base+'/api/operation',{headers:admin})).json();if(op.operation.state!=='running'){assert.equal(op.operation.state,'success',op.operation.message);break;}await new Promise(r=>setTimeout(r,10));}
 const after=await(await fetch(base+'/api/proxy-hosts',{headers:admin})).json();assert.equal(after.hosts.length,1);
 const appConfig=await(await fetch(base+'/api/config',{headers:admin})).json();appConfig.config.applications[0].domain=host.domains[0];
 const conflict=await fetch(base+'/api/config',{method:'PUT',headers:admin,body:JSON.stringify(appConfig)});assert.equal(conflict.status,400);assert.match((await conflict.json()).error,/Hosts de proxy/);
});
