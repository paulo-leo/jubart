import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {atomicWrite} from './core.mjs';
import {createOfficialSource,officialRepository,officialImage,releaseVersion,compareVersions,blobHash,contentHash,updateFail} from './official-release.mjs';
import {releaseState,releaseOverlay,jsonFile,fileState,writableFile,stateEqual,inspectProject,projectSignature,protectedMount} from './update-files.mjs';
const publicHistory=row=>Object.fromEntries(['id','version','previousVersion','commit','state','message','startedAt','finishedAt','rollbackOf','rollbackAvailable'].filter(key=>row[key]!==undefined).map(key=>[key,row[key]]));
export function createPanelUpdates({root,runningVersion,composeConfig,docker,maintenance,source=createOfficialSource(),now=()=>Date.now()}){
 const directory=path.join(root,releaseState),plans=new Map();let preparing=false;
 const saveJSON=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await atomicWrite(file,JSON.stringify(value,null,2)+'\n');};
 async function workspaceVersion(){try{const value=JSON.parse(await fs.readFile(path.join(root,'docker/panel/package.json'),'utf8')).version;if(releaseVersion(value))return value;}catch{}updateFail('Versão do código local não identificada. Prepare o workspace oficial antes de atualizar.',409);}
 async function read(){const [catalog,installed,history]=await Promise.all([jsonFile(path.join(directory,'catalog.json')),jsonFile(path.join(directory,'installed.json')),jsonFile(path.join(directory,'history.json'),[])]);let localVersion=null;try{localVersion=await workspaceVersion();}catch{}return {repository:officialRepository,image:officialImage,runningVersion,workspaceVersion:localVersion,installed:installed?{version:installed.version,commit:installed.commit,updatedAt:installed.updatedAt}:null,checkedAt:catalog?.checkedAt||null,versions:catalog?.versions||[],history:history.slice(-20).reverse().map(publicHistory),rollbackAvailable:!!installed?.checkpointId&&history.some(row=>row.id===installed.checkpointId&&row.state==='success'&&row.rollbackAvailable)};}
 async function check(){const versions=await source.tags(),catalog={checkedAt:new Date(now()).toISOString(),versions};await saveJSON(path.join(directory,'catalog.json'),catalog);return read();}
 async function withPreparation(task){if(preparing||maintenance.isRunning())updateFail('Aguarde a preparação ou manutenção atual.',409);preparing=true;try{return await task();}finally{preparing=false;}}
 async function preview(version){return withPreparation(async()=>{
  if(!releaseVersion(version))updateFail('Selecione uma versão estável válida.');const currentVersion=await workspaceVersion();if(version.split('.')[0]!==currentVersion.split('.')[0])updateFail('Atualizações entre versões principais exigem migração manual.',409);if(compareVersions(version,currentVersion)<0)updateFail('Para retornar, use o backup da última atualização oficial.',409);if(compareVersions(version,currentVersion)===0)updateFail('O código já está nesta versão. Selecione uma versão oficial mais recente.',409);
  const versions=await source.tags(),target=versions.find(row=>row.version===version);if(!target)updateFail('Versão não encontrada no repositório oficial.',404);
  const installed=await jsonFile(path.join(directory,'installed.json')),previous=versions.find(row=>row.version===currentVersion);
  if(installed?.version!==currentVersion&&!previous)updateFail('A versão local não possui uma referência oficial para verificar alterações.',409);
  const [targetFiles,panelImage,cliImage,baseFiles]=await Promise.all([source.tree(target.commit),source.image(version),source.image(version,true),installed?.version===currentVersion?installed.files:source.tree(previous.commit)]);
  if(!targetFiles['docker/panel/package.json']||!targetFiles['config/cli-image']||!targetFiles['compose.yaml'])updateFail('A versão não contém a instalação completa.');
  const archive=await source.archive(target.commit,targetFiles),packageData=JSON.parse(archive.get('docker/panel/package.json').toString()),lock=JSON.parse(archive.get('docker/panel/package-lock.json').toString());if(packageData.version!==version||lock.version!==version||lock.packages?.['']?.version!==version||archive.get('config/cli-image').toString().trim()!==officialImage+':cli-'+version)updateFail('Fontes oficiais com versões inconsistentes.',409);
  const definition=await composeConfig();if(!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(definition.name)||!definition.services?.panel)updateFail('Projeto Compose inválido.');
  if(!definition.services.panel.healthcheck||definition.services.panel.healthcheck.disable)updateFail('Ative o healthcheck do painel para verificar e recuperar uma atualização oficial.',409);
  const containers=await inspectProject(docker,definition.name),panels=containers.filter(row=>row.service==='panel');if(panels.length!==1||!panels[0].running)updateFail('É necessário um único painel em execução.',409);
  const space=await fs.statfs(root),required=[...archive.values()].reduce((sum,buffer)=>sum+buffer.length,0)*3+16*1024*1024;if(space.bavail*space.bsize<required)updateFail('Espaço livre insuficiente para preparar a atualização e o backup.',409);
  const changes=[],checks=[],conflicts=[],deferred=[],preserved=[];const effective={...targetFiles};
  for(const file of [...new Set([...Object.keys(baseFiles),...Object.keys(targetFiles)])].sort()){
   const before=await fileState(root,file),base=baseFiles[file]||null,next=targetFiles[file]||null;checks.push({path:file,state:before});
   if(protectedMount(root,file,containers)){deferred.push(file);if(base)effective[file]=base;else delete effective[file];continue;}
   if(stateEqual(base,next)){if(!stateEqual(before,base))preserved.push(file);continue;}
   if(stateEqual(before,next))continue;
   if(!stateEqual(before,base)){conflicts.push(file);continue;}
   try{await writableFile(root,file);}catch{conflicts.push(file);continue;}
   changes.push({path:file,before,after:next,kind:!next?'remove':!before?'create':'update'});
  }
  for(const file of ['.env',releaseOverlay]){await writableFile(root,file,true);checks.push({path:file,state:await fileState(root,file,true),internal:true});}
  const planId=randomBytes(16).toString('hex'),stage=path.join(directory,'plans',planId);await fs.mkdir(stage,{recursive:true,mode:0o700});
  for(const change of changes)if(change.after){const file=path.join(stage,'source',change.path);await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await atomicWrite(file,archive.get(change.path),change.after.mode);}
  const plan={id:planId,kind:'update',version,previousVersion:currentVersion,commit:target.commit,panelImage,cliImage,targetFiles,effective,changes,checks,conflicts,deferred,preserved,project:definition.name,containers,projectSignature:projectSignature(containers),installedHash:contentHash(JSON.stringify(installed)),createdAt:now(),expiresAt:now()+15*60*1000};
  await saveJSON(path.join(stage,'plan.json'),plan);plans.set(planId,plan);for(const [id,value]of plans)if(value.expiresAt<now())plans.delete(id);
  return {planId,canApply:conflicts.length===0,version,previousVersion:currentVersion,commit:target.commit,changes:changes.map(({path,kind})=>({path,kind})),conflicts,deferred,preserved,expiresAt:new Date(plan.expiresAt).toISOString(),...confirmation(plan)};
 });}
 async function previewRollback(){return withPreparation(async()=>{
  const installed=await jsonFile(path.join(directory,'installed.json'));if(!/^[a-f0-9]{32}$/.test(installed?.checkpointId||''))updateFail('Não há atualização oficial com retorno disponível.',409);
  const checkpoint=await jsonFile(path.join(directory,'checkpoints',installed.checkpointId,'checkpoint.json'));if(!checkpoint||checkpoint.state!=='applied')updateFail('Backup de retorno indisponível.',409);
  const checks=checkpoint.writes.map(row=>({path:row.path,state:row.after,internal:row.internal}));for(const row of checks)if(!stateEqual(await fileState(root,row.path,row.internal),row.state))updateFail('Arquivo alterado após a atualização: '+row.path+'. Revise antes de retornar.',409);
  await docker(['image','inspect',checkpoint.previousPanelImage]);const containers=await inspectProject(docker,checkpoint.project),planId=randomBytes(16).toString('hex'),plan={id:planId,kind:'rollback',version:checkpoint.previousVersion,previousVersion:checkpoint.version,checkpointId:checkpoint.id,checks,project:checkpoint.project,containers,projectSignature:projectSignature(containers),installedHash:contentHash(JSON.stringify(installed)),expiresAt:now()+15*60*1000};
  await saveJSON(path.join(directory,'plans',planId,'plan.json'),plan);plans.set(planId,plan);
  return {planId,canApply:true,version:plan.version,previousVersion:plan.previousVersion,changes:checkpoint.writes.map(row=>({path:row.path,kind:'restore'})),conflicts:[],deferred:[],preserved:[],...confirmation(plan)};
 });}
 function confirmation(plan){const rollback=plan.kind==='rollback';return {title:rollback?'Retornar à versão anterior do Jubart?':'Atualizar o Jubart para '+plan.version+'?',summary:[['Origem','github.com/'+officialRepository],['Versão',plan.previousVersion+' → '+plan.version],['Imagens','Docker Hub · '+officialImage],['Serviços','Somente o painel será recriado']],execution:rollback?'Restaurar o código e a seleção de imagens do backup da última atualização; verificar o retorno do painel.':'Baixar fontes e imagens oficiais, verificar revisão e integridade, guardar backup do código e aplicar somente a imagem do painel.',commands:[{kind:'internal',text:rollback?'Validar que os arquivos não mudaram desde a atualização; restaurar o backup privado.':'Validar pacote GitHub por commit, verificar imagem por digest e revisão, sincronizar código e runtime da CLI preservando dados locais e arquivos montados nos demais serviços.'},{kind:'shell',text:'docker compose up -d --no-deps --no-build --pull never panel'}],impact:'O painel terá uma breve reconexão e poderá exigir novo login. Aplicações, bancos, filas, proxy e volumes não serão reiniciados pela atualização. Arquivos montados nos demais serviços são preservados. Mudanças de configuração desses serviços devem ser aplicadas separadamente. Se a nova imagem não ficar saudável, o executor tenta restaurar a versão anterior; o resultado fica no histórico.'};}
 async function apply(data,actor){if(!data||Object.keys(data).some(key=>key!=='planId')||!/^[a-f0-9]{32}$/.test(data.planId||''))updateFail('Prévia inválida.');const plan=plans.get(data.planId);if(!plan||plan.expiresAt<now())updateFail('A prévia expirou. Verifique a versão novamente.',409);if(plan.conflicts?.length)updateFail('Resolva os arquivos com alterações locais antes de atualizar.',409);
  for(const row of plan.checks)if(!stateEqual(await fileState(root,row.path,row.internal),row.state))updateFail('Arquivo alterado após a prévia: '+row.path+'. Gere nova prévia.',409);
  const installed=await jsonFile(path.join(directory,'installed.json'));if(contentHash(JSON.stringify(installed))!==plan.installedHash)updateFail('A instalação mudou. Gere nova prévia.',409);
  if(contentHash(JSON.stringify(await inspectProject(docker,plan.project)))!==contentHash(JSON.stringify(plan.containers)))updateFail('Os serviços mudaram após a prévia. Verifique novamente.',409);
  plans.delete(plan.id);return maintenance.launch(actor,plan.kind==='rollback'?'official-rollback':'official-update',{planId:plan.id,version:plan.version});
 }
 return {read,check,preview,previewRollback,apply,isPreparing:()=>preparing};
}
