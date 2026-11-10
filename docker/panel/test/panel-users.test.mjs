import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {createPanelUsers,validatePanelUser} from '../panel-users.mjs';
import {delegatedBackupArgs} from '../delegated-access.mjs';
import {createPanel} from '../server.mjs';
const account={username:'viewer',name:'Viewer',password:'a-long-random-password',enabled:true,admin:false,permissions:['services.read'],services:['php'],databases:[]};
test('usuários têm senha scrypt, revisão, escopos e administrador bootstrap protegido',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'panel-users-'));try{
 const users=createPanelUsers({root,bootstrapUsername:'paulo'}),actor=users.bootstrap();const initial=await users.list();const created=await users.save({revision:initial.revision,user:account},actor);
 assert.equal(created.user.username,'viewer');assert(!JSON.stringify(created).includes('password'));assert(!(await fs.readFile(path.join(root,'.panel-state/panel-users/users.json'),'utf8')).includes(account.password));assert(!(await fs.readFile(path.join(root,'.panel-state/panel-users/audit.jsonl'),'utf8')).includes(account.password));assert(await users.authenticate('VIEWER',account.password));assert.equal(await users.authenticate('viewer','wrong'),null);
 await assert.rejects(users.save({revision:initial.revision,user:account},actor));assert.throws(()=>validatePanelUser({...account,username:'Paulo'},'paulo'));assert.throws(()=>validatePanelUser({...account,permissions:['terminal.exec']},'paulo'));assert.throws(()=>validatePanelUser({...account,services:[]},'paulo'));assert.throws(()=>validatePanelUser({...account,databases:[{engine:'postgres',database:'postgres'}]},'paulo'));
 const state=await users.list();await users.save({revision:state.revision,user:{...created.user,password:'',enabled:false}},actor);assert.equal(await users.authenticate('viewer',account.password),null);
 assert(delegatedBackupArgs('mariadb','appdb').includes('BACKUP_RETENTION_DAYS=0'));assert(delegatedBackupArgs('mariadb','appdb').includes('BACKUP_REMOTE_ENABLED=false'));assert.throws(()=>delegatedBackupArgs('mariadb','mysql'));assert.throws(()=>delegatedBackupArgs('mariadb','appdb,other'));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('API aplica escopos por serviço/banco, nega escalada e revoga sessões após alteração',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'panel-rbac-')),calls=[];await fs.writeFile(path.join(root,'.env'),'APP_DOMAIN=localhost\nAPP_DIRECTORY=/tmp\nDB_PASSWORD=secret-value-test\n');
 const executor=async(_,args,options={})=>{calls.push(args);
 if(args.includes('config')&&args.includes('--format'))return {stdout:JSON.stringify({name:'infra',services:{php:{},mariadb:{},postgres:{},backup:{},panel:{}}})};
 if(options.input?.includes("'kind'"))return {stdout:[{kind:'database',name:'appdb'},{kind:'database',name:'otherdb'},{kind:'user',name:'root',host:'localhost',admin:true}].map(JSON.stringify).join('\n')};
 if(args.includes('/opt/backup/backup.py')&&args.includes('status'))return {stdout:JSON.stringify({files:[{name:'mariadb-appdb-20261109T120000000000Z.sql.gz',bytes:20,createdAt:1},{name:'mariadb-appdb-other-20261109T120000000000Z.sql.gz',bytes:30},{name:'mariadb-otherdb-20261109T120000000000Z.sql.gz',bytes:40}]})};
 if(args[0]==='ps')return {stdout:'abc'};
 if(args[0]==='inspect')return {stdout:JSON.stringify(['php','mariadb'].map(name=>({Config:{Labels:{'com.docker.compose.service':name}},Name:'/'+name,State:{Status:'running'}})))};
 if(args[0]==='volume'&&args[1]==='ls')return {stdout:''};if(args.includes('logs'))return {stdout:'Log secret-value-test'};return {stdout:''};};
 const server=createPanel({root,username:'paulo',password:'bootstrap-password-test',executor});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});const base=`http://127.0.0.1:${server.address().port}`;
 const login=async(username,password)=>{const response=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username,password})});assert.equal(response.status,200);const data=await response.json();return {data,headers:{Cookie:response.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':data.csrf,'Content-Type':'application/json'}};};
 const admin=await login('paulo','bootstrap-password-test');assert(admin.data.access.admin);
 const call=(session,route,method='GET',data)=>fetch(base+route,{method,headers:session.headers,...(data?{body:JSON.stringify(data)}:{})});
 const add=async user=>{const listed=await(await call(admin,'/api/panel-users')).json();const result=await call(admin,'/api/panel-users/save','POST',{revision:listed.revision,user});assert.equal(result.status,200);return (await result.json()).user;};
 const created=await add(account),viewer=await login('viewer',account.password);assert(!viewer.data.access.admin);
 const summary=await(await call(viewer,'/api/access/summary')).json();assert.deepEqual(summary.services.map(s=>s.name),['php']);assert(!JSON.stringify(summary).includes('secret-value-test'));
 for(const route of ['/api/config','/api/status','/api/panel-users','/api/databases/mariadb','/api/apps/main/env','/api/external-tools','/api/resources','/api/metrics'])assert.equal((await call(viewer,route)).status,403,route);
 assert.equal((await call(viewer,'/api/services/php/stop','POST',{})).status,403);assert.equal((await call(viewer,'/api/panel-users/save','POST',{user:{admin:true}})).status,403);assert.equal((await call(viewer,'/api/operation-preview','POST',{route:'/php/save',data:{}})).status,403);assert.equal((await call(viewer,'/api/operation-preview','POST',{route:'/logout',data:{}})).status,200);
 await add({...account,username:'operator',permissions:['services.read','services.stop','services.logs'],services:['php']});const operator=await login('operator',account.password);
 assert.equal((await call(operator,'/api/services/mariadb/stop','POST',{})).status,403);assert.equal((await call(operator,'/api/services/php/exec','POST',{command:'id'})).status,403);const logs=await(await call(operator,'/api/services/php/logs')).json();assert.equal(logs.logs,'Log [oculto]');
 const stop=await call(operator,'/api/services/php/stop','POST',{});assert.equal(stop.status,202);await new Promise(resolve=>setTimeout(resolve,50));assert(calls.some(args=>args.includes('stop')&&args.includes('php')));assert.equal((await(await call(viewer,'/api/operation')).json()).operation,null);
 await add({...account,username:'backupuser',permissions:['backups.read','backups.run'],services:[],databases:[{engine:'mariadb',database:'appdb'}]});const backup=await login('backupuser',account.password);
 const inventory=await(await call(backup,'/api/access/backups')).json();assert.equal(inventory.databases.length,1);assert.equal(inventory.databases[0].files.length,1);assert(!JSON.stringify(inventory).includes('otherdb'));
 assert.equal((await call(backup,'/api/access/backups/run','POST',{engine:'mariadb',database:'otherdb'})).status,403);assert.equal((await call(backup,'/api/access/backups/run','POST',{engine:'postgres',database:'appdb'})).status,403);assert.equal((await call(backup,'/api/databases/mariadb/backup-run','POST',{})).status,403);
 assert.equal((await call(backup,'/api/operation-preview','POST',{route:'/access/backups/run',data:{engine:'mariadb',database:'appdb'}})).status,200);
 assert.equal((await call(backup,'/api/access/backups/run','POST',{engine:'mariadb',database:'appdb',remoteEnabled:true,databases:'*'})).status,202);await new Promise(resolve=>setTimeout(resolve,50));const run=calls.find(args=>args.includes('BACKUP_DATABASES=appdb'));assert(run.includes('BACKUP_RETENTION_DAYS=0'));assert(run.includes('BACKUP_REMOTE_ENABLED=false'));
 const users=await(await call(admin,'/api/panel-users')).json();assert(!JSON.stringify(users).includes(account.password));const revoke=await call(admin,'/api/panel-users/save','POST',{revision:users.revision,user:{...created,password:'',enabled:false}});assert.equal(revoke.status,200);assert.equal((await call(viewer,'/api/session')).status,401);
 assert.equal((await call(operator,'/api/logout','POST',{})).status,200);
});

test('backup delegado preserva os marcadores globais de saúde, inclusive em falha',()=>{
 const script=path.resolve(import.meta.dirname,'../../backup/backup.py');
 execFileSync('python3',['-c',`
import importlib.util, tempfile, pathlib, os, sys
spec=importlib.util.spec_from_file_location('backup',${JSON.stringify(script)})
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
with tempfile.TemporaryDirectory() as folder:
 b.ROOT=pathlib.Path(folder); b.ENGINE='mariadb'
 success=b.ROOT/'.last-success'; failure=b.ROOT/'.last-error'
 success.write_text('previous-success'); failure.write_text('previous-error')
 os.environ['BACKUP_DATABASES']='appdb'
 b.databases=lambda:['appdb']
 b.dump_database=lambda name:b.ROOT/'appdb.sql.gz'
 sys.argv=['backup.py','delegated-once'];b.main()
 assert success.read_text()=='previous-success' and failure.read_text()=='previous-error'
 def bad(name): raise RuntimeError('simulated failure')
 b.dump_database=bad
 try: b.main();raise AssertionError('failure ignored')
 except RuntimeError: pass
 assert success.read_text()=='previous-success' and failure.read_text()=='previous-error'
`],{stdio:'pipe'});
});
