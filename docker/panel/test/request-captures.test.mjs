import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {captureEvent,validateRule,createRequestCaptures} from '../request-captures.mjs';
const app={id:'main',domain:'localhost',enabled:true};
const rule={id:'a',name:'Usuários',app:'main',enabled:true,pathPrefix:'/usuarios',match:'any',cpuPercent:80,memoryPercent:0,durationMs:1000};
test('captura duração em ms e CPU do mesmo serviço sem query, corpo ou cabeçalhos',()=>{
 const at=Date.now(),row={StartUTC:new Date(at-2000).toISOString(),Duration:2000000000,RequestHost:'localhost:8080',RequestMethod:'GET',RequestPath:'/usuarios?token=secret',DownstreamStatus:200,Authorization:'secret',body:'private'};
 const event=captureEvent(row,rule,app,[{at,containers:[{service:'php',cpuPercent:85,memoryPercent:20},{service:'mariadb',cpuPercent:900,memoryPercent:99}]}]);
 assert.equal(event.durationMs,2000);assert.equal(event.path,'/usuarios');assert.equal(event.cpuPercent,85);assert.equal(event.sampleCount,1);assert(!JSON.stringify(event).includes('secret'));assert(!JSON.stringify(event).includes('private'));
 assert.equal(captureEvent({...row,RequestHost:'other.test'},rule,app,[]),null);
 assert.equal(captureEvent(row,{...rule,match:'all',cpuPercent:95},app,[{at,containers:[{service:'php',cpuPercent:85}]}]),null);
 assert.equal(captureEvent(row,{...rule,durationMs:0},app,[{at:at-60000,containers:[{service:'php',cpuPercent:99}]}]),null);
 assert.equal(captureEvent(row,{...rule,enabled:false},app,[]),null);
});
test('validação rejeita regras sem gatilho e percentuais/caminhos inválidos',()=>{
 assert.equal(validateRule(rule,[app]).durationMs,1000);
 for(const change of [{cpuPercent:0,durationMs:0},{memoryPercent:101},{durationMs:-1},{pathPrefix:'/usuarios?token=x'},{app:'unknown'}])assert.throws(()=>validateRule({...rule,...change},[app]));
});
test('coletor persiste eventos, deduplica logs repetidos e respeita revisão das regras',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'captures-'));try{
 const at=Date.now(),row={StartUTC:new Date(at-1000).toISOString(),Duration:1500000000,RequestHost:'localhost',RequestMethod:'GET',RequestPath:'/usuarios',RequestCount:1};
 const collector=createRequestCaptures({root,loadConfig:async()=>({config:{applications:[app]}}),compose:async args=>args.includes('ps')?JSON.stringify({ID:'abc',Service:'php',Name:'php'}):JSON.stringify(row),collectMetrics:async()=>({current:{at,containers:[{id:'abc',name:'php',cpuPercent:90,memoryPercent:20}]}})});
 const initial=await collector.list();await collector.save({revision:initial.revision,rule:{...rule,id:undefined}});await collector.tick();await collector.tick();
 const current=await collector.list();assert.equal(current.events.length,1);assert.equal(current.events[0].cpuPercent,90);assert.equal(current.status.error,null);
 await assert.rejects(collector.save({revision:initial.revision,rule}));await collector.clear();assert.equal((await collector.list()).events.length,0);await collector.tick();assert.equal((await collector.list()).events.length,0);
 await collector.remove({revision:current.revision,id:current.rules[0].id});assert.equal((await collector.list()).rules.length,0);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
