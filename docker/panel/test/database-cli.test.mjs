import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {inspectDatabases} from '../database-cli.mjs';
import {mariaInventorySQL,pgInventorySQL} from '../databases.mjs';

const env={POSTGRES_USER:'infra_admin',POSTGRES_PASSWORD:'ADMIN-SECRET',POSTGRES_DB:'infra',POSTGRES_PORT:'5544',DB_PASSWORD:'APP-SECRET',DB_DATABASE:'appdb'};
test('inventário consulta apenas SQL fixo, filtra servidor e não devolve credenciais',async()=>{
 const calls=[];
 const result=await inspectDatabases('/tmp','postgres',{env,run:async(file,args,options)=>{
  calls.push({file,args,options});return {stdout:[{kind:'database',name:'infra',bytes:42},{kind:'user',name:'app',host:'network',admin:false,locked:true},{kind:'grant',user:'app',database:'infra',privileges:'CONNECT'}].map(JSON.stringify).join('\n')};
 }});
 assert.equal(calls.length,1);assert.equal(calls[0].options.input,pgInventorySQL);assert.equal(calls[0].file,'docker');
 assert.deepEqual(calls[0].args.slice(0,5),['compose','exec','-T','postgres','sh']);assert.ok(!JSON.stringify(calls).includes(env.POSTGRES_PASSWORD));
 assert.equal(result.servers[0].connection.hostPort,5544);assert.equal(result.servers[0].users[0].locked,true);assert.equal(result.servers[0].databases[0].name,'infra');
 assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test('desativados não executam comandos; falha de um servidor preserva o outro e omite stderr',async()=>{
 let calls=0;
 const disabled=await inspectDatabases('/tmp','postgres',{env:{...env,POSTGRES_ENABLED:'false'},run:async()=>{calls++;}});assert.equal(calls,0);assert.equal(disabled.servers[0].status,'disabled');
 const result=await inspectDatabases('/tmp','all',{env,run:async(file,args,options)=>{if(args.includes('postgres'))throw new Error('private driver details ADMIN-SECRET');assert.equal(options.input,mariaInventorySQL);return {stdout:'{"kind":"database","name":"appdb"}'};}});
 assert.deepEqual(result.servers.map(s=>s.status),['available','unavailable']);assert.ok(!JSON.stringify(result).includes('SECRET'));
 await assert.rejects(inspectDatabases('/tmp','postgres;drop',{env}),/engine/);
});
test('helper real envia inventário pelo stdin do processo e não exige dependências do painel',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'db-cli-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'.env'),'POSTGRES_DB=infra\nPOSTGRES_PASSWORD=ADMIN-SECRET\nMARIADB_ENABLED=false\n');
 const fakeDocker=path.join(root,'docker');
 await fs.writeFile(fakeDocker,`#!/usr/bin/env node\nconst fs=require('node:fs');let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{fs.writeFileSync(process.env.DB_CLI_CAPTURE,JSON.stringify({args:process.argv.slice(2),input}));process.stdout.write(JSON.stringify({kind:'database',name:'infra',bytes:42})+'\\n');});\n`,{mode:0o700});
 const helper=path.resolve(import.meta.dirname,'../database-cli.mjs'),capture=path.join(root,'capture.json');
 const child=execFile(process.execPath,[helper],{env:{...process.env,PATH:root+':'+process.env.PATH,DB_CLI_CAPTURE:capture}},()=>{});
 let output='',stderr='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.stdin.end(JSON.stringify({root,engine:'postgres'}));
 const code=await new Promise(resolve=>child.on('close',resolve));assert.equal(code,0,output+' '+stderr);
 assert.equal(JSON.parse(output).servers[0].status,'available');const saved=JSON.parse(await fs.readFile(capture,'utf8'));
 assert.equal(saved.input,pgInventorySQL);assert.ok(!JSON.stringify(saved.args).includes('ADMIN-SECRET'));
});
