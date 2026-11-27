import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createIncidentWebhooks} from '../incident-webhooks.mjs';
import {defaultWebhookRequest} from '../webhook-http.mjs';
import {createIntegration} from '../integration.mjs';
import {notificationActions} from '../mcp-notifications.mjs';
async function fixture(t){
 const root=await fs.mkdtemp('/tmp/jubart-mcp-notifications-'),audits=[],tasks=[],sent=[];let current;
 await fs.mkdir(root+'/.panel-state/mcp',{recursive:true});await fs.writeFile(root+'/.env','PANEL_VAULT_KEY='+ 'a'.repeat(64)+'\nNOTIFICATION_PROVIDER_TOKEN=private-notification-secret\nPANEL_PASSWORD=private-admin-secret\n');
 const readEnv=()=>fs.readFile(root+'/.env','utf8');
 const webhooks=createIncidentWebhooks({root,readEnv,events:async()=>({sourceId:'test',sequence:0,events:[]}),transport:async(request,envelope,id)=>{sent.push({request,envelope,id});return {statusCode:204,durationMs:1};},audit:async value=>audits.push(value),pollMs:10});
 const startOperation=(label,work)=>{const op={id:randomUUID(),label,state:'running',startedAt:new Date().toISOString()};current=op;tasks.push((async()=>{try{await work();op.state='success';}catch(error){op.state='error';op.message=error.message;}})());return op;};
 const integration=createIntegration({root,keys:{audit:async value=>audits.push(value)},snapshot:async()=>({services:[],volumes:[],project:'test'}),loadConfig:async()=>({config:{applications:[]},revision:'config'}),clean:async value=>value,incidentWebhooks:webhooks,startOperation,getOperation:()=>current});
 t.after(async()=>{await Promise.all(tasks);await webhooks.stop();await new Promise(resolve=>setTimeout(resolve,150));await fs.rm(root,{recursive:true,force:true});});
 const key={id:'owner',scopes:['read','execute'],actions:notificationActions};
 const read=()=>integration.read(key,{resource:'notification-webhooks'}),wait=()=>Promise.all(tasks);
 const request=()=>({...structuredClone(defaultWebhookRequest),url:'https://notify.example/private-path-secret',secretHeaders:[{name:'Authorization',environment:'NOTIFICATION_PROVIDER_TOKEN',prefix:'Bearer '}]});
 const save=async()=>({action:'notification.webhook.save',revision:(await read()).revision,webhook:{name:'Provider',enabled:true,events:['incident','recovery'],severities:['critical','warning'],services:[],timeoutSeconds:10,maxAttempts:2,request:request()}});
 return {root,audits,sent,webhooks,integration,key,read,wait,request,save};
}
test('MCP notificações: consulta segura, prévia sem envio, save com referência e retry idempotente',async t=>{
 const f=await fixture(t),operation=await f.save(),preview=await f.integration.plan(f.key,{operation});assert.equal(preview.executes,false);assert.equal(preview.endpoint,'https://notify.example');assert.equal(f.sent.length,0);assert.equal((await f.read()).webhooks.length,0);
 const input={requestId:randomUUID(),operation},receipt=await f.integration.execute(f.key,input);await f.wait();assert.equal((await f.integration.operation(f.key,receipt.operation.id)).operation.state,'success');
 await f.integration.execute(f.key,input);assert.equal((await f.read()).webhooks.length,1);
 let state=await f.read();const id=state.webhooks[0].id;assert.equal(state.webhooks[0].endpoint,'https://notify.example');
 const protectedConfig=await f.webhooks.configuration({revision:state.revision,id},'test-only');assert.equal(protectedConfig.webhook.request.headers[0].value,'Bearer private-notification-secret');
 const testOp={action:'notification.webhook.test',revision:state.revision,id},testInput={requestId:randomUUID(),operation:testOp};await f.integration.plan(f.key,{operation:testOp});assert.equal(f.sent.length,0);
 await f.integration.execute(f.key,testInput);await f.wait();await f.integration.execute(f.key,testInput);assert.equal((await f.integration.read(f.key,{resource:'webhook-deliveries'})).deliveries.length,1);
 await f.webhooks.start();for(let i=0;i<100&&!f.sent.length;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.sent.length,1);assert.equal(f.sent[0].envelope.test,true);
 assert.equal(JSON.stringify(await f.read()).includes('private-'),false);assert.equal(JSON.stringify(preview).includes('private-'),false);assert.equal(JSON.stringify(f.audits).includes('private-'),false);assert.equal((await fs.readFile(f.root+'/.panel-state/mcp/receipts.json','utf8')).includes('private-'),false);
});
test('MCP notificações: ação específica, revisão, credenciais restritas e preservação do pedido',async t=>{
 const f=await fixture(t),operation=await f.save();await assert.rejects(f.integration.execute({...f.key,actions:['backup.run']},{requestId:randomUUID(),operation}),error=>error.status===403);
 for(const reference of ['PANEL_PASSWORD','DB_ROOT_PASSWORD','OTHER_SECRET']){const invalid=structuredClone(operation);invalid.webhook.request.secretHeaders[0].environment=reference;await assert.rejects(f.integration.plan(f.key,{operation:invalid}),error=>error.status===400);}
 const literal=structuredClone(operation);literal.webhook.request.headers=[{name:'Authorization',value:'Bearer private-secret'}];literal.webhook.request.secretHeaders=[];await assert.rejects(f.integration.plan(f.key,{operation:literal}),/secretHeaders/);
 await f.integration.execute(f.key,{requestId:randomUUID(),operation});await f.wait();let state=await f.read(),id=state.webhooks[0].id;
 await assert.rejects(f.integration.execute(f.key,{requestId:randomUUID(),operation:{action:'notification.webhook.remove',revision:operation.revision,id}}),error=>error.status===409);
 const edit={action:'notification.webhook.save',revision:state.revision,webhook:{...operation.webhook,id,name:'Renamed'}};delete edit.webhook.request;
 await f.integration.execute(f.key,{requestId:randomUUID(),operation:edit});await f.wait();state=await f.read();const config=await f.webhooks.configuration({revision:state.revision,id},'test-only');assert.equal(config.webhook.request.headers[0].value,'Bearer private-notification-secret');
 await f.integration.execute(f.key,{requestId:randomUUID(),operation:{action:'notification.webhook.toggle',revision:state.revision,id,enabled:false}});await f.wait();state=await f.read();assert.equal(state.webhooks[0].enabled,false);
 await f.integration.execute(f.key,{requestId:randomUUID(),operation:{action:'notification.webhook.remove',revision:state.revision,id}});await f.wait();assert.equal((await f.read()).webhooks.length,0);
});
