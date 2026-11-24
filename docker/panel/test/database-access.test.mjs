import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDatabaseAPI} from '../database-api.mjs';
import {createDatabaseConnections,defaultConnectionDiscovery} from '../database-connections.mjs';
import {createVault,pgInventorySQL,mariaInventorySQL} from '../databases.mjs';
import {operationPreview} from '../operation-preview.mjs';
import {changePlan} from '../public/change-plan.js';

async function fixture(t,{engine='postgres',failGrant=false,failConnect=false,key='a'.repeat(64)}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'db-access-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const env=`POSTGRES_USER=infra_admin\nPANEL_VAULT_KEY=${key}\n`,readEnv=async()=>env;
 const users=[{kind:'user',name:'infra_admin',host:'network',admin:true}],calls=[],events=[],tasks=[];
 let api;
 const connections=createDatabaseConnections({root,readEnv,discoverDefaults:defaultConnectionDiscovery({root,readEnv,databases:{handle:(...args)=>api.handle(...args)}}),audit:async e=>events.push(e),testConnection:async (selected,data,actor)=>{
  assert.equal(selected,engine);assert.equal(data.user,'app_access');assert.equal(data.database,'infra');assert.equal(actor,'operator');
  assert.equal((await createVault(root,readEnv).reveal(engine,data.user,engine==='postgres'?'network':'%')).password,data.password);
  if(failConnect)throw new Error('SERVER-SECRET-INTERNAL');
 }});
 const compose=async(args,unused,options={})=>{
  calls.push({args,input:options.input});
  if(options.input===pgInventorySQL||options.input===mariaInventorySQL)return [{kind:'database',name:'infra',bytes:123},...users,{kind:'grant',user:'app_access',grantee:"'app_access'@'%'",database:'infra',privileges:'CONNECT'}].map(JSON.stringify).join('\n');
  if(options.input?.includes('CREATE ROLE')||options.input?.includes('CREATE USER'))users.push({kind:'user',name:'app_access',host:engine==='postgres'?'network':'%',admin:false});
  if(options.input?.startsWith('GRANT')&&failGrant)throw new Error('SERVER-SECRET-INTERNAL');
  return args.includes('status')?'{}':'';
 };
 api=createDatabaseAPI({root,readEnv,compose,syncConnections:data=>connections.syncPassword(data),saveConnection:(data,actor)=>connections.saveAccess(data,actor),startOperation:(label,task)=>{tasks.push(task);return {label,state:'running'};}});
 const setup=(data={})=>api.handle(`/api/databases/${engine}/setup-access`,'POST',{database:'infra',user:'app_access',password:'new-private-password-123',permission:'readwrite',...data},'operator');
 return {root,api,connections,users,calls,events,tasks,setup,readEnv};
}

test('acesso ao banco inicial cria conta separada, concede, testa, cifra conexão e sincroniza nova senha nos dois SGBDs',async t=>{
 for(const engine of ['postgres','mariadb']){
  const f=await fixture(t,{engine});assert.equal((await f.setup()).status,202);
  assert.ok(!f.calls.some(c=>/CREATE (ROLE|USER)/.test(c.input||'')),'nenhuma alteração antes de executar a operação');
  await f.tasks.shift()();
  const list=await f.connections.list();assert.equal(list.connections.length,1);const connection=list.connections[0];
  assert.equal(connection.user,'app_access');assert.equal((await f.connections.resolve(connection.id)).password,'new-private-password-123');
  assert.equal(connection.password,undefined);assert.ok(!JSON.stringify(f.events).includes('new-private'));
  assert.ok(!(await fs.readFile(path.join(f.root,'.panel-state/database-connections/connections.json'),'utf8')).includes('new-private'));
  assert.ok(f.calls.some(c=>/GRANT/.test(c.input||'')));assert.ok(f.calls.every(c=>!c.args.join(' ').includes('new-private')));
  const replacement='replacement-private-456';
  await f.api.handle(`/api/databases/${engine}/password`,'POST',{user:'app_access',host:'%',password:replacement},'operator');await f.tasks.shift()();
  assert.equal((await f.connections.resolve(connection.id)).password,replacement);
  await assert.rejects(f.setup(),/já existe/);
 }
});

test('proteção, validação e revalidação evitam alterar conta existente, admin e banco de sistema',async t=>{
 const f=await fixture(t);
 for(const data of [{user:'infra_admin'},{user:'postgres'},{database:'postgres'},{user:'x; DROP ROLE a'},{permission:'admin'},{database:'missing'}])await assert.rejects(f.setup(data));
 assert.equal(f.tasks.length,0);assert.ok(!f.calls.some(c=>/CREATE (ROLE|USER)/.test(c.input||'')));
 await f.setup();f.users.push({kind:'user',name:'app_access',host:'network',admin:false});await assert.rejects(f.tasks.shift()(),/já existe/);
 const noKey=await fixture(t,{key:''});await assert.rejects(noKey.setup(),/PANEL_VAULT_KEY/);assert.equal(noKey.calls.length,0);
});

test('falhas parciais preservam credencial e apontam recuperação, sem repetir criação ou vazar erros do driver',async t=>{
 for(const failGrant of [true,false]){
  const f=await fixture(t,{failGrant,failConnect:!failGrant});await f.setup();
  await assert.rejects(f.tasks.shift()(),error=>{assert.match(error.message,failGrant?/Permissões por banco/:/cadastro da conexão falhou/);assert.ok(!error.message.includes('SERVER-SECRET'));return true;});
  assert.equal((await createVault(f.root,f.readEnv).reveal('postgres','app_access','network')).password,'new-private-password-123');
  await assert.rejects(f.setup(),/já existe/);
 }
});

test('prévia e confirmação explicam criação, teste e limites, com senha sempre omitida',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'db-preview-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const data={database:'infra',user:'app_access',password:'secret-not-in-preview',permission:'readonly'};
 const plan=changePlan('/databases/postgres/setup-access',data);
 assert.match(plan.execution,/testar/);assert.match(plan.impact,/public/);
 const preview=await operationPreview({root,route:'/databases/postgres/setup-access',data,env:{},config:{applications:[],proxy:{}},automation:{workers:[],schedulers:[],jobs:[]}});
 const text=JSON.stringify({plan,preview});assert.ok(!text.includes(data.password));assert.match(text,/CREATE ROLE/);assert.match(text,/GRANT SELECT/);assert.match(text,/SELECT 1/);
});
