import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fromEnv,parseEnv,patchEnv,validateConfig,checkPaths} from '../core.mjs';
import {runtimeCompose} from '../runtimes.mjs';
test('configuração legada permanece PHP; tipos e opções sobrevivem ao .env',()=>{
 const config=fromEnv({});assert.equal(config.applications[0].type,'php');assert.equal(runtimeCompose(config),'services: {}\n');
 Object.assign(config.applications[1],{type:'node',startCommand:'npm run serve',workingDirectory:'/var/www/html/server',port:3000});
 Object.assign(config.applications[2],{type:'static',buildDirectory:'build',spa:true});
 const imported=fromEnv(parseEnv(patchEnv('',config)));assert.equal(imported.applications[1].startCommand,'npm run serve');assert.equal(imported.applications[2].spa,true);assert.equal(imported.applications[2].type,'static');
 for(const update of [{type:'invalid'},{type:'static',buildDirectory:'../private'},{workingDirectory:'/etc'},{startCommand:'echo $SECRET'}]){const c=structuredClone(config);Object.assign(c.applications[0],update);assert.throws(()=>validateConfig(c));}
});
test('valida build existente e rejeita saída do projeto por link',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'runtime-path-'));try{const c=fromEnv({APP_DIRECTORY:dir});Object.assign(c.applications[0],{type:'static',buildDirectory:'dist'});await assert.rejects(checkPaths(c,dir));await fs.mkdir(path.join(dir,'dist'));await fs.writeFile(path.join(dir,'dist/index.html'),'ok');await checkPaths(c,dir);await fs.symlink('/tmp',path.join(dir,'outside'));c.applications[0].buildDirectory='outside';await assert.rejects(checkPaths(c,dir));}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Compose real troca runtimes, remove PHP/dependências, preserva redes e bancos',async t=>{
 try{execFileSync('docker',['compose','version'],{stdio:'pipe'});}catch{t.skip('Compose indisponível');return;}
 const root=path.resolve(import.meta.dirname,'../../..'),c=fromEnv({});
 Object.assign(c.applications[0],{type:'static',buildDirectory:'dist',spa:true});Object.assign(c.applications[1],{enabled:true,type:'node',port:3000});
 const file=path.join(root,'config',`test-runtime-${process.pid}.yaml`);await fs.writeFile(file,runtimeCompose(c));try{
 const result=JSON.parse(execFileSync('docker',['compose','-f','compose.yaml','-f',file,'--profile','app2','--profile','app3','--profile','db-mariadb-true','--profile','db-postgres-true','config','--format','json'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 assert.ok(result.services['php-app3'].build);assert.equal(result.services['php-app3'].environment.DB_CONNECTION,'mysql');
 const main=result.services.php,node=result.services['php-app2'];assert.match(main.image,/^caddy:/);assert.equal(main.build,undefined);assert.equal(main.depends_on,undefined);assert.equal(main.environment.DB_PASSWORD,undefined);assert.equal(main.environment.SPA_TRY,'try_files {path} /index.html');assert.ok(main.volumes.find(v=>v.target==='/var/www/html').read_only);assert.match(node.image,/^node:/);assert.equal(node.environment.PORT,'3000');assert.equal(node.build,undefined);assert.deepEqual(node.command,['sh','-lc','exec npm start']);assert.ok(result.services.mariadb.volumes.some(v=>v.source==='mariadb_data'));assert.ok(Object.hasOwn(node.networks,"proxy"));
 }finally{await fs.unlink(file);}
});

test('novas aplicações PHP/Node/Estática geram serviços, perfis e rotas independentes',async t=>{
 const {extraAppRoutes}=await import('../runtimes.mjs');
 const c=fromEnv({APP_4_DIRECTORY:'./four',APP_5_DIRECTORY:'./five',APP_6_DIRECTORY:'./six',COMPOSE_PROFILES:'app4,app5,app6'});
 Object.assign(c.applications.find(a=>a.id==='app5'),{type:'node',port:3000});Object.assign(c.applications.find(a=>a.id==='app6'),{type:'static',spa:true});
 const restored=fromEnv(parseEnv(patchEnv('',c)));assert.equal(restored.applications.length,6);assert.equal(restored.applications.find(a=>a.id==='app5').enabled,true);
 const routes=JSON.parse(extraAppRoutes(c));assert.equal(routes.http.services['managed-app5'].loadBalancer.servers[0].url,'http://php-app5:3000');assert.match(routes.http.routers['managed-app6-http'].rule,/app6.localhost/);
 try{execFileSync('docker',['compose','version'],{stdio:'pipe'});}catch{t.skip('Compose indisponível');return;}
 const root=path.resolve(import.meta.dirname,'../../..'),file=path.join(root,'config',`test-new-app-${process.pid}.yaml`);await fs.writeFile(file,runtimeCompose(c));try{
 const result=JSON.parse(execFileSync('docker',['compose','-f','compose.yaml','-f',file,'--profile','*','config','--format','json'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 assert.ok(result.services['php-app4'].build);assert.equal(result.services['php-app4'].environment.DB_USERNAME,'app4');assert.equal(result.services['php-app4'].environment.DB_PASSWORD,'');assert.match(result.services['php-app5'].image,/^node:/);assert.match(result.services['php-app6'].image,/^caddy:/);assert.deepEqual(result.services['php-app4'].profiles,['app4']);
 }finally{await fs.unlink(file);}
});
