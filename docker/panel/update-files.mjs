import fs from 'node:fs/promises';
import path from 'node:path';
import {constants} from 'node:fs';
import {atomicWrite,parseEnv} from './core.mjs';
import {blobHash,contentHash,publicReleasePath,updateFail} from './official-release.mjs';
export const releaseOverlay='config/jubart-release.compose.yaml';
export const releaseState='.panel-state/official-updates';
export const jsonFile=async(file,fallback=null)=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}};
export async function safeFile(root,file,{internal=false}={}){
 if(!internal&&!publicReleasePath(file))updateFail('Arquivo de atualização não permitido.');
 if(!file||path.isAbsolute(file)||file.split('/').some(p=>!p||p==='.'||p==='..')||file.includes('\\'))updateFail('Caminho inválido.');
 const base=await fs.realpath(root);if(base!==path.resolve(root))updateFail('A raiz da instalação não pode usar links simbólicos.');
 const parts=file.split('/');let current=base;
 for(let i=0;i<parts.length;i++){current=path.join(current,parts[i]);try{const stat=await fs.lstat(current);if(stat.isSymbolicLink()||i<parts.length-1&&!stat.isDirectory()||i===parts.length-1&&!stat.isFile())updateFail('Arquivo ou pasta não regular: '+file,409);}catch(error){if(error.code==='ENOENT')return path.join(base,file);throw error;}}
 return current;
}
export async function fileState(root,file,internal=false){const full=await safeFile(root,file,{internal});try{const [bytes,stat]=await Promise.all([fs.readFile(full),fs.stat(full)]);return {sha:blobHash(bytes),mode:stat.mode&0o777};}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export async function writableFile(root,file,internal=false){const full=await safeFile(root,file,{internal});let parent=path.dirname(full);for(;;){try{await fs.access(parent,constants.W_OK|constants.X_OK);break;}catch(error){if(error.code!=='ENOENT')updateFail('Sem permissão para atualizar: '+file,409);const next=path.dirname(parent);if(next===parent)updateFail('Pasta de atualização indisponível.');parent=next;}}}
export const stateEqual=(a,b)=>a?.sha===b?.sha&&(a?.mode??null)===(b?.mode??null);
export async function writeManagedFile(root,file,buffer,mode=0o644,internal=false){
 const full=await safeFile(root,file,{internal});if(buffer===null){await fs.rm(full,{force:true});return;}
 const owner=await fs.stat(root),exists=await fs.lstat(full).catch(error=>{if(error.code==='ENOENT')return null;throw error;});let parent=root;
 for(const part of file.split('/').slice(0,-1)){parent=path.join(parent,part);try{await fs.mkdir(parent,{mode:0o755});if(process.getuid?.()===0)await fs.lchown(parent,owner.uid,owner.gid);}catch(error){if(error.code!=='EEXIST')throw error;}}
 await safeFile(root,file,{internal});await atomicWrite(full,buffer,mode);if(!exists&&process.getuid?.()===0)await fs.lchown(full,owner.uid,owner.gid);
}
export function updateEnvironment(text){
 const env=parseEnv(text),files=(env.COMPOSE_FILE||'compose.yaml:config/automation.compose.json:config/apps.compose.yaml:config/proxy-network.compose.yaml').split(':').filter(Boolean).filter(file=>file!==releaseOverlay);
 files.push(releaseOverlay);const value=files.join(':');if(/[\x00-\x1f'\\$]/.test(value))updateFail('COMPOSE_FILE contém caracteres não suportados para atualização automática.');
 let found=false;const lines=text.split('\n').map(line=>{if(/^COMPOSE_FILE=/.test(line)){if(found)updateFail('COMPOSE_FILE duplicado no ambiente.');found=true;return "COMPOSE_FILE='"+value+"'";}return line;});if(!found)lines.push("COMPOSE_FILE='"+value+"'");return lines.join('\n');
}
export const overlayText=image=>'# Gerenciado pela atualização oficial do Jubart.\nservices:\n  panel:\n    image: '+image+'\n    build: !reset null\n';
export const escapedDefinition=value=>JSON.stringify(value,(_key,entry)=>typeof entry==='string'?entry.replaceAll('$',()=> '$$'):entry,2)+'\n';
export async function inspectProject(run,project){
 const ids=(await run(['ps','-aq','--filter','label=com.docker.compose.project='+project])).trim().split(/\s+/).filter(Boolean);if(!ids.length)updateFail('Containers da instalação não identificados.',409);
 const rows=JSON.parse(await run(['inspect',...ids]));return rows.filter(row=>row.Config?.Labels?.['com.docker.compose.oneoff']?.toLowerCase()!=='true').map(row=>({id:row.Id,service:row.Config?.Labels?.['com.docker.compose.service'],image:row.Image,running:row.State?.Running,startedAt:row.State?.StartedAt,mounts:(row.Mounts||[]).map(m=>({type:m.Type,source:m.Source,target:m.Destination,name:m.Name,writable:m.RW}))})).sort((a,b)=>a.id.localeCompare(b.id));
}
export const protectedMount=(root,file,containers)=>containers.filter(c=>c.service!=='panel').some(c=>c.mounts.some(m=>m.type==='bind'&&(path.join(root,file)===m.source||path.join(root,file).startsWith(m.source+path.sep))));
export const projectSignature=rows=>contentHash(JSON.stringify(rows.filter(row=>row.service!=='panel')));
export async function assertProjectUnchanged(run,project,before){const after=await inspectProject(run,project);if(projectSignature(after)!==projectSignature(before))updateFail('Outro serviço mudou durante a atualização. Nenhum comando de recriação foi enviado a esses serviços.',409);return after;}
