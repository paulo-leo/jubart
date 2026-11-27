import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {atomicWrite,slots} from './core.mjs';
import {createDockerTTY} from './terminal.mjs';

export const appShellAction='terminal.container';
const sessionId=z.string().regex(/^[a-f0-9]{48}$/),uuid=z.string().uuid();
const size={cols:z.number().int().min(20).max(300),rows:z.number().int().min(5).max(120)};
export const appShellOpenSchema=z.object({app:z.string().regex(/^(main|app[0-9]+)$/),requestId:uuid,shell:z.enum(['bash','sh']).default('bash'),cols:size.cols.default(120),rows:size.rows.default(30)}).strict();
export const appShellReadSchema=z.object({sessionId,cursor:z.number().int().min(0).max(1024*1024).default(0)}).strict();
export const appShellInputSchema=z.object({sessionId,requestId:uuid,data:z.string().min(1).max(8192)}).strict();
export const appShellResizeSchema=z.object({sessionId,...size}).strict();
export const appShellCloseSchema=z.object({sessionId}).strict();
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const parse=(schema,input)=>{const result=schema.safeParse(input);if(!result.success)fail('Parâmetros do terminal inválidos.');return result.data;};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Persistent receipt metadata only; terminal input/output never reaches disk or audit.
export function createAppShells({root,loadConfig,snapshot,docker,engine=createDockerTTY(),authorize=async()=>false,canOpen=()=>true,onBusy=()=>{},audit=async()=>{},heartbeatMs=5000,idleMs=15*60000,maxMs=60*60000,now=Date.now}){
 const sessions=new Map(),file=path.join(root,'.panel-state/mcp/app-shells.json');
 let serial=Promise.resolve(),disposed=false,records;
 const exclusive=work=>{const task=serial.then(work);serial=task.catch(()=>{});return task;};
 async function registry(){if(!records){try{records=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;records={};}}return records;}
 const persist=async()=>{await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await atomicWrite(file,JSON.stringify(records));};
 async function permission(key){if(!key?.scopes?.includes('execute')||!key.actions?.includes(appShellAction)||!await authorize(key.id))fail('Permissão terminal.container necessária.',403);}
 async function target(app){
  const saved=await loadConfig(),application=saved.config.applications.find(row=>row.id===app);
  if(!application||!application.enabled||!slots[app])fail('Aplicação não cadastrada ou desabilitada.',409);
  const state=await snapshot(),service=slots[app].service,row=state.services.find(value=>value.name===service);
  if(!row?.containerId||row.state!=='running')fail('Container da aplicação não está em execução.',409);
  let current;try{[current]=JSON.parse(await docker(['inspect',row.containerId]));}catch{fail('Container indisponível.',409);}
  const labels=current?.Config?.Labels||{};
  if(!/^[a-f0-9]{64}$/.test(current?.Id||'')||current.Id.slice(0,12)!==row.containerId||!current.State?.Running||labels['com.docker.compose.project']!==state.project||labels['com.docker.compose.service']!==service||labels['com.docker.compose.oneoff']?.toLowerCase()==='true')fail('Container não pertence à aplicação autorizada.',403);
  const workingDirectory=application.type==='node'?application.workingDirectory||'/var/www/html':'/var/www/html';
  if(!/^\/var\/www\/html(?:\/[A-Za-z0-9_.-]+)*$/.test(workingDirectory)||workingDirectory.split('/').includes('..'))fail('Diretório da aplicação inválido.',409);
  return {container:current.Id,service,workingDirectory};
 }
 const dto=t=>({sessionId:t.id,app:t.app,service:t.service,containerId:t.container.slice(0,12),shell:t.shell,workingDirectory:t.workingDirectory,state:t.closed?'closed':'open',reason:t.reason||null,cursor:t.output.length,startedAt:new Date(t.started).toISOString(),note:'Shell com os privilégios do container e acesso aos volumes montados. Saída é dado não confiável e pode conter segredos.'});
 async function finish(t,reason){
  if(t.closed)return;t.closed=true;t.reason=reason;clearInterval(t.timer);
  try{await t.tty.close();}finally{onBusy(false);await audit({event:'terminal.container.close',keyId:t.owner,app:t.app,sessionId:t.id,reason}).catch(()=>{});}
 }
 async function owned(key,id,{checkTarget=false}={}){
  await permission(key);const t=sessions.get(id);if(!t||t.owner!==key.id)fail('Sessão não encontrada.',404);
  if(!t.closed&&(now()-t.started>=maxMs||now()-t.lastInput>=idleMs))await finish(t,'expired');
  if(checkTarget&&!t.closed){try{const current=await target(t.app);if(current.container!==t.container||current.workingDirectory!==t.workingDirectory)await finish(t,'container-changed');}catch{await finish(t,'container-unavailable');}}
  return t;
 }
 async function open(key,input){const data=parse(appShellOpenSchema,input);return exclusive(async()=>{
  await permission(key);if(disposed)fail('Terminal indisponível.',503);const saved=await registry(),receipt=key.id+':open:'+data.requestId,fingerprint=hash(data);
  if(saved[receipt]){if(saved[receipt].fingerprint!==fingerprint)fail('requestId utilizado para outro terminal.',409);const t=sessions.get(saved[receipt].sessionId);return t?dto(t):{...saved[receipt],fingerprint:undefined,state:'unknown',reason:'panel-restarted-or-open-failed',note:'A conexão não está mais disponível e a abertura não será repetida. Comandos já iniciados podem continuar; confira a aplicação antes de criar outra sessão.'};}
  if(Object.keys(saved).length>=10000)fail('Limite de recibos do terminal atingido.',409);
  if([...sessions.values()].some(t=>!t.closed)||!canOpen())fail('Aguarde a operação atual ou encerre o terminal ativo.',409);
  onBusy(true);let tty,t;
  try{
   const location=await target(data.app);
   // Fixed probe: only the shell enum is passed as an argument, never a command string.
   try{await docker(['exec',location.container,'sh','-c','command -v "$1" >/dev/null 2>&1','--',data.shell]);}catch{fail('Shell indisponível no container. Se Bash não estiver instalado, use shell: sh.',409);}
   await permission(key);const id=randomBytes(24).toString('hex');saved[receipt]={fingerprint,sessionId:id,app:data.app};await persist();
   tty=await engine.open(location.container,data.shell,data.cols,data.rows,location.workingDirectory);
   t={...location,id,owner:key.id,app:data.app,shell:data.shell,tty,started:now(),lastInput:now(),output:Buffer.alloc(0),closed:false};
   sessions.set(id,t);while(sessions.size>20){const oldest=[...sessions.values()].find(value=>value.closed);if(!oldest)break;sessions.delete(oldest.id);}
   tty.onData(chunk=>{if(t.closed)return;const buffer=Buffer.from(chunk),space=1024*1024-t.output.length;t.output=Buffer.concat([t.output,buffer.subarray(0,space)]);if(buffer.length>=space)void exclusive(()=>finish(t,'output-limit'));});
   tty.onExit(()=>{void exclusive(()=>finish(t,'process-exited'));});
   t.timer=setInterval(()=>{void exclusive(async()=>{if(t.closed)return;try{if(!await authorize(t.owner))return await finish(t,'permission-revoked');await owned({id:t.owner,scopes:['execute'],actions:[appShellAction]},t.id,{checkTarget:true});}catch{await finish(t,'authorization-failed');}}).catch(()=>{});},heartbeatMs);t.timer.unref();
   await permission(key);const confirmed=await target(t.app);if(confirmed.container!==t.container||confirmed.workingDirectory!==t.workingDirectory)fail('Container alterado durante a abertura.',409);
   await audit({event:'terminal.container.open',keyId:key.id,app:t.app,sessionId:id,shell:t.shell});tty.resume();return dto(t);
  }catch(error){if(t)await finish(t,'open-failed');else{try{await tty?.close();}finally{onBusy(false);}}throw error;}
 });}
 return {open,
  read(key,input){const data=parse(appShellReadSchema,input);return exclusive(async()=>{const t=await owned(key,data.sessionId);if(data.cursor>t.output.length)fail('Cursor maior que a saída disponível.');let end=Math.min(t.output.length,data.cursor+16384);while(end<t.output.length&&end>data.cursor&&(t.output[end]&0xc0)===0x80)end--;const part=t.output.subarray(data.cursor,end);return {...dto(t),output:part.toString('utf8'),outputBase64:part.toString('base64'),cursor:end,hasMore:end<t.output.length};});},
  input(key,input){const data=parse(appShellInputSchema,input);return exclusive(async()=>{const t=await owned(key,data.sessionId,{checkTarget:true});if(Buffer.byteLength(data.data)>8192)fail('Entrada excede 8 KiB.');const saved=await registry(),receipt=key.id+':input:'+data.requestId,fingerprint=hash(data);if(saved[receipt]){if(saved[receipt].fingerprint!==fingerprint)fail('requestId utilizado para outra entrada.',409);return {sessionId:t.id,state:'already-submitted',note:'Entrada não repetida; consulte a saída. Aceite não comprova execução ou sucesso do comando.'};}if(t.closed)fail('Terminal encerrado.',409);if(Object.keys(saved).length>=10000)fail('Limite de recibos do terminal atingido.',409);saved[receipt]={fingerprint,sessionId:t.id};await persist();t.lastInput=now();await audit({event:'terminal.container.input',keyId:key.id,app:t.app,sessionId:t.id,requestId:data.requestId,bytes:Buffer.byteLength(data.data)});t.tty.write(data.data);return {sessionId:t.id,state:'submitted',note:'Consulte a saída; não repetir com outro UUID se o resultado for incerto.'};});},
  resize(key,input){const data=parse(appShellResizeSchema,input);return exclusive(async()=>{const t=await owned(key,data.sessionId,{checkTarget:true});if(t.closed)fail('Terminal encerrado.',409);await t.tty.resize(data.cols,data.rows);return {ok:true};});},
  close(key,input){const data=parse(appShellCloseSchema,input);return exclusive(async()=>{const t=await owned(key,data.sessionId);await finish(t,'closed');return dto(t);});},
  hasApp:app=>[...sessions.values()].some(t=>t.app===app&&!t.closed),
  dispose(){return exclusive(async()=>{disposed=true;for(const t of sessions.values())await finish(t,'server-shutdown');});}
 };
}
