import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createPanel} from '../server.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
test('MCP HTTP/SDK: descobre ferramentas por chave, mantém Bash entre chamadas e gerencia notificações',async t=>{
 const root=await fs.mkdtemp('/tmp/jubart-mcp-extended-http-'),input=[],clients=[];let closes=0;
 await fs.writeFile(root+'/.env','APP_DOMAIN=localhost\nAPP_DIRECTORY=/projects/main\nPANEL_VAULT_KEY='+ 'a'.repeat(64)+'\n');
 const container={Id:'a'.repeat(64),Name:'/test-php-1',Config:{Labels:{'com.docker.compose.project':'test','com.docker.compose.service':'php'}},State:{Status:'running',Running:true},Mounts:[]};
 const executor=async(_,args)=>({stdout:args.includes('config')&&args.includes('--format')?JSON.stringify({name:'test',services:{php:{image:'test'},panel:{}}}):args[0]==='ps'?container.Id:args[0]==='inspect'?JSON.stringify([container]):args[0]==='volume'?'':''});
 const engine={async open(){let data,exit;return {onData(fn){data=fn;},onExit(fn){exit=fn;},resume(){data(Buffer.from('container-ready> '));},write(value){input.push(value);data(Buffer.from(value));},async resize(){},async close(){closes++;exit();}};}};
 const server=createPanel({root,username:'admin',password:'test-password-long-enough',executor,terminalEngine:engine,healthProbe:async()=>({status:'unknown'}),webhookOptions:{transport:async()=>({statusCode:204,durationMs:1})}});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{for(const client of clients)await client.close();server.closeAllConnections();await server.shutdown();await new Promise(resolve=>setTimeout(resolve,150));await fs.rm(root,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username:'admin',password:'test-password-long-enough'})}),session=await login.json(),headers={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrf,'Content-Type':'application/json'};
 async function key(scopes,actions){const response=await fetch(base+'/api/mcp/keys',{method:'POST',headers,body:JSON.stringify({name:'Test',expiresInDays:1,scopes,actions})});assert.equal(response.status,201);return response.json();}
 async function connect(created){const client=new Client({name:'test',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+created.token}}}));clients.push(client);return client;}
 const reader=await connect(await key(['read'],[]));assert.equal((await reader.listTools()).tools.some(tool=>tool.name.startsWith('jubart_app_shell_')),false);
 const credentials=await key(['read','execute'],['terminal.container','notification.webhook.save','notification.webhook.test']),client=await connect(credentials);
 const tools=(await client.listTools()).tools;assert.equal(tools.filter(tool=>tool.name.startsWith('jubart_app_shell_')).length,5);assert.equal(tools.find(tool=>tool.name==='jubart_app_shell_input').inputSchema.required.includes('requestId'),true);
 const call=async(name,args)=>{const result=await client.callTool({name,arguments:args});assert.notEqual(result.isError,true,JSON.stringify(result));return JSON.parse(result.content[0].text);};
 const opened=await call('jubart_app_shell_open',{app:'main',requestId:randomUUID()});
 const text={sessionId:opened.sessionId,requestId:randomUUID(),data:'pwd\n'};await call('jubart_app_shell_input',text);await call('jubart_app_shell_input',text);assert.deepEqual(input,['pwd\n']);
 assert.match((await call('jubart_app_shell_read',{sessionId:opened.sessionId,cursor:0})).output,/container-ready> pwd/);
 const other=await connect(await key(['execute'],['terminal.container']));assert.equal((await other.callTool({name:'jubart_app_shell_read',arguments:{sessionId:opened.sessionId}})).isError,true);
 await call('jubart_app_shell_close',{sessionId:opened.sessionId});assert.equal(closes,1);
 const info=await call('infra_read',{resource:'notification-webhooks'}),operation={action:'notification.webhook.save',revision:info.revision,webhook:{name:'SDK test',enabled:false,events:['incident'],severities:['critical'],services:[],timeoutSeconds:5,maxAttempts:1,request:{url:'https://notify.example/endpoint',method:'POST',headers:[],query:{},bodyMode:'event',bodyTemplate:{},allowPrivateNetwork:false}}};
 assert.equal((await call('infra_plan',{operation})).executes,false);const receipt=await call('infra_execute',{requestId:randomUUID(),operation});let result;
 for(let i=0;i<40;i++){result=await call('operation_status',{id:receipt.operation.id});if(result.operation.state!=='running')break;await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(result.operation.state,'success');assert.equal((await call('infra_read',{resource:'notification-webhooks'})).webhooks.length,1);
 assert.equal((await fetch(base+'/api/ai/app-shell/open',{method:'POST',headers:{Authorization:'Bearer '+credentials.token},body:JSON.stringify({app:'main',requestId:randomUUID(),container:'foreign'})})).status,400);
 const next=await call('jubart_app_shell_open',{app:'main',requestId:randomUUID()});assert.equal(next.state,'open');
 assert.equal((await fetch(base+'/api/mcp/keys/'+credentials.key.id+'/revoke',{method:'POST',headers,body:'{}'})).status,200);
 assert.equal((await fetch(base+'/api/ai/app-shell/read',{method:'POST',headers:{Authorization:'Bearer '+credentials.token},body:JSON.stringify({sessionId:next.sessionId})})).status,401);
});
