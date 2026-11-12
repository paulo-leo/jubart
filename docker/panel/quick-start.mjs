import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {atomicWrite} from './core.mjs';
import {initializeLocalConfig} from './local-config.mjs';
// Only replace shipped placeholders. Never rotate an existing installation's credentials.
export async function prepareQuickStart(root,{hostRoot=root}={}){
 const file=path.join(root,'.env');let text;
 try{text=await fs.readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;text=await fs.readFile(path.join(root,'.env.example'),'utf8');}
 if(!path.isAbsolute(hostRoot))throw new Error('O diretório do host precisa ser absoluto.');
 const projects=path.join(hostRoot,'projects');let prepared=false;
 text=text.split('\n').map(line=>{const match=line.match(/^([A-Z_0-9]+)=(.*)$/);if(!match)return line;const [,key,value]=match;
  let next=value;
  if(key==='PANEL_WORKSPACE_DIRECTORY'&&value==='/caminho/absoluto/infra-comserv')next=hostRoot;
  if(key==='PANEL_PROJECTS_DIRECTORY'&&value==='/caminho/absoluto/projetos'){next=projects;prepared=true;}
  if(/PASSWORD$/.test(key)&&value.startsWith('troque-'))next=randomBytes(24).toString('hex');
  if(key==='PANEL_VAULT_KEY'&&value==='gere-com-openssl-rand-hex-32')next=randomBytes(32).toString('hex');
  if(/[\r\n"$`]/.test(next)&&next!==value)throw new Error('Use um caminho de instalação sem aspas, crases ou cifrão.');
  return key+'='+next;
 }).join('\n');
 if(prepared)await fs.mkdir(path.join(root,'projects'),{recursive:true});
 await fs.mkdir(path.join(root,'app'),{recursive:true});
 await atomicWrite(file,text);await fs.chmod(file,0o600);
 await initializeLocalConfig(root);
}
