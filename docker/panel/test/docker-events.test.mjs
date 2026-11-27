import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {once} from 'node:events';
import {createDockerEvents,dockerServiceEvent} from '../docker-events.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async predicate=>{for(let i=0;i<150;i++){if(await predicate())return;await pause(5);}throw Error('Tempo excedido no teste.');};
let index=0;
const raw=(Action,overrides={})=>({Type:'container',Action,timeNano:String(BigInt(Date.now())*1000000n+BigInt(++index)),Actor:{ID:'a'.repeat(64),Attributes:{'com.docker.compose.project':'test','com.docker.compose.service':'php','private-label':'never-expose-this'}},...overrides});
test('eventos Docker: valida projeto/serviço/oneoff e elimina atributos privados',()=>{
 const event=raw('restart'),result=dockerServiceEvent(event,'test');assert.equal(result.action,'restarted');assert.equal(result.containerId,'a'.repeat(12));assert.equal(JSON.stringify(result).includes('never-expose-this'),false);
 for(const input of [raw('kill'),raw('start',{Type:'volume'}),raw('start',{Actor:{...event.Actor,ID:'invalid'}}),raw('start',{Actor:{...event.Actor,Attributes:{...event.Actor.Attributes,'com.docker.compose.oneoff':'True'}}}),raw('start',{timeNano:'invalid'})])assert.equal(dockerServiceEvent(input,'test'),null);
 assert.equal(dockerServiceEvent(event,'other'),null);
});
async function fixture(t,options={}){
 const root=await fs.mkdtemp('/tmp/jubart-docker-events-'),socketPath=root+'/engine.sock',responses=[],requests=[],events=[],statuses=[];let checkpoint;
 const server=http.createServer((req,res)=>{requests.push(new URL(req.url,'http://engine'));responses.push(res);res.writeHead(200,{'Content-Type':'application/json'});res.flushHeaders();});server.listen(socketPath);await once(server,'listening');
 const stream=createDockerEvents({socketPath,scope:async()=>({project:'test'}),cursor:async()=>checkpoint,onEvent:async event=>{events.push(event);checkpoint=event.timeNano;},onStatus:value=>statuses.push(value),startSettleMs:25,reconnectMs:10,...options});
 t.after(async()=>{await stream.stop();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});
 return {stream,events,statuses,requests,responses,send(event){const line=JSON.stringify(event).replace(/"timeNano":"(\d+)"/,'"timeNano":$1');responses.at(-1).write(line+'\n');},wait};
}
test('eventos Docker: stream Unix filtra escopo, preserva nanos, agrupa start/restart e reconecta por cursor',async t=>{
 const f=await fixture(t);await f.stream.start();await wait(()=>f.responses.length===1);const filters=JSON.parse(f.requests[0].searchParams.get('filters'));assert.deepEqual(filters.label,['com.docker.compose.project=test']);
 const died=raw('die');f.send(died);await wait(()=>f.events.length===1);assert.equal(f.events[0].timeNano,died.timeNano);
 f.send(raw('start'));f.send(raw('restart'));await wait(()=>f.events.length===2);await pause(40);assert.deepEqual(f.events.map(e=>e.action),['stopped','restarted']);
 f.send(raw('start',{Actor:{ID:'b'.repeat(64),Attributes:{'com.docker.compose.project':'foreign','com.docker.compose.service':'php'}}}));await pause(40);assert.equal(f.events.length,2);
 f.responses[0].end();await wait(()=>f.responses.length===2);assert.equal(f.statuses.includes('reconnecting'),true);assert.equal(Number(f.requests[1].searchParams.get('since')),Number(BigInt(f.events[1].timeNano)/1000000000n)-2);
 f.send(raw('start'));await wait(()=>f.events.length===3);await f.stream.stop();const count=f.responses.length;await pause(40);assert.equal(f.responses.length,count);assert.equal(f.statuses.at(-1),'disconnected');
});
test('eventos Docker: start seguido de queda não perde o início pendente',async t=>{
 const f=await fixture(t);await f.stream.start();await wait(()=>f.responses.length===1);f.send(raw('start'));f.send(raw('die'));await wait(()=>f.events.length===2);assert.deepEqual(f.events.map(e=>e.action),['started','stopped']);
});
test('eventos Docker: escopo indisponível falha fechado e tenta novamente',async t=>{
 let available=false;const f=await fixture(t,{scope:async()=>{if(!available)throw Error('private-production-error');return {project:'test'};}});await f.stream.start();await wait(()=>f.statuses.includes('reconnecting'));assert.equal(f.requests.length,0);available=true;await wait(()=>f.responses.length===1);assert.equal(JSON.stringify(f.statuses).includes('private-'),false);
});
