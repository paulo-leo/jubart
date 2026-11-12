import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {atomicWrite,parseEnv,databaseEnabled,validateConfig} from './core.mjs';
export const accessServices={mariadb:{name:'MariaDB',prefix:'MARIADB',port:3306,engine:'mariadb'},postgres:{name:'PostgreSQL',prefix:'POSTGRES',port:5432,engine:'postgres'},phpmyadmin:{name:'phpMyAdmin',prefix:'PHPMYADMIN',port:8081,engine:'mariadb'}};
export function validateAccess(value){if(!value||!['127.0.0.1','0.0.0.0'].includes(value.bindAddress)||!Number.isInteger(value.port)||value.port<1||value.port>65535)throw new Error('Escolha acesso local ou público e uma porta entre 1 e 65535.');return {bindAddress:value.bindAddress,port:value.port};}
const same=(a,b)=>a?.bindAddress===b?.bindAddress&&a?.port===b?.port;
export function createServiceAccess({root,readEnv,loadConfig,compose,docker,composeConfig,startOperation,audit}){
 const envFile=path.join(root,'.env'),configFile=path.join(root,'config/apps.json');
 async function read(){
  const text=await readEnv(),env=parseEnv(text),saved=await loadConfig(),definition=await composeConfig();
  if(!/^[a-z0-9][a-z0-9_-]*$/.test(definition.name))throw new Error('Projeto inválido.');
  const ids=(await docker(['ps','-aq','--filter',`label=com.docker.compose.project=${definition.name}`])).trim().split(/\s+/).filter(Boolean);
  const containers=ids.length?JSON.parse(await docker(['inspect',...ids])):[];
  const services=Object.entries(accessServices).map(([id,meta])=>{
   const configured={bindAddress:env[meta.prefix+'_BIND_ADDRESS']||'127.0.0.1',port:Number(env[meta.prefix+'_PORT']||meta.port)};
   const desired=(id==='phpmyadmin'?saved.config.proxy.phpmyadmin:saved.config.proxy.databases[id])||configured;
   const c=containers.find(c=>c.Config?.Labels?.['com.docker.compose.service']===id&&c.Config?.Labels?.['com.docker.compose.oneoff']?.toLowerCase()!=='true');
   const internal=id==='phpmyadmin'?80:meta.port;
   const published=(c?.NetworkSettings?.Ports?.[internal+'/tcp']||[]).map(p=>({bindAddress:p.HostIp,port:Number(p.HostPort)}));
   return {id,name:meta.name,enabled:databaseEnabled(env,meta.engine),configured,desired,published,containerId:c?.Id||null,state:c?.State?.Status||'not_created',health:c?.State?.Health?.Status||null,pending:!same(desired,configured)||c?.State?.Status!=='running'||!published.some(p=>same(p,desired)),protocol:id==='phpmyadmin'?'HTTP':'TCP',internalPort:internal};
  });
  const revision=createHash('sha256').update(text+saved.revision+JSON.stringify(services.map(s=>[s.id,s.containerId,s.published]))).digest('hex');
  return {services,revision};
 }
 async function apply(id,data,actor){
  const meta=accessServices[id];if(!meta)throw new Error('Serviço inválido.');const value=validateAccess(data);
  const current=await read();if(data.revision!==current.revision)throw Object.assign(new Error('Configuração ou container alterado. Atualize a lista.'),{status:409});
  if(!current.services.find(s=>s.id===id).enabled)throw new Error('Serviço desativado no .env. Habilite antes de publicar.');
  const row=current.services.find(s=>s.id===id);if(same(value,row.configured)&&same(value,row.desired)&&!row.pending)return {ok:true,unchanged:true};
  return {operation:startOperation('Aplicar acesso · '+meta.name,async()=>{
   const fresh=await read();if(fresh.revision!==data.revision)throw new Error('Configuração alterada. Atualize a lista.');
   const saved=await loadConfig(),config=structuredClone(saved.config);
   if(id==='phpmyadmin')config.proxy.phpmyadmin=value;else config.proxy.databases[id]=value;
   validateConfig(config);
   const occupied=[config.proxy.httpPort,config.proxy.httpsPort,config.proxy.panel?.port,...Object.entries(accessServices).filter(([other])=>other!==id).map(([other,m])=>fresh.services.find(s=>s.id===other).configured.port)];
   if(occupied.includes(value.port))throw new Error('Porta já configurada para outro serviço.');
   const old=await readEnv(),next=patchAccessEnv(old,meta.prefix,value),staged=path.join(root,'.env.access-staged');
   try{await atomicWrite(staged,next);await compose(['--profile','*','config','--quiet'],staged);}finally{await fs.unlink(staged).catch(()=>{});}
   if(await readEnv()!==old||(await loadConfig()).revision!==saved.revision)throw new Error('Configuração alterada durante validação.');
   const backup=path.join(root,'.panel-state','service-access',id+'-'+Date.now());await fs.mkdir(backup,{recursive:true,mode:0o700});await atomicWrite(path.join(backup,'env'),old);await atomicWrite(path.join(backup,'apps.json'),JSON.stringify(saved.config,null,2)+'\n');
   await audit({actor,event:'service.access',service:id,result:'requested',...value});
   await atomicWrite(envFile,next);await atomicWrite(configFile,JSON.stringify(config,null,2)+'\n');
   try{
    await compose(['up','-d','--no-deps','--no-build','--force-recreate','--wait','--wait-timeout','90',id]);
    const actual=(await read()).services.find(s=>s.id===id);
    if(actual.pending)throw new Error('Docker não confirmou a publicação. Configuração permanece pendente; atualize e reaplique.');
    await audit({actor,event:'service.access',service:id,result:'success',...value});
   }catch(e){await audit({actor,event:'service.access',service:id,result:'failed',...value});throw e;}
  })};
 }
 return {read,apply};
}
export function patchAccessEnv(text,prefix,value){const values={[prefix+'_BIND_ADDRESS']:value.bindAddress,[prefix+'_PORT']:value.port};const remaining=new Set(Object.keys(values));const lines=text.split('\n').map(l=>{const k=l.match(/^([A-Z0-9_]+)=/)?.[1];if(!Object.hasOwn(values,k))return l;remaining.delete(k);return k+'='+values[k];});for(const k of remaining)lines.push(k+'='+values[k]);return lines.join('\n');}
