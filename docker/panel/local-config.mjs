import fs from 'node:fs/promises';
import path from 'node:path';
import {automationCompose,emptyAutomation} from './automation.mjs';
import {runtimeCompose} from './runtimes.mjs';
import {securityRoutes} from './security.mjs';
async function json(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export async function initializeLocalConfig(root){async function create(name,content,mode=0o600){const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});try{await fs.writeFile(file,content,{flag:'wx',mode});}catch(e){if(e.code!=='EEXIST')throw e;}}
 const apps=await json(path.join(root,'config/apps.json'),null),automation=await json(path.join(root,'config/automation.json'),emptyAutomation());
 await create('config/apps.compose.yaml',apps?runtimeCompose(apps):'services: {}\n');
 await create('config/proxy-network.compose.yaml','{}\n');
 await create('config/automation.compose.json',JSON.stringify(automationCompose(automation),null,2)+'\n');
 const policies=await json(path.join(root,'.panel-state/security.json'),{groups:[],policies:[]});await create('docker/traefik/security.yml',securityRoutes(policies),0o644);
}
