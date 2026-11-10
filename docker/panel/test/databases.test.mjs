import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { identifier, protectAccount, protectDatabase, encryptPassword, decryptPassword, createDatabaseSQL, createUserSQL, accessSQL, lockSQL } from '../databases.mjs';
import { createDatabaseAPI, validCron, backupConfig, validateBackup } from '../database-api.mjs';

test('identificadores, proteção administrativa, SQL delimitado e cofre autenticado', () => {
  for (const name of ['x; DROP DATABASE x', '../x', 'x"', 'pg_foo']) {
    if (name === 'pg_foo') assert.throws(() => protectAccount('postgres', name));
    else assert.throws(() => identifier(name));
  }
  for (const name of ['root', 'postgres', 'infra_admin']) assert.throws(() => protectAccount('postgres',name));
  for (const name of ['mysql', 'postgres', 'template0']) assert.throws(() => protectDatabase(name));
  const key='a'.repeat(64), secret="password'quoted1234";
  const encrypted=encryptPassword(secret,key);
  assert.equal(decryptPassword(encrypted,key),secret);
  assert.throws(() => decryptPassword(encrypted,'b'.repeat(64)));
  assert.throws(() => encryptPassword(secret,''));
  for(const engine of ['mariadb','postgres']) {
    assert.match(createUserSQL(engine,'appuser','%',secret),/password''quoted1234/);
    const sql=[createDatabaseSQL(engine,'appdb'),accessSQL(engine,'appuser','%','appdb','readonly'),accessSQL(engine,'appuser','%','appdb','readwrite',true),lockSQL(engine,'appuser','%',true)].join('\n');
    assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE)\b|DELETE FROM/i);
  }
  assert.ok(validCron('30 3 * * *')); assert.ok(validCron('*/15 0-23 * * 0,6'));
  for(const cron of ['60 * * * *','* 24 * * *','* * 0 * *','*/0 * * * *','* * * * * *'])assert.equal(validCron(cron),false);
});

test('API cria contas, criptografa senha, bloqueia login, aplica backup isolado e não oferece exclusão', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'database-api-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  let env=`PANEL_VAULT_KEY=${'a'.repeat(64)}\nPOSTGRES_USER=infra_admin\nDB_PASSWORD=keep-existing-secret\nBACKUP_ENABLED=true\nBACKUP_DIRECTORY=./backups/maria\nBACKUP_SCHEDULE="0 3 * * *"\nBACKUP_TIMEZONE=UTC\nBACKUP_RETENTION_DAYS=14\nBACKUP_MAX_AGE_HOURS=48\nBACKUP_RUN_ON_START=true\nBACKUP_DATABASES=*\nBACKUP_REMOTE_ENABLED=false\nBACKUP_REMOTE_PREFIX=infra/mariadb\nBACKUP_S3_PROVIDER=AWS\nBACKUP_S3_ACCESS_KEY_ID=existing-key\nBACKUP_S3_SECRET_ACCESS_KEY=existing-s3-secret\nBACKUP_S3_ENV_AUTH=false\n`;
  await fs.writeFile(path.join(root,'.env'),env);
  const calls=[],tasks=[],users={mariadb:[],postgres:[]};
  const compose=async(args,envPath,options={})=>{
    calls.push({args,envPath,...options});
    if(options.input){
      const engine=args.includes('postgres')?'postgres':'mariadb';
      if(options.input.includes("'kind'"))return [...[{kind:'database',name:'appdb',bytes:1024}],...users[engine],{kind:'user',name:engine==='mariadb'?'root':'infra_admin',host:engine==='mariadb'?'localhost':'network',admin:true}].map(JSON.stringify).join('\n');
      if(/CREATE (USER|ROLE)/.test(options.input))users[engine].push({kind:'user',name:'appuser',host:engine==='mariadb'?'%':'network',admin:false,locked:false});
      return '';
    }
    if(args.includes('status'))return JSON.stringify({fileCount:0,files:[]});
    return '';
  };
  const api=createDatabaseAPI({root,compose,readEnv:()=>fs.readFile(path.join(root,'.env'),'utf8'),startOperation:(label,task)=>{tasks.push(task);return {label,state:'running'};}});
  async function run(engine,action,data={}) { const result=await api.handle(`/api/databases/${engine}/${action}`,'POST',data);if(result.status===202)await tasks.shift()();return result; }
  for(const engine of ['mariadb','postgres']) {
    await run(engine,'create-database',{database:'appdb'});
    await run(engine,'create-user',{user:'appuser',host:'%'});
    const list=(await api.handle(`/api/databases/${engine}`,'GET',{})).body;
    assert.equal(list.inventory.users[0].knownPassword,true);
    assert.equal(list.connection.published,true);assert.equal(list.connection.bindAddress,'127.0.0.1');assert.equal(list.connection.hostPort,engine==='mariadb'?3306:5432);
    const revealed=await run(engine,'reveal',{user:'appuser',host:'%'});
    assert.ok(revealed.body.password.length>=24);
    const vault=await fs.readFile(path.join(root,'.panel-state/db-credentials.json'),'utf8');
    assert.ok(!vault.includes(revealed.body.password));
    const replacement='new-long-password-123';
    await run(engine,'password',{user:'appuser',host:'%',password:replacement});
    assert.equal((await run(engine,'reveal',{user:'appuser',host:'%'})).body.password,replacement);
    await run(engine,'lock',{user:'appuser',host:'%'});
    await run(engine,'unlock',{user:'appuser',host:'%'});
    await run(engine,'grant',{user:'appuser',host:'%',database:'appdb',permission:'readwrite'});
    await run(engine,'revoke',{user:'appuser',host:'%',database:'appdb'});
    assert.equal((await run(engine,'delete-database',{database:'appdb'})).status,404);
    await assert.rejects(run(engine,'password',{user:'root',host:'localhost'}),/protegida/);
  }
  const config=backupConfig(Object.fromEntries(env.split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).replace(/^"|"$/g,'')];})),'mariadb');
  assert.equal(config.s3SecretAccessKey,undefined);assert.equal(config.s3SecretAccessKeyConfigured,true);
  assert.throws(()=>validateBackup({...config,directory:'/var/lib/docker/volumes'},root));
  assert.throws(()=>validateBackup({...config,schedule:'99 * * * *'},root));
  await run('mariadb','backup-settings',{...config,directory:'./backups/new',schedule:'15 4 * * *',s3AccessKeyId:'',s3SecretAccessKey:''});
  env=await fs.readFile(path.join(root,'.env'),'utf8');
  assert.match(env,/DB_PASSWORD=keep-existing-secret/);assert.match(env,/BACKUP_S3_SECRET_ACCESS_KEY=existing-s3-secret/);
  assert.match(env,/BACKUP_DIRECTORY='\.\/backups\/new'/);
  assert.deepEqual(calls.at(-1).args,['up','-d','--no-deps','--force-recreate','backup']);
  assert.ok(calls.filter(c=>c.input).every(c=>!c.args.join(' ').includes('new-long-password')));
  assert.ok(calls.every(c=>!c.args.some(a=>['down','--volumes','volume','rm'].includes(a))));
});
