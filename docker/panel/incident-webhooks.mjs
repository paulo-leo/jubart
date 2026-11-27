import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {atomicWrite,parseEnv} from './core.mjs';
import {encryptPassword,decryptPassword} from './databases.mjs';
import {createWebhookTransport,validateWebhookRequest,webhookVariables} from './webhook-http.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid=z.string().uuid(),revision=z.string().regex(/^[a-f0-9]{64}$/);
const hookSchema=z.object({id:uuid.optional(),name:z.string().trim().min(1).max(80),enabled:z.boolean(),serviceEvents:z.boolean().default(true),events:z.array(z.enum(['incident','recovery'])).min(1).max(2),severities:z.array(z.enum(['critical','warning'])).min(1).max(2),services:z.array(z.string().regex(/^(?:[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}|monitor:collection)$/)).max(100),timeoutSeconds:z.number().int().min(1).max(30),maxAttempts:z.number().int().min(1).max(5),request:z.unknown().optional()}).strict();
const saveSchema=z.object({revision,webhook:hookSchema}).strict(),idSchema=z.object({revision,id:uuid}).strict();
const pending=row=>['pending','sending'].includes(row.state);
const terminal=row=>!pending(row);
const pick=(value,names)=>Object.fromEntries(names.filter(name=>value?.[name]!==undefined).map(name=>[name,value[name]]));
export function webhookEnvelope(event,installation){
 const incident=pick(event.incident,['id','target','service','state','status','severity','message','openedAt','updatedAt','resolvedAt','resolution','transition','containerId']);
 incident.evidence=(event.incident?.evidence||[]).slice(0,10).map(row=>pick(row,['kind','status']));
 return {schemaVersion:1,id:event.type==='test'?'test:'+randomUUID():event.sourceId+':'+event.id,type:event.type,transition:incident.transition||null,at:event.at,installation,test:event.type==='test',incident};
}
export function createIncidentWebhooks({root,readEnv=()=>fs.readFile(path.join(root,'.env'),'utf8'),events,transport=createWebhookTransport(),audit=async()=>{},now=Date.now,pollMs=1000,maxPending=200,maxHistory=300,concurrency=3,retryDelay=attempt=>Math.min(300000,5000*2**(attempt-1)),installation=path.basename(root)}){
 const directory=path.join(root,'.panel-state/incident-webhooks'),file=path.join(directory,'state.json');let state,ready,serial=Promise.resolve(),started=false,stopped=false,timer,ticking,ingestError=null;
 const active=new Map();
 const load=()=>ready??=(async()=>{try{state=JSON.parse(await fs.readFile(file,'utf8'));if(state.schemaVersion!==1||!Array.isArray(state.webhooks)||!Array.isArray(state.deliveries))throw new Error();for(const row of state.deliveries)if(row.state==='sending'){row.state='pending';row.attempts=Math.max(0,row.attempts-1);row.nextAt=now();row.message='Entrega interrompida; será retomada com a mesma identificação.';}}catch(error){if(error.code!=='ENOENT')fail('Estado dos webhooks inválido ou inacessível. Revise o diretório privado.',503);state={schemaVersion:1,webhooks:[],deliveries:[]};}})();
 const exclusive=work=>{const result=serial.then(async()=>{await load();return work();});serial=result.catch(()=>{});return result;};
 const persist=async()=>{await fs.mkdir(directory,{recursive:true,mode:0o700});await atomicWrite(file,JSON.stringify(state)+'\n');};
 async function transaction(work){return exclusive(async()=>{const before=structuredClone(state);try{const result=await work();const closed=state.deliveries.filter(terminal).sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt));state.deliveries=[...closed.slice(-maxHistory),...state.deliveries.filter(pending)];await persist();return result;}catch(error){state=before;throw error;}});}
 const configurationRows=()=>state.webhooks.map(({cursor,gapAt,...row})=>row),currentRevision=()=>hash(configurationRows());
 const key=async()=>parseEnv(await readEnv()).PANEL_VAULT_KEY;
 async function seal(request){try{return encryptPassword(JSON.stringify(request),await key());}catch{fail('Configure uma PANEL_VAULT_KEY válida antes de salvar webhooks.',409);}}
 async function unseal(record){try{return validateWebhookRequest(JSON.parse(decryptPassword(record,await key())));}catch{fail('Não foi possível abrir a configuração protegida. Confira a chave do cofre.',409);}}
 const publicDelivery=row=>({...pick(row,['id','webhookId','webhookName','state','eventId','type','service','severity','test','attempts','maxAttempts','createdAt','updatedAt','finishedAt','statusCode','durationMs','message','manualRetries','transition','containerId']),nextAttemptAt:row.state==='pending'?new Date(row.nextAt).toISOString():null});
 const publicHook=row=>({serviceEvents:row.serviceEvents!==false,...pick(row,['id','name','enabled','serviceEvents','events','severities','services','timeoutSeconds','maxAttempts','method','endpoint','allowPrivateNetwork','createdAt','updatedAt','gapAt']),protectedConfiguration:true,lastDelivery:state.deliveries.filter(item=>item.webhookId===row.id).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,1).map(publicDelivery)[0]||null});
 const snapshot=()=>({revision:currentRevision(),webhooks:state.webhooks.map(publicHook),deliveries:[...state.deliveries].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(publicDelivery),summary:{eventFeedError:ingestError,destinations:state.webhooks.length,enabled:state.webhooks.filter(row=>row.enabled).length,pending:state.deliveries.filter(row=>row.state==='pending').length,sending:state.deliveries.filter(row=>row.state==='sending').length,failed:state.deliveries.filter(row=>row.state==='failed').length,delivered:state.deliveries.filter(row=>row.state==='delivered').length},variables:webhookVariables});
 const assertRevision=input=>{if(input!==currentRevision())fail('Webhooks alterados. Atualize antes de salvar.',409);};
 function cancelHook(id,message){for(const row of state.deliveries.filter(row=>row.webhookId===id&&pending(row))){row.state='cancelled';row.updatedAt=row.finishedAt=new Date(now()).toISOString();row.message=message;delete row.sealedRequest;}for(const task of active.values())if(task.webhookId===id)task.controller.abort();}
 function makeDelivery(hook,event){if(state.deliveries.filter(pending).length>=maxPending)fail('Fila de webhooks cheia. Aguarde as entregas antes de tentar novamente.',429);const createdAt=new Date(now()).toISOString(),envelope=webhookEnvelope(event,installation);return {id:randomUUID(),webhookId:hook.id,webhookName:hook.name,state:'pending',eventId:envelope.id,type:envelope.type,transition:envelope.transition,containerId:envelope.incident.containerId||null,service:envelope.incident.service||null,severity:envelope.incident.severity,test:envelope.test,envelope,sealedRequest:hook.sealedRequest,configurationVersion:hook.configurationVersion,timeoutSeconds:hook.timeoutSeconds,maxAttempts:hook.maxAttempts,attempts:0,nextAt:now(),createdAt,updatedAt:createdAt,message:'Aguardando envio.'};}
 function schedule(delay=pollMs){if(!started||stopped)return;clearTimeout(timer);timer=setTimeout(()=>{void tick().catch(()=>{});},delay);timer.unref();}
 async function ingest(){const feed=await events();return exclusive(async()=>{
  const hooks=state.webhooks.filter(row=>row.enabled);if(!hooks.length)return;const before=structuredClone(state);let changed=false;
  try{
   const cursors=new Map(),blocked=new Set(),first=feed.events[0]?.id;
   for(const hook of hooks){let cursor=hook.cursor?.sourceId===feed.sourceId?hook.cursor.id:0;if(first&&cursor<first-1){hook.gapAt=new Date(now()).toISOString();cursor=first-1;changed=true;}cursors.set(hook.id,cursor);}
   for(const event of feed.events){for(const hook of hooks){
    if(blocked.has(hook.id)||event.id<=cursors.get(hook.id))continue;
    const incident=event.incident||{},matches=(event.type==='lifecycle'?hook.serviceEvents!==false:hook.events.includes(event.type)&&hook.severities.includes(incident.severity))&&(!hook.services.length||hook.services.includes(incident.service||incident.target)),eventId=feed.sourceId+':'+event.id;
    if(matches&&!state.deliveries.some(row=>row.webhookId===hook.id&&row.eventId===eventId)){
     if(state.deliveries.filter(pending).length>=maxPending){blocked.add(hook.id);continue;}
     state.deliveries.push(makeDelivery(hook,{...event,sourceId:feed.sourceId}));
    }
    cursors.set(hook.id,event.id);changed=true;
   }}
   for(const hook of hooks){const cursor=cursors.get(hook.id);if(hook.cursor?.sourceId!==feed.sourceId||hook.cursor?.id!==cursor){hook.cursor={sourceId:feed.sourceId,id:cursor};changed=true;}}
   if(changed)await persist();
  }catch(error){state=before;throw error;}
 });}
 async function take(){return exclusive(async()=>{
  const row=state.deliveries.find((row,index)=>row.state==='pending'&&row.nextAt<=now()&&!state.deliveries.slice(0,index).some(earlier=>pending(earlier)&&earlier.webhookId===row.webhookId&&(earlier.envelope.incident.id===row.envelope.incident.id||row.service&&earlier.service===row.service)));if(!row)return null;
  const before=structuredClone(state);try{
   const hook=state.webhooks.find(hook=>hook.id===row.webhookId);
   if(!hook||!hook.enabled&&!row.test||hook.configurationVersion!==row.configurationVersion){row.state='cancelled';row.message='Destino removido, desativado ou alterado.';row.updatedAt=row.finishedAt=new Date(now()).toISOString();delete row.sealedRequest;await persist();return null;}
   row.state='sending';row.attempts++;row.updatedAt=new Date(now()).toISOString();row.message='Enviando ao destino.';await persist();return structuredClone(row);
  }catch(error){state=before;throw error;}
 });}
 async function deliver(row,controller){
  let response,error;try{const current=await exclusive(()=>state.deliveries.find(item=>item.id===row.id)?.state);if(current!=='sending'){active.delete(row.id);schedule(0);return;}const request=await unseal(row.sealedRequest);if(controller.signal.aborted)throw Object.assign(new Error('Entrega interrompida.'),{retryable:false});response=await transport(request,row.envelope,row.id,{signal:controller.signal,timeoutSeconds:row.timeoutSeconds});}catch(value){error=value;}
  try{await transaction(async()=>{const current=state.deliveries.find(item=>item.id===row.id);if(!current||current.state!=='sending')return;current.updatedAt=new Date(now()).toISOString();
   if(stopped){current.state='pending';current.attempts=Math.max(0,current.attempts-1);current.nextAt=now();current.message='Entrega interrompida; será retomada com a mesma identificação.';return;}
   const code=Number.isInteger(response?.statusCode)?response.statusCode:null;current.statusCode=code;current.durationMs=Number.isFinite(response?.durationMs)?Math.max(0,Math.round(response.durationMs)):null;
   if(!error&&code>=200&&code<300){current.state='delivered';current.message='Requisição aceita pelo destino (HTTP '+code+').';current.finishedAt=current.updatedAt;delete current.sealedRequest;return;}
   const retryable=error?error.status!==409&&error.retryable!==false:code===408||code===425||code===429||code>=500&&code<=599;
   current.message=error?(error.status===409?'Não foi possível abrir a configuração protegida.':error.retryable===false?'Destino ou requisição recusado. Revise endereço, rede e configuração.':'Falha de conexão ou tempo limite no destino.'):code>=300&&code<400?'O destino redirecionou a requisição. Use a URL final; redirecionamentos não são seguidos.':'O destino respondeu HTTP '+(code||'inválido')+'.';
   if(retryable&&current.attempts<current.maxAttempts){current.state='pending';current.nextAt=now()+Math.max(retryDelay(current.attempts),Number.isFinite(response?.retryAfterMs)?Math.min(3600000,Math.max(0,response.retryAfterMs)):0);}
   else{current.state='failed';current.finishedAt=current.updatedAt;delete current.sealedRequest;}
  });}catch{await exclusive(()=>{const current=state.deliveries.find(item=>item.id===row.id);if(current?.state==='sending'){current.state='pending';current.attempts=Math.max(0,current.attempts-1);current.nextAt=now()+5000;current.message='Resultado não persistido; a entrega será retomada com a mesma identificação.';}});}finally{active.delete(row.id);schedule(0);}
 }
 async function tick(){if(ticking)return ticking;ticking=(async()=>{await load();try{try{await ingest();ingestError=null;}catch{ingestError='Não foi possível consultar novos eventos. Entregas já enfileiradas continuam sendo processadas.';}while(started&&!stopped&&active.size<concurrency){const row=await take();if(!row)break;const controller=new AbortController(),task={controller,webhookId:row.webhookId,promise:null};active.set(row.id,task);task.promise=deliver(row,controller).catch(()=>{});}}finally{schedule();}})().finally(()=>{ticking=null;});return ticking;}
 async function save(input,actor){const parsed=saveSchema.safeParse(input);if(!parsed.success)fail('Cadastro de webhook inválido.');const data=parsed.data,request=data.webhook.request===undefined?null:validateWebhookRequest(data.webhook.request),sealed=request?await seal(request):null,feed=await events();
  return transaction(async()=>{assertRevision(data.revision);const {request:_request,...fields}=data.webhook,old=fields.id?state.webhooks.find(row=>row.id===fields.id):null;if(fields.id&&!old)fail('Webhook não encontrado.',404);if(!old&&state.webhooks.length>=20)fail('Limite de 20 destinos de webhook.');if(!request&&!old)fail('Informe a requisição do novo webhook.');
   const hook={...old,...fields,id:old?.id||randomUUID(),events:[...new Set(fields.events)],severities:[...new Set(fields.severities)],services:[...new Set(fields.services)],sealedRequest:sealed||old.sealedRequest,configurationVersion:randomUUID(),createdAt:old?.createdAt||new Date(now()).toISOString(),updatedAt:new Date(now()).toISOString(),cursor:{sourceId:feed.sourceId,id:feed.sequence},...(request?{method:request.method,endpoint:new URL(request.url).origin,allowPrivateNetwork:request.allowPrivateNetwork}:{})};
   await audit({actor,event:'monitor.webhook.save',id:hook.id,name:hook.name,enabled:hook.enabled});if(old)cancelHook(old.id,'Entrega cancelada porque o destino foi alterado.');state.webhooks=old?state.webhooks.map(row=>row.id===hook.id?hook:row):[...state.webhooks,hook];return {webhook:publicHook(hook)};
  });
 }
 async function configuration(input,actor){const parsed=idSchema.safeParse(input);if(!parsed.success)fail('Webhook inválido.');return exclusive(async()=>{assertRevision(input.revision);const row=state.webhooks.find(row=>row.id===input.id);if(!row)fail('Webhook não encontrado.',404);await audit({actor,event:'monitor.webhook.configuration',id:row.id});return {webhook:{serviceEvents:row.serviceEvents!==false,...pick(row,['id','name','enabled','serviceEvents','events','severities','services','timeoutSeconds','maxAttempts']),request:await unseal(row.sealedRequest)},revision:currentRevision()};});}
 async function remove(input,actor){if(!idSchema.safeParse(input).success)fail('Webhook inválido.');return transaction(async()=>{assertRevision(input.revision);if(!state.webhooks.some(row=>row.id===input.id))fail('Webhook não encontrado.',404);await audit({actor,event:'monitor.webhook.remove',id:input.id});cancelHook(input.id,'Entrega cancelada porque o destino foi removido.');state.webhooks=state.webhooks.filter(row=>row.id!==input.id);return {ok:true};});}
 async function toggle(input,actor){if(!z.object({revision,id:uuid,enabled:z.boolean()}).strict().safeParse(input).success)fail('Estado do webhook inválido.');const feed=await events();return transaction(async()=>{assertRevision(input.revision);const row=state.webhooks.find(row=>row.id===input.id);if(!row)fail('Webhook não encontrado.',404);await audit({actor,event:'monitor.webhook.toggle',id:row.id,enabled:input.enabled});row.enabled=input.enabled;row.updatedAt=new Date(now()).toISOString();row.cursor={sourceId:feed.sourceId,id:feed.sequence};if(!row.enabled)cancelHook(row.id,'Entrega cancelada porque o destino foi desativado.');return {webhook:publicHook(row)};});}
 async function test(input,actor){if(!idSchema.safeParse(input).success)fail('Webhook inválido.');const result=await transaction(async()=>{assertRevision(input.revision);const hook=state.webhooks.find(row=>row.id===input.id);if(!hook)fail('Webhook não encontrado.',404);if(state.deliveries.some(row=>row.webhookId===hook.id&&row.test&&now()-Date.parse(row.createdAt)<5000))fail('Aguarde alguns segundos antes de testar novamente.',429);await audit({actor,event:'monitor.webhook.test',id:hook.id});const at=new Date(now()).toISOString(),row=makeDelivery(hook,{type:'test',at,incident:{id:randomUUID(),target:'service:jubart-webhook-test',service:'jubart-webhook-test',state:'open',status:'unavailable',severity:'warning',message:'Evento de teste do Jubart. Não corresponde a uma falha real.',openedAt:at,resolvedAt:null,evidence:[]}});state.deliveries.push(row);return {delivery:publicDelivery(row)};});schedule(0);return result;}
 async function retry(input,actor){if(!idSchema.safeParse(input).success)fail('Entrega inválida.');const result=await transaction(async()=>{assertRevision(input.revision);const row=state.deliveries.find(row=>row.id===input.id);if(!row)fail('Entrega não encontrada.',404);if(row.state!=='failed')fail('Somente uma entrega com falha pode ser reenviada.',409);const hook=state.webhooks.find(hook=>hook.id===row.webhookId);if(!hook||!hook.enabled&&!row.test)fail('O destino precisa existir e estar ativo para reenviar.',409);if(state.deliveries.filter(pending).length>=maxPending)fail('Fila de webhooks cheia.',429);await audit({actor,event:'monitor.webhook.retry',id:hook.id,deliveryId:row.id});Object.assign(row,{state:'pending',attempts:0,manualRetries:(row.manualRetries||0)+1,sealedRequest:hook.sealedRequest,configurationVersion:hook.configurationVersion,timeoutSeconds:hook.timeoutSeconds,maxAttempts:hook.maxAttempts,nextAt:now(),updatedAt:new Date(now()).toISOString(),message:'Reenvio manual aguardando a configuração atual.'});delete row.finishedAt;return {delivery:publicDelivery(row)};});schedule(0);return result;}
 return {read:()=>exclusive(()=>snapshot()),save,configuration,remove,toggle,test,retry,tick,
  async start(){await load();if(stopped)return;started=true;schedule(0);},
  async stop(){stopped=true;started=false;clearTimeout(timer);for(const task of active.values())task.controller.abort();await ticking?.catch(()=>{});for(const task of active.values())task.controller.abort();await Promise.all([...active.values()].map(task=>task.promise));await serial;},
 };
}
