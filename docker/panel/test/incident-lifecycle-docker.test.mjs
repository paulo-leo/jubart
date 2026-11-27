// Opt-in, disposable container only. No host projects, network or published ports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {createDockerEvents} from '../docker-events.mjs';
import {createIncidentMonitor} from '../incident-monitor.mjs';
import {createIncidentWebhooks} from '../incident-webhooks.mjs';
import {defaultWebhookRequest} from '../webhook-http.mjs';
const wait=async predicate=>{for(let i=0;i<200;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Evento Docker não observado no prazo.');};
test('Docker real: stop/start/restart chega ao SSE e aos webhooks sem aguardar o intervalo',{
 skip:process.env.JUBART_MCP_DOCKER_QA!=='1',timeout:60000,
},async()=>{
 const execute=promisify(execFile),docker=async args=>(await execute('docker',args,{timeout:30000,maxBuffer:1024*1024})).stdout;
 const project='jubart-events-qa-'+randomBytes(6).toString('hex'),name=project+'-php',root=await fs.mkdtemp('/tmp/'+project+'-');let monitor,webhooks,stream;
 try{
  const image=(await fs.readFile(new URL('../../../config/cli-image',import.meta.url),'utf8')).trim();await docker(['image','inspect',image]);
  await docker(['run','-d','--pull=never','--init','--name',name,'--label','com.docker.compose.project='+project,'--label','com.docker.compose.service=php','--network','none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges:true','--pids-limit','64','--memory','96m',image,'node','-e',"process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)"]);
  await fs.writeFile(root+'/.env','PANEL_VAULT_KEY='+ 'a'.repeat(64)+'\n');
  monitor=createIncidentMonitor({root,collect:async()=>{const state=JSON.parse(await docker(['inspect',name]))[0];return {status:state.State.Running?'operational':'unavailable',sources:{docker:true},services:[{name:'php',containerId:state.Id.slice(0,12),expected:true,state:state.State.Running?'running':'exited',status:state.State.Running?'operational':'unavailable',checks:[]}]};}});
  await monitor.check();const initial=await monitor.read();await monitor.configure({...initial.settings,revision:initial.revision,intervalSeconds:86400,failureThreshold:10},'qa');
  const res=new EventEmitter();res.output='';res.writableLength=0;res.writeHead=()=>{};res.flushHeaders=()=>{};res.write=text=>{res.output+=text;};res.end=()=>{res.writableEnded=true;};await monitor.subscribe({headers:{}},res,{owner:'qa',authorize:async()=>true});
  const delivered=[];webhooks=createIncidentWebhooks({root,events:()=>monitor.events(),transport:async(_request,event)=>{delivered.push(event);return {statusCode:204,durationMs:1};},pollMs:10});
  await webhooks.save({revision:(await webhooks.read()).revision,webhook:{name:'QA',enabled:true,events:['incident','recovery'],severities:['critical','warning'],services:['php'],timeoutSeconds:5,maxAttempts:1,request:{...defaultWebhookRequest,url:'https://not-used.example/events'}}},'qa');await webhooks.start();
  let connected=false;stream=createDockerEvents({scope:async()=>({project}),cursor:()=>monitor.dockerCursor(),onEvent:event=>monitor.serviceEvent(event),onStatus:value=>{connected=value==='connected';monitor.eventSource(value);}});await stream.start();await wait(()=>connected);
  // Consume any initial start replay before measuring the subsequent operations.
  await new Promise(resolve=>setTimeout(resolve,600));const baseline=(await monitor.events()).sequence;
  await docker(['stop','--time','1',name]);await wait(async()=>(await monitor.events()).events.some(e=>e.id>baseline&&e.incident.transition==='stopped'));
  const beforeStart=(await monitor.events()).sequence;await docker(['start',name]);await wait(async()=>(await monitor.events()).events.some(e=>e.id>beforeStart&&e.type==='lifecycle'&&e.incident.transition==='started'));
  await monitor.check();const beforeRestart=(await monitor.events()).sequence;
  await docker(['restart','--time','1',name]);await wait(async()=>(await monitor.events()).events.some(e=>e.id>beforeRestart&&e.type==='lifecycle'&&e.incident.transition==='restarted'));
  await wait(()=>delivered.some(e=>e.type==='lifecycle'&&e.transition==='restarted'));
  const restartEvents=(await monitor.events()).events.filter(e=>e.id>beforeRestart);assert.equal(restartEvents.filter(e=>e.incident.transition==='stopped').length,1);assert.equal(restartEvents.filter(e=>e.type==='lifecycle').length,1,JSON.stringify(restartEvents.map(event=>({type:event.type,transition:event.incident.transition}))));
  assert.match(res.output,/event: incident/);assert.match(res.output,/event: lifecycle/);assert.match(res.output,/"transition":"restarted"/);
  assert.equal(delivered.some(e=>e.type==='incident'&&e.transition==='stopped'),true);assert.equal((await monitor.read()).settings.intervalSeconds,86400);assert.equal(JSON.parse(await docker(['inspect',name]))[0].State.Running,true);
 }finally{await stream?.stop();await monitor?.stop();await webhooks?.stop();await docker(['rm','-f',name]).catch(()=>{});await fs.rm(root,{recursive:true,force:true});}
});
