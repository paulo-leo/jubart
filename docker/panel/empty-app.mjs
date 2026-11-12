import fs from 'node:fs/promises';
import path from 'node:path';
export async function inspectEmptyApp(root,config,id){
 const app=config.applications.find(a=>a.id===id);
 if(!app)throw new Error('Aplicação não cadastrada.');
 if(app.websocket?.enabled)return {canRemove:false,reason:'Desative e aplique o WebSocket antes de remover a aplicação.'};
 if(id==='main')return {canRemove:false,reason:'A aplicação principal deve ser mantida.'};
 try{
  const folder=path.resolve(root,app.directory),real=await fs.realpath(folder),infra=await fs.realpath(root);
  if(real!==folder||real===infra||infra.startsWith(real+path.sep)||real===path.parse(real).root)return {canRemove:false,reason:'Diretório protegido ou com link simbólico.'};
  if(!(await fs.stat(real)).isDirectory())return {canRemove:false,reason:'O apontamento não é uma pasta.'};
  if((await fs.readdir(real)).length)return {canRemove:false,reason:'A pasta contém arquivos ou subdiretórios, inclusive ocultos.'};
  let automation;try{automation=JSON.parse(await fs.readFile(path.join(root,'config/automation.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(['workers','jobs','schedulers'].some(key=>automation?.[key]?.some(item=>item.app===id)))return {canRemove:false,reason:'Remova primeiro os cadastros de filas, jobs e agendadores desta aplicação.'};
  return {canRemove:true,directory:real};
 }catch{return {canRemove:false,reason:'Não foi possível verificar a pasta no host.'};}
}
