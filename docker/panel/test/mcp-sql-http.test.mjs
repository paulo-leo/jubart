import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createPanel} from '../server.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
test('MCP SDK/REST: conexões do painel e SQL com permissão própria, revisão e resultados recuperáveis',async t=>{
 const root=await fs.mkdtemp('/tmp/jubart-mcp-sql-http-'),clients=[];await fs.writeFile(root+'/.env','APP_DOMAIN=localhost\nAPP_DIRECTORY=/projects/main\nPOSTGRES_USER=infra_admin\n');let executions=0;
 const executor=async(_,args,options)=>({stdout:args.includes('--format')?JSON.stringify({name:'test',services:{php:{},panel:{}}}):options?.input?.includes("'kind'")?JSON.stringify({kind:'database',name:'appdb'}):'{}'});
 const server=createPanel({root,username:'admin',password:'test-password-long-enough',executor,healthProbe:async()=>({status:'unknown'}),sqlRunner:async input=>{executions++;assert.equal(input.readOnly,true);assert.equal(input.user,'appuser');assert.equal(input.password,'temporary-connection-password');return {columns:['answer'],rows:[[42]],affectedRows:0,returnedRows:1,durationMs:1};}});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{for(const client of clients)await client.close();server.closeAllConnections();await server.shutdown();await fs.rm(root,{recursive:true,force:true});});const base='http://127.0.0.1:'+server.address().port;
 const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username:'admin',password:'test-password-long-enough'})}),session=await login.json(),headers={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrf};
 const post=(route,data)=>fetch(base+route,{method:'POST',headers,body:JSON.stringify(data)}),current=await(await fetch(base+'/api/database-connections',{headers})).json();const saved=await(await post('/api/database-connections/save',{name:'Shared panel connection',engine:'mariadb',database:'appdb',user:'appuser',password:'temporary-connection-password',revision:current.revision})).json();assert.ok(saved.connection.id);
 async function connect(scopes,actions){const response=await post('/api/mcp/keys',{name:'QA',scopes,actions,expiresInDays:1});assert.equal(response.status,201);const key=await response.json(),client=new Client({name:'qa',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+key.token}}}));clients.push(client);return {key,client};}
 const reader=await connect(['read'],[]),readTools=(await reader.client.listTools()).tools.map(tool=>tool.name);assert.ok(readTools.includes('jubart_database_connections'));assert.equal(readTools.includes('jubart_sql_execute'),false);
 const call=async(client,name,args)=>{const response=await client.callTool({name,arguments:args});assert.notEqual(response.isError,true,JSON.stringify(response));return JSON.parse(response.content[0].text);};
 const listed=await call(reader.client,'jubart_database_connections',{});assert.equal(listed.connections[0].id,saved.connection.id);assert.equal(listed.sql.allowed,false);assert.equal(JSON.stringify(listed).includes('temporary-connection-password'),false);assert.equal(executions,0);
 const writer=await connect(['read','execute'],['database.sql.execute']),writerTools=(await writer.client.listTools()).tools.map(tool=>tool.name);for(const name of ['jubart_sql_plan','jubart_sql_execute','jubart_sql_result'])assert.ok(writerTools.includes(name));
 const data=await call(writer.client,'jubart_database_connections',{}),input={connectionId:saved.connection.id,revision:data.revision,sql:'SELECT 42 AS answer',requestId:randomUUID()};
 const {requestId,...preview}=input;assert.equal((await call(writer.client,'jubart_sql_plan',preview)).executes,false);assert.equal(executions,0);
 const result=await call(writer.client,'jubart_sql_execute',input);assert.equal(result.state,'success');assert.deepEqual(result.result.rows,[[42]]);await call(writer.client,'jubart_sql_execute',input);assert.equal(executions,1);
 assert.deepEqual((await call(writer.client,'jubart_sql_result',{queryId:result.queryId})).result.rows,[[42]]);assert.deepEqual((await call(writer.client,'operation_status',{id:result.queryId})).result.rows,[[42]]);
 const denied=await reader.client.callTool({name:'jubart_sql_execute',arguments:input});assert.equal(denied.isError,true);
 const invalid=await writer.client.callTool({name:'jubart_sql_execute',arguments:{...input,requestId:randomUUID(),password:'forbidden'}});assert.equal(invalid.isError,true);assert.equal(executions,1);
 const rest=await fetch(base+'/api/ai/execute',{method:'PUT',headers:{Authorization:'Bearer '+writer.key.token},body:JSON.stringify({requestId,operation:{action:'database.sql.execute',...preview}})});assert.equal(rest.status,202);assert.equal((await rest.json()).queryId,result.queryId);assert.equal(executions,1);
 for(const sql of ['UPDATE sample SET value=1','SELECT 1; DELETE FROM sample','WITH d AS (DELETE FROM sample RETURNING *) SELECT * FROM d']){
  const invalidInput={...input,sql,batch:true,requestId:randomUUID()};
  assert.equal((await writer.client.callTool({name:'jubart_sql_execute',arguments:invalidInput})).isError,true);
  const {requestId,...operation}=invalidInput;const response=await fetch(base+'/api/ai/execute',{method:'PUT',headers:{Authorization:'Bearer '+writer.key.token},body:JSON.stringify({requestId,operation:{action:'database.sql.execute',...operation}})});assert.equal(response.status,400);
 }
 assert.equal(executions,1);
 const record=await fs.readFile(root+'/.panel-state/mcp/sql-receipts.json','utf8');assert.equal(/SELECT 42|temporary-connection-password|answer/.test(record),false);
});
