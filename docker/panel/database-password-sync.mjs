import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {atomicWrite,parseEnv} from './core.mjs';

// Only credentials explicitly managed by the infrastructure are changed.
export async function preparePasswordSync({root,readEnv,compose,composeConfig,engine,user,host,password}){
 const before=await readEnv(),env=parseEnv(before),keys=[];
 if(engine==='mariadb'&&host==='%')for(const key of Object.keys(env))if(/^(?:DB|APP_[0-9]+_DB)_USERNAME$/.test(key)&&env[key]===user)keys.push(key.replace(/_USERNAME$/,'_PASSWORD'));
 if(!keys.length)return async()=>{};
 if(password.includes("'"))throw new Error('Para sincronizar a senha no .env, escolha uma senha sem aspas simples.');
 let next=before;for(const key of keys){const line=`${key}='${password}'`,re=new RegExp('^'+key+'=.*$','gm');next=re.test(next)?next.replace(re,()=>line):next+'\n'+line+'\n';}
 const staged=path.join(root,'.env.password-'+randomBytes(8).toString('hex'));
 try{await atomicWrite(staged,next);await compose(['config','--quiet'],staged);}finally{await fs.unlink(staged).catch(()=>{});}
 const definition=await composeConfig();
 const running=new Set((await compose(['ps','--status','running','--services'])).trim().split(/\s+/));
 const services=Object.entries(definition.services||{}).filter(([name,s])=>{
  const e=s.environment||{};return running.has(name)&&/^(?:php(?:-app\d+)?|worker-.+|scheduler-.+)$/.test(name)&&e.DB_HOST===engine&&e.DB_USERNAME===user&&keys.some(k=>env[k]===e.DB_PASSWORD);
 }).map(([name])=>name);
 if(await readEnv()!==before)throw new Error('.env alterado durante a validação. Tente novamente.');
 return async()=>{
  if(await readEnv()!==before)throw new Error('A senha mudou no banco, mas o .env foi alterado simultaneamente. Atualize as credenciais e recrie as aplicações.');
  const backup=path.join(root,'.panel-state/database-password-sync');await fs.mkdir(backup,{recursive:true,mode:0o700});await atomicWrite(path.join(backup,'env-before'),before);
  await atomicWrite(path.join(root,'.env'),next);
  if(!services.length)return;
  await compose(['up','-d','--no-deps','--no-build','--force-recreate',...services]);
  for(const name of services)if(/^php(?:-app\d+)?$/.test(name))await compose(['exec','-T',name,'sh','-c','if [ -f artisan ]; then php artisan config:clear --no-ansi; fi']);
 };
}
