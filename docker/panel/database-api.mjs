import {createHash} from 'node:crypto';
import {preparePasswordSync} from './database-password-sync.mjs';
import path from 'node:path';
import fs from 'node:fs/promises';
import { parseEnv, atomicWrite, databaseEnabled } from './core.mjs';
import { engines, identifier, accountHost, protectAccount, protectDatabase, passwordValue, createVault, createDatabaseSQL, createUserSQL, changePasswordSQL, lockSQL, accessSQL, mariaInventorySQL, pgInventorySQL, encryptPassword } from './databases.mjs';
export const backupRevision=text=>createHash('sha256').update(text).digest('hex');
const backupFields = ['enabled','directory','schedule','timezone','retentionDays','maxAgeHours','runOnStart','databases','remoteEnabled','remotePrefix','s3Provider','s3Bucket','s3Region','s3Endpoint','s3AccessKeyId','s3SecretAccessKey','s3EnvAuth'];
const suffixes = {enabled:'ENABLED',directory:'DIRECTORY',schedule:'SCHEDULE',timezone:'TIMEZONE',retentionDays:'RETENTION_DAYS',maxAgeHours:'MAX_AGE_HOURS',runOnStart:'RUN_ON_START',databases:'DATABASES',remoteEnabled:'REMOTE_ENABLED',remotePrefix:'REMOTE_PREFIX',s3Provider:'S3_PROVIDER',s3Bucket:'S3_BUCKET',s3Region:'S3_REGION',s3Endpoint:'S3_ENDPOINT',s3AccessKeyId:'S3_ACCESS_KEY_ID',s3SecretAccessKey:'S3_SECRET_ACCESS_KEY',s3EnvAuth:'S3_ENV_AUTH'};
export function validCron(expression) {
  if (typeof expression !== 'string') return false;
  const fields=expression.trim().split(/\s+/),limits=[[0,59],[0,23],[1,31],[1,12],[0,7]];
  return fields.length===5 && fields.every((field,index)=>field.split(',').every(part=>{
    const m=part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);if(!m || (m[2] && Number(m[2])<1))return false;
    if(m[1]==='*')return true;const [a,b=a]=m[1].split('-').map(Number);return a>=limits[index][0]&&b<=limits[index][1]&&a<=b;
  }));
}
export function backupConfig(env, engine) {
  const prefix=engine==='mariadb'?'BACKUP_':'PG_BACKUP_', result={};
  for(const key of backupFields){const value=env[prefix+suffixes[key]] || '';if(key==='s3AccessKeyId'||key==='s3SecretAccessKey'){result[key+'Configured']=!!value;continue;} result[key]=['enabled','runOnStart','remoteEnabled','s3EnvAuth'].includes(key)?value==='true':['retentionDays','maxAgeHours'].includes(key)?Number(value):value;}
  return result;
}
export function validateBackup(config,root) {
  if(!validCron(config.schedule))throw new Error('Use cron numérico com cinco campos válidos.');
  try{new Intl.DateTimeFormat('pt-BR',{timeZone:config.timezone});}catch{throw new Error('Fuso horário inválido.');}
  for(const key of ['enabled','runOnStart','remoteEnabled','s3EnvAuth'])if(typeof config[key]!=='boolean')throw new Error('Opção de backup inválida.');
  if(!Number.isInteger(config.retentionDays)||config.retentionDays<0||config.retentionDays>3650||!Number.isInteger(config.maxAgeHours)||config.maxAgeHours<1||config.maxAgeHours>87600)throw new Error('Retenção ou idade máxima inválida.');
  if(typeof config.directory!=='string'||!config.directory.trim()||config.directory.length>1024)throw new Error('Informe uma pasta de backup exclusiva.');
  const resolved=path.resolve(root,config.directory);
  if(resolved===root || resolved==='/' || /^\/(?:etc|proc|dev|sys)(?:\/|$)/.test(resolved)||resolved.startsWith('/var/lib/docker')||resolved.startsWith('/var/lib/postgresql'))throw new Error('Escolha uma pasta dedicada a backups, fora de diretórios de sistema/dados do banco.');
  if(config.databases!=='*')config.databases.split(',').forEach(identifier);
  if(config.remoteEnabled&&(!config.s3Bucket||!config.remotePrefix))throw new Error('Defina bucket e prefixo remoto exclusivo.');
  if(!['AWS','Other'].includes(config.s3Provider))throw new Error('Provedor S3 inválido.');
  if(config.s3Endpoint&&!/^https:\/\/[^\s]+$/.test(config.s3Endpoint))throw new Error('Use endpoint S3 HTTPS.');
  for(const key of backupFields)if(config[key]!==undefined&&(/[\x00-\x1f'\\$]/.test(String(config[key]))))throw new Error('Configuração contém caracteres não suportados.');
  return config;
}
export function createDatabaseAPI({root,compose,readEnv,startOperation,composeConfig=async()=>({services:{}}),syncConnections=async()=>{},saveConnection}){
  const vault=createVault(root,readEnv);
  const backupService=engine=>engine==='mariadb'?'backup':'backup-postgres';
  async function sql(engine,query){
    try {
      const command=engine==='mariadb'?'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb --user=root --batch --raw --skip-column-names':'PGPASSWORD="$POSTGRES_PASSWORD" exec psql --host=127.0.0.1 --username="$POSTGRES_USER" --dbname=postgres --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1';
      return await compose(['exec','-T',engine,'sh','-c',command],undefined,{input:query,timeout:20000,maxBuffer:4*1024*1024});
    } catch {throw new Error('O banco recusou a operação ou não está disponível. Confira estado, nomes e permissões. Nenhum banco ou volume foi removido.');}
  }
  async function inventory(engine){
    const rows=(await sql(engine,engine==='mariadb'?mariaInventorySQL:pgInventorySQL)).trim().split('\n').filter(Boolean).map(row=>JSON.parse(row));
    const users=[];
    for(const row of rows.filter(r=>r.kind==='user'))users.push({...row,locked:row.locked===true||row.locked===1||row.locked==='1'||row.locked==='true',admin:row.admin===true||row.admin===1,knownPassword:await vault.has(engine,row.name,row.host)});
    return {databases:rows.filter(r=>r.kind==='database'),users,grants:rows.filter(r=>r.kind==='grant')};
  }
  async function verifyUser(engine,user,host){
    const env=parseEnv(await readEnv());protectAccount(engine,user,env.POSTGRES_USER || 'infra_admin');
    const found=(await inventory(engine)).users.find(u=>u.name===user&&(engine==='postgres'||u.host===host));
    if(!found||found.admin)throw new Error('Conta inexistente ou administrativa/protegida.');
  }
  async function handle(route,method,data,actor){
    const match=route.match(/^\/api\/databases\/(mariadb|postgres)(?:\/(setup-access|create-database|create-user|password|lock|unlock|grant|revoke|reveal|backup-settings|backup-run|backup-delete))?$/);
    if(!match)return {status:404,body:{error:'Operação de banco não encontrada.'}};
    const [,engine,action]=match;
    if (!databaseEnabled(parseEnv(await readEnv()), engine)) return {status:409,body:{error:'Banco desativado no .env da infraestrutura. Habilite '+(engine==='mariadb'?'MARIADB_ENABLED':'POSTGRES_ENABLED')+' para administrá-lo.'}};
    if(method==='GET'&&!action){
      const env=parseEnv(await readEnv());let list=null,error=null,status=null,statusError=null;
      try{list=await inventory(engine);}catch(e){error=e.message;}
      try{status=JSON.parse(await compose(['exec','-T',backupService(engine),'python3','/opt/backup/backup.py','status'],undefined,{timeout:10000}));}catch{statusError='Serviço de backup ainda não iniciado ou não atualizado.';}
      return {status:200,body:{engine,inventory:list,inventoryError:error,backup:backupConfig(env,engine),backupStatus:status,backupStatusError:statusError,connection:{host:engine,port:engine==='mariadb'?3306:5432,published:true,bindAddress:env[engine==='mariadb'?'MARIADB_BIND_ADDRESS':'POSTGRES_BIND_ADDRESS']||'127.0.0.1',hostPort:Number(env[engine==='mariadb'?'MARIADB_PORT':'POSTGRES_PORT']||(engine==='mariadb'?3306:5432)),defaultStorageEngine:engine==='mariadb'?(env.MARIADB_DEFAULT_STORAGE_ENGINE||'InnoDB'):null}}};
    }
    if(method!=='POST')return {status:405,body:{error:'Use POST para operações de banco.'}};
    if(action==='setup-access'){
      if(!saveConnection)throw new Error('Cadastro de conexões indisponível. Atualize o painel.');
      const env=parseEnv(await readEnv()),database=identifier(data.database),user=identifier(data.user),host=engine==='mariadb'?'%':'network';
      protectDatabase(database);protectAccount(engine,user,env.POSTGRES_USER||'infra_admin');
      const password=passwordValue(data.password),permission=data.permission||'readwrite';
      encryptPassword(password,env.PANEL_VAULT_KEY);
      const create=createUserSQL(engine,user,host,password),grant=accessSQL(engine,user,host,database,permission);
      const name=`${engine==='postgres'?'PostgreSQL':'MariaDB'} · ${database} · ${user}`.slice(0,80);
      const check=async()=>{
        const list=await inventory(engine);
        if(!list.databases.some(d=>d.name===database))throw new Error('Banco não encontrado. Atualize a listagem.');
        if(list.users.some(u=>u.name===user&&(engine==='postgres'||u.host===host)))throw new Error('Esta conta já existe. Use Permissões por banco ou Redefinir senha; escolha outro nome para criar um acesso separado.');
      };
      await check();
      return {status:202,body:{operation:startOperation(`Configurar acesso · ${engine} · ${database}`,async()=>{
        await check();
        await sql(engine,create);
        try{await vault.save(engine,user,host,password);}catch{throw new Error('Conta criada, mas a senha não pôde ser guardada. Redefina a senha em Usuários antes de continuar.');}
        try{await sql(engine,grant);}catch{throw new Error('Conta criada e senha guardada no cofre, mas as permissões não foram concluídas. Revise em Usuários → Permissões por banco antes de tentar novamente.');}
        try{await saveConnection({name,engine,database,user,password},actor);}catch{throw new Error('Conta criada, senha guardada e permissões concedidas. O teste/cadastro da conexão falhou. Confira a disponibilidade e cadastre a conexão em Dados → Conexões; a senha está em Usuários.');}
      })}};
    }
    if(action==='backup-delete'){
      if(typeof data.name!=='string'||data.name.length>255||!new RegExp(`^${engine}-[A-Za-z0-9_.-]+\\.sql\\.gz$`).test(data.name)||data.name.includes('..'))throw new Error('Nome de backup inválido.');
      return {status:202,body:{operation:startOperation(`Excluir backup local · ${engine}`,()=>compose(['exec','-T',backupService(engine),'python3','/opt/backup/backup.py','delete',data.name],undefined,{timeout:10000}))}};
    }
    if(action==='backup-run')return {status:202,body:{operation:startOperation(`Backup imediato · ${engine}`,async()=>{if(data.expectedRevision&&backupRevision(await readEnv())!==data.expectedRevision)throw Object.assign(new Error('Configuração de backup alterada. Gere uma nova prévia.'),{status:409});if(typeof data.beforeBackupApply==='function')await data.beforeBackupApply();await compose(['run','--rm','--no-deps',backupService(engine),'once'],undefined,{timeout:1800000});})}};
    if(action==='backup-settings'){
      const before=await readEnv();if(data.expectedRevision&&backupRevision(before)!==data.expectedRevision)throw Object.assign(new Error('Configuração de backup alterada. Gere uma nova prévia.'),{status:409});const env=parseEnv(before);const config={...backupConfig(env,engine),...data};validateBackup(config,root);
      const prefix=engine==='mariadb'?'BACKUP_':'PG_BACKUP_',values={};
      for(const field of backupFields){if((field==='s3AccessKeyId'||field==='s3SecretAccessKey')&&!data[field])continue;values[prefix+suffixes[field]]=String(config[field]);}
      return {status:202,body:{operation:startOperation(`Configurar backup · ${engine}`,async()=>{
        const old=await readEnv();if(data.expectedRevision&&backupRevision(old)!==data.expectedRevision)throw Object.assign(new Error('Configuração de backup alterada. Gere uma nova prévia.'),{status:409});if(typeof data.beforeBackupApply==='function')await data.beforeBackupApply();const remaining=new Set(Object.keys(values));let next=old.split('\n').map(line=>{const name=line.split('=',1)[0];if(!Object.hasOwn(values,name))return line;remaining.delete(name);return `${name}='${values[name]}'`;}).join('\n');
        for(const key of remaining)next+=`\n${key}='${values[key]}'`;
        const staged=path.join(root,'.env.panel-staged');try{await atomicWrite(staged,next);await compose(['config','--quiet'],staged);}finally{await fs.unlink(staged).catch(()=>{});}
        await fs.mkdir(path.join(root,'.panel-state'),{recursive:true,mode:0o700});await atomicWrite(path.join(root,'.panel-state/env-before-backup-settings'),old);
        if(await readEnv()!==old)throw new Error('.env alterado durante validação. Tente novamente.');
        await atomicWrite(path.join(root,'.env'),next);
        await compose(['up','-d','--no-deps','--force-recreate',backupService(engine)]);
      })}};
    }
    if(action==='create-database'){
      const query=createDatabaseSQL(engine,data.database);
      return {status:202,body:{operation:startOperation(`Criar banco · ${engine}`,()=>sql(engine,query))}};
    }
    if(!['create-user','password','lock','unlock','grant','revoke','reveal'].includes(action))return {status:404,body:{error:'Operação não disponível.'}};
    const user=identifier(data.user),host=engine==='mariadb'?accountHost(data.host):'network';
    const env=parseEnv(await readEnv());protectAccount(engine,user,env.POSTGRES_USER||'infra_admin');
    if(action==='reveal'){await verifyUser(engine,user,host);return {status:200,body:await vault.reveal(engine,user,host)};}
    let query,password;
    if(action==='create-user'||action==='password'){
      password=passwordValue(data.password);encryptPassword(password,env.PANEL_VAULT_KEY); // Falhar antes de alterar o banco se o cofre não estiver configurado.
      query=action==='create-user'?createUserSQL(engine,user,host,password):changePasswordSQL(engine,user,host,password);
    }else if(action==='lock'||action==='unlock')query=lockSQL(engine,user,host,action==='lock');
    else query=accessSQL(engine,user,host,data.database,data.permission||'readwrite',action==='revoke');
    return {status:202,body:{operation:startOperation(`${action} · ${engine}`,async()=>{
      if(action!=='create-user')await verifyUser(engine,user,host);
      const synchronize=action==='password'?await preparePasswordSync({root,readEnv,compose,composeConfig,engine,user,host,password}):null;
      await sql(engine,query);
      if(password)await vault.save(engine,user,host,password);
      if(synchronize){try{await syncConnections({engine,user,host,password});await synchronize();}catch{throw new Error('A senha foi alterada no banco, mas a sincronização das conexões/aplicações não foi concluída. Confira o .env e recrie os serviços afetados; não repita a troca sem revisar.');}}
    })}};
  }
  return {handle};
}
