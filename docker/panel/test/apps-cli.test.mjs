import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fromEnv,parseEnv} from '../core.mjs';
import {planApp,publicPlan,applyApp} from '../apps-cli.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'jubart-app-cli-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'config'));
 await fs.mkdir(path.join(root,'docker/traefik'),{recursive:true});
 await fs.mkdir(path.join(root,'app/public'),{recursive:true});
 await fs.mkdir(path.join(root,'other/public'),{recursive:true});
 await fs.writeFile(path.join(root,'other/private.txt'),'project-data-preserved');
 const env='COMPOSE_FILE=compose.yaml:config/automation.compose.json:config/apps.compose.yaml:config/erp.compose.yaml\nAPP_DOMAIN=main.localhost\nAPP_DIRECTORY=./app\nAPP_2_DIRECTORY=./other\nAPP_2_DOMAIN=old.localhost\nPANEL_PASSWORD=SECRET-DO-NOT-PRINT\nAPP_2_DB_PASSWORD=DB-SECRET-PRESERVED\n';
 await fs.writeFile(path.join(root,'.env'),env);
 const config=fromEnv(parseEnv(env));
 config.applications[0].name='Principal';
 config.applications[1].name='ERP';
 await fs.writeFile(path.join(root,'config/apps.json'),JSON.stringify(config));
 const calls=[];
 const run=async(command,args)=>{calls.push([command,...args]);return {stdout:args.includes('ps')?'[{"Service":"php-app2","Name":"php-app2"}]':''};};
 return {root,env,config,calls,run};
}
const request=(action,id,changes={},saveOnly=false)=>({action,id,changes,saveOnly});

test('plan chooses a free ID, validates paths and values, and has no writes or secrets',async t=>{
 const f=await fixture(t);
 const before=await fs.readdir(path.join(f.root,'config'));
 const plan=await planApp(f.root,request('create',null,{name:'Nova',domain:'new.localhost',directory:'./other'}));
 assert.equal(plan.id,'app4');
 assert.equal(plan.app.type,'php');
 assert.equal(plan.app.enabled,true);
 assert.deepEqual(await fs.readdir(path.join(f.root,'config')),before);
 assert.equal(await fs.readFile(path.join(f.root,'.env'),'utf8'),f.env);
 assert.doesNotMatch(JSON.stringify(publicPlan(plan)),/SECRET|PASSWORD|DB_PASSWORD/);
 for(const input of [request('create','app2',{domain:'x.localhost',directory:'./other'}),request('update','unknown',{name:'x'}),
  request('remove','main'),request('update','main',{enabled:false}),request('update','main',{port:80}),
  request('update','main',{domain:'https://wrong.example'}),request('update','main',{directory:'./missing'}),
  request('update','main',{})])await assert.rejects(planApp(f.root,input));
});

test('save only updates the selected app, preserves other drafts and credentials, and backs up privately',async t=>{
 const f=await fixture(t);
 f.config.applications[0].domain='unsaved-main-draft.localhost';
 await fs.writeFile(path.join(f.root,'config/apps.json'),JSON.stringify(f.config));
 const input=request('update','app2',{domain:'new.localhost',directory:'./other',enabled:true},true);
 const plan=await planApp(f.root,input);
 const result=await applyApp(f.root,input,plan.revision,{run:f.run});
 assert.equal(f.calls.length,0);
 assert.equal(result.applied,false);
 const env=parseEnv(await fs.readFile(path.join(f.root,'.env'),'utf8'));
 assert.equal(env.APP_DOMAIN,'main.localhost');
 assert.equal(env.APP_2_DOMAIN,'new.localhost');
 assert.equal(env.APP_2_DB_PASSWORD,'DB-SECRET-PRESERVED');
 assert.equal(env.PANEL_PASSWORD,'SECRET-DO-NOT-PRINT');
 assert.match(env.COMPOSE_FILE,/config\/erp\.compose\.yaml/);
 const saved=JSON.parse(await fs.readFile(path.join(f.root,'config/apps.json'),'utf8'));
 assert.equal(saved.applications[0].domain,'unsaved-main-draft.localhost');
 assert.equal(saved.applications[1].name,'ERP');
 assert.equal(saved.applications[1].domain,'new.localhost');
 const applying=await planApp(f.root,request('apply','main'));
 assert.ok(applying.summary.changes.some(change=>change.field==='Domínio'&&change.before==='main.localhost'&&change.after==='unsaved-main-draft.localhost'));
 assert.match(await fs.readFile(path.join(f.root,'docker/traefik/extra-apps.yml'),'utf8'),/^\{/);
 const backup=path.join(f.root,result.backup,'before.json');
 assert.equal((await fs.stat(backup)).mode&0o777,0o600);
 assert.equal((await fs.stat(path.dirname(backup))).mode&0o777,0o700);
 assert.match(await fs.readFile(backup,'utf8'),/SECRET-DO-NOT-PRINT/);
});

test('apply validates staged Compose, removes the old selected container and recreates selected services',async t=>{
 const f=await fixture(t),input=request('update','app2',{enabled:true,domain:'new.localhost'});
 const plan=await planApp(f.root,input);
 await applyApp(f.root,input,plan.revision,{run:f.run});
 assert.ok(f.calls[0].includes('--quiet'));
 assert.ok(f.calls[0].some(arg=>arg.endsWith('.env')&&arg.includes('.jubart-cli-')));
 assert.deepEqual(f.calls.find(args=>args.includes('stop')).slice(-4),['stop','--timeout','30','php-app2']);
 assert.deepEqual(f.calls.find(args=>args.includes('rm')).slice(-3),['rm','-f','php-app2']);
 assert.deepEqual(f.calls.at(-1).slice(-6),['up','-d','--no-deps','--force-recreate','php-app2','traefik']);
 assert.ok(f.calls.every(args=>!args.includes('panel')&&!args.includes('-v')&&!args.includes('down')));
 assert.equal(await fs.readFile(path.join(f.root,'other/private.txt'),'utf8'),'project-data-preserved');
 assert.ok(!(await fs.readdir(path.join(f.root,'config'))).some(name=>name.startsWith('.jubart-cli-')));
});

test('single-field edits preserve pending fields and a rename never changes applied environment or containers',async t=>{
 const f=await fixture(t);
 f.config.applications[1].directory='./pending-folder';
 await fs.writeFile(path.join(f.root,'config/apps.json'),JSON.stringify(f.config));
 let input=request('update','app2',{domain:'new.localhost'},true);
 let plan=await planApp(f.root,input);
 await applyApp(f.root,input,plan.revision,{run:f.run});
 assert.equal(parseEnv(await fs.readFile(path.join(f.root,'.env'),'utf8')).APP_2_DIRECTORY,'./other');
 assert.equal(JSON.parse(await fs.readFile(path.join(f.root,'config/apps.json'),'utf8')).applications[1].directory,'./pending-folder');
 const env=await fs.readFile(path.join(f.root,'.env'),'utf8');
 const runtime=await fs.readFile(path.join(f.root,'config/apps.compose.yaml'),'utf8');
 input=request('update','app2',{name:'Apenas nome'});
 plan=await planApp(f.root,input);
 assert.equal(plan.runtimeChange,false);
 await applyApp(f.root,input,plan.revision,{run:f.run});
 assert.equal(await fs.readFile(path.join(f.root,'.env'),'utf8'),env);
 assert.equal(await fs.readFile(path.join(f.root,'config/apps.compose.yaml'),'utf8'),runtime);
 assert.equal(f.calls.length,0);
});

test('remove deletes only the registration/container, retains base slot defaults and all project data',async t=>{
 const f=await fixture(t),input=request('remove','app2');
 const plan=await planApp(f.root,input);
 await applyApp(f.root,input,plan.revision,{run:f.run});
 const saved=JSON.parse(await fs.readFile(path.join(f.root,'config/apps.json'),'utf8'));
 assert.ok(!saved.applications.some(app=>app.id==='app2'));
 const env=parseEnv(await fs.readFile(path.join(f.root,'.env'),'utf8'));
 assert.equal(env.APP_2_DIRECTORY,'./other');
 assert.equal(env.APP_2_DB_PASSWORD,'DB-SECRET-PRESERVED');
 assert.ok(!env.COMPOSE_PROFILES.split(',').includes('app2'));
 assert.equal(await fs.readFile(path.join(f.root,'other/private.txt'),'utf8'),'project-data-preserved');
 assert.deepEqual(f.calls.at(-1).slice(-5),['up','-d','--no-deps','--force-recreate','traefik']);
});

test('stale revisions, dependency links, Compose failures and concurrent edits preserve configuration',async t=>{
 const f=await fixture(t),input=request('update','app2',{enabled:true});
 const plan=await planApp(f.root,input);
 await fs.appendFile(path.join(f.root,'.env'),'# edited\n');
 await assert.rejects(applyApp(f.root,input,plan.revision,{run:f.run}),/Configuração alterada/);
 assert.equal(f.calls.length,0);
 const fresh=await planApp(f.root,input);
 await assert.rejects(applyApp(f.root,input,fresh.revision,{run:async()=>{throw new Error('SECRET-NEVER');}}),/Docker não concluiu/);
 assert.equal(await fs.readFile(path.join(f.root,'.env'),'utf8'),f.env+'# edited\n');
 assert.ok(!(await fs.readdir(path.join(f.root,'config'))).some(name=>name.startsWith('.jubart-cli-')));
 await fs.writeFile(path.join(f.root,'config/automation.json'),JSON.stringify({workers:[{app:'app2'}]}));
 await assert.rejects(planApp(f.root,input),/vínculos no painel/);
 await planApp(f.root,request('update','app2',{name:'Novo nome'}));
});

test('post-save Docker failure preserves the new configuration and provides a recovery command',async t=>{
 const f=await fixture(t),input=request('create','app4',{domain:'new.localhost',directory:'./other'});
 const plan=await planApp(f.root,input);
 await assert.rejects(applyApp(f.root,input,plan.revision,{run:async(command,args)=>{
  if(args.includes('up'))throw new Error('private-stderr-secret');
  return {stdout:''};
 }}),/Configuração salva.*jubart app apply app4/);
 const saved=JSON.parse(await fs.readFile(path.join(f.root,'config/apps.json'),'utf8'));
 assert.ok(saved.applications.some(app=>app.id==='app4'));
 assert.ok(!(await fs.readdir(path.join(f.root,'config'))).some(name=>name.startsWith('.jubart-cli-')));
});

test('real Compose validates create, runtime changes and removal without accessing the Docker daemon',async t=>{
 const execute=promisify(execFile);
 try{await execute('docker',['compose','version']);}catch{t.skip('Docker Compose indisponível');return;}
 const f=await fixture(t);
 const source=new URL('../../../',import.meta.url);
 let env=await fs.readFile(new URL('.env.example',source),'utf8');
 env+='\nAPP_DIRECTORY=./app\nAPP_2_DIRECTORY=./other\nPANEL_WORKSPACE_DIRECTORY='+f.root+'\n';
 await fs.writeFile(path.join(f.root,'.env'),env);
 await fs.copyFile(new URL('compose.yaml',source),path.join(f.root,'compose.yaml'));
 await fs.writeFile(path.join(f.root,'config/apps.json'),JSON.stringify(fromEnv(parseEnv(env))));
 await fs.writeFile(path.join(f.root,'config/automation.compose.json'),'{"services":{}}');
 await fs.writeFile(path.join(f.root,'config/apps.compose.yaml'),'services: {}\n');
 await fs.writeFile(path.join(f.root,'config/proxy-network.compose.yaml'),'{}');
 await fs.writeFile(path.join(f.root,'other/public/index.html'),'static-test');
 const run=async(command,args,options)=>{
  if(args.includes('config'))return execute(command,args,options);
  return {stdout:args.includes('ps')?'[]':''};
 };
 for(const input of [request('create','app4',{domain:'four.localhost',directory:'./other'}),
  request('update','app2',{enabled:true,type:'node',domain:'node.localhost'}),
  request('update','app2',{type:'static',buildDirectory:'public'}),
  request('remove','app4'),request('remove','app2')]){
  const plan=await planApp(f.root,input);
  await applyApp(f.root,input,plan.revision,{run});
 }
});
