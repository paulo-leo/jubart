import fs from 'node:fs/promises';
import path from 'node:path';
import {parseEnv,fromEnv,slots} from './core.mjs';
import {inspectEmptyApp} from './empty-app.mjs';
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
async function inspectFolder(root,directory){
 const folder=path.resolve(root,directory);try{
  const [real,infra,before]=await Promise.all([fs.realpath(folder),fs.realpath(root),fs.lstat(folder)]);
  const protectedPath=real!==folder||real===infra||infra.startsWith(real+path.sep)||real===path.parse(real).root;
  if(protectedPath)return {directory:folder,verified:false,empty:null,reason:'Pasta protegida ou com link simbólico.'};
  if(!before.isDirectory())return {directory:folder,verified:false,empty:null,reason:'O apontamento não é uma pasta.'};
  const entries=await fs.readdir(folder,{withFileTypes:true}),after=await fs.lstat(folder);
  if(after.isSymbolicLink()||before.dev!==after.dev||before.ino!==after.ino)return {directory:folder,verified:false,empty:null,reason:'A pasta mudou durante a verificação.'};
  return {directory:folder,verified:true,empty:entries.length===0,entryCount:entries.length,entries:entries.slice(0,100).map(entry=>({name:entry.name,type:entry.isSymbolicLink()?'symlink':entry.isDirectory()?'directory':'file'})),truncated:entries.length>100,identity:{dev:String(before.dev),ino:String(before.ino)}};
 }catch{return {directory:folder,verified:false,empty:null,reason:'Não foi possível confirmar a pasta no host/volume.'};}
}
export function createAppDirectory({root,loadConfig,snapshot,hasHostSession=()=>false}){
 async function inspect(id,remembered=new Map()){
  const saved=await loadConfig(),app=saved.config.applications.find(app=>app.id===id);if(!app)fail('Aplicação não cadastrada.',404);
  const applied=fromEnv(parseEnv(await fs.readFile(path.join(root,'.env'),'utf8'))).applications.find(app=>app.id===id);
  const directories=new Map();for(const [source,directory]of [['saved',app.directory],['applied',applied?.directory]])if(directory)directories.set(path.resolve(root,directory),{source,directory});
  let runtimeVerified=true;
  if(snapshot){try{const state=await snapshot(),service=state.services.find(service=>service.name===slots[id]?.service);for(const mount of service?.mounts||[])if(mount.target==='/var/www/html'||mount.target?.startsWith('/var/www/html/')){if(!mount.source){runtimeVerified=false;continue;}remembered.set(mount.source,{source:mount.type==='volume'?'docker-volume':'runtime-bind',directory:mount.source,volume:mount.name||null,target:mount.target});}}catch{runtimeVerified=false;}}
  for(const [directory,mount]of remembered)directories.set(path.resolve(root,directory),mount);
  const folders=await Promise.all([...directories.values()].map(async entry=>({...entry,...await inspectFolder(root,entry.directory)})));
  const eligibility=await inspectEmptyApp(root,saved.config,id),active=await hasHostSession(id);
  const empty=folders.length>0&&folders.every(folder=>folder.verified&&folder.empty);
  const canRemove=eligibility.canRemove&&runtimeVerified&&empty&&!active;
  return {app:id,name:app.name,revision:saved.revision,directory:path.resolve(root,app.directory),folders,empty,verified:runtimeVerified&&folders.every(folder=>folder.verified),hostSessionActive:active,canRemove,reason:canRemove?null:active?'Encerre a sessão de Bash desta aplicação antes de remover.':!eligibility.canRemove?eligibility.reason:!runtimeVerified?'Não foi possível verificar as montagens do container.':!empty?'A pasta do projeto/volume contém entradas ou não pôde ser confirmada.':null,note:'Inclui arquivos ocultos e subdiretórios. A remoção não apaga a pasta nem o conteúdo de volumes.'};
 }
 return {inspect,async hostLocation(id){const info=await inspect(id);const folder=info.folders.find(folder=>folder.directory===info.directory);if(!folder?.verified)fail(folder?.reason||'Pasta não verificada.');return {app:id,directory:info.directory,identity:folder.identity,revision:info.revision};},removalGuard(id){const remembered=new Map();return async()=>{const result=await inspect(id,remembered);if(!result.canRemove)fail(result.reason||'A pasta precisa estar vazia para remover a aplicação.');return result;};}};
}
