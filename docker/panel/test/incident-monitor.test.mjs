import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createIncidentMonitor,monitorDefaults} from '../incident-monitor.mjs';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {dockerServiceEvent} from '../docker-events.mjs';
const report=(status='operational',extra={})=>({status,sources:{docker:true,configuration:true,compose:true},services:[{name:'php',status,expected:true,state:status==='unavailable'?'exited':'running',checks:[{kind:'http',status:status==='operational'?'passed':status==='unknown'?'unknown':'failed',message:'password=never-persist-this'}]}],...extra});
async function fixture(t,options={}){const root=await fs.mkdtemp('/tmp/jubart-monitor-');let value=report(),calls=0;const events=[];const monitor=createIncidentMonitor({root,collect:async()=>{calls++;if(value instanceof Error)throw value;return value;},audit:async e=>events.push(e),...options});t.after(async()=>{await monitor.stop();await fs.rm(root,{recursive:true,force:true});});const configure=async changes=>{const current=await monitor.read();return monitor.configure({...current.settings,revision:current.revision,...changes},'admin');};return {root,monitor,configure,events,set:valueNext=>{value=valueNext;},calls:()=>calls};}

test('monitor: preferências validadas, concorrência por revisão e pausa persistente',async t=>{
 const f=await fixture(t),initial=await f.monitor.read();assert.deepEqual(initial.settings,monitorDefaults);assert.equal(initial.summary.lastCheckAt,null);
 for(const changes of [{intervalSeconds:1},{failureThreshold:0},{recoveryThreshold:11},{enabled:'true'},{unexpected:'x'}])await assert.rejects(f.configure(changes),e=>e.status===400);
 await f.configure({enabled:false,intervalSeconds:30});await assert.rejects(f.monitor.configure({...initial.settings,revision:initial.revision},'admin'),e=>e.status===409);
 const restored=createIncidentMonitor({root:f.root,collect:async()=>report()});t.after(()=>restored.stop());assert.equal((await restored.read()).settings.enabled,false);assert.equal(f.events.length,1);
});
test('monitor: confirmação consecutiva, deduplicação e desconhecido não encerra incidente',async t=>{
 const f=await fixture(t);f.set(report('degraded'));await f.monitor.check();assert.equal((await f.monitor.read()).incidents.length,0);
 f.set(report());await f.monitor.check();f.set(report('degraded'));await f.monitor.check();assert.equal((await f.monitor.read()).incidents.length,0);await f.monitor.check();
 let state=await f.monitor.read();assert.equal(state.summary.activeIncidents,1);const id=state.incidents[0].id,sequence=state.summary.sequence;
 await f.monitor.check();assert.equal((await f.monitor.read()).summary.sequence,sequence);
 f.set(report('unknown'));await f.monitor.check();assert.equal((await f.monitor.read()).summary.activeIncidents,1);
 f.set(report());await f.monitor.check();state=await f.monitor.read();assert.equal(state.summary.activeIncidents,0);assert.equal(state.incidents[0].id,id);assert.equal(state.incidents[0].resolution,'recovered');assert.equal(state.summary.sequence,sequence+1);
 f.set(report('degraded'));await f.monitor.check();await f.monitor.check();assert.equal((await f.monitor.read()).incidents.length,2);
});
test('monitor: falha de coleta não vaza erro e não recupera serviços sem evidência',async t=>{
 const f=await fixture(t);await f.configure({failureThreshold:1});f.set(report('unavailable'));await f.monitor.check();f.set(new Error('private-production-secret'));await f.monitor.check();const state=await f.monitor.read();assert.equal(state.summary.activeIncidents,2);assert.equal(state.summary.status,'unknown');assert.equal(JSON.stringify(state).includes('private-production-secret'),false);
 const saved=await fs.readFile(path.join(f.root,'.panel-state/monitor/state.json'),'utf8');assert.equal(saved.includes('never-persist-this'),false);
 f.set(report('unknown',{sources:{docker:false},services:[]}));await f.monitor.check();assert.equal((await f.monitor.read()).incidents.find(row=>row.service==='php').state,'open');
});
test('monitor: desativação e remoção encerram incidentes sem afirmar recuperação',async t=>{
 const f=await fixture(t);await f.configure({failureThreshold:1});f.set(report('unavailable'));await f.monitor.check();f.set(report('disabled',{services:[{name:'php',expected:false,status:'disabled',state:'exited'}]}));await f.monitor.check();assert.equal((await f.monitor.read()).incidents[0].resolution,'disabled');
 f.set(report('unavailable'));await f.monitor.check();f.set(report('operational',{services:[]}));await f.monitor.check();assert.equal((await f.monitor.read()).incidents[0].resolution,'removed');
});
test('monitor: estado e sequência persistem após reinício; histórico tem limite',async t=>{
 const f=await fixture(t,{maxIncidents:3,maxEvents:4});await f.configure({failureThreshold:1});for(let i=0;i<5;i++){f.set(report('degraded'));await f.monitor.check();f.set(report());await f.monitor.check();}
 const before=await f.monitor.read();assert.equal(before.incidents.length,3);const saved=JSON.parse(await fs.readFile(path.join(f.root,'.panel-state/monitor/state.json'),'utf8'));assert.equal(saved.events.length,4);
 const restored=createIncidentMonitor({root:f.root,collect:async()=>report('unavailable')});t.after(()=>restored.stop());assert.deepEqual(await restored.read(),before);await restored.check();assert.equal((await restored.read()).summary.sequence,before.summary.sequence+1);
});
test('monitor: duas solicitações simultâneas compartilham a coleta',async t=>{
 let release,calls=0;const gate=new Promise(resolve=>{release=resolve;});const f=await fixture(t,{collect:async()=>{calls++;await gate;return report();}});const first=f.monitor.check(),second=f.monitor.check();for(let i=0;i<50&&calls===0;i++)await new Promise(resolve=>setTimeout(resolve,2));assert.equal(calls,1);release();assert.deepEqual(await first,await second);
});
test('monitor: executa em segundo plano sem cliente e para com o serviço',async t=>{
 const f=await fixture(t,{initialDelayMs:1});await f.monitor.start();for(let i=0;i<50&&f.calls()===0;i++)await new Promise(resolve=>setTimeout(resolve,5));await f.monitor.stop();assert.equal(f.calls(),1);assert.ok((await f.monitor.read()).summary.lastCheckAt);
});

test('monitor: alteração de severidade gera evento sem duplicar o incidente',async t=>{
 const f=await fixture(t);await f.configure({failureThreshold:1,recoveryThreshold:2});f.set(report('degraded'));await f.monitor.check();const first=(await f.monitor.read()).incidents[0];f.set(report('unavailable'));await f.monitor.check();let state=await f.monitor.read();assert.equal(state.incidents.length,1);assert.equal(state.incidents[0].id,first.id);assert.equal(state.incidents[0].severity,'critical');assert.equal(state.summary.sequence,2);f.set(report());await f.monitor.check();assert.equal((await f.monitor.read()).summary.activeIncidents,1);await f.monitor.check();assert.equal((await f.monitor.read()).summary.activeIncidents,0);
});

test('monitor: encerrar durante a inicialização não rearma verificações',async t=>{
 const f=await fixture(t,{initialDelayMs:1});const starting=f.monitor.start();await f.monitor.stop();await starting;await new Promise(resolve=>setTimeout(resolve,15));assert.equal(f.calls(),0);
});

let eventIndex=0;
const containerEvent=(action,id='a'.repeat(64))=>dockerServiceEvent({Type:'container',Action:action,timeNano:String(BigInt(Date.now())*1000000n+BigInt(++eventIndex)),Actor:{ID:id,Attributes:{'com.docker.compose.project':'test','com.docker.compose.service':'php'}}},'test');
test('monitor: parada é imediata, die/stop não duplica, reinício rápido avisa sem afirmar recuperação',async t=>{
 const f=await fixture(t);await f.configure({failureThreshold:10});const stop=containerEvent('die');await f.monitor.serviceEvent(stop);let state=await f.monitor.read();assert.equal(state.summary.activeIncidents,1);assert.equal(state.incidents[0].transition,'stopped');
 await f.monitor.serviceEvent(containerEvent('stop'));await f.monitor.serviceEvent(stop);assert.equal((await f.monitor.events()).sequence,1);
 await f.monitor.serviceEvent(containerEvent('restart'));state=await f.monitor.read();assert.equal(state.serviceEvents[0].type,'lifecycle');assert.equal(state.serviceEvents[0].incident.transition,'restarted');assert.equal(state.serviceEvents[0].incident.status,'unknown');assert.equal(state.summary.activeIncidents,1);
 f.set(report('unknown'));await f.monitor.check();assert.equal((await f.monitor.read()).summary.activeIncidents,1);f.set(report());await f.monitor.check();assert.equal((await f.monitor.read()).summary.activeIncidents,0);assert.deepEqual((await f.monitor.events()).events.map(e=>e.type),['incident','lifecycle','recovery']);
});
test('monitor: replay e pausa mantêm cursor sem reenviar paradas/inícios anteriores',async t=>{
 const f=await fixture(t),stop=containerEvent('die');await f.monitor.serviceEvent(stop);const checkpoint=await f.monitor.dockerCursor();
 const restored=createIncidentMonitor({root:f.root,collect:async()=>report()});t.after(()=>restored.stop());await restored.serviceEvent(stop);assert.equal((await restored.events()).sequence,1);assert.equal(await restored.dockerCursor(),checkpoint);
 const current=await restored.read();await restored.configure({...current.settings,revision:current.revision,enabled:false},'admin');const restart=containerEvent('restart');await restored.serviceEvent(restart);assert.equal((await restored.events()).sequence,1);assert.equal(await restored.dockerCursor(),restart.timeNano);
 const paused=await restored.read();await restored.configure({...paused.settings,revision:paused.revision,enabled:true},'admin');await restored.serviceEvent(restart);assert.equal((await restored.events()).sequence,1);
});
test('monitor: evento não espera a sondagem lenta e descarta uma amostra anterior à parada',async t=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});const f=await fixture(t,{collect:()=>gate});const check=f.monitor.check();await new Promise(resolve=>setTimeout(resolve,5));
 const event=f.monitor.serviceEvent(containerEvent('die'));await Promise.race([event,new Promise((_,reject)=>setTimeout(()=>reject(Error('Evento bloqueado pela sondagem')),300))]);assert.equal((await f.monitor.read()).summary.activeIncidents,1);release(report());await check;assert.equal((await f.monitor.read()).summary.activeIncidents,1);
});
test('monitor: SSE publica lifecycle com ID, replay e histórico consultável',async t=>{
 const f=await fixture(t),response=()=>{const res=new EventEmitter();res.chunks=[];res.writableLength=0;res.writeHead=()=>{};res.flushHeaders=()=>{};res.write=text=>res.chunks.push(text);res.end=()=>{res.writableEnded=true;};return res;};
 const res=response();await f.monitor.subscribe({headers:{}},res,{owner:'test',authorize:async()=>true});await f.monitor.serviceEvent(containerEvent('restart'));assert.match(res.chunks.join(''),/event: lifecycle\n/);assert.match(res.chunks.join(''),/"transition":"restarted"/);assert.equal((await f.monitor.read()).serviceEvents.length,1);
 const replay=response();await f.monitor.subscribe({headers:{'last-event-id':'0'}},replay,{owner:randomUUID(),authorize:async()=>true});assert.match(replay.chunks.join(''),/id: 1\nevent: lifecycle/);
});
test('monitor: fallback periódico confirma container parado sem aguardar falhas HTTP consecutivas',async t=>{
 const f=await fixture(t);await f.configure({failureThreshold:10});f.set(report('degraded'));await f.monitor.check();assert.equal((await f.monitor.read()).summary.activeIncidents,0);f.set(report('unavailable'));await f.monitor.check();assert.equal((await f.monitor.read()).summary.activeIncidents,1);
});
