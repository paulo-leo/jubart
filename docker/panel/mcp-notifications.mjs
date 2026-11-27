import {z} from 'zod';
import {parseEnv} from './core.mjs';
import {validateWebhookRequest} from './webhook-http.mjs';

export const notificationActions=['notification.webhook.save','notification.webhook.toggle','notification.webhook.remove','notification.webhook.test','notification.webhook.retry'];
const revision=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().uuid();
const header=z.object({name:z.string().min(1).max(128),value:z.string().max(8192)}).strict();
const secretHeader=z.object({name:z.string().min(1).max(128),environment:z.string().regex(/^(?:WEBHOOK|NOTIFICATION)_[A-Z0-9_]+$/),prefix:z.string().max(80).default('')}).strict();
const request=z.object({url:z.string().min(1).max(2048),method:z.enum(['GET','POST']),headers:z.array(header).max(30),secretHeaders:z.array(secretHeader).max(10).default([]),query:z.record(z.string().min(1).max(128),z.string().max(8192)),bodyMode:z.enum(['event','json','form']),bodyTemplate:z.unknown(),allowPrivateNetwork:z.boolean()}).strict();
export const notificationActionSchemas=[
 z.object({action:z.literal('notification.webhook.save'),revision,webhook:z.object({id:id.optional(),name:z.string().trim().min(1).max(80),enabled:z.boolean(),serviceEvents:z.boolean().default(true),events:z.array(z.enum(['incident','recovery'])).min(1).max(2),severities:z.array(z.enum(['critical','warning'])).min(1).max(2),services:z.array(z.string().regex(/^(?:[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}|monitor:collection)$/)).max(100),timeoutSeconds:z.number().int().min(1).max(30),maxAttempts:z.number().int().min(1).max(5),request:request.optional()}).strict()}).strict(),
 z.object({action:z.literal('notification.webhook.toggle'),revision,id,enabled:z.boolean()}).strict(),
 ...['remove','test','retry'].map(verb=>z.object({action:z.literal('notification.webhook.'+verb),revision,id}).strict()),
];
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export function createNotificationIntegration({webhooks,readEnv,startOperation}){
 const available=()=>{if(!webhooks)fail('Notificações HTTP indisponíveis.',503);};
 async function input(data){
  if(data.action!=='notification.webhook.save'){const {action,...fields}=data;return fields;}
  const value=structuredClone(data.webhook);
  if(value.request){
   const {secretHeaders,...config}=value.request;
   if(config.headers.some(row=>/authorization|cookie|token|secret|api[-_]?key/i.test(row.name)))fail('Headers de autenticação devem usar secretHeaders com uma variável WEBHOOK_* ou NOTIFICATION_*, sem enviar o segredo pelo MCP.');
   const env=parseEnv(await readEnv());
   for(const ref of secretHeaders){if(!env[ref.environment])fail('Variável de credencial de notificação não configurada.',409);config.headers.push({name:ref.name,value:ref.prefix+env[ref.environment]});}
   value.request=validateWebhookRequest(config);
  }
  return {revision:data.revision,webhook:value};
 }
 async function read(data){available();const value=await webhooks.read();return data.resource==='webhook-deliveries'?{revision:value.revision,deliveries:value.deliveries,summary:value.summary}:{revision:value.revision,webhooks:value.webhooks,summary:value.summary,variables:value.variables,credentialSources:Object.entries(parseEnv(await readEnv())).filter(([name,value])=>/^(?:WEBHOOK|NOTIFICATION)_[A-Z0-9_]+$/.test(name)&&value).map(([environment])=>({environment})),note:'Configuração protegida: não retorna URLs completas, headers, parâmetros, corpo nem credenciais. serviceEvents (padrão true) controla avisos de início/reinício, respeitando o filtro de serviços. request omitido em save preserva o pedido existente; informado, substitui o pedido inteiro. secretHeaders aceita referências WEBHOOK_* e NOTIFICATION_* do ambiente, copiadas para o cofre ao salvar.'};}
 async function plan(data){
  available();const current=await webhooks.read();if(current.revision!==data.revision)fail('Destinos alterados. Consulte notification-webhooks novamente.',409);
  const verb=data.action.split('.').at(-1),hook=current.webhooks.find(row=>row.id===(data.webhook?.id||data.id));
  if(verb==='save'){if(data.webhook.id&&!hook)fail('Webhook não encontrado.',404);if(!data.webhook.id&&!data.webhook.request)fail('Informe request para criar um destino.');await input(data);}
  else if(verb==='retry'){if(!current.deliveries.some(row=>row.id===data.id&&row.state==='failed'))fail('Entrega com falha não encontrada.',409);}
  else if(!hook)fail('Webhook não encontrado.',404);
  return {action:data.action,revision:data.revision,executes:false,target:data.webhook?.id||data.id||'new',name:data.webhook?.name||hook?.name,requestMode:data.webhook?.request?'replace-entire-request':'preserve-existing',endpoint:data.webhook?.request?new URL(data.webhook.request.url).origin:hook?.endpoint,impact:['test','retry'].includes(verb)?'Enfileira uma requisição HTTP real para o destino salvo, mesmo no teste. Pode gerar notificações e efeitos externos.':'Altera somente o destino de notificações. Ativação/salvamento pode enviar eventos futuros; remoção/desativação cancela entregas pendentes. Não altera o monitoramento, SSE ou containers.'};
 }
 async function execute(data,actor){await plan(data);let operation;operation=startOperation(data.action,async()=>{await plan(data);const result=await webhooks[data.action.split('.').at(-1)](await input(data),actor);if(operation)operation.result=result;});return {status:202,body:{operation}};}
 return {read,plan,execute};
}
