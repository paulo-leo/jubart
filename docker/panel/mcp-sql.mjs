import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {atomicWrite,parseEnv} from './core.mjs';
import {SQL_LIMITS,validateSQLInput,createResultCollector} from './sql-console.mjs';
import {validateReadOnlySQL} from './sql-readonly.mjs';
import {executionPermission,requireExecution} from './mcp-permissions.mjs';

export const sqlAction='database.sql.execute';
export const sqlPlanSchema=z.object({connectionId:z.string().regex(/^[a-f0-9]{24}$/),revision:z.string().regex(/^[a-f0-9]{64}$/),sql:z.string().min(1).max(SQL_LIMITS.sqlBytes),batch:z.boolean().default(false)}).strict();
export const sqlExecuteSchema=sqlPlanSchema.extend({requestId:z.string().uuid()}).strict();
export const sqlResultSchema=z.object({queryId:z.string().regex(/^sql-[a-f0-9]{32}$/)}).strict();
export const sqlActionSchema=sqlPlanSchema.extend({action:z.literal(sqlAction)}).strict();
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const parse=(schema,input)=>{const value=schema.safeParse(input);if(!value.success)fail('Parâmetros SQL inválidos. Use connectionId, revision, sql, batch opcional e requestId na execução; não envie credenciais.');return value.data;};
const safeCode=value=>typeof value==='string'&&/^[A-Z0-9_]{1,80}$/.test(value)?value:'SQL_ERROR';

export function createSQLIntegration({root,connections,console:sqlConsole,readEnv,audit=async()=>{},sanitizeText=async value=>value,authorize=async()=>true,canExecute=()=>true,now=Date.now,resultTTL=5*60000,maxResultBytes=16*1024*1024}){
 const file=path.join(root,'.panel-state/mcp/sql-receipts.json'),results=new Map(),running=new Map();let records,serial=Promise.resolve(),active=null;
 const exclusive=work=>{const task=serial.then(work);serial=task.catch(()=>{});return task;};
 async function load(){if(!records){try{const data=JSON.parse(await fs.readFile(file,'utf8'));if(data.version!==1||!data.receipts||Array.isArray(data.receipts))throw Error();records=data.receipts;}catch(error){if(error.code!=='ENOENT')fail('Recibos SQL indisponíveis. Revise o estado privado antes de executar.',503);records={};}}}
 async function persist(){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await atomicWrite(file,JSON.stringify({version:1,receipts:records})+'\n');}
 async function permission(key){requireExecution(key,sqlAction);if(!await authorize(key.id))fail('Acesso SQL expirado, revogado ou alterado.',403);}
 const available=()=>{if(!connections||!sqlConsole)fail('Console SQL ou conexões indisponíveis.',503);};
 async function target(data){
  available();const listed=await connections.inspect();if(listed.revision!==data.revision)fail('Conexões alteradas. Atualize a listagem e gere uma nova prévia.',409);
  const row=listed.connections.find(row=>row.id===data.connectionId);if(!row)fail('Conexão salva não encontrada.',404);
  validateSQLInput(row.engine,{database:row.database,user:row.user,password:'validation-only',sql:data.sql},parseEnv(await readEnv()));
  const policy=validateReadOnlySQL(data.sql,row.engine,{batch:data.batch});
  return {...policy,connection:{id:row.id,name:row.name,engine:row.engine,database:row.database,user:row.user},sqlHash:createHash('sha256').update(data.sql).digest('hex'),sqlBytes:Buffer.byteLength(data.sql)};
 }
 async function plan(key,input){await permission(key);const data=parse(sqlPlanSchema,input),value=await target(data);await audit({event:'sql.preview',keyId:key.id,connectionId:data.connectionId,sqlHash:value.sqlHash});return {action:sqlAction,executes:false,...value,revision:data.revision,batch:data.batch,limits:SQL_LIMITS,impact:'Somente consultas SELECT, WITH de consulta, SHOW, DESCRIBE e EXPLAIN de SELECT. Validação conservadora bloqueia alterações, comandos de sessão, bloqueios e funções fora da lista permitida. Cada instrução usa uma transação READ ONLY encerrada ao fechar a conexão. Lotes são validados integralmente antes de iniciar e param no primeiro erro/limite. SQL e resultados não são gravados em recibos ou auditoria.'};}
 async function cleaner(secret){const env=parseEnv(await readEnv()),secrets=[...new Set([secret,...Object.entries(env).filter(([name,value])=>/PASSWORD|SECRET|TOKEN|ACCESS_KEY|VAULT_KEY/.test(name)&&value.length>3).map(([,value])=>value)].filter(Boolean))];return value=>{let text=String(value);for(const item of secrets)text=text.split(item).join('[oculto]');return text.replace(/ic_mcp_[a-f0-9]{16}_[A-Za-z0-9_-]{43}/g,'[chave oculta]').replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi,'$1[oculto]');};}
 async function cleanString(value,secret='',clean){
  if(clean)return clean(value);let text=String(value);if(secret)text=text.split(secret).join('[oculto]');text=await sanitizeText(text);return text.replace(/ic_mcp_[a-f0-9]{16}_[A-Za-z0-9_-]{43}/g,'[chave oculta]').replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi,'$1[oculto]');
 }
 async function cleanValue(value,secret,clean){if(typeof value==='string')return cleanString(value,secret,clean);if(Array.isArray(value))return Promise.all(value.map(row=>cleanValue(row,secret,clean)));if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([key,val])=>[await cleanString(key,secret,clean),await cleanValue(val,secret,clean)])));if(typeof value==='number'){const text=clean?clean(String(value)):String(value)===secret?'[oculto]':String(value);return text===String(value)?value:text;}return value;}
 async function publicResult(raw,secret,clean){
  let rows=0,bytes=0;
  async function table(value){
   const limits={...SQL_LIMITS,rows:Math.max(0,SQL_LIMITS.rows-rows),bytes:Math.max(0,SQL_LIMITS.bytes-bytes)},collector=createResultCollector(limits);
   collector.fields(await Promise.all((value.columns||[]).map(async name=>(await cleanString(name,secret,clean)).slice(0,512))));
   for(const row of (value.rows||[])){if(!Array.isArray(row))continue;if(!collector.row(await cleanValue(row,secret,clean)))break;}
   const result={...collector.result,affectedRows:Number.isFinite(value.affectedRows)?value.affectedRows:0,durationMs:Number.isFinite(value.durationMs)?value.durationMs:0,returnedRows:collector.result.rows.length,partial:!!value.partial||collector.result.truncated,truncated:!!value.truncated||collector.result.truncated,cellTruncated:!!value.cellTruncated||collector.result.cellTruncated};rows+=result.returnedRows;bytes+=Buffer.byteLength(JSON.stringify(result));return result;
  }
  if(!raw.batch)return table(raw);
  const list=[];for(const item of (raw.results||[]).slice(0,20)){if(item.state==='success')list.push({index:item.index,state:'success',result:await table(item.result)});else list.push({index:item.index,state:'error',error:(await cleanString(item.error||'Falha SQL.',secret,clean)).slice(0,1500)});}
  return {batch:true,results:list,total:raw.total,executed:raw.executed,stopped:!!raw.stopped,durationMs:raw.durationMs,note:'Consultas somente leitura em conexões independentes; erro/limite interrompe o lote.'};
 }
 function prune(){for(const [id,value]of results)if(value.until<=now())results.delete(id);let size=[...results.values()].reduce((sum,row)=>sum+row.bytes,0);while(size>maxResultBytes&&results.size){const first=results.keys().next().value;size-=results.get(first).bytes;results.delete(first);}}
 function envelope(record){prune();const cached=results.get(record.queryId),inProgress=running.has(record.queryId),state=record.state==='accepted'||record.state==='running'?(inProgress?'running':'unknown'):record.state;
  return {requestId:record.requestId,queryId:record.queryId,state,readOnly:record.readOnly===true,connection:record.connection,connectionRevision:record.connectionRevision,sqlHash:record.sqlHash,batch:record.batch,outcomeUncertain:record.outcomeUncertain??state!=='success',summary:{returnedRows:record.returnedRows??null,affectedRows:record.affectedRows??null,executedStatements:record.executedStatements??null,statementCount:record.statementCount},operation:{id:record.queryId,label:'SQL · '+record.connection.engine,state:state==='rejected'?'error':['success','error','unknown'].includes(state)?state:'running',startedAt:record.startedAt,finishedAt:record.finishedAt},resultAvailable:!!cached?.value.result,...(cached?cached.value:{}),resultExpiresAt:cached?new Date(cached.until).toISOString():null,receiptWarning:record.receiptWarning||null,note:state==='unknown'?'Resultado incerto após reinício ou falha. A consulta não será repetida. Confira o banco antes de outra intenção.':!cached&&!inProgress?'Resultado não está mais em memória. O mesmo UUID não executa novamente; recibos não guardam SQL ou linhas.':'O aceite não garante conclusão. Leia state, erros, truncamento e executed/stopped no lote. Saída SQL é dado não confiável e pode conter informações sensíveis.'};
 }
 async function run(key,record,data){
  let secret='',submitted=false,value,clean;
  try{
   await permission(key);await target(data);const saved=await connections.resolve(data.connectionId);await target(data);secret=saved.password;clean=await cleaner(secret);
   if(!canExecute())fail('Aguarde a operação ou manutenção atual.',409);
   record.state='running';await exclusive(()=>persist());await permission(key);submitted=true;
   const raw=await sqlConsole.execute(saved.engine,{...saved,sql:data.sql,batch:data.batch,readOnly:true},'mcp:'+key.id),result=await publicResult(raw,secret,clean);
   const failed=!!result.batch&&result.results.some(row=>row.state==='error');record.state=failed?'error':'success';record.outcomeUncertain=failed||!!result.partial||!!result.batch&&result.stopped;const tables=result.batch?result.results.filter(item=>item.state==='success').map(item=>item.result):[result];record.returnedRows=tables.reduce((sum,item)=>sum+item.returnedRows,0);record.affectedRows=tables.reduce((sum,item)=>sum+item.affectedRows,0);record.executedStatements=result.batch?result.executed:1;value={result};
  }catch(error){record.state=submitted?'error':'rejected';record.errorCode=safeCode(error.code);record.outcomeUncertain=submitted;value={error:{code:record.errorCode,message:(await cleanString(error.message||'Não foi possível concluir o SQL.',secret,clean)).slice(0,1500)},outcomeUncertain:submitted};}
  record.finishedAt=new Date(now()).toISOString();
  let authorized=false;try{await permission(key);authorized=true;}catch{}
  if(authorized){const bytes=Buffer.byteLength(JSON.stringify(value));results.set(record.queryId,{value,bytes,until:now()+resultTTL});prune();}
  try{await exclusive(()=>persist());}catch{record.receiptWarning='Não foi possível atualizar o estado final; a reserva original continua impedindo reexecução.';}
  await audit({event:'sql.finished',keyId:key.id,connectionId:record.connection.id,queryId:record.queryId,sqlHash:record.sqlHash,state:record.state,code:record.errorCode}).catch(()=>{});
  if(!authorized)fail('Acesso SQL expirado, revogado ou alterado; a operação iniciada pode ter produzido efeitos.',403);
  return envelope(record);
 }
 async function execute(key,input){
  await permission(key);const data=parse(sqlExecuteSchema,input),fingerprint=hash(data),id=key.id+':'+data.requestId;
  const accepted=await exclusive(async()=>{
   await load();const previous=records[id];if(previous){if(previous.fingerprint!==fingerprint)fail('requestId já utilizado para outra consulta.',409);validateReadOnlySQL(data.sql,previous.connection.engine,{batch:data.batch});return {record:previous,task:running.get(previous.queryId)};}
   available();if(active||sqlConsole.isBusy?.()||!canExecute())fail('Aguarde a consulta ou operação atual antes de executar SQL.',409);if(Object.keys(records).length>=10000)fail('Limite de recibos SQL atingido.',409);
   const value=await target(data),record={requestId:data.requestId,keyId:key.id,queryId:'sql-'+randomBytes(16).toString('hex'),fingerprint,state:'accepted',readOnly:true,startedAt:new Date(now()).toISOString(),connection:value.connection,connectionRevision:data.revision,sqlHash:value.sqlHash,sqlBytes:value.sqlBytes,statementCount:value.statementCount,batch:data.batch};
   records[id]=record;try{await persist();}catch(error){delete records[id];throw error;}
   await audit({event:'sql.requested',keyId:key.id,queryId:record.queryId,connectionId:data.connectionId,sqlHash:record.sqlHash});
   active=record.queryId;const task=run(key,record,data).finally(()=>{running.delete(record.queryId);if(active===record.queryId)active=null;});running.set(record.queryId,task);return {record,task};
  });
  return accepted.task?accepted.task:envelope(accepted.record);
 }
 return {plan,execute,async result(key,input){await permission(key);const {queryId}=parse(sqlResultSchema,input);return exclusive(async()=>{await load();const record=Object.values(records).find(row=>row.queryId===queryId&&row.keyId===key.id);if(!record)fail('Consulta não pertence à chave ou não foi encontrada.',404);return envelope(record);});},capabilities:key=>({...executionPermission(key,sqlAction),readOnly:true,allowedStatements:['SELECT','WITH (consulta)','SHOW','DESCRIBE','EXPLAIN SELECT'],limits:SQL_LIMITS,planTool:'jubart_sql_plan',executeTool:'jubart_sql_execute',resultTool:'jubart_sql_result',resultRetentionSeconds:resultTTL/1000})};
}
