import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {once} from 'node:events';
import {createPanel} from '../server.mjs';
import {createPanelUsers} from '../panel-users.mjs';
const observation=status=>({status,sources:{docker:true,compose:true,configuration:true},services:[{name:'php',expected:true,state:status==='unavailable'?'exited':'running',status,checks:[{kind:'healthcheck',status:status==='operational'?'passed':'failed'}]}]});
async function stream(url,headers={}){
 const controller=new AbortController(),response=await fetch(url,{headers,signal:controller.signal});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/event-stream/);const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
 async function next(){let timer;try{return await Promise.race([(async()=>{for(;;){const index=buffer.indexOf('\n\n');if(index>=0){const packet=buffer.slice(0,index);buffer=buffer.slice(index+2);const type=packet.match(/^event: (.+)$/m)?.[1];if(!type)continue;return {type,id:packet.match(/^id: (.+)$/m)?.[1],data:JSON.parse(packet.match(/^data: (.+)$/m)[1])};}const part=await reader.read();if(part.done)return null;buffer+=decoder.decode(part.value,{stream:true});}})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('SSE não respondeu dentro do prazo.')),2000);})]);}finally{clearTimeout(timer);}}
 return {next,close:()=>{controller.abort();return reader.cancel().catch(()=>{});}};
}
test('monitor SSE: sessão, chave MCP, escopos, replay e revogação durante a conexão',async t=>{
 const root=await fs.mkdtemp('/tmp/jubart-stream-');await fs.writeFile(path.join(root,'.env'),'APP_DOMAIN=localhost\nAPP_DIRECTORY=/tmp\nDB_PASSWORD=secret-not-for-stream\n');let current=observation('operational');const commands=[];
 const server=createPanel({root,username:'admin',password:'admin-test-password-long',executor:async(_,args)=>{commands.push(args);return {stdout:args.includes('config')?JSON.stringify({name:'test',services:{php:{},panel:{}}}):'[]'};},monitorOptions:{collect:async()=>current,initialDelayMs:100000,heartbeatMs:30}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port,streams=[];t.after(async()=>{for(const item of streams)await item.close();await server.shutdown();await fs.rm(root,{recursive:true,force:true});});
 const login=async(username,password)=>{const response=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username,password})});assert.equal(response.status,200);const data=await response.json();return {Cookie:response.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':data.csrf,'Content-Type':'application/json'};};
 const admin=await login('admin','admin-test-password-long');const post=async(route,data)=>fetch(base+route,{method:'POST',headers:admin,body:JSON.stringify(data)});
 const settings=await(await fetch(base+'/api/monitor',{headers:admin})).json();assert.equal((await post('/api/monitor/settings',{...settings.settings,enabled:false,failureThreshold:1,revision:settings.revision})).status,200);
 assert.equal((await fetch(base+'/api/monitor/settings',{method:'POST',headers:{Cookie:admin.Cookie},body:'{}'})).status,403);
 const createKey=async scopes=>{const response=await post('/api/mcp/keys',{name:'Stream test',scopes,actions:scopes.includes('execute')?['container.stop']:[],expiresInDays:1});assert.equal(response.status,201);return response.json();};const read=await createKey(['read']),execute=await createKey(['execute']),bearer={Authorization:'Bearer '+read.token};
 assert.equal((await fetch(base+'/api/monitor/events')).status,401);assert.equal((await fetch(base+'/api/ai/events')).status,401);assert.equal((await fetch(base+'/api/ai/events?token='+encodeURIComponent(read.token))).status,401);assert.equal((await fetch(base+'/api/ai/events',{headers:{Authorization:'Bearer '+execute.token}})).status,403);
 const panel=await stream(base+'/api/monitor/events',admin);streams.push(panel);assert.equal((await panel.next()).type,'snapshot');
 const external=await stream(base+'/api/ai/events',bearer);streams.push(external);assert.equal((await external.next()).type,'snapshot');
 current=observation('unavailable');assert.equal((await post('/api/monitor/check',{})).status,200);const incident=await external.next();assert.equal(incident.type,'incident');assert.equal(incident.data.incident.service,'php');assert.equal(JSON.stringify(incident).includes('secret-not-for-stream'),false);assert.equal((await panel.next()).type,'incident');
 await external.close();current=observation('operational');await post('/api/monitor/check',{});
 const resumed=await stream(base+'/api/ai/events',{...bearer,'Last-Event-ID':incident.id});streams.push(resumed);assert.equal((await resumed.next()).type,'recovery');const snapshot=await resumed.next();assert.equal(snapshot.type,'snapshot');assert.equal(snapshot.data.summary.activeIncidents,0);
 const history=await(await fetch(base+'/api/ai/read?resource=incidents',{headers:bearer})).json();assert.equal(history.incidents.length,1);assert.equal((await fetch(base+'/api/ai/incidents',{headers:bearer})).status,200);
 const parallel=await Promise.all(Array.from({length:4},()=>fetch(base+'/api/ai/events',{headers:bearer})));assert.equal(parallel.filter(response=>response.status===200).length,2);assert.equal(parallel.filter(response=>response.status===429).length,2);for(const response of parallel)await response.body.cancel();
 await post('/api/mcp/keys/'+read.key.id+'/revoke',{});const expired=await resumed.next();assert.equal(expired.type,'auth-expired');assert.equal(await resumed.next(),null);assert.equal((await fetch(base+'/api/ai/incidents',{headers:bearer})).status,401);
 const users=createPanelUsers({root,bootstrapUsername:'admin'});await users.save({revision:(await users.list()).revision,user:{username:'viewer',name:'Viewer',password:'viewer-test-password-long',enabled:true,admin:false,permissions:['monitor.read'],services:[],databases:[]}},users.bootstrap());const viewer=await login('viewer','viewer-test-password-long');for(const route of ['/api/monitor','/api/monitor/events'])assert.equal((await fetch(base+route,{headers:viewer})).status,403);
 await post('/api/logout',{});let event;do{event=await panel.next();}while(event&&event.type!=='auth-expired');assert.equal(event.type,'auth-expired');assert.equal(await panel.next(),null);
 assert.equal(commands.some(args=>args.some(arg=>['stop','restart','up','build'].includes(arg))),false);
});
