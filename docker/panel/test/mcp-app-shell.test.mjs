import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createAppShells} from '../mcp-app-shell.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(t,options={}){
 const root=await fs.mkdtemp('/tmp/jubart-app-shell-'),calls=[],audits=[],ttys=[],allowed=new Set(['owner','other']);let busy=false,block=false,clock=Date.now();
 const app={id:'app2',type:'node',enabled:true,workingDirectory:'/var/www/html/backend'};
 const container={Id:'a'.repeat(64),Config:{Labels:{'com.docker.compose.project':'test','com.docker.compose.service':'php-app2'}},State:{Running:true}};
 const state={project:'test',services:[{name:'php-app2',containerId:'a'.repeat(12),state:'running'}]};
 const engine={open:async(...args)=>{calls.push(args);const tty={input:[],sizes:[],closed:0,onData(fn){this.data=fn;},onExit(fn){this.exit=fn;},resume(){this.data(Buffer.from('ready> '));},write(data){this.input.push(data);this.data(Buffer.from(data));},resize(...size){this.sizes.push(size);},async close(){this.closed++;this.exit?.();}};ttys.push(tty);return tty;}};
 const dependencies={root,engine,loadConfig:async()=>({config:{applications:[app]}}),snapshot:async()=>state,docker:async args=>{if(args[0]==='inspect')return JSON.stringify([container]);return '';},authorize:async id=>allowed.has(id),canOpen:()=>!block,onBusy:v=>{busy=v;},audit:async event=>audits.push(event),heartbeatMs:20,now:()=>clock,...options};
 const manager=createAppShells(dependencies),key={id:'owner',scopes:['execute'],actions:['terminal.container']};
 t.after(async()=>{await manager.dispose();await pause(20);await fs.rm(root,{recursive:true,force:true});});
 return {root,manager,key,app,state,container,allowed,calls,audits,ttys,dependencies,busy:()=>busy,block:v=>{block=v;},advance:ms=>{clock+=ms;}};
}
test('MCP Bash: app correta, diretório Node, ownership e entradas idempotentes sem persistir comandos/saída',async t=>{
 const f=await fixture(t),request={app:'app2',requestId:randomUUID()},session=await f.manager.open(f.key,request);
 assert.equal(session.state,'open');assert.equal(session.service,'php-app2');assert.equal(f.busy(),true);assert.deepEqual(f.calls[0],['a'.repeat(64),'bash',120,30,'/var/www/html/backend']);
 assert.equal((await f.manager.open(f.key,request)).sessionId,session.sessionId);assert.equal(f.calls.length,1);
 await assert.rejects(f.manager.open(f.key,{...request,shell:'sh'}),error=>error.status===409);
 await assert.rejects(f.manager.read({...f.key,id:'other'},{sessionId:session.sessionId}),error=>error.status===404);
 const input={sessionId:session.sessionId,requestId:randomUUID(),data:'printf private-command-secret\n'};
 assert.equal((await f.manager.input(f.key,input)).state,'submitted');assert.equal((await f.manager.input(f.key,input)).state,'already-submitted');assert.equal(f.ttys[0].input.length,1);
 await assert.rejects(f.manager.input(f.key,{...input,data:'different\n'}),error=>error.status===409);
 const output=await f.manager.read(f.key,{sessionId:session.sessionId});assert.match(output.output,/private-command-secret/);assert.equal(Buffer.from(output.outputBase64,'base64').toString(),output.output);
 assert.equal((await f.manager.read(f.key,{sessionId:session.sessionId,cursor:output.cursor})).output,'');
 await f.manager.resize(f.key,{sessionId:session.sessionId,cols:80,rows:25});assert.deepEqual(f.ttys[0].sizes,[[80,25]]);
 await f.manager.close(f.key,{sessionId:session.sessionId});assert.equal(f.busy(),false);assert.equal(f.ttys[0].closed,1);assert.equal(f.manager.hasApp('app2'),false);
 const disk=await fs.readFile(f.root+'/.panel-state/mcp/app-shells.json','utf8');assert.equal(disk.includes('private-command-secret'),false);assert.equal(JSON.stringify(f.audits).includes('private-command-secret'),false);
 const restarted=createAppShells(f.dependencies);t.after(()=>restarted.dispose());assert.equal((await restarted.open(f.key,request)).state,'unknown');assert.equal(f.calls.length,1);
});
test('MCP Bash: exige permissão nova, container em execução e propriedade Compose; não aceita IDs externos',async t=>{
 const f=await fixture(t),request=()=>({app:'app2',requestId:randomUUID()});
 for(const key of [{...f.key,actions:['terminal.host']},{...f.key,scopes:['read']}])await assert.rejects(f.manager.open(key,request()),error=>error.status===403);
 await assert.rejects(f.manager.open(f.key,{...request(),container:'a'.repeat(64)}),error=>error.status===400);
 f.app.enabled=false;await assert.rejects(f.manager.open(f.key,request()),error=>error.status===409);f.app.enabled=true;
 f.state.services[0].state='exited';await assert.rejects(f.manager.open(f.key,request()),error=>error.status===409);f.state.services[0].state='running';
 f.container.Config.Labels['com.docker.compose.project']='other';await assert.rejects(f.manager.open(f.key,request()),error=>error.status===403);assert.equal(f.calls.length,0);assert.equal(f.busy(),false);
});
test('MCP Bash: revogação fecha sessão sem nova consulta e substituição do container impede entrada',async t=>{
 const f=await fixture(t),session=await f.manager.open(f.key,{app:'app2',requestId:randomUUID()});f.allowed.delete('owner');
 for(let i=0;i<50&&f.manager.hasApp('app2');i++)await pause(10);assert.equal(f.manager.hasApp('app2'),false);assert.equal(f.ttys[0].closed,1);
 await assert.rejects(f.manager.read(f.key,{sessionId:session.sessionId}),error=>error.status===403);f.allowed.add('owner');
 const next=await f.manager.open(f.key,{app:'app2',requestId:randomUUID()});f.container.Id='b'.repeat(64);f.state.services[0].containerId='b'.repeat(12);
 await assert.rejects(f.manager.input(f.key,{sessionId:next.sessionId,requestId:randomUUID(),data:'must-not-run\n'}),error=>error.status===409);assert.equal(f.ttys[1].input.length,0);assert.equal(f.ttys[1].closed,1);
});
test('MCP Bash: limite de saída/tempo, UTF-8, exclusão mútua e shell ausente',async t=>{
 const f=await fixture(t,{idleMs:100}),request=()=>({app:'app2',requestId:randomUUID()});f.block(true);await assert.rejects(f.manager.open(f.key,request()),error=>error.status===409);f.block(false);
 const session=await f.manager.open(f.key,request());await assert.rejects(f.manager.open(f.key,request()),error=>error.status===409);
 f.ttys[0].data(Buffer.from('x'.repeat(16376)+'🐋'));let part=await f.manager.read(f.key,{sessionId:session.sessionId});assert.equal(part.output.includes('\ufffd'),false);part=await f.manager.read(f.key,{sessionId:session.sessionId,cursor:part.cursor});assert.equal(part.output,'🐋');
 f.advance(101);assert.equal((await f.manager.read(f.key,{sessionId:session.sessionId})).reason,'expired');
 const next=await f.manager.open(f.key,request());f.ttys[1].data(Buffer.alloc(2*1024*1024,97));await pause(10);assert.equal((await f.manager.read(f.key,{sessionId:next.sessionId})).reason,'output-limit');
 const missing=createAppShells({...f.dependencies,docker:async args=>{if(args[0]==='exec')throw new Error('missing');return JSON.stringify([f.container]);}});t.after(()=>missing.dispose());await assert.rejects(missing.open(f.key,request()),error=>error.status===409&&error.message.includes('shell: sh'));
});
