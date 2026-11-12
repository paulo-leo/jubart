import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {atomicWrite,parseEnv,slots} from './core.mjs';
export const phpFiles=['php.ini','sessions.ini','opcache.ini','extensions.ini','extensions.list'];
export const phpModules=['pdo_mysql','mbstring','intl','zip','bcmath','gd','opcache','pcntl','redis','exif','sockets','soap','imagick','xdebug','curl'];
export const phpFields={FRANKENPHP_DIGEST:'digest',PHP_VERSION:'version',FRANKENPHP_VERSION:'version',PHP_MEMORY_LIMIT:'size',PHP_UPLOAD_MAX_FILESIZE:'size',PHP_POST_MAX_SIZE:'size',PHP_MAX_EXECUTION_TIME:'integer',PHP_DISPLAY_ERRORS:'display',PHP_SESSION_COOKIE_SECURE:'bit',PHP_SESSION_GC_MAXLIFETIME:'integer',PHP_OPCACHE_MEMORY:'integer',OCTANE_WORKERS:'integer',OCTANE_MAX_REQUESTS:'integer',PHP_INSTALL_SQLSERVER:'boolean',PHP_INSTALL_POSTGRESQL:'boolean',PHP_INSTALL_SQLITE:'boolean',PHP_INSTALL_MYSQLI:'boolean'};
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export function validatePHP(data){
 if(data.settings?.PHP_INSTALL_SQLSERVER==='true')fail('Drivers SQL Server via ODBC Microsoft estão bloqueados pela política open source.');
 if(!data.files||!data.settings)fail('Configuração PHP incompleta.');
 if(Object.keys(data.files).some(k=>!phpFiles.includes(k))||Object.keys(data.settings).some(k=>!Object.hasOwn(phpFields,k)))fail('Arquivo ou variável não permitido.');
 for(const name of phpFiles){const content=data.files[name];if(typeof content!=='string'||Buffer.byteLength(content)>65536||content.includes('\0'))fail(`Arquivo inválido: ${name}`);
  if(name==='extensions.list'){const modules=content.split(/\s+/).filter(Boolean);if(modules.some(m=>!phpModules.includes(m))||new Set(modules).size!==modules.length)fail('Extensão não permitida ou duplicada. Use os controles de drivers para os SGBDs.');}
  else for(const line of content.split('\n')){const value=line.trim();if(value&&!/^[;#]/.test(value)&&!/^\[[^\]\r\n]+\]$/.test(value)&&!/^\s*[A-Za-z0-9_.-]+(?:\[\])?\s*=/.test(value))fail(`Diretiva INI inválida em ${name}.`);}
 }
 for(const [key,kind] of Object.entries(phpFields)){const v=data.settings[key];if(v===undefined)continue;const rules={digest:/^sha256:[a-f0-9]{64}$/,version:/^[0-9][A-Za-z0-9._-]{0,80}$/,size:/^(?:-1|[0-9]+[KMG]?)$/i,integer:/^[0-9]{1,8}$/,display:/^(On|Off)$/,bit:/^[01]$/,boolean:/^(true|false)$/};if(typeof v!=='string'||!rules[kind].test(v))fail(`Valor inválido: ${key}`);}
 return data;
}
export function createPHPAPI({root,readEnv,loadConfig,compose,startOperation,automation,afterApply}){
 const directory=path.join(root,'docker/php');let pending=Promise.resolve();
 async function read(){const files=Object.fromEntries(await Promise.all(phpFiles.map(async name=>[name,await fs.readFile(path.join(directory,name),'utf8')])));const env=parseEnv(await readEnv());const settings=Object.fromEntries(Object.keys(phpFields).map(k=>[k,env[k]||({boolean:'false',bit:'0',display:'Off'}[phpFields[k]]||'')]));const serverConfig=await fs.readFile(path.join(directory,'Caddyfile'),'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});return {files,settings,serverConfig,revision:createHash('sha256').update(JSON.stringify({files,settings})).digest('hex'),modules:phpModules,applications:(await loadConfig()).config.applications.filter(a=>(a.type||'php')==='php').map(({id,name,enabled,mode})=>({id,name,enabled,mode}))};}
 return {async handle(route,method,data){
  if(route==='/api/php'&&method==='GET')return {status:200,body:await read()};
  if(route==='/api/php/save'&&method==='POST'){
   const task=pending.then(async()=>{validatePHP(data);const current=await read();if(current.revision!==data.revision)fail('Configuração alterada. Reabra o formulário antes de salvar.',409);
    const state=path.join(root,'.panel-state');await fs.mkdir(state,{recursive:true,mode:0o700});await atomicWrite(path.join(state,'php-before-save.json'),JSON.stringify({files:current.files,settings:current.settings},null,2));
    let text=await readEnv();for(const [key,value] of Object.entries(data.settings)){const re=new RegExp('^'+key+'=.*$','gm');text=re.test(text)?text.replace(re,`${key}=${value}`):text+`\n${key}=${value}\n`;}
    for(const name of phpFiles)await atomicWrite(path.join(directory,name),data.files[name],0o644);await atomicWrite(path.join(root,'.env'),text);return {status:200,body:await read()};});pending=task.catch(()=>{});return task;
  }
  if(route==='/api/php/apply'&&method==='POST'){
   const current=await read();if(current.revision!==data.revision)fail('Configuração alterada. Atualize antes de aplicar.',409);
   const apps=(await loadConfig()).config.applications.filter(a=>a.enabled&&(a.type||'php')==='php');if(!apps.length)fail('Nenhuma aplicação PHP habilitada.');
   const operation=startOperation('Reconstruir PHP e FrankenPHP',async()=>{await compose(['--profile','*','config','--quiet']);for(const app of apps)await automation.stopForApp(app.id);await compose(['up','-d','--build','--force-recreate',...apps.map(a=>slots[a.id].service)],undefined,{timeout:1800000,maxBuffer:16*1024*1024});await automation.recreateEnabled();if(afterApply)await afterApply();});return {status:202,body:{operation}};
  }
  const match=route.match(/^\/api\/php\/runtime\/(main|app[0-9]+)$/);
  if(match&&method==='GET'){
   const app=(await loadConfig()).config.applications.find(a=>a.id===match[1]&&a.enabled&&(a.type||'php')==='php');if(!app)fail('Escolha uma aplicação PHP habilitada.');
   const code='$keys=["memory_limit","upload_max_filesize","post_max_size","max_execution_time","display_errors","expose_php","session.save_handler","session.cookie_secure","session.gc_maxlifetime","opcache.enable","opcache.enable_cli","opcache.memory_consumption"]; $ini=[]; foreach($keys as $key){$ini[$key]=ini_get($key);} echo json_encode(["version"=>PHP_VERSION,"sapi"=>PHP_SAPI,"modules"=>get_loaded_extensions(),"ini"=>$ini,"loadedFile"=>php_ini_loaded_file(),"scannedFiles"=>php_ini_scanned_files()]);';
   const result=JSON.parse(await compose(['exec','-T',slots[app.id].service,'php','-r',code],undefined,{timeout:15000}));return {status:200,body:{...result,scope:'CLI: valores do servidor HTTP/Octane podem diferir por SAPI e sobrescritas da aplicação.'}};
  }
  return null;
 }};
}
