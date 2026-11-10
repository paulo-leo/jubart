import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { atomicWrite } from './core.mjs';
const digest = text => createHash('sha256').update(text).digest('hex');
const fail = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
export function createAppEnv({root,loadConfig}) {
  let pending=Promise.resolve();
  async function target(id) {
    const {config}=await loadConfig(), app=config.applications.find(a=>a.id===id);
    if(!app)fail('Aplicação não cadastrada.',404);
    let directory;
    try {directory=await fs.realpath(path.resolve(root,app.directory));} catch {fail('O diretório cadastrado não está acessível no painel.',404);}
    const infra=await fs.realpath(root);
    if(infra===directory||infra.startsWith(directory+path.sep)||directory===path.parse(directory).root)fail('O editor é exclusivo para projetos, não para o .env da infraestrutura.',403);
    return {configuredDirectory:app.directory,directory,filename:path.join(directory,'.env')};
  }
  async function inspect(filename,content=false) {
    let stat;
    try {stat=await fs.lstat(filename);} catch(e){if(e.code==='ENOENT')return {exists:false,revision:null,...(content?{content:''}:{})};throw e;}
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink>1)fail('O .env deve ser um arquivo regular, sem links.',403);
    if(stat.size>65536)fail('O editor aceita arquivos .env de até 64 KiB.');
    if(!content)return {exists:true};
    const text=await fs.readFile(filename,'utf8');
    return {exists:true,revision:digest(text),content:text};
  }
  return {
    async read(id,content=false){const {filename,directory,configuredDirectory}=await target(id);return {...await inspect(filename,content),directory,configuredDirectory};},
    save(id,data){
      const task=pending.then(async()=>{
        if(typeof data.content!=='string'||Buffer.byteLength(data.content)>65536||data.content.includes('\0'))fail('Conteúdo inválido ou maior que 64 KiB.');
        const {filename,directory}=await target(id);
        if(data.directory!==directory)fail('O diretório cadastrado mudou. Abra o editor novamente.',409);
        const current=await inspect(filename,true);
        if(data.revision!==current.revision)fail('O arquivo foi alterado desde a abertura. Feche e abra o editor para carregar a versão atual.',409);
        if(current.exists)await atomicWrite(filename,data.content);
        else {
          const tmp=path.join(directory,`.env.panel-${randomBytes(8).toString('hex')}.tmp`);
          try {
            await fs.writeFile(tmp,data.content,{mode:0o600,flag:'wx'});
            if(process.getuid?.()===0){const owner=await fs.stat(directory);await fs.chown(tmp,owner.uid,owner.gid);}
            try {await fs.link(tmp,filename);}catch(e){if(e.code==='EEXIST')fail('O .env foi criado por outro processo. Abra o editor novamente.',409);throw e;}
          } finally {await fs.unlink(tmp).catch(()=>{});}
        }
        return {exists:true,revision:digest(data.content)};
      });
      pending=task.catch(()=>{});return task;
    }
  };
}
