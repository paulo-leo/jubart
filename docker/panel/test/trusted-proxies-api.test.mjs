import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createPanel} from '../server.mjs';

test('guia autenticado consulta o Docker novamente e devolve o IP do proxy sem executar alterações',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'jubart-trusted-proxy-'));
 await fs.writeFile(path.join(root,'.env'),'APP_DOMAIN=localhost\nDB_PASSWORD=do-not-expose\n');
 let proxyIP='172.20.0.5';const calls=[];
 const executor=async(command,args)=>{
  calls.push(args);
  if(args.includes('config')&&args.includes('--format'))return {stdout:JSON.stringify({name:'infra',services:{php:{},traefik:{}}})};
  if(args[0]==='ps')return {stdout:'php-id\ntraefik-id'};
  if(args[0]==='inspect')return {stdout:JSON.stringify(['php','traefik'].map(service=>({Id:service+'-id',Name:'/'+service,Config:{Labels:{'com.docker.compose.service':service}},State:{Status:'running'},NetworkSettings:{Networks:{infra_proxy:{IPAddress:service==='traefik'?proxyIP:'172.20.0.9'}}}})))};
  if(args[0]==='volume'&&args[1]==='ls')return {stdout:''};
  throw Error('Comando inesperado: '+args[0]);
 };
 const server=createPanel({root,username:'admin',password:'administrator-password',executor});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await server.shutdown();await fs.rm(root,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/connection-guide')).status,401);
 const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username:'admin',password:'administrator-password'})});
 assert.equal(login.status,200);const headers={Cookie:login.headers.get('set-cookie').split(';')[0]};
 let response=await fetch(base+'/api/connection-guide',{headers});assert.equal(response.status,200);
 let data=await response.json();assert.equal(data.trustedProxies.applications[0].envLine,'TRUSTED_PROXIES=172.20.0.5');
 assert.doesNotMatch(JSON.stringify(data),/do-not-expose/);
 proxyIP='172.20.0.7';response=await fetch(base+'/api/connection-guide',{headers});data=await response.json();
 assert.equal(data.trustedProxies.applications[0].envLine,'TRUSTED_PROXIES=172.20.0.7');
 assert.equal(calls.filter(a=>a[0]==='inspect').length,2);
 assert.ok(calls.every(a=>a.includes('config')||a[0]==='ps'||a[0]==='inspect'||(a[0]==='volume'&&a[1]==='ls')));
});
