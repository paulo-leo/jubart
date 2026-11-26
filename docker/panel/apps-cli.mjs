import {assertProxyHostDomains} from './proxy-hosts.mjs';
// App management for the host CLI. Reuses panel validation and generators.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fromEnv,parseEnv,validateConfig,patchEnv,checkPaths,atomicWrite,slots} from './core.mjs';
import {runtimeCompose,extraAppRoutes} from './runtimes.mjs';
import {websocketFromEnv} from './websocket-config.mjs';

const execute=promisify(execFile);
const fail=message=>{throw new Error(message);};
const read=async file=>fs.readFile(file,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields=['name','domain','directory','type','port','enabled','documentRoot','mode','startCommand','workingDirectory','buildDirectory','spa'];
const labels={name:'Nome',domain:'Domínio',directory:'Pasta no host',type:'Tipo',port:'Porta interna',enabled:'Habilitada',documentRoot:'Raiz pública',mode:'Modo PHP',startCommand:'Comando de início',workingDirectory:'Pasta de trabalho',buildDirectory:'Pasta do build',spa:'SPA'};

export async function planApp(root,request){
 root=path.resolve(root);
 if(!['create','update','remove','apply'].includes(request.action))fail('Operação de aplicação inválida.');
 if(!request.changes||typeof request.changes!=='object'||Array.isArray(request.changes)||Object.keys(request.changes).some(key=>!fields.includes(key)))fail('Opções de aplicação inválidas.');
 if(['remove','apply'].includes(request.action)&&Object.keys(request.changes).length)fail('Esta operação não aceita alterações de campos.');
 const names=['.env','config/apps.json','config/apps.compose.yaml','docker/traefik/extra-apps.yml','config/automation.json'];
 const contents=await Promise.all(names.map(name=>read(path.join(root,name))));
 if(contents[0]===null)fail('Instalação não preparada. Execute ./install.sh.');
 const env=parseEnv(contents[0]);
 const current=fromEnv(env);
 const config=contents[1]===null?fromEnv(env):JSON.parse(contents[1]);
 for(const app of config.applications)app.websocket??=websocketFromEnv(env,slots[app.id]?.prefix,app,config.proxy);
 validateConfig(config);
 const original=structuredClone(config);
 let id=request.id;
 if(request.action==='create'&&!id)id=Object.keys(slots).find(candidate=>candidate!=='main'&&!config.applications.some(app=>app.id===candidate));
 if(!Object.hasOwn(slots,id||''))fail('Use um identificador main ou app2 até app100; limite de 100 aplicações.');
 const previous=structuredClone(config.applications.find(app=>app.id===id));
 if(request.action==='create'&&previous)fail('Identificador já cadastrado. Use jubart app update '+id+'.');
 if(request.action!=='create'&&!previous)fail('Aplicação não cadastrada. Consulte os IDs em jubart apps.');
 if(request.action==='remove'&&id==='main')fail('A aplicação principal não pode ser removida.');
 if(request.action==='update'&&!Object.keys(request.changes).length)fail('Informe ao menos uma flag. Consulte jubart app update --help.');
 let app;
 if(request.action==='create'){
  if(!request.changes.domain||!request.changes.directory)fail('Criar uma aplicação exige --domain e --directory.');
  const type=request.changes.type||'php';
  app={id,name:request.changes.name||request.changes.domain,type,enabled:true,port:type==='node'?3000:type==='static'?8080:8000,...request.changes};
  config.applications.push(app);
 }else if(request.action==='remove')config.applications=config.applications.filter(app=>app.id!==id);
 else{
  app=config.applications.find(app=>app.id===id);
  Object.assign(app,request.changes);
 }
 validateConfig(config);
 await assertProxyHostDomains(root,config);
 const currentApp=current.applications.find(app=>app.id===id);
 const runtimeChange=request.action!=='update'||Object.keys(request.changes).some(field=>field!=='name'&&JSON.stringify(request.changes[field])!==JSON.stringify(currentApp?.[field]));
 const beforeValue=field=>((request.action==='apply'||request.action==='update'&&!request.saveOnly)&&field!=='name'?currentApp:previous)?.[field];
 const changed=(request.action==='update'?Object.keys(request.changes):fields)
  .filter(field=>JSON.stringify(beforeValue(field))!==JSON.stringify(app?.[field]));
 const mercureFile=path.join(root,'.panel-state/mercure',id,'record.json');
 const mercure=await read(mercureFile);
 const automation=contents[4]===null?{}:JSON.parse(contents[4]);
 if(runtimeChange){
  const dependencies=['workers','schedulers','jobs'].flatMap(key=>(automation[key]||[]).filter(item=>item.app===id));
  if(dependencies.length||previous?.websocket?.enabled||currentApp?.websocket?.enabled||(mercure&&JSON.parse(mercure).settings?.enabled))
   fail('Esta aplicação possui filas, jobs, Scheduler, WebSocket ou Mercure vinculados. Gerencie esses vínculos no painel antes de alterar o runtime ou remover o cadastro.');
 }
 // Use current applied values for all other apps and proxy settings. A saved
 // draft for a different app must not be applied by this command.
 const applied=current;
 applied.applications=original.applications.map(saved=>{
  const value=applied.applications.find(item=>item.id===saved.id);
  return value||{...saved,enabled:false};
 }).filter(item=>item.id!==id);
 const runtimeApp=app&&(request.action==='update'?{...(currentApp||previous),...request.changes}:app);
 if(runtimeApp)applied.applications.push(runtimeApp);
 validateConfig(applied);
 if(runtimeApp?.enabled&&runtimeChange)await checkPaths({applications:[runtimeApp]},root);
 let nextEnv=patchEnv(contents[0],applied);
 if(request.action==='remove'&&!['app2','app3'].includes(id)){
  const prefix=slots[id].prefix+'_';
  const managed=new Set(['DOMAIN','DIRECTORY','TYPE','URL','START_COMMAND','WORKING_DIRECTORY','BUILD_DIRECTORY','SPA','DOCUMENT_ROOT','SERVER_MODE','HTTP_PORT',
   'WEBSOCKET_ENABLED','WEBSOCKET_PROVIDER','WEBSOCKET_ROUTING','WEBSOCKET_DOMAIN','WEBSOCKET_PORT','WEBSOCKET_TLS','WEBSOCKET_NODE_COMMAND','WEBSOCKET_NODE_PATH','WEBSOCKET_ORIGINS']);
  nextEnv=nextEnv.split('\n').filter(line=>!line.startsWith(prefix)||!managed.has(line.slice(prefix.length).split('=')[0])).join('\n');
 }
 const revision=hash([names,contents,mercure]);
 return {root,id,request:{...request,id},revision,config,applied,previous,app:runtimeApp,nextEnv,runtimeChange,
  summary:{id,action:request.action,service:slots[id].service,changes:changed.map(field=>({field:labels[field],before:beforeValue(field)??'—',after:app?.[field]??'—'})),
   app:app||previous,saveOnly:!!request.saveOnly,runtimeChange},
  files:runtimeChange?[['.env',nextEnv],['config/apps.json',JSON.stringify(config,null,2)+'\n'],
         ['config/apps.compose.yaml',runtimeCompose(applied)],['docker/traefik/extra-apps.yml',extraAppRoutes(applied)]]:
         [['config/apps.json',JSON.stringify(config,null,2)+'\n']],
  names,contents};
}

export function publicPlan(plan){
 const {id,action,service,changes,app,saveOnly,runtimeChange}=plan.summary;
 return {revision:plan.revision,id,action,service,changes,saveOnly,runtimeChange,
  app:Object.fromEntries(['id',...fields].map(field=>[field,app[field]]))};
}

export async function applyApp(root,request,expected,{run=execute,guard=async()=>{}}={}){
 const plan=await planApp(root,request);
 if(!expected||plan.revision!==expected)fail('Configuração alterada desde a revisão. Execute o comando novamente.');
 const lock=path.join(plan.root,'config/.jubart-cli-apps.lock');
 await fs.mkdir(path.dirname(lock),{recursive:true});
 let handle;
 try{handle=await fs.open(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST')fail('Outra alteração de aplicações está em andamento. Se foi interrompida, confira os processos antes de remover config/.jubart-cli-apps.lock.');throw error;}
 const staged=[];
 let committed=false,backup;
 const docker=async args=>{
  try{return (await run('docker',args,{cwd:plan.root,timeout:600000,maxBuffer:4*1024*1024})).stdout;}
  catch{fail('Docker não concluiu a operação. Confira Docker, permissões, configuração e logs dos serviços.');}
 };
 try{
  await guard(plan);
  const token=randomBytes(6).toString('hex');
  const envStage=path.join(plan.root,'.jubart-cli-'+token+'.env');
  const runtimeStage=path.join(plan.root,'config/.jubart-cli-'+token+'.yaml');
  const env=parseEnv(plan.nextEnv);
  const composeFiles=(env.COMPOSE_FILE||'compose.yaml:config/automation.compose.json:config/apps.compose.yaml').split(':');
  if(!composeFiles.includes('compose.yaml'))fail('COMPOSE_FILE deve incluir compose.yaml para gerenciar aplicações pela CLI.');
  const compose=async(args,{staging=false}={})=>docker(['compose','--project-directory',plan.root,'--env-file',staging?envStage:path.join(plan.root,'.env'),
   ...composeFiles.flatMap(file=>['-f',staging&&file==='config/apps.compose.yaml'?runtimeStage:path.resolve(plan.root,file)]),'--profile','*',...args]);
  if(!request.saveOnly&&plan.runtimeChange){
   staged.push(envStage,runtimeStage);
   await atomicWrite(envStage,plan.files[0][1]);
   await atomicWrite(runtimeStage,plan.files[2][1]);
   await compose(['config','--quiet'],{staging:true});
  }
  if((await planApp(root,request)).revision!==expected)fail('Configuração alterada durante a validação. Execute o comando novamente.');
  backup=path.join(plan.root,'.panel-state/app-cli',new Date().toISOString().replaceAll(':','-')+'-'+token);
  await fs.mkdir(backup,{recursive:true,mode:0o700});
  const before=await Promise.all(plan.files.map(async([name])=>[name,await read(path.join(plan.root,name))]));
  await atomicWrite(path.join(backup,'before.json'),JSON.stringify(before,null,2)+'\n');
  if(!request.saveOnly&&plan.runtimeChange&&plan.previous){
   // Stop/remove using the CURRENT definition, including a service removed
   // from the new runtime overlay. No volumes or application files are deleted.
   const output=await docker(['compose','ps','--all','--format','json']);
   const rows=output.trim().startsWith('[')?JSON.parse(output):output.split('\n').filter(Boolean).map(line=>JSON.parse(line));
   if(rows.some(row=>row.Service===slots[plan.id].service)){
    await guard(plan);
    await docker(['compose','--profile','*','stop','--timeout','30',slots[plan.id].service]);
    await guard(plan);
    await docker(['compose','--profile','*','rm','-f',slots[plan.id].service]);
   }
  }
  if((await planApp(root,request)).revision!==expected)fail('Configuração alterada antes da gravação. Execute o comando novamente.');
  await guard(plan);
  const written=[];
  try{
   for(const [name,content]of plan.files){
    await fs.mkdir(path.dirname(path.join(plan.root,name)),{recursive:true});
    await atomicWrite(path.join(plan.root,name),content,name.endsWith('.yml')?0o644:0o600);written.push(name);
   }
  }catch(error){
   for(const name of written.reverse()){
    const previous=before.find(([file])=>file===name)[1];
    if(previous===null)await fs.unlink(path.join(plan.root,name));else await atomicWrite(path.join(plan.root,name),previous,name.endsWith('.yml')?0o644:0o600);
   }
   throw error;
  }
  committed=true;
  if(!request.saveOnly&&plan.runtimeChange){
   await compose(['config','--quiet']);
   if(plan.app?.enabled)await compose(['up','-d','--build',slots[plan.id].service]);
   // Apply the selected app and shared proxy without recreating dependencies.
   const services=plan.app?.enabled?[slots[plan.id].service,'traefik']:['traefik'];
   await compose(['up','-d','--no-deps','--force-recreate',...services]);
  }
  return {id:plan.id,saved:true,applied:!request.saveOnly||!plan.runtimeChange,backup:path.relative(plan.root,backup)};
 }catch(error){
  if(committed)fail('Configuração salva, mas a aplicação no Docker falhou. '+(request.action==='remove'?'Confira docker compose up -d --no-deps traefik.':'Corrija a causa e execute jubart app apply '+plan.id+'.')+' Backup: '+path.relative(plan.root,backup));
  throw error;
 }finally{
  for(const file of staged)await fs.unlink(file).catch(()=>{});
  await handle.close();
  await fs.unlink(lock);
 }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  let text='';for await(const chunk of process.stdin){text+=chunk;if(Buffer.byteLength(text)>65536)fail('Requisição muito grande.');}
  const input=JSON.parse(text);
  const result=input.mode==='plan'?publicPlan(await planApp(input.root,input.request)):
   input.mode==='apply'?await applyApp(input.root,input.request,input.revision):fail('Operação inválida.');
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch(error){
  const message=error.code||error instanceof SyntaxError||error instanceof TypeError?'Não foi possível ler, validar ou salvar os arquivos da instalação.':error.message;
  process.stdout.write(JSON.stringify({error:message})+'\n');process.exitCode=1;
 }
}
