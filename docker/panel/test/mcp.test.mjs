import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createPanel} from '../server.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
test('MCP/REST: autenticação, escopos, allowlist, idempotência, auditoria e revogação',async t=>{
 const root=await fs.mkdtemp('/tmp/infra-mcp-test-');await fs.writeFile(path.join(root,'.env'),'APP_DOMAIN=localhost\nAPP_DIRECTORY=/projects/main\nDB_PASSWORD=private-db-secret\n');const calls=[];
 const executor=async(_,args)=>{calls.push(args);if(args.includes('config')&&args.includes('--format'))return {stdout:JSON.stringify({name:'test',services:{php:{image:'php-test'},panel:{}}})};if(args[0]==='ps')return {stdout:''};if(args[0]==='volume')return {stdout:''};if(args.includes('logs'))return {stdout:'test private-db-secret'};return {stdout:'[]'};};
 const server=createPanel({root,username:'admin',password:'admin-password-at-least-16',executor});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await new Promise(r=>setTimeout(r,200));await fs.rm(root,{recursive:true,force:true});});const base=`http://127.0.0.1:${server.address().port}`;
 const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username:'admin',password:'admin-password-at-least-16'})}),csrf=(await login.json()).csrf,admin={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':csrf,'Content-Type':'application/json'};
 const create=async scopes=>{const response=await fetch(base+'/api/mcp/keys',{method:'POST',headers:admin,body:JSON.stringify({name:'test-key',scopes,actions:scopes.includes('execute')?['worker.register']:[],expiresInDays:1})});assert.equal(response.status,201);return response.json();};
 assert.equal((await fetch(base+'/api/mcp/keys',{method:'POST',headers:{Cookie:admin.Cookie},body:'{}'})).status,403);
 const read=await create(['read']),both=await create(['read','execute']);const bearer=token=>({Authorization:'Bearer '+token,'Content-Type':'application/json'});
 assert.equal((await fetch(base+'/api/ai/read?resource=containers',{headers:admin})).status,401);
 assert.equal((await fetch(base+'/api/ai/read?resource=containers',{headers:bearer(read.token)})).status,200);
 const state=await (await fetch(base+'/api/ai/read?resource=containers',{headers:bearer(read.token)})).json();assert.equal('config' in state,false);assert.equal('mounts' in state.services[0],false);
 const logs=await(await fetch(base+'/api/ai/read?resource=logs&service=php',{headers:bearer(read.token)})).json();assert.equal(JSON.stringify(logs).includes('private-db-secret'),false);
 assert.equal((await fetch(base+'/api/ai/read?resource=logs&service=unrelated',{headers:bearer(read.token)})).status,403);
 const mutation={requestId:randomUUID(),operation:{action:'worker.register',app:'main',queue:'emails',connection:'redis',tries:3,timeout:60,sleep:3,stopGrace:90}};
 assert.equal((await fetch(base+'/api/ai/execute',{method:'PUT',headers:bearer(read.token),body:JSON.stringify(mutation)})).status,403);
 assert.equal((await fetch(base+'/api/ai/execute',{method:'PUT',headers:bearer(both.token),body:JSON.stringify({requestId:randomUUID(),operation:{action:'service.exec',command:'rm -rf /'}})})).status,400);
 const first=await fetch(base+'/api/ai/execute',{method:'PUT',headers:bearer(both.token),body:JSON.stringify(mutation)});assert.equal(first.status,202);const receipt=await first.json();
 await new Promise(r=>setTimeout(r,200));const duplicate=await(await fetch(base+'/api/ai/execute',{method:'PUT',headers:bearer(both.token),body:JSON.stringify(mutation)})).json();assert.equal(duplicate.operation.id,receipt.operation.id);assert.equal(JSON.parse(await fs.readFile(path.join(root,'config/automation.json'),'utf8')).workers.length,1);
 const status=await(await fetch(base+'/api/ai/operations/'+receipt.operation.id,{headers:bearer(both.token)})).json();assert.equal(status.operation.state,'success');assert.equal((await fetch(base+'/api/ai/operations/'+receipt.operation.id,{headers:bearer(read.token)})).status,403);

 const registered=JSON.parse(await fs.readFile(path.join(root,'config/automation.json'),'utf8')).workers[0];
 assert.equal((await fetch(base+'/api/ai/execute',{method:'PUT',headers:bearer(both.token),body:JSON.stringify({requestId:randomUUID(),operation:{action:'worker.stop',id:registered.id}})})).status,403);
 assert.equal((await fetch(base+'/api/ai/execute',{method:'PUT',headers:bearer(both.token),body:JSON.stringify({...mutation,operation:{...mutation.operation,queue:'different'}})})).status,409);
 const client=new Client({name:'integration-test',version:'1.0.0'});await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:bearer(read.token)}}));const tools=await client.listTools();assert.ok(tools.tools.some(t=>t.name==='infra_read'));assert.equal(tools.tools.some(t=>t.name==='automation_execute'),false);const response=await client.callTool({name:'infra_read',arguments:{resource:'automation'}});assert.equal(response.isError,undefined);assert.ok(JSON.parse(response.content[0].text).workers.length===1);await client.close();
 const disk=await fs.readFile(path.join(root,'.panel-state/mcp/keys.json'),'utf8');assert.equal(disk.includes(read.token),false);const events=await(await fetch(base+'/api/mcp/audit',{headers:admin})).json();assert.ok(events.events.some(e=>e.event==='execution.finished'));assert.equal(JSON.stringify(events).includes(both.token),false);
 await fetch(base+`/api/mcp/keys/${read.key.id}/revoke`,{method:'POST',headers:admin,body:'{}'});assert.equal((await fetch(base+'/api/ai/read?resource=containers',{headers:bearer(read.token)})).status,401);

 const keyFile=path.join(root,'.panel-state/mcp/keys.json'),keyRows=JSON.parse(await fs.readFile(keyFile,'utf8'));keyRows.find(k=>k.id===both.key.id).expiresAt='2000-01-01T00:00:00.000Z';await fs.writeFile(keyFile,JSON.stringify(keyRows));assert.equal((await fetch(base+'/api/ai/read?resource=containers',{headers:bearer(both.token)})).status,401);
 assert.equal(calls.some(a=>a.includes('rm -rf /')),false);
});
