import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createSQLIntegration,sqlAction} from '../mcp-sql.mjs';
import {createSQLConsole} from '../sql-console.mjs';
import {createDatabaseConnections} from '../database-connections.mjs';
import {createIntegration} from '../integration.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(t,options={}){
 const root=await fs.mkdtemp('/tmp/jubart-mcp-sql-'),audits=[],queries=[],allowed=new Set(['owner','other']);let clock=Date.now(),blocked=false,runner=async input=>({columns:['id','id','value'],rows:[[1,2,null],[3,4,input.password]],affectedRows:0,returnedRows:2,durationMs:1});
 await fs.writeFile(root+'/.env','POSTGRES_USER=infra_admin\nPANEL_PASSWORD=private-environment-secret\n');const readEnv=()=>fs.readFile(root+'/.env','utf8');
 const audit=async event=>audits.push(event),connections=createDatabaseConnections({root,readEnv,audit,testConnection:async()=>{}});
 await connections.save({name:'MariaDB application',engine:'mariadb',database:'appdb',user:'appuser',password:'private-connection-secret',revision:(await connections.inspect()).revision},'admin');
 await connections.save({name:'PostgreSQL application',engine:'postgres',database:'appdb',user:'appuser',password:'private-postgres-secret',revision:(await connections.inspect()).revision},'admin');
 const sqlConsole=createSQLConsole({readEnv,databases:{handle:async()=>({body:{inventory:{databases:[{name:'appdb'}]}}})},audit,runner:async(input,config)=>{queries.push({input,config});return runner(input);}});
 const dependencies={root,connections,console:sqlConsole,readEnv,audit,sanitizeText:async value=>value.replaceAll('private-environment-secret','[oculto]'),authorize:async id=>allowed.has(id),canExecute:()=>!blocked,now:()=>clock,...options},api=createSQLIntegration(dependencies);
 const integration=createIntegration({root,keys:{audit},databaseConnections:connections,sqlConsole,clean:dependencies.sanitizeText,authorizeSQL:dependencies.authorize,canExecuteSQL:dependencies.canExecute,snapshot:async()=>({project:'test',services:[],volumes:[]}),loadConfig:async()=>({config:{applications:[]}})});
 const key={id:'owner',scopes:['read','execute'],actions:[sqlAction]};
 t.after(async()=>{while(sqlConsole.isBusy())await pause(5);await fs.rm(root,{recursive:true,force:true});});
 return {root,api,integration,key,connections,dependencies,audits,queries,allowed,sqlConsole,setRunner:value=>{runner=value;},block:value=>{blocked=value;},advance:ms=>{clock+=ms;},input:async(engine='mariadb',extra={})=>{const listing=await connections.inspect();return {connectionId:listing.connections.find(row=>row.engine===engine).id,revision:listing.revision,sql:'SELECT 1 AS UNIQUE_SQL_TEXT_SENTINEL;',requestId:randomUUID(),...extra};}};
}
test('MCP SQL: conexão salva, prévia sem execução, tabela posicional, redaction e recibos sem dados',async t=>{
 const f=await fixture(t),input=await f.input(),{requestId,...previewInput}=input;const plan=await f.api.plan(f.key,previewInput);assert.equal(plan.executes,false);assert.equal(plan.readOnly,true);assert.equal(plan.connection.database,'appdb');assert.equal(f.queries.length,0);assert.equal(JSON.stringify(plan).includes('UNIQUE_SQL_TEXT_SENTINEL'),false);
 const first=await f.api.execute(f.key,input);assert.equal(first.state,'success');assert.deepEqual(first.result.columns,['id','id','value']);assert.deepEqual(first.result.rows[0],[1,2,null]);assert.equal(first.result.rows[1][2],'[oculto]');assert.equal(f.queries[0].input.password,'private-connection-secret');assert.equal(f.queries[0].input.user,'appuser');assert.equal(f.queries[0].input.readOnly,true);assert.equal(first.readOnly,true);
 const retry=await f.api.execute(f.key,input);assert.equal(retry.queryId,first.queryId);assert.equal(f.queries.length,1);assert.deepEqual((await f.api.result(f.key,{queryId:first.queryId})).result,first.result);
 const file=await fs.readFile(f.root+'/.panel-state/mcp/sql-receipts.json','utf8');assert.equal(/UNIQUE_SQL_TEXT_SENTINEL|private-connection-secret|columns|rows/.test(file),false);assert.equal(JSON.stringify(f.audits).includes('UNIQUE_SQL_TEXT_SENTINEL'),false);assert.equal(JSON.stringify(f.audits).includes('private-connection-secret'),false);assert.equal((await fs.stat(f.root+'/.panel-state/mcp/sql-receipts.json')).mode&0o777,0o600);
});
test('MCP SQL: permissão explícita, somente connectionId/revisão e ownership de resultados',async t=>{
 const f=await fixture(t),input=await f.input();for(const key of [{...f.key,scopes:['read']},{...f.key,actions:['database.connection.save']}])await assert.rejects(f.api.execute(key,input),error=>error.status===403&&error.code==='MCP_PERMISSION_REQUIRED');
 for(const fields of [{password:'inline'},{host:'external'},{database:'another'},{user:'root'},{connectionId:'invalid'}])await assert.rejects(f.api.execute(f.key,{...input,...fields}),error=>error.status===400);
 assert.equal(f.queries.length,0);const result=await f.api.execute(f.key,input);await assert.rejects(f.api.result({...f.key,id:'other'},{queryId:result.queryId}),error=>error.status===404);await assert.rejects(f.api.execute(f.key,{...input,sql:'DELETE FROM sample'}),error=>error.status===409);
});
test('MCP SQL: resultado expira/reinicia sem repetir uma consulta aceita',async t=>{
 const f=await fixture(t);let writes=0;f.setRunner(async()=>{writes++;return {columns:[],rows:[],affectedRows:0,returnedRows:0};});const input=await f.input('postgres',{sql:"SELECT 'UNIQUE_SQL_TEXT_SENTINEL' AS value;"}),first=await f.api.execute(f.key,input);assert.equal(first.result.affectedRows,0);
 f.advance(300001);const expired=await f.api.execute(f.key,input);assert.equal(expired.resultAvailable,false);assert.equal(expired.state,'success');assert.equal(writes,1);
 const restarted=createSQLIntegration(f.dependencies);const old=await restarted.execute(f.key,input);assert.equal(old.queryId,first.queryId);assert.equal(old.resultAvailable,false);assert.equal(writes,1);
});
test('MCP SQL: erro preserva recibo e remove senha da resposta sem reexecutar',async t=>{
 const f=await fixture(t);f.setRunner(async input=>{throw Object.assign(new Error('Erro com '+input.password),{code:'SQL_ERROR'});});const input=await f.input(),first=await f.api.execute(f.key,input);assert.equal(first.state,'error');assert.equal(first.outcomeUncertain,true);assert.equal(JSON.stringify(first).includes('private-connection-secret'),false);await f.api.execute(f.key,input);assert.equal(f.queries.length,1);
 const listing=await f.connections.inspect();await f.connections.remove({id:input.connectionId,revision:listing.revision},'admin');await assert.rejects(f.api.execute(f.key,{...input,requestId:randomUUID()}),error=>error.status===409);assert.equal(f.queries.length,1);
});
test('MCP SQL: lote de consultas herda limites e para no primeiro erro',async t=>{
 const f=await fixture(t);f.setRunner(async input=>{if(input.sql.includes('missing_table'))throw Error('Erro do lote');return {columns:[],rows:[],returnedRows:0,affectedRows:0};});const input=await f.input('postgres',{batch:true,sql:'SELECT 1; SELECT * FROM missing_table; SELECT 2;'}),result=await f.api.execute(f.key,input);assert.equal(result.state,'error');assert.equal(result.result.executed,2);assert.equal(result.result.stopped,true);assert.equal(result.result.results[0].result.affectedRows,0);assert.equal(f.queries.length,2);await f.api.execute(f.key,input);assert.equal(f.queries.length,2);
});
test('MCP SQL: execução em andamento pertence à chave, não duplica e bloqueia outra intenção',async t=>{
 const f=await fixture(t);let release;f.setRunner(()=>new Promise(resolve=>{release=resolve;}));const input=await f.input(),pending=f.api.execute(f.key,input);for(let i=0;i<100&&!release;i++)await pause(2);assert.ok(release);
 const record=Object.values(JSON.parse(await fs.readFile(f.root+'/.panel-state/mcp/sql-receipts.json','utf8')).receipts)[0];assert.equal((await f.api.result(f.key,{queryId:record.queryId})).state,'running');const repeated=f.api.execute(f.key,input);
 await assert.rejects(f.api.execute(f.key,{...input,requestId:randomUUID()}),error=>error.status===409);release({columns:['a'],rows:[[1]],returnedRows:1,affectedRows:0});assert.equal((await pending).queryId,(await repeated).queryId);assert.equal(f.queries.length,1);
});
test('MCP SQL: revogação durante a execução impede devolver/cachear linhas',async t=>{
 const f=await fixture(t);let release;f.setRunner(()=>new Promise(resolve=>{release=resolve;}));const input=await f.input(),pending=f.api.execute(f.key,input);for(let i=0;i<100&&!release;i++)await pause(2);f.allowed.delete('owner');release({columns:['secret'],rows:[['private-result']],returnedRows:1});await assert.rejects(pending,error=>error.status===403);f.allowed.add('owner');const retry=await f.api.execute(f.key,input);assert.equal(retry.resultAvailable,false);assert.equal(JSON.stringify(retry).includes('private-result'),false);assert.equal(f.queries.length,1);
});
test('MCP SQL: infra_execute usa o mesmo executor sem persistir linhas no histórico genérico',async t=>{
 const f=await fixture(t),input=await f.input(),{requestId,...fields}=input,operation={action:sqlAction,...fields};const listing=await f.integration.read(f.key,{resource:'database-connections'});assert.equal(listing.sql.allowed,true);assert.equal((await f.integration.read({...f.key,scopes:['read'],actions:[]},{resource:'database-connections'})).sql.allowed,false);
 const preview=await f.integration.plan(f.key,{operation});assert.equal(preview.executes,false);const result=await f.integration.execute(f.key,{requestId,operation});assert.equal(result.state,'success');assert.equal((await f.integration.operation(f.key,result.queryId)).result.rows.length,2);await assert.rejects(fs.stat(f.root+'/.panel-state/mcp/receipts.json'),error=>error.code==='ENOENT');
});

test('MCP SQL: rejeita alterações na prévia, execução direta, lote inteiro e infra_execute antes do runner',async t=>{
 const f=await fixture(t);
 for(const engine of ['mariadb','postgres'])for(const sql of ['UPDATE sample SET value=1','DELETE FROM sample','CREATE TABLE sample (id INT)','SELECT 1; DELETE FROM sample', 'WITH removed AS (DELETE FROM sample RETURNING *) SELECT * FROM removed', 'SELECT custom_writer()', 'EXPLAIN ANALYZE SELECT 1']){
  const input=await f.input(engine,{sql,batch:true}),{requestId,...preview}=input;
  await assert.rejects(f.api.plan(f.key,preview),e=>e.code==='SQL_READ_ONLY');
  await assert.rejects(f.api.execute(f.key,input),e=>e.code==='SQL_READ_ONLY');
  await assert.rejects(f.integration.execute(f.key,{requestId,operation:{action:sqlAction,...preview}}),e=>e.code==='SQL_READ_ONLY');
 }
 assert.equal(f.queries.length,0);
 const input=await f.input('postgres',{batch:true,sql:'SELECT 1; SELECT 2;'});assert.equal((await f.api.execute(f.key,input)).state,'success');assert.equal(f.queries.length,2);assert.ok(f.queries.every(query=>query.input.readOnly===true));
});
