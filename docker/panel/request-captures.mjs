import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {atomicWrite,slots} from './core.mjs';
const revision=rules=>createHash('sha256').update(JSON.stringify(rules)).digest('hex');
export function validateRule(rule,apps){
 if(typeof rule.name!=='string'||!rule.name.trim()||rule.name.length>80)throw new Error('Informe um nome de até 80 caracteres.');
 if(!apps.some(a=>a.id===rule.app))throw new Error('Aplicação inválida.');
 if(typeof rule.enabled!=='boolean'||!['any','all'].includes(rule.match))throw new Error('Condição inválida.');
 if(typeof rule.pathPrefix!=='string'||!rule.pathPrefix.startsWith('/')||rule.pathPrefix.length>256||/[?\x00-\x1f]/.test(rule.pathPrefix))throw new Error('Use um prefixo de caminho, sem query string.');
 for(const [key,max] of [['cpuPercent',10000],['memoryPercent',100],['durationMs',3600000]])if(!Number.isFinite(rule[key])||rule[key]<0||rule[key]>max)throw new Error('Limite fora do intervalo permitido.');
 if(!rule.cpuPercent&&!rule.memoryPercent&&!rule.durationMs)throw new Error('Habilite ao menos um limite.');
 return Object.fromEntries(['name','app','enabled','match','pathPrefix','cpuPercent','memoryPercent','durationMs'].map(key=>[key,rule[key]]));
}
export function captureEvent(row,rule,app,samples){
 if(!rule.enabled||!app.enabled||String(row.RequestHost||'').split(':')[0].toLowerCase()!==app.domain.toLowerCase())return null;
 const pathname=String(row.RequestPath||'').split(/[?#]/)[0].slice(0,2048);if(!pathname.startsWith(rule.pathPrefix))return null;
 const started=Date.parse(row.StartUTC||row.StartLocal),duration=Number(row.Duration)/1e6;if(!Number.isFinite(started)||!Number.isFinite(duration)||duration<0)return null;
 const end=started+duration,service=slots[app.id].service;
 // Amostras pertencem ao mesmo container e à janela da requisição (+/- 5s).
 const relevant=samples.filter(s=>s.at>=started-5000&&s.at<=end+5000).flatMap(s=>s.containers.filter(c=>c.service===service).map(c=>({...c,at:s.at})));
 const peak=key=>{const values=relevant.map(s=>s[key]).filter(Number.isFinite);return values.length?Math.max(...values):null;};
 const cpu=peak('cpuPercent'),memory=peak('memoryPercent');
 const checks=[rule.cpuPercent?['CPU',cpu!==null&&cpu>=rule.cpuPercent]:null,rule.memoryPercent?['Memória',memory!==null&&memory>=rule.memoryPercent]:null,rule.durationMs?['Duração',duration>=rule.durationMs]:null].filter(Boolean);
 if(!(rule.match==='all'?checks.every(([,hit])=>hit):checks.some(([,hit])=>hit)))return null;
 const id=createHash('sha256').update(JSON.stringify([rule.id,row.StartUTC||row.StartLocal,row.RequestCount,row.RouterName,row.RequestMethod,row.RequestPath,row.Duration])).digest('hex');
 return {id,ruleId:rule.id,ruleName:rule.name,app:app.id,domain:app.domain,path:pathname,method:String(row.RequestMethod||'').slice(0,12),status:Number(row.DownstreamStatus)||null,startedAt:new Date(started).toISOString(),durationMs:duration,originMs:Number.isFinite(Number(row.OriginDuration))?Number(row.OriginDuration)/1e6:null,cpuPercent:cpu,memoryPercent:memory,sampleCount:relevant.length,reason:checks.filter(([,hit])=>hit).map(([name])=>name).join(', '),capturedAt:Date.now()};
}
export function createRequestCaptures({root,loadConfig,compose,collectMetrics,intervalMs=5000}){
 const file=path.join(root,'.panel-state/request-captures.json');let queue=Promise.resolve(),timer,stopped=false,samples=[];
 const serial=fn=>{const job=queue.then(fn);queue=job.catch(()=>{});return job;};
 async function read(){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {rules:[],events:[],cursor:Date.now(),seen:[]};}}
 async function write(state){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await atomicWrite(file,JSON.stringify(state));}
 const status={lastPoll:null,error:null,truncated:false,gap:false};
 return {async list(){const state=await read();return {rules:state.rules,events:state.events.filter(e=>e.capturedAt>=Date.now()-7*86400000),revision:revision(state.rules),status,intervalMs,retentionDays:7,maxEvents:1000};},save(data){return serial(async()=>{const state=await read();if(data.revision!==revision(state.rules))throw new Error('Regras alteradas em outra sessão. Atualize.');const {config}=await loadConfig();const rule=validateRule(data.rule,config.applications);const id=data.rule.id;if(id&&!state.rules.some(r=>r.id===id))throw new Error('Regra inexistente.');if(!id&&state.rules.length>=50)throw new Error('Limite de 50 regras.');const next={...rule,id:id||randomBytes(8).toString('hex')};state.rules=id?state.rules.map(r=>r.id===id?next:r):[...state.rules,next];await write(state);return {ok:true};});},remove(data){return serial(async()=>{const state=await read();if(data.revision!==revision(state.rules))throw new Error('Regras alteradas. Atualize.');if(!state.rules.some(r=>r.id===data.id))throw new Error('Regra inexistente.');state.rules=state.rules.filter(r=>r.id!==data.id);await write(state);return {ok:true};});},clear(){return serial(async()=>{const state=await read();state.events=[];await write(state);return {ok:true};});},
 tick(){return serial(async()=>{const state=await read();const retained=state.events.filter(e=>e.capturedAt>=Date.now()-7*86400000);if(retained.length!==state.events.length){state.events=retained;await write(state);}if(!state.rules.some(r=>r.enabled)){status.error=null;return;}
 const now=Date.now(),{config}=await loadConfig();let current;try{current=(await collectMetrics()).current;}catch{current=null;}
 if(current){const ids=(await compose(['--profile','*','ps','-a','--format','json'])).trim().split('\n').filter(Boolean).flatMap(line=>{const item=JSON.parse(line);return Array.isArray(item)?item:[item];});samples.push({at:current.at,containers:(current.containers||[]).map(c=>({...c,service:ids.find(i=>i.ID?.startsWith(c.id)||c.id?.startsWith(i.ID)||i.Name===c.name)?.Service}))});samples=samples.filter(s=>s.at>=now-3600000).slice(-720);}
 status.gap=now-state.cursor>60000;const since=new Date(Math.max(state.cursor-10000,now-60000)).toISOString();const text=await compose(['logs','--no-color','--since',since,'--tail=2000','traefik'],undefined,{timeout:10000,maxBuffer:4*1024*1024});const lines=text.split('\n').filter(Boolean);status.truncated=lines.length>=2000;let jsonCount=0;const seen=new Set(state.seen||[]);
 for(const line of lines){let row;try{row=JSON.parse(line.slice(line.indexOf('{')));}catch{continue;}if(row.RequestPath===undefined)continue;jsonCount++;
 for(const rule of state.rules){const app=config.applications.find(a=>a.id===rule.app);if(!app)continue;const event=captureEvent(row,rule,app,samples);if(event&&!seen.has(event.id)){state.events.push(event);seen.add(event.id);}}}
 state.events=state.events.filter(e=>e.capturedAt>=now-7*86400000).slice(-1000);state.seen=[...seen].slice(-10000);state.cursor=now;await write(state);status.lastPoll=now;status.error=!jsonCount&&lines.length?'Nenhum access log JSON identificado nesta consulta. Recrie o Traefik com a configuração atual.':null;
 });},start(){stopped=false;const run=async()=>{try{await this.tick();}catch(e){status.error='Falha na coleta de requisições; verifique Traefik e métricas.';}finally{if(!stopped){timer=setTimeout(run,intervalMs);timer.unref?.();}}};run();},stop(){stopped=true;clearTimeout(timer);}};
}
