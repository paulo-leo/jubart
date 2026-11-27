import {executionPermission} from './mcp-permissions.mjs';
import {containerActions,containerControllable} from './mcp-infrastructure.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {parseEnv,databaseEnabled} from './core.mjs';
import {backupConfig,backupRevision,validateBackup} from './database-api.mjs';
import {createVault} from './databases.mjs';
import {validateSQLInput} from './sql-console.mjs';
export const backupActions=['backup.configure','backup.run','database.connection.save','database.connection.test','database.connection.remove'];
const engine=z.enum(['mariadb','postgres']),revision=z.string().regex(/^[a-f0-9]{64}$/),connectionId=z.string().regex(/^[a-f0-9]{24}$/),name=z.string().regex(/^[a-z][a-z0-9_]{0,47}$/);
const environmentRef=z.string().regex(/^(?:DB_PASSWORD|APP_[0-9]+_DB_PASSWORD|POSTGRES_PASSWORD)$/);
const credential=z.discriminatedUnion('source',[z.object({source:z.literal('environment'),name:environmentRef}).strict(),z.object({source:z.literal('vault'),host:z.string().max(253).optional()}).strict(),z.object({source:z.literal('connection'),id:connectionId}).strict()]);
export const backupSettingsSchema=z.object({enabled:z.boolean().optional(),directory:z.string().min(1).max(1024).optional(),schedule:z.string().min(1).max(100).optional(),timezone:z.string().min(1).max(100).optional(),retentionDays:z.number().int().min(0).max(3650).optional(),maxAgeHours:z.number().int().min(1).max(87600).optional(),runOnStart:z.boolean().optional(),databases:z.string().min(1).max(2048).optional(),remoteEnabled:z.boolean().optional(),remotePrefix:z.string().max(512).optional(),s3Provider:z.enum(['AWS','Other']).optional(),s3Bucket:z.string().max(253).optional(),s3Region:z.string().max(100).optional(),s3Endpoint:z.string().max(1024).optional(),s3EnvAuth:z.boolean().optional()}).strict().refine(settings=>Object.keys(settings).length>0,'Informe ao menos uma opção.');
export const backupActionSchemas=[
 z.object({action:z.literal('backup.configure'),engine,revision,settings:backupSettingsSchema,s3CredentialsFrom:engine.optional()}).strict(),
 z.object({action:z.literal('backup.run'),engine,revision}).strict(),
 z.object({action:z.literal('database.connection.save'),revision,id:connectionId.optional(),name:z.string().min(1).max(80),engine,database:name,user:name,credential:credential.optional()}).strict(),
 z.object({action:z.literal('database.connection.test'),revision,id:connectionId}).strict(),
 z.object({action:z.literal('database.connection.remove'),revision,id:connectionId}).strict(),
];
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const pick=(value,fields)=>Object.fromEntries(fields.filter(field=>value?.[field]!==undefined).map(field=>[field,value[field]]));
const prefix=engine=>engine==='mariadb'?'BACKUP_':'PG_BACKUP_';
const service=engine=>engine==='mariadb'?'backup':'backup-postgres';
const envNames=env=>Object.keys(env).filter(key=>/^(?:DB_PASSWORD|APP_[0-9]+_DB_PASSWORD|POSTGRES_PASSWORD)$/.test(key)&&env[key]);
export function createBackupIntegration({root,readEnv,loadConfig,databases,connections,startOperation,compose,snapshot,docker,hostMounts=async()=>[]}){
 const vault=createVault(root,readEnv);
 const enabled=(env,engine)=>{if(!databaseEnabled(env,engine))fail('Servidor '+engine+' desabilitado nesta instalação.',409);};
 const inspectConnections=async()=>{if(!connections)fail('Conexões de banco indisponíveis.',503);return connections.inspect();};
 async function connectionInput(data){
  const env=parseEnv(await readEnv());enabled(env,data.engine);validateSQLInput(data.engine,{database:data.database,user:data.user,password:'validation-only',sql:'SELECT 1;'},env);let password;
  if(data.credential?.source==='environment'){password=env[data.credential.name];if(!password)fail('A referência de senha não está configurada. Use o painel para cadastrá-la.',409);}
  else if(data.credential?.source==='vault'){try{password=(await vault.reveal(data.engine,data.user,data.engine==='postgres'?'network':data.credential.host||'%')).password;}catch{fail('Credencial da conta não está disponível no cofre. Cadastre o acesso pelo painel.',409);}}
  else if(data.credential?.source==='connection'){const source=await connections.resolve(data.credential.id,{engine:data.engine});if(source.user!==data.user)fail('A conexão de origem pertence a outra conta.',409);password=source.password;}
  else if(data.id){password=(await connections.resolve(data.id)).password;}
  else fail('Informe uma referência de credencial existente, sem senha em texto.',400);
  const validated=validateSQLInput(data.engine,{database:data.database,user:data.user,password,sql:'SELECT 1;'},env);
  return {name:data.name,engine:data.engine,database:validated.database,user:validated.user,password:validated.password,...(data.id?{id:data.id}:{}),revision:data.revision};
 }
 async function validateDirectory(directory){
  const resolved=path.resolve(root,directory),realRoot=await fs.realpath(root);if(realRoot===resolved||realRoot.startsWith(resolved+path.sep))fail('Escolha uma pasta exclusiva de backups, fora da raiz/ancestrais da instalação.');
  if(/^\/(?:etc|proc|dev|sys|var\/lib\/(?:docker|postgresql|mysql))(?:\/|$)/.test(resolved))fail('Diretório de sistema ou dados do banco protegido.');
  const config=(await loadConfig()).config;for(const app of config.applications){const project=path.resolve(root,app.directory);if(resolved===project||resolved.startsWith(project+path.sep)||project.startsWith(resolved+path.sep))fail('O destino do backup deve ficar separado das pastas das aplicações.');}
  const mounts=[{source:root,target:root},...(await hostMounts()).filter(mount=>mount.type==='bind'&&path.isAbsolute(mount.source||'')&&path.isAbsolute(mount.target||''))].filter(mount=>resolved===mount.source||resolved.startsWith(mount.source+path.sep)).sort((a,b)=>b.source.length-a.source.length);if(!mounts.length)fail('O destino precisa estar em uma pasta do host visível pelo painel, como a instalação, projetos ou HOST_STORAGE_DIRECTORY.');const mapped=path.resolve(mounts[0].target,path.relative(mounts[0].source,resolved));let existing=mapped;while(true){try{const [stat,real]=await Promise.all([fs.stat(existing),fs.realpath(existing)]);if(!stat.isDirectory()||real!==existing)fail('O destino não pode usar links simbólicos ou apontar para arquivo.');break;}catch(error){if(error.status)throw error;if(error.code!=='ENOENT')fail('Não foi possível verificar o destino de backup.');const parent=path.dirname(existing);if(parent===existing)fail('Diretório de backup inválido.');existing=parent;}}
  return resolved;
 }
 async function backupValue(data){
  const text=await readEnv();if(backupRevision(text)!==data.revision)fail('Configuração alterada. Consulte backups e gere nova prévia.',409);const env=parseEnv(text);enabled(env,data.engine);
  const current=backupConfig(env,data.engine),settings={...current,...data.settings};validateBackup(settings,root);const hostDirectory=await validateDirectory(settings.directory);
  if(settings.s3Endpoint){let url;try{url=new URL(settings.s3Endpoint);}catch{fail('Endpoint S3 inválido.');}if(url.username||url.password||url.search||url.hash)fail('Endpoint S3 não aceita credenciais ou parâmetros na URL.');}
  const values={...data.settings};let access=env[prefix(data.engine)+'S3_ACCESS_KEY_ID'],secret=env[prefix(data.engine)+'S3_SECRET_ACCESS_KEY'];
  if(data.s3CredentialsFrom){access=env[prefix(data.s3CredentialsFrom)+'S3_ACCESS_KEY_ID'];secret=env[prefix(data.s3CredentialsFrom)+'S3_SECRET_ACCESS_KEY'];if(!access||!secret)fail('Credencial S3 de origem não configurada.',409);values.s3AccessKeyId=access;values.s3SecretAccessKey=secret;}
  if(settings.remoteEnabled&&!settings.s3EnvAuth&&(!access||!secret))fail('Configure credenciais S3 no painel ou selecione uma origem já configurada.',409);
  validateBackup({...settings,...values},root);return {current,settings,values,hostDirectory};
 }
 async function read(data,key){
  if(data.resource==='database-connections'){const value=await inspectConnections(),env=parseEnv(await readEnv());return {...value,credentialSources:envNames(env).map(name=>({source:'environment',name})),note:'Metadados das conexões salvas; sem senhas ou descoberta automática com gravação. Servidores limitados a MariaDB/PostgreSQL desta instalação. Credenciais podem ser reutilizadas por referência ao ambiente, cofre ou outra conexão da mesma conta.'};}
  const text=await readEnv(),env=parseEnv(text),servers=[];let inventory;try{inventory=await snapshot?.();}catch{}
  for(const engine of data.engine&&data.engine!=='all'?[data.engine]:['mariadb','postgres']){
   const settings=backupConfig(env,engine),row={engine,enabled:databaseEnabled(env,engine),revision:backupRevision(text),settings,service:service(engine),databaseConnection:{host:engine,port:engine==='mariadb'?3306:5432,user:engine==='mariadb'?'root':env.POSTGRES_USER||'infra_admin',passwordConfigured:!!env[engine==='mariadb'?'DB_ROOT_PASSWORD':'POSTGRES_PASSWORD'],credentialSource:'managed-environment'},status:null,statusAvailable:false};
   row.databaseEnabled=row.enabled;row.automaticBackupEnabled=settings.enabled;
   const current=inventory?.services?.find(item=>item.name===row.service),containerId=/^[a-f0-9]{12}$/.test(current?.containerId||'')?current.containerId:null;
   row.runtime={note:'Estado do container e ambiente configurado são distintos do agendamento salvo; running/healthy e automaticEnabled não comprovam execução de cópias.',inventoryAvailable:!!inventory,containerExists:inventory?!!containerId:null,state:current?.state||(inventory?'not_created':'unknown'),containerId,health:current?.health??null,automaticEnabled:null,configurationComparison:{status:'unknown',fieldsCompared:[],differences:[]}};
   if(containerId&&docker&&inventory?.project){try{
    const [container]=JSON.parse(await docker(['inspect',containerId],{timeout:10000})),labels=container?.Config?.Labels||{};
    if(container?.Id?.slice(0,12)===containerId&&labels['com.docker.compose.project']===inventory.project&&labels['com.docker.compose.service']===row.service&&labels['com.docker.compose.oneoff']?.toLowerCase()!=='true'){
     const runtimeEnv=Object.fromEntries((container.Config.Env||[]).map(line=>{const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1)];}));
     const values={};for(const [field,variable]of Object.entries({enabled:'BACKUP_ENABLED',schedule:'BACKUP_SCHEDULE',timezone:'BACKUP_TIMEZONE',runOnStart:'BACKUP_RUN_ON_START'})){
      if(!Object.hasOwn(runtimeEnv,variable))continue;const raw=runtimeEnv[variable];if(['enabled','runOnStart'].includes(field)){if(!['true','false'].includes(raw))continue;values[field]=raw==='true';}else if(raw.length<=100&&!/[\x00-\x1f]/.test(raw))values[field]=raw;
     }
     row.runtime.automaticEnabled=values.enabled??null;const fieldsCompared=Object.keys(values),differences=fieldsCompared.filter(field=>values[field]!==settings[field]).map(field=>({field,saved:settings[field],effective:values[field]}));
     row.runtime.configurationComparison={status:!fieldsCompared.length?'unknown':differences.length?'pending':'matches',fieldsCompared,differences,note:'Compara somente os campos indicados do ambiente do container com a configuração salva; não confirma credenciais, arquivos ou execução de backups.'};
    }
   }catch{}}
   row.operations=containerActions.map(action=>{const permission=executionPermission(key,action),blockedBy=!containerId?(inventory?'container_missing':'runtime_unavailable'):!containerControllable(current)?'service_protected':action!=='container.stop'&&!row.enabled?'database_disabled':null;return {action,tool:'jubart_container_'+action.split('.')[1],...permission,available:permission.allowed&&!blockedBy,blockedBy,operation:containerId?{action,service:row.service,containerId}:null};});
   for(const action of ['backup.configure','backup.run']){const permission=executionPermission(key,action);row.operations.push({action,tool:action==='backup.configure'?'jubart_backup_configure':'jubart_backup_run',...permission,available:permission.allowed&&row.enabled,blockedBy:row.enabled?null:'database_disabled',engine,revision:row.revision});}
   row.statusUnavailableReason=!row.enabled?'database_disabled':inventory&&row.runtime.state!=='running'?'service_not_running':null;
   if(row.enabled&&row.statusUnavailableReason!=='service_not_running'&&(compose||databases)){try{const value=compose?JSON.parse(await compose(['exec','-T',service(engine),'python3','/opt/backup/backup.py','status'],undefined,{timeout:10000})): (await databases.handle('/api/databases/'+engine,'GET',{})).body.backupStatus;if(value&&!Array.isArray(value)&&Number.isInteger(value.fileCount)&&value.fileCount>=0){row.status={...pick(value,['engine','lastSuccess','lastError','fileCount','bytes']),files:(value.files||[]).slice(0,30).map(file=>pick(file,['name','bytes','createdAt','uploaded']))};row.statusAvailable=true;}}catch{}}
   if(!row.statusAvailable&&!row.statusUnavailableReason)row.statusUnavailableReason='query_unavailable';
   servers.push(row);
  }
  return {observedAt:new Date().toISOString(),servers,workflow:{startService:'Se o pedido é iniciar o serviço existente, use a operação container.start autorizada em operations, com infra_plan/infra_execute ou jubart_container_start. Não habilite agendamento nem altere outro banco.',configure:'Para agenda, pasta, retenção e enabled, use backup.configure com a revisão atual e as opções solicitadas; a ação precisa estar na chave.',run:'Para uma cópia imediata, use backup.run; não depende de habilitar o agendamento automático.',permissions:'allowed=false informa exatamente missingScopes/missingActions. Informe a permissão ausente ao usuário; não afirme que a operação só existe no navegador. A concessão de permissões é administrativa e não pode ser feita pela própria chave.',verification:'Após o aceite, acompanhe operation_status, releia backups e confira status/arquivos. Running/healthy não comprova backups automáticos; parada observada não prova quem solicitou ou se foi administrativa.'},s3CredentialSources:['mariadb','postgres'].map(engine=>({engine,accessKeyIdConfigured:!!env[prefix(engine)+'S3_ACCESS_KEY_ID'],secretAccessKeyConfigured:!!env[prefix(engine)+'S3_SECRET_ACCESS_KEY']})),note:'Configuração salva e estado consultado; status indisponível não significa ausência de cópias. Backups usam as contas gerenciadas do serviço, não as conexões de aplicação do console. Senhas/chaves não são retornadas. Alterar retenção ou ativar agenda/runOnStart pode executar dumps, remover dumps locais antigos e enviar dados para S3.'};
 }
 async function plan(data){
  if(data.action==='backup.configure'){
   const value=await backupValue(data);return {action:data.action,engine:data.engine,revision:data.revision,hostDirectory:value.hostDirectory,executes:false,changes:Object.entries(data.settings).filter(([key,next])=>JSON.stringify(next)!==JSON.stringify(value.current[key])).map(([field,after])=>({field,before:value.current[field],after})),credentials:data.s3CredentialsFrom?{mode:'reuse-s3',sourceEngine:data.s3CredentialsFrom}:{mode:'preserve-existing'},commands:[{kind:'internal',text:'Validar revisão, pasta dedicada, cron, retenção e credenciais por referência; atualizar apenas as opções de backup do servidor selecionado e guardar backup privado do .env.'},{kind:'shell',text:'docker compose up -d --no-deps --force-recreate '+service(data.engine)}],impact:'Recria somente o serviço de backup. Pode ativar backups automáticos, executar ao iniciar, remover dumps locais vencidos pela retenção e enviar dados para o destino S3 configurado. Não recria o banco nem aplicações; mudar a pasta não move cópias anteriores.'};
  }
  if(data.action==='backup.run'){const text=await readEnv();if(backupRevision(text)!==data.revision)fail('Configuração de backup alterada.',409);const env=parseEnv(text);enabled(env,data.engine);const settings=backupConfig(env,data.engine);validateBackup(settings,root);const hostDirectory=await validateDirectory(settings.directory);return {action:data.action,engine:data.engine,settings,hostDirectory,executes:false,commands:[{kind:'shell',text:'docker compose run --rm --no-deps '+service(data.engine)+' once'}],impact:'Executa o backup dos bancos selecionados, com retenção local e envio remoto atualmente configurados. Pode consumir CPU/disco e transmitir dados ao S3. Não altera dados dos bancos de origem.'};}
  const value=await inspectConnections();if(value.revision!==data.revision)fail('Conexões alteradas. Consulte database-connections e gere nova prévia.',409);
  if(data.action==='database.connection.save'){if(data.id&&!value.connections.some(row=>row.id===data.id))fail('Conexão não encontrada.',404);await connectionInput(data);return {action:data.action,executes:false,connection:pick(data,['id','name','engine','database','user']),credential:data.credential?{...data.credential}:{source:'preserve-existing'},commands:[{kind:'internal',text:'Validar a revisão, resolver a credencial no servidor, testar SELECT 1 e salvar a conexão com senha cifrada no cofre do painel.'}],impact:'Cria/atualiza apenas a conexão salva. Não cria bancos/usuários, não redefine senhas e não publica portas.'};}
  const connection=value.connections.find(row=>row.id===data.id);if(!connection)fail('Conexão não encontrada.',404);
  return {action:data.action,executes:false,connection,commands:[{kind:'internal',text:data.action==='database.connection.test'?'Testar SELECT 1 com a credencial salva, sem revelar senha.':'Remover somente o cadastro da conexão salva.'}],impact:data.action==='database.connection.test'?'Não modifica dados dos bancos.':'Não remove bancos, usuários, arquivos ou cópias de backup.'};
 }
 async function execute(data,actor){
  await plan(data);
  if(data.action==='backup.configure'){const {values}=await backupValue(data);return databases.handle('/api/databases/'+data.engine+'/backup-settings','POST',{...values,expectedRevision:data.revision,beforeBackupApply:async()=>{await backupValue(data);}},actor);}
  if(data.action==='backup.run')return databases.handle('/api/databases/'+data.engine+'/backup-run','POST',{expectedRevision:data.revision,beforeBackupApply:async()=>{await plan(data);}},actor);
  let operation;operation=startOperation(data.action,async()=>{await plan(data);if(data.action==='database.connection.save'){const input=await connectionInput(data);await connections.test(input,actor);const result=await connections.save(input,actor);if(operation)operation.result=result;}
   else if(data.action==='database.connection.test'){const result=await connections.test({id:data.id},actor);if(operation)operation.result=result;}
   else await connections.remove({id:data.id,revision:data.revision},actor);
  });return {status:202,body:{operation}};
 }
 return {read,plan,execute};
}
