import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {atomicWrite} from './core.mjs';

export const monitorDefaults={enabled:true,intervalSeconds:60,failureThreshold:2,recoveryThreshold:1};
const settingsSchema=z.object({enabled:z.boolean(),intervalSeconds:z.number().int().min(15).max(86400),failureThreshold:z.number().int().min(1).max(10),recoveryThreshold:z.number().int().min(1).max(10)}).strict();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const serviceName=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const statuses=new Set(['operational','degraded','unavailable','unknown','disabled']);
// Persist only selected evidence, never raw reports, logs, errors or environment values.
export function monitorObservations(report){
 const rows=(report.services||[]).filter(row=>serviceName.test(row.name)).slice(0,500).map(row=>({target:'service:'+row.name,service:row.name,status:statuses.has(row.status)?row.status:'unknown',expected:row.expected!==false,state:String(row.state||'unknown').slice(0,32),health:['healthy','unhealthy','starting'].includes(row.health)?row.health:null,checks:(row.checks||[]).slice(0,10).map(check=>({kind:String(check.kind||'check').replace(/[^a-z0-9-]/gi,'').slice(0,32),status:['passed','failed','unknown'].includes(check.status)?check.status:'unknown'}))}));
 const failed=report.sources&&Object.values(report.sources).some(value=>value===false);
 rows.push({target:'monitor:collection',status:failed?'degraded':'operational',expected:true,service:null,state:failed?'incomplete':'available',health:null,checks:[]});
 return rows;
}
export function createIncidentMonitor({root,collect,audit=async()=>{},now=Date.now,initialDelayMs=3000,heartbeatMs=15000,maxIncidents=500,maxEvents=1000}){
 const directory=path.join(root,'.panel-state/monitor'),file=path.join(directory,'state.json');
 let state,ready,serial=Promise.resolve(),pending,timer,started=false,stopped=false,generation=0;
 const clients=new Set(),streaks=new Map();
 const load=()=>ready??=(async()=>{try{state=JSON.parse(await fs.readFile(file,'utf8'));settingsSchema.parse(state.settings);if(state.schemaVersion!==1||!Array.isArray(state.incidents)||!Array.isArray(state.events)||!Number.isSafeInteger(state.sequence))throw new Error();}catch(error){if(error.code!=='ENOENT')fail('Estado do monitor inválido ou inacessível. Revise o arquivo privado de monitoramento.',503);state={schemaVersion:1,settings:{...monitorDefaults},sequence:0,incidents:[],events:[],lastCheckAt:null,observations:[],status:'unknown',lastError:null};}})();
 const exclusive=work=>{const result=serial.then(work);serial=result.catch(()=>{});return result;};
 const persist=async()=>{await fs.mkdir(directory,{recursive:true,mode:0o700});await atomicWrite(file,JSON.stringify(state)+'\n');};
 const summary=()=>({status:state.status,lastCheckAt:state.lastCheckAt,lastError:state.lastError,activeIncidents:state.incidents.filter(row=>row.state==='open').length,sequence:state.sequence});
 const publicState=()=>({schemaVersion:1,settings:{...state.settings},revision:digest(state.settings),summary:summary(),incidents:[...state.incidents].reverse(),services:state.observations.filter(row=>row.service)});
 const frame=(event,data,id)=>`${id===undefined?'':'id: '+id+'\n'}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
 function close(client){clients.delete(client);clearInterval(client.heartbeat);client.res.end();}
 function write(client,event,data,id){if(client.res.destroyed||client.res.writableEnded){close(client);return;}client.res.write(frame(event,data,id));if(client.res.writableLength>256*1024)close(client);}
 function broadcast(event,data,id){for(const client of clients)write(client,event,data,id);}
 function record(type,incident){const event={id:++state.sequence,type,at:new Date(now()).toISOString(),incident:{...incident}};state.events.push(event);state.events=state.events.slice(-maxEvents);return event;}
 async function evaluate(report,error){
  const observations=error?[{target:'monitor:collection',service:null,status:'unavailable',expected:true,state:'failed',checks:[]}]:monitorObservations(report);
  const before=structuredClone(state),previousStreaks=new Map([...streaks].map(([key,value])=>[key,{...value}]));
  const events=[],seen=new Set();
  for(const row of observations){
   seen.add(row.target);let streak=streaks.get(row.target)||{failed:0,passed:0};const current=state.incidents.find(incident=>incident.target===row.target&&incident.state==='open');
   const failed=row.expected&&['degraded','unavailable'].includes(row.status);
   if(failed){streak.failed++;streak.passed=0;if(!current&&streak.failed>=state.settings.failureThreshold){const incident={id:randomUUID(),target:row.target,service:row.service||null,state:'open',severity:row.status==='unavailable'?'critical':'warning',status:row.status,openedAt:new Date(now()).toISOString(),updatedAt:new Date(now()).toISOString(),resolvedAt:null,message:row.service?(row.status==='unavailable'?'O container esperado não está em execução.':'Uma verificação de saúde ou dependência falhou.'):'Não foi possível concluir todas as verificações da infraestrutura.',evidence:row.checks};state.incidents.push(incident);events.push(record('incident',incident));}else if(current){current.updatedAt=new Date(now()).toISOString();current.evidence=row.checks;if(current.status!==row.status){current.status=row.status;current.severity=row.status==='unavailable'?'critical':'warning';current.message=row.service?(row.status==='unavailable'?'O container esperado não está em execução.':'Uma verificação de saúde ou dependência falhou.'):'Não foi possível concluir todas as verificações da infraestrutura.';events.push(record('incident',current));}}}
   else if(row.status==='operational'||!row.expected){streak.failed=0;streak.passed++;if(current&&streak.passed>=state.settings.recoveryThreshold){current.state='resolved';current.resolvedAt=current.updatedAt=new Date(now()).toISOString();current.resolution=row.expected?'recovered':'disabled';events.push(record('recovery',current));}}
   else{streak.failed=0;streak.passed=0;} // Unknown is neither a failure nor evidence of recovery.
   streaks.set(row.target,streak);
  }
  // Only a complete inventory can confirm that an old target was removed.
  if(!error&&report.sources&&Object.values(report.sources).every(Boolean))for(const incident of state.incidents.filter(row=>row.state==='open'&&!seen.has(row.target))){incident.state='resolved';incident.resolvedAt=incident.updatedAt=new Date(now()).toISOString();incident.resolution='removed';events.push(record('recovery',incident));streaks.delete(incident.target);}
  for(const target of streaks.keys())if(!seen.has(target)&&!state.incidents.some(row=>row.target===target&&row.state==='open'))streaks.delete(target);
  const open=state.incidents.filter(row=>row.state==='open'),resolved=state.incidents.filter(row=>row.state!=='open');const retained=Math.max(0,maxIncidents-open.length);state.incidents=[...(retained?resolved.slice(-retained):[]),...open];
  state.observations=observations;state.lastCheckAt=new Date(now()).toISOString();state.status=error?'unknown':statuses.has(report.status)?report.status:'unknown';state.lastError=error?'Não foi possível coletar a saúde da infraestrutura.':null;
  try{await persist();}catch(error){state=before;streaks.clear();for(const [key,value]of previousStreaks)streaks.set(key,value);throw error;}for(const event of events)broadcast(event.type,event,event.id);broadcast('status',summary());return publicState();
 }
 async function check(){await load();if(pending)return pending;pending=exclusive(async()=>{let report,error;try{report=await collect();if(!report||!Array.isArray(report.services))throw new Error();}catch{error=true;}return evaluate(report,error);}).finally(()=>{pending=null;});return pending;}
 function schedule(delay){clearTimeout(timer);const version=++generation;if(!started||stopped||!state.settings.enabled)return;timer=setTimeout(async()=>{try{await check();}catch{broadcast('monitor-error',{message:'Falha ao salvar o monitoramento. Consulte as permissões do diretório privado.'});}finally{if(version===generation)schedule(state.settings.intervalSeconds*1000);}},delay);timer.unref();}
 return {
  async read(){await load();await serial;return publicState();},check,
  async configure(input,actor){const parsed=settingsSchema.safeParse({enabled:input.enabled,intervalSeconds:input.intervalSeconds,failureThreshold:input.failureThreshold,recoveryThreshold:input.recoveryThreshold});if(!parsed.success||Object.keys(input).some(key=>!['revision',...Object.keys(monitorDefaults)].includes(key)))fail('Configuração inválida: intervalo de 15 a 86400 segundos e limites de 1 a 10 verificações.');await load();return exclusive(async()=>{if(input.revision!==digest(state.settings))fail('Monitoramento alterado. Atualize antes de salvar.',409);await audit({actor,event:'monitor.settings',settings:parsed.data});const previous=state.settings;state.settings=parsed.data;try{await persist();}catch(error){state.settings=previous;throw error;}streaks.clear();schedule(0);broadcast('settings',{settings:{...state.settings},summary:summary()});return publicState();});},
  async start(){const version=++generation;started=true;stopped=false;await load();if(!stopped&&started&&version===generation)schedule(initialDelayMs);},
  async stop(){stopped=true;started=false;++generation;clearTimeout(timer);for(const client of clients)close(client);await pending?.catch(()=>{});},
  async subscribe(req,res,{owner,authorize,lastEventId=req.headers['last-event-id']}={}){
   await load();await serial;if(!await authorize())fail('Acesso ao monitoramento não autorizado.',401);
   if(clients.size>=50||[...clients].filter(client=>client.owner===owner).length>=3)fail('Limite de conexões SSE atingido. Feche outra conexão antes de tentar.',429);
   const client={owner,res,heartbeat:null,checking:false};
   res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders?.();res.write('retry: 10000\n\n');clients.add(client);res.once('close',()=>{clients.delete(client);clearInterval(client.heartbeat);});
   const cursor=typeof lastEventId==='string'&&/^\d{1,15}$/.test(lastEventId)?Number(lastEventId):null;
   const canReplay=cursor!==null&&cursor<=state.sequence&&cursor>=(state.events[0]?.id??state.sequence)-1;
   if(canReplay)for(const event of state.events.filter(event=>event.id>cursor))write(client,event.type,event,event.id);
   write(client,'snapshot',publicState(),state.sequence);if(!clients.has(client))return;
   client.heartbeat=setInterval(async()=>{if(client.checking)return;client.checking=true;try{if(!await authorize()){write(client,'auth-expired',{message:'Acesso expirado, revogado ou alterado.'});return close(client);}if(res.destroyed||res.writableEnded)return close(client);res.write(': heartbeat\n\n');if(res.writableLength>256*1024)close(client);}catch{close(client);}finally{client.checking=false;}},heartbeatMs);client.heartbeat.unref();
  },
 };
}
