import http,{validateHeaderName,validateHeaderValue} from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import {isIP,BlockList} from 'node:net';
import {readFileSync} from 'node:fs';
import {z} from 'zod';

export const webhookVariables=['event.id','event.type','event.transition','event.at','incident.id','incident.target','incident.service','incident.state','incident.status','incident.severity','incident.message','incident.openedAt','incident.resolvedAt','installation','test'];
export const defaultWebhookRequest={url:'',method:'POST',headers:[],query:{},bodyMode:'event',bodyTemplate:{},allowPrivateNetwork:false};
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const safeString=z.string().max(8192),pairs=z.record(z.string().min(1).max(128),safeString);
const requestSchema=z.object({url:z.string().min(1).max(2048),method:z.enum(['GET','POST']),headers:z.array(z.object({name:z.string().min(1).max(128),value:safeString}).strict()).max(30),query:pairs,bodyMode:z.enum(['event','json','form']),bodyTemplate:z.unknown(),allowPrivateNetwork:z.boolean()}).strict();
const reservedHeaders=new Set(['host','connection','content-length','transfer-encoding','trailer','upgrade','proxy-authorization','proxy-connection','te','expect','content-type','idempotency-key','x-jubart-event-id','x-jubart-delivery-id','x-jubart-event']);
const dangerousKeys=new Set(['__proto__','prototype','constructor']);
function templateString(value){const matches=value.matchAll(/{{\s*([^{}]+?)\s*}}/g);for(const match of matches)if(!webhookVariables.includes(match[1].trim()))fail('Variável de webhook não reconhecida: '+match[1].trim());if(value.replace(/{{\s*[^{}]+?\s*}}/g,'').includes('{{'))fail('Variável de webhook incompleta.');}
function templateJSON(value,depth=0){if(depth>12)fail('O corpo JSON excede a profundidade permitida.');if(typeof value==='string'){if(value.length>8192)fail('Campo JSON muito longo.');templateString(value);return;}if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;if(Array.isArray(value)){if(value.length>200)fail('Lista JSON muito longa.');for(const row of value)templateJSON(row,depth+1);return;}if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype){if(Object.keys(value).length>100)fail('Objeto JSON muito grande.');for(const [key,row]of Object.entries(value)){if(dangerousKeys.has(key)||key.length>128)fail('Chave JSON não permitida.');templateJSON(row,depth+1);}return;}fail('Informe um corpo JSON válido.');}
export function validateWebhookRequest(input){
 const parsed=requestSchema.safeParse(input);if(!parsed.success)fail('Requisição de webhook inválida. Confira URL, método, headers, parâmetros e corpo.');const request=parsed.data;
 let url;try{url=new URL(request.url);}catch{fail('Informe uma URL HTTP ou HTTPS válida.');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.search||url.hostname.includes('%')||/[{}\x00-\x20]/.test(request.url))fail('Use URL HTTP/HTTPS sem credenciais, fragmento, espaços ou variáveis; cadastre parâmetros no campo próprio.');
 request.url=url.href;if(Object.keys(request.query).length>50)fail('Use até 50 parâmetros de URL.');
 const seen=new Set();for(const row of request.headers){const name=row.name.toLowerCase();try{validateHeaderName(row.name);validateHeaderValue(row.name,row.value);}catch{fail('Nome ou valor de header inválido.');}if(reservedHeaders.has(name)||seen.has(name))fail('Header reservado ou repetido: '+row.name);seen.add(name);templateString(row.value);}
 for(const [key,value]of Object.entries(request.query)){if(dangerousKeys.has(key)||/[\x00-\x1f]/.test(key))fail('Parâmetro de URL inválido.');templateString(value);}
 if(request.bodyMode==='json'){if(!request.bodyTemplate||typeof request.bodyTemplate!=='object')fail('O corpo personalizado deve ser um objeto ou lista JSON.');templateJSON(request.bodyTemplate);}
 else if(request.bodyMode==='form'){const result=pairs.safeParse(request.bodyTemplate);if(!result.success||Object.keys(result.data).length>50)fail('Formulário deve ser um objeto JSON com até 50 valores de texto.');for(const [key,value]of Object.entries(result.data)){if(dangerousKeys.has(key))fail('Campo de formulário inválido.');templateString(value);}}
 else request.bodyTemplate={};
 if(Buffer.byteLength(JSON.stringify(request))>16384)fail('A configuração da requisição deve ter no máximo 16 KiB.');return request;
}
const render=(text,variables)=>text.replace(/{{\s*([^{}]+?)\s*}}/g,(_match,key)=>String(variables[key.trim()]??''));
export function renderWebhookRequest(request,envelope,deliveryId){
 const variables=Object.fromEntries(webhookVariables.map(name=>[name,name.startsWith('event.')?envelope[name.slice(6)]:name.startsWith('incident.')?envelope.incident?.[name.slice(9)]:envelope[name]]));
 const json=value=>typeof value==='string'?render(value,variables):Array.isArray(value)?value.map(json):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,row])=>[key,json(row)])):value;
 const url=new URL(request.url);for(const [key,value]of Object.entries(request.query))url.searchParams.set(key,render(value,variables));if(url.href.length>8192)fail('URL renderizada muito longa.');
 const headers={'User-Agent':'Jubart-incident-webhook/1','X-Jubart-Event-Id':envelope.id,'X-Jubart-Delivery-Id':deliveryId,'X-Jubart-Event':envelope.type,'Idempotency-Key':deliveryId};
 for(const row of request.headers){const value=render(row.value,variables);try{validateHeaderValue(row.name,value);}catch{fail('Header renderizado inválido.');}headers[row.name]=value;}
 let body=null;if(request.method==='POST'){if(request.bodyMode==='form'){body=new URLSearchParams(json(request.bodyTemplate)).toString();headers['Content-Type']='application/x-www-form-urlencoded; charset=utf-8';}else{body=JSON.stringify(request.bodyMode==='event'?envelope:json(request.bodyTemplate));headers['Content-Type']='application/json; charset=utf-8';}if(Buffer.byteLength(body)>65536)fail('Corpo renderizado excede 64 KiB.');headers['Content-Length']=String(Buffer.byteLength(body));}
 if(Buffer.byteLength(JSON.stringify(headers))>16384)fail('Headers renderizados excedem o limite.');return {url,method:request.method,headers,body};
}
const denied=new BlockList();for(const [ip,prefix,family]of [['0.0.0.0',8,'ipv4'],['127.0.0.0',8,'ipv4'],['169.254.0.0',16,'ipv4'],['100.64.0.0',10,'ipv4'],['192.0.0.0',24,'ipv4'],['192.0.2.0',24,'ipv4'],['198.18.0.0',15,'ipv4'],['198.51.100.0',24,'ipv4'],['203.0.113.0',24,'ipv4'],['224.0.0.0',4,'ipv4'],['240.0.0.0',4,'ipv4'],['::',96,'ipv6'],['2002::',16,'ipv6'],['2001::',32,'ipv6'],['fd00:ec2::254',128,'ipv6'],['168.63.129.16',32,'ipv4'],['::1',128,'ipv6'],['fe80::',10,'ipv6'],['ff00::',8,'ipv6'],['2001:db8::',32,'ipv6'],['64:ff9b::',96,'ipv6']])denied.addSubnet(ip,prefix,family);
const privateRanges=new BlockList();for(const [ip,prefix,family]of [['10.0.0.0',8,'ipv4'],['172.16.0.0',12,'ipv4'],['192.168.0.0',16,'ipv4'],['fc00::',7,'ipv6']])privateRanges.addSubnet(ip,prefix,family);
export function webhookAddressAllowed(address,allowPrivateNetwork=false){const version=isIP(address);if(!version)return false;const family=version===4?'ipv4':'ipv6';if(version===6&&(address.toLowerCase().startsWith('::ffff:')||address.toLowerCase().startsWith('::192.')))return false;return !denied.check(address,family)&&(allowPrivateNetwork||!privateRanges.check(address,family));}
function safeNetworkError(message,retryable=true){return Object.assign(new Error(message),{retryable});}
async function withAbort(promise,signal){if(signal?.aborted)throw safeNetworkError('Entrega interrompida ou tempo limite atingido.');let abort;try{return await Promise.race([promise,new Promise((_,reject)=>{abort=()=>reject(safeNetworkError('Entrega interrompida ou tempo limite atingido.'));signal?.addEventListener('abort',abort,{once:true});})]);}finally{signal?.removeEventListener('abort',abort);}}
let ca;try{ca=readFileSync('/etc/ssl/certs/ca-certificates.crt');}catch{}
export function createWebhookTransport({lookup=(hostname)=>dns.lookup(hostname,{all:true,verbatim:true})}={}){
 return async function deliver(request,envelope,deliveryId,{signal,timeoutSeconds=10}={}){
  const timed=AbortSignal.timeout(timeoutSeconds*1000),combined=signal?AbortSignal.any([signal,timed]):timed;let rendered;
  try{rendered=renderWebhookRequest(request,envelope,deliveryId);}catch{throw safeNetworkError('Não foi possível montar a requisição. Revise headers, parâmetros e corpo.',false);}
  const hostname=rendered.url.hostname.replace(/^\[|\]$/g,'');let addresses;
  try{addresses=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await withAbort(lookup(hostname),combined);}catch{throw safeNetworkError('Não foi possível resolver o destino no prazo.');}
  if(!addresses.length||addresses.length>32||addresses.some(row=>!webhookAddressAllowed(row.address,request.allowPrivateNetwork)))throw safeNetworkError('Destino bloqueado: revise a rede privada; loopback, link-local e metadados não são permitidos.',false);
  if(combined.aborted)throw safeNetworkError('Entrega interrompida ou tempo limite atingido.');
  const pinned=(_hostname,options,callback)=>{if(typeof options==='function'){callback=options;options={};}const selected=options?.family?addresses.filter(row=>row.family===options.family):addresses;if(!selected.length)return callback(new Error('Address unavailable'));options?.all?callback(null,selected):callback(null,selected[0].address,selected[0].family);};
  const secure=rendered.url.protocol==='https:',client=secure?https:http,agent=secure?new https.Agent({keepAlive:false,proxyEnv:{},...(ca?{ca}:{})}):new http.Agent({keepAlive:false,proxyEnv:{}});
  try{return await new Promise((resolve,reject)=>{const started=Date.now();const outgoing=client.request(rendered.url,{method:rendered.method,headers:rendered.headers,lookup:pinned,agent,signal:combined,maxHeaderSize:16384,rejectUnauthorized:true},incoming=>{
    const statusCode=incoming.statusCode;let retryAfterMs=null;const retry=String(incoming.headers['retry-after']||'');if(/^\d{1,8}$/.test(retry))retryAfterMs=Math.min(3600000,Number(retry)*1000);else if(retry){const date=Date.parse(retry);if(Number.isFinite(date))retryAfterMs=Math.min(3600000,Math.max(0,date-Date.now()));}incoming.destroy();resolve({statusCode,durationMs:Date.now()-started,retryAfterMs});
   });outgoing.on('error',()=>reject(safeNetworkError(timed.aborted?'O destino não respondeu no prazo.':combined.aborted?'Entrega interrompida.':'Falha de conexão ou certificado HTTPS com o destino.')));outgoing.end(rendered.body);
  });}finally{agent.destroy();}
 };
}
