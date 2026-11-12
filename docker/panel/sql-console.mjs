import {splitSQL} from './sql-statements.mjs';
import {createHash} from 'node:crypto';
import mysql from 'mysql2';
import pg from 'pg';
import {identifier,protectAccount,protectDatabase,createVault} from './databases.mjs';
import {databaseEnabled,parseEnv} from './core.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const SQL_LIMITS=Object.freeze({rows:500,columns:100,bytes:1024*1024,cell:8192,sqlBytes:64*1024,timeoutMs:15000});
export function validateSQLInput(engine,data,env={}){
 if(!['mariadb','postgres'].includes(engine))throw fail('SGBD inválido.');
 if(!databaseEnabled(env,engine))throw fail('Banco desativado no .env da infraestrutura.',409);
 protectDatabase(data.database);protectAccount(engine,data.user,env.POSTGRES_USER||'infra_admin');
 if(typeof data.password!=='string'||!data.password||data.password.length>256||/[\0\r\n]/.test(data.password))throw fail('Informe a senha de um usuário do banco.');
 if(typeof data.sql!=='string'||!data.sql.trim()||Buffer.byteLength(data.sql)>SQL_LIMITS.sqlBytes||data.sql.includes('\0'))throw fail('Informe SQL válido, com no máximo 64 KiB.');
 return {engine,database:identifier(data.database),user:identifier(data.user),password:data.password,sql:data.sql};
}
export function createResultCollector(limits=SQL_LIMITS){
 const result={columns:[],rows:[],affectedRows:0,truncated:false,cellTruncated:false,limits};let bytes=0,fieldsSeen=false;
 return {result,fields(names){if(fieldsSeen)throw fail('Procedimentos com múltiplos resultados não são suportados. Execute uma instrução por vez.');fieldsSeen=true;if(names.length>limits.columns)throw fail('Resultado possui colunas demais. Selecione até '+limits.columns+' colunas.');result.columns=names.map(String);},row(values){
  if(result.rows.length>=limits.rows){result.truncated=true;return false;}
  const row=values.map(value=>{if(value===null||value===undefined)return null;if(Buffer.isBuffer(value))value='0x'+value.toString('hex');else if(value instanceof Date)value=value.toISOString();else if(typeof value==='bigint')value=String(value);else if(typeof value==='object')value=JSON.stringify(value);if(typeof value==='string'&&Buffer.byteLength(value)>limits.cell){result.cellTruncated=true;return Buffer.from(value).subarray(0,limits.cell).toString('utf8')+'…';}return value;});
  const size=Buffer.byteLength(JSON.stringify(row));if(bytes+size>limits.bytes){result.truncated=true;return false;}bytes+=size;result.rows.push(row);return true;
 }};
}
const mysqlQuery=(connection,sql)=>new Promise((resolve,reject)=>connection.query(sql,(err,rows)=>err?reject(err):resolve(rows)));
export async function runSQL(input,{mysqlFactory=mysql.createConnection,pgFactory=options=>new pg.Client(options),limits=SQL_LIMITS}={}){
 const collector=createResultCollector(limits);let connection,timer,settled=false;
 const common={host:input.engine,port:input.engine==='mariadb'?3306:5432,user:input.user,password:input.password,database:input.database};
 const started=Date.now();
 try{
  return await new Promise(async(resolve,reject)=>{
   const finish=(error,partial=false)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)return reject(error);resolve({...collector.result,durationMs:Date.now()-started,returnedRows:collector.result.rows.length,partial});};
   const stop=()=>{if(input.engine==='mariadb')connection?.destroy();else connection?.end().catch(()=>{});};
   timer=setTimeout(()=>{stop();finish(fail('Tempo limite de 15 segundos excedido. A execução pode ter produzido alterações parciais; confira o banco antes de repetir.'));},limits.timeoutMs);
   try{
    if(input.engine==='mariadb'){
     connection=mysqlFactory({...common,connectTimeout:5000,multipleStatements:false,rowsAsArray:true,supportBigNumbers:true,bigNumberStrings:true,dateStrings:true});connection.on('error',err=>finish(err));
     const grants=await mysqlQuery(connection,'SHOW GRANTS FOR CURRENT_USER()');
     for(const row of grants){const grant=String(Array.isArray(row)?row[0]:Object.values(row)[0]);if(!/^GRANT USAGE ON /i.test(grant)&&(/ ON \*\.\*/i.test(grant)||! / ON /i.test(grant)))throw fail('Use uma conta de aplicação sem privilégios globais ou roles administrativas.');}
     await mysqlQuery(connection,'SET SESSION max_statement_time=15, lock_wait_timeout=5');if(settled)return;
     const query=connection.query(input.sql);
     query.on('fields',fields=>{try{collector.fields(fields.map(f=>f.name));}catch(e){stop();finish(e);}});
     query.on('result',row=>{if(settled)return;if(Array.isArray(row)){if(!collector.row(row)){stop();finish(null,true);}}else collector.result.affectedRows=Number(row.affectedRows||0);});
     query.on('error',error=>finish(error));query.on('end',()=>finish());
    }else{
     connection=pgFactory({...common,connectionTimeoutMillis:5000,statement_timeout:15000,lock_timeout:5000,query_timeout:17000,application_name:'jubart-sql'});connection.on('error',error=>finish(error));await connection.connect();
     const role=await connection.query("SELECT rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls, pg_has_role(current_user,'pg_read_server_files','MEMBER') OR pg_has_role(current_user,'pg_write_server_files','MEMBER') OR pg_has_role(current_user,'pg_execute_server_program','MEMBER') AS server_access FROM pg_roles WHERE rolname=current_user");
     if(!role.rows[0]||Object.values(role.rows[0]).some(v=>v===true))throw fail('Use uma conta de aplicação sem privilégios administrativos ou acesso a arquivos/programas do servidor.');if(settled)return;
     const query=new pg.Query({text:input.sql,rowMode:'array',queryMode:'extended'});let pgFields=false;
     query.on('row',(row,result)=>{if(settled)return;try{if(!pgFields){collector.fields(result.fields.map(f=>f.name));pgFields=true;}if(!collector.row(row)){stop();finish(null,true);}}catch(e){stop();finish(e);}});
     query.on('error',error=>finish(error));query.on('end',result=>{if(settled)return;try{if(!pgFields&&result.fields?.length)collector.fields(result.fields.map(f=>f.name));collector.result.affectedRows=result.command==='SELECT'?0:Number(result.rowCount||0);finish();}catch(e){finish(e);}});
     connection.query(query);
    }
   }catch(e){finish(e);}
  });
 }finally{clearTimeout(timer);if(input.engine==='mariadb')connection?.destroy();else await connection?.end().catch(()=>{});}
}
export function createSQLConsole({root,readEnv,databases,audit,runner=runSQL,canExecute=()=>true}){
 let busy=false;const vault=root?createVault(root,readEnv):null;
 async function context(engine,database){
  const env=parseEnv(await readEnv());if(!['mariadb','postgres'].includes(engine)||!databaseEnabled(env,engine))throw fail('SGBD indisponível.',409);protectDatabase(database);
  const result=await databases.handle(`/api/databases/${engine}`,'GET',{}),inventory=result.body.inventory;
  if(!inventory?.databases.some(d=>d.name===database))throw fail('Banco não encontrado ou indisponível.');
  const candidates=[];const allowed=user=>{try{protectAccount(engine,user,env.POSTGRES_USER||'infra_admin');return true;}catch{return false;}};
  if(engine==='mariadb'){
   const prefixes=['DB',...Object.keys(env).filter(k=>/^APP_[0-9]+_DB_DATABASE$/.test(k)).map(k=>k.slice(0,-9))];
   for(const prefix of prefixes)if(env[prefix+'_DATABASE']===database&&env[prefix+'_PASSWORD']&&allowed(env[prefix+'_USERNAME']))candidates.push({id:'env:'+prefix,user:env[prefix+'_USERNAME'],source:'env',label:env[prefix+'_USERNAME']+' · .env da infraestrutura',prefix});
  }
  for(const user of inventory.users||[]){
   if(user.admin||user.locked||!user.knownPassword||!allowed(user.name))continue;
   const host=engine==='mariadb'?user.host:'network';
   const granted=(inventory.grants||[]).some(g=>g.database===database&&(engine==='postgres'?g.user===user.name:g.grantee===`'${user.name}'@'${host}'`||g.user===user.name&&(!g.host||g.host===host)));
   if(granted&&vault)candidates.push({id:'vault:'+user.name+':'+host,user:user.name,host,source:'vault',label:user.name+' · senha registrada no painel'});
  }
  return {env,inventory,candidates};
 }
 async function resolveCredentials(engine,data){
 const ctx=await context(engine,data.database);let credentials=data;
   if(data.credentialId&&data.credentialId!=='manual'){
    const option=ctx.candidates.find(c=>c.id===data.credentialId);if(!option)throw fail('Credencial automática indisponível. Atualize as conexões ou informe outra conta.');
    const password=option.source==='env'?ctx.env[option.prefix+'_PASSWORD']:(await vault.reveal(engine,option.user,option.host)).password;
    credentials={...data,user:option.user,password};
   }
   return {credentials,env:ctx.env};
 }
 return {isBusy:()=>busy,resolveCredentials,async connect(engine,data,actor){await this.execute(engine,{...data,sql:'SELECT 1 AS connected;',batch:false},actor);return {connected:true};},async connections(engine,database){const {candidates}=await context(engine,database);return {connections:candidates.map(({prefix,...option})=>option)};},async execute(engine,data,actor){
  if(!canExecute())throw fail('Painel em manutenção. Aguarde a operação terminar.',409);if(busy)throw fail('Já existe uma consulta SQL em execução. Aguarde.',409);busy=true;
  let meta;
  try{
   if(data.credentialId&&data.credentialId!=='manual')throw fail('Digite usuário e senha para acessar o console SQL.');
   const {env}=await context(engine,data.database);const credentials=data;
   const input=validateSQLInput(engine,credentials,env);
   if(data.batch){const statements=splitSQL(input.sql,engine),results=[],started=Date.now();let rows=0,bytes=0,stopped=false;
    for(let i=0;i<statements.length;i++){const remaining=30000-(Date.now()-started);if(remaining<=0||rows>=SQL_LIMITS.rows||bytes>=SQL_LIMITS.bytes){stopped=true;break;}const meta={actor,event:'sql.execute',engine,database:input.database,user:input.user,statement:i+1,sqlHash:createHash('sha256').update(statements[i]).digest('hex')};await audit({...meta,result:'requested'});
     try{const result=await runner({...input,sql:statements[i]},{limits:{...SQL_LIMITS,rows:SQL_LIMITS.rows-rows,bytes:SQL_LIMITS.bytes-bytes,timeoutMs:Math.min(SQL_LIMITS.timeoutMs,remaining)}});rows+=result.returnedRows||0;bytes+=Buffer.byteLength(JSON.stringify(result));results.push({index:i+1,state:'success',result});await audit({...meta,result:'success',returnedRows:result.returnedRows,affectedRows:result.affectedRows});if(result.partial||result.truncated){stopped=true;break;}}
     catch(error){const message=String(error.sqlMessage||error.message||'Falha SQL').split(input.password).join('[oculto]').slice(0,1500);results.push({index:i+1,state:'error',error:message});await audit({...meta,result:'failed',code:String(error.code||'SQL_ERROR').slice(0,80)});stopped=true;break;}
    }
    return {batch:true,results,total:statements.length,executed:results.length,stopped,durationMs:Date.now()-started,note:'Instruções executadas em sequência, em conexões independentes. Interrompe no primeiro erro ou limite. Alterações anteriores não são desfeitas.'};
   }
   meta={actor,event:'sql.execute',engine,database:input.database,user:input.user,sqlHash:createHash('sha256').update(input.sql).digest('hex')};await audit({...meta,result:'requested'});
   try{const result=await runner(input);await audit({...meta,result:'success',returnedRows:result.returnedRows,affectedRows:result.affectedRows,durationMs:result.durationMs,truncated:result.truncated});return result;}
   catch(error){await audit({...meta,result:'failed',code:String(error.code||'SQL_ERROR').slice(0,80)});const message=String(error.sqlMessage||error.message||'Falha SQL').split(input.password).join('[oculto]').slice(0,1500);throw fail(message);}
  }finally{busy=false;}
 }};
}
