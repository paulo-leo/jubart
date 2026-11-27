// Opt-in: databases, data volumes and network are disposable; no production DB is queried.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
test('MCP SQL real: MariaDB/PostgreSQL por conexão salva somente leitura, escrita bloqueada e dados preservados',{
 skip:process.env.JUBART_SQL_DOCKER_QA!=='1',timeout:180000,
},async()=>{
 const execute=promisify(execFile),docker=async(args,timeout=30000)=>(await execute('docker',args,{timeout,maxBuffer:2*1024*1024})).stdout;
 const prefix='jubart-sql-qa-'+randomBytes(5).toString('hex'),network=prefix+'-net',root=await fs.mkdtemp('/tmp/'+prefix+'-'),source=path.resolve(import.meta.dirname,'..'),names=[prefix+'-mariadb',prefix+'-postgres'];let createdNetwork=false;
 try{
  const images={};for(const engine of ['mariadb','postgres']){const ids=(await docker(['ps','-q','--filter','label=com.docker.compose.project=laravel','--filter','label=com.docker.compose.service='+engine])).trim().split(/\s+/).filter(Boolean);assert.equal(ids.length,1,'Imagem local do '+engine+' necessária para o teste');images[engine]=JSON.parse(await docker(['inspect',ids[0]]))[0].Image;}
  const cli=(await fs.readFile(path.resolve(source,'../../config/cli-image'),'utf8')).trim();await docker(['image','inspect',cli]);await docker(['network','create','--internal',network]);createdNetwork=true;
  await docker(['run','-d','--pull=never','--name',names[0],'--network',network,'--network-alias','mariadb','--memory','384m','--pids-limit','256','--label','com.docker.compose.project='+prefix,'-e','MARIADB_ROOT_PASSWORD=DisposableRootPassword123','-e','MARIADB_DATABASE=appdb','-e','MARIADB_USER=appuser','-e','MARIADB_PASSWORD=DisposableAppPassword123',images.mariadb]);
  await docker(['run','-d','--pull=never','--name',names[1],'--network',network,'--network-alias','postgres','--memory','256m','--pids-limit','256','--label','com.docker.compose.project='+prefix,'-e','POSTGRES_USER=infra_admin','-e','POSTGRES_DB=appdb','-e','POSTGRES_PASSWORD=DisposableRootPassword123',images.postgres]);
  for(const [index,engine]of ['mariadb','postgres'].entries()){
   let ready=false;for(let attempt=0;attempt<150;attempt++){try{await docker(engine==='mariadb'?['exec','-e','MYSQL_PWD=DisposableAppPassword123',names[index],'mariadb','-u','appuser','appdb','-e','SELECT 1']:['exec',names[index],'pg_isready','-U','infra_admin','-d','appdb']);ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,200));}}assert.ok(ready,engine+' temporário não ficou pronto');
  }
  await docker(['exec',names[1],'psql','-U','infra_admin','-d','appdb','-v','ON_ERROR_STOP=1','-c',"CREATE USER appuser WITH PASSWORD 'DisposableAppPassword123'; GRANT CONNECT ON DATABASE appdb TO appuser; GRANT USAGE, CREATE ON SCHEMA public TO appuser;"]);
  const setup="CREATE TABLE mcp_sql_fixture (id INT PRIMARY KEY, value VARCHAR(100)); INSERT INTO mcp_sql_fixture VALUES (1, 'fixture-sql-literal');";
  await docker(['exec','-e','MYSQL_PWD=DisposableRootPassword123',names[0],'mariadb','-u','root','appdb','-e',setup]);
  await docker(['exec',names[1],'psql','-U','infra_admin','-d','appdb','-v','ON_ERROR_STOP=1','-c',setup+" GRANT ALL ON mcp_sql_fixture TO appuser; CREATE FUNCTION mcp_write_probe() RETURNS INT LANGUAGE plpgsql AS $$ BEGIN UPDATE mcp_sql_fixture SET value='changed'; RETURN 1; END; $$; CREATE VIEW mcp_write_view AS SELECT mcp_write_probe() AS value; GRANT SELECT ON mcp_write_view TO appuser;"]);
  await docker(['exec','-e','MYSQL_PWD=DisposableRootPassword123',names[0],'mariadb','-u','root','appdb','--delimiter=//','-e',"CREATE FUNCTION mcp_write_probe() RETURNS INT MODIFIES SQL DATA BEGIN UPDATE mcp_sql_fixture SET value='changed'; RETURN 1; END// CREATE VIEW mcp_write_view AS SELECT mcp_write_probe() AS value//"]);
  const script=String.raw`
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';
import {createDatabaseConnections} from '/source/database-connections.mjs';import {createSQLConsole} from '/source/sql-console.mjs';import {createSQLIntegration,sqlAction} from '/source/mcp-sql.mjs';
const root=process.env.QA_ROOT,readEnv=async()=>'POSTGRES_USER=infra_admin\n',audit=[];
const connections=createDatabaseConnections({root,readEnv,audit:async event=>audit.push(event),testConnection:async()=>{}}),sqlConsole=createSQLConsole({readEnv,audit:async event=>audit.push(event),databases:{handle:async()=>({body:{inventory:{databases:[{name:'appdb'}]}}})}}),api=createSQLIntegration({root,connections,console:sqlConsole,readEnv,audit:async event=>audit.push(event)}),key={id:'qa',scopes:['read','execute'],actions:[sqlAction]};
for(const engine of ['mariadb','postgres']){
 await connections.save({name:engine,engine,database:'appdb',user:'appuser',password:'DisposableAppPassword123',revision:(await connections.inspect()).revision},'qa');
 const listing=await connections.inspect(),connection=listing.connections.find(row=>row.engine===engine);const input=sql=>({connectionId:connection.id,revision:listing.revision,sql,requestId:randomUUID()});
 const execute=async data=>{const value=await api.execute(key,data);assert.equal(value.state,'success',JSON.stringify(value.error||value.result));return value;};
 const data=input('SELECT id, value FROM mcp_sql_fixture ORDER BY id');const {requestId,...preview}=data;assert.equal((await api.plan(key,preview)).readOnly,true);
 const selected=await execute(data);assert.deepEqual(selected.result.rows,[[1,'fixture-sql-literal']]);assert.equal(selected.readOnly,true);assert.equal((await execute(data)).queryId,selected.queryId);
 for(const sql of ['CREATE TABLE forbidden (id INT)',"INSERT INTO mcp_sql_fixture VALUES (2, 'forbidden')","UPDATE mcp_sql_fixture SET value='changed' WHERE id=1",'DELETE FROM mcp_sql_fixture','SELECT 1; DELETE FROM mcp_sql_fixture','WITH removed AS (DELETE FROM mcp_sql_fixture RETURNING *) SELECT * FROM removed','SELECT mcp_write_probe()']){
  await assert.rejects(api.execute(key,{...input(sql),batch:true}),error=>error.code==='SQL_READ_ONLY');
 }
 // The SQL text is an ordinary SELECT. A stored function hidden behind a view
 // still cannot write: the database READ ONLY transaction is enforced as well.
 const hidden=await api.execute(key,input('SELECT * FROM mcp_write_view'));assert.equal(hidden.state,'error');assert.match(hidden.error.message,/read.only|read only|read-only/i);
 const safe=await execute(input('SELECT id, value FROM mcp_sql_fixture ORDER BY id'));assert.deepEqual(safe.result.rows,[[1,'fixture-sql-literal']]);
 const batch=await execute({...input('SELECT id FROM mcp_sql_fixture; SELECT COUNT(*) FROM mcp_sql_fixture;'),batch:true});assert.equal(batch.result.executed,2);assert.deepEqual(batch.result.results[0].result.rows,[[1]]);
 if(engine==='mariadb'){const schemas=await execute(input('SHOW DATABASES'));assert.ok(schemas.result.rows.some(row=>row[0]==='appdb'));await execute(input('DESCRIBE mcp_sql_fixture'));}
 else {const mode=await execute(input('SHOW transaction_read_only'));assert.deepEqual(mode.result.rows,[['on']]);}
 await execute(input('EXPLAIN SELECT * FROM mcp_sql_fixture'));
}
const receipts=await fs.readFile(root+'/.panel-state/mcp/sql-receipts.json','utf8');assert.equal(/fixture-sql-literal|DisposableAppPassword123|CREATE TABLE|INSERT INTO/.test(receipts),false);assert.equal(/fixture-sql-literal|DisposableAppPassword123/.test(JSON.stringify(audit)),false);console.log('MariaDB e PostgreSQL: consultas, idempotência validados e escritas bloqueadas, inclusive por função em view; dados preservados em bancos descartáveis.');
`;
  await fs.writeFile(root+'/qa.mjs',script);const output=await docker(['run','--rm','--pull=never','--network',network,'--memory','128m','--pids-limit','64','--cap-drop=ALL','--security-opt=no-new-privileges:true','--user',`${process.getuid?.()??0}:${process.getgid?.()??0}`,'--mount',`type=bind,src=${source},dst=/source,readonly`,'--mount',`type=bind,src=${root},dst=${root}`,'-e','QA_ROOT='+root,'--entrypoint','node',cli,root+'/qa.mjs'],90000);assert.match(output,/idempotência validados/);
 }finally{for(const name of names)await docker(['rm','-f','-v',name]).catch(()=>{});if(createdNetwork)await docker(['network','rm',network]).catch(()=>{});await fs.rm(root,{recursive:true,force:true});}
});
