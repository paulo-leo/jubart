import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {parseEnv,atomicWrite} from './core.mjs';
import {runtimeCompose} from './runtimes.mjs';
import {automationCompose} from './automation.mjs';
export function memoryKey(service){if(!/^[a-z][a-z0-9-]{0,100}$/.test(service))throw new Error('Serviço inválido.');return 'CONTAINER_MEMORY_'+service.toUpperCase().replaceAll('-','_');}
export function memoryValue(value){if(!Number.isInteger(value)||(value!==0&&(value<64||value>1048576)))throw new Error('Informe 0 (sem limite) ou de 64 a 1048576 MiB.');return value===0?'0':`${value}m`;}
export function diskUsage(){return new Promise((resolve,reject)=>{const request=http.get({socketPath:'/var/run/docker.sock',path:'/system/df'},res=>{let text='';res.on('data',data=>{text+=data;if(text.length>16*1024*1024)request.destroy(new Error('Resposta Docker muito grande.'));});res.on('end',()=>{try{if(res.statusCode!==200)throw new Error('Docker recusou a coleta de disco.');resolve(JSON.parse(text));}catch(e){reject(e);}});});request.setTimeout(20000,()=>request.destroy(new Error('Tempo de coleta de disco excedido.')));request.on('error',reject);});}
export async function storageReport({root,definition,readDisk=diskUsage}){
 const errors=[];let host=null,usage=null;
 try{const source=process.env.HOST_STORAGE_MOUNT||'/host/storage',stat=await fs.statfs(source);host={path:process.env.HOST_STORAGE_DIRECTORY||'Sistema de arquivos da pasta configurada',total:Number(stat.blocks)*Number(stat.bsize),free:Number(stat.bfree)*Number(stat.bsize),available:Number(stat.bavail)*Number(stat.bsize),used:(Number(stat.blocks)-Number(stat.bfree))*Number(stat.bsize)};}catch{errors.push('Capacidade do host indisponível; recrie o painel para montar HOST_STORAGE_DIRECTORY.');}
 try{usage=await readDisk();}catch{errors.push('Uso Docker indisponível. Verifique a conexão com o daemon e tente atualizar.');}
 const containers=(usage?.Containers||[]).filter(c=>c.Labels?.['com.docker.compose.project']===definition.name).map(c=>({id:c.Id,name:c.Names?.[0]?.replace(/^\//,'')||c.Id,service:c.Labels?.['com.docker.compose.service'],writable:c.SizeRw??null,rootfs:c.SizeRootFs??null,mounts:(c.Mounts||[]).map(m=>({type:m.Type,name:m.Name||m.Source,target:m.Destination}))}));
 const volumeNames=new Set(containers.flatMap(c=>c.mounts.filter(m=>m.type==='volume').map(m=>m.name)));
 const volumes=(usage?.Volumes||[]).filter(v=>volumeNames.has(v.Name)||v.Labels?.['com.docker.compose.project']===definition.name).map(v=>({name:v.Name,bytes:v.UsageData?.Size>=0?v.UsageData.Size:null,containers:containers.filter(c=>c.mounts.some(m=>m.type==='volume'&&m.name===v.Name)).map(c=>c.name)}));
 return {at:Date.now(),host,containers,volumes,errors,docker:usage?{layers:usage.LayersSize??null,images:(usage.Images||[]).length,scope:'Daemon completo: inclui outros projetos; camadas de imagens podem ser compartilhadas.'}:null,partialWritable:containers.some(c=>c.writable===null),partialVolumes:volumes.some(v=>v.bytes===null),projectWritable:containers.reduce((n,c)=>n+(c.writable||0),0),projectVolumes:volumes.reduce((n,v)=>n+(v.bytes||0),0)};
}
export function createResourceAPI({root,docker,composeConfig,readEnv,loadConfig,startOperation}){
 return {async list(){const definition=await composeConfig(),env=parseEnv(await readEnv());const ids=(await docker(['ps','-aq','--filter',`label=com.docker.compose.project=${definition.name}`])).trim().split(/\s+/).filter(Boolean);const current=ids.length?JSON.parse(await docker(['inspect',...ids])):[];return {services:Object.keys(definition.services).map(service=>{const c=current.find(c=>c.Config?.Labels?.['com.docker.compose.service']===service);return {name:service,configured:env[memoryKey(service)]||'0',configuredMiB:Math.ceil(Number(definition.services[service].mem_limit||0)/1048576),effective:c?.HostConfig?.Memory??null,state:c?.State?.Status||'Não criado',container:c?.Id||null};})};},async save(data){const value=memoryValue(data.memoryMiB),key=memoryKey(data.service),definition=await composeConfig();if(!Object.hasOwn(definition.services,data.service))throw new Error('Serviço fora da infraestrutura.');return {operation:startOperation(`Limite de memória · ${data.service}`,async()=>{
 const old=await readEnv(),env=parseEnv(old);if((env[key]||'0')!==data.previous)throw new Error('Limite alterado em outra sessão. Atualize antes de salvar.');
 const info=await this.list(),service=info.services.find(s=>s.name===data.service);
 const state=path.join(root,'.panel-state');await fs.mkdir(state,{recursive:true,mode:0o700});await atomicWrite(path.join(state,'env-before-memory'),old);
 if(await readEnv()!==old)throw new Error('.env alterado durante a operação. Revise e tente novamente.');
 const next=old.split('\n').filter(line=>line.split('=',1)[0]!==key).join('\n')+`\n${key}=${value}\n`;await atomicWrite(path.join(root,'.env'),next);
 const saved=await loadConfig();await atomicWrite(path.join(root,'config/apps.compose.yaml'),runtimeCompose(saved.config));
 let automation;try{automation=JSON.parse(await fs.readFile(path.join(root,'config/automation.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(automation)await atomicWrite(path.join(root,'config/automation.compose.json'),JSON.stringify(automationCompose(automation),null,2)+'\n');
 if(service.container){try{await docker(['update','--memory',value,'--memory-swap',value==='0'?'-1':value,service.container]);}catch{throw new Error('Limite salvo no .env, mas o Docker recusou a atualização em execução. Confira o limite efetivo e recrie o serviço para aplicar a configuração salva.');}}
 })};}};
}
