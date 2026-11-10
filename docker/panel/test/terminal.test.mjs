import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once,EventEmitter} from 'node:events';
import {createDockerTTY,createTerminalManager} from '../terminal.mjs';
import {createPanel} from '../server.mjs';

const container='a'.repeat(64);
const fakeTTY=()=>{const bus=new EventEmitter();return {writes:[],sizes:[],closed:0,onData:fn=>bus.on('data',fn),onExit:fn=>bus.on('exit',fn),resume(){bus.emit('data',Buffer.from('$ '));},write(data){this.writes.push(data);bus.emit('data',Buffer.from(data));},async resize(c,r){this.sizes.push([c,r]);},async close(){this.closed++;},emit:data=>bus.emit('data',Buffer.from(data))};};

test('TTY mantém entrada/saída em tempo real, tamanho e dono; desconexão encerra shell',async()=>{
 const tty=fakeTTY(),events=[],busy=[];const manager=createTerminalManager({engine:{open:async()=>tty},audit:async e=>events.push(e),onBusy:v=>busy.push(v)});
 const {id}=await manager.open({container,service:'php',shell:'sh',cols:80,rows:24,owner:'owner',actor:'admin'});
 assert.throws(()=>manager.attach(id,'other',{},{}),/não encontrada/);
 const res=new EventEmitter();res.chunks=[];res.writableLength=0;res.writeHead=()=>{};res.flushHeaders=()=>{};res.write=s=>res.chunks.push(s);res.end=s=>res.chunks.push(s);
 manager.attach(id,'owner',{},res);
 assert.match(res.chunks.join(''),/data:/);
 await manager.input(id,'owner','read answer\r');await manager.input(id,'owner','sim\r');await manager.input(id,'owner','\x03');
 assert.deepEqual(tty.writes,['read answer\r','sim\r','\x03']);
 assert.match(res.chunks.join(''),new RegExp(Buffer.from('sim\r').toString('base64')));
 await manager.resize(id,'owner',120,40);assert.deepEqual(tty.sizes,[[120,40]]);
 await assert.rejects(manager.input(id,'owner','x'.repeat(9000)),/8 KiB/);
 await assert.rejects(manager.open({container,service:'php',shell:'bash',cols:80,rows:24,owner:'owner'}),/ativo/);
 res.emit('close');await new Promise(r=>setTimeout(r,10));assert.equal(tty.closed,1);assert.equal(busy.at(-1),false);
 assert.deepEqual(events.map(e=>e.event),['terminal.open','terminal.close']);assert.equal(JSON.stringify(events).includes('read answer'),false);
 await manager.dispose();
});

test('transporte Docker usa TTY real, preserva bytes ANSI/UTF8 e envia HUP ao shell do container',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'infra-tty-'));const socketPath=path.join(root,'engine.sock'),calls=[];let peer;
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const data=raw?JSON.parse(raw):{};calls.push({path:req.url,data});
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url.endsWith('/exec')?{Id:'b'.repeat(64)}:{}));
 });
 server.on('upgrade',(req,socket)=>{peer=socket;calls.push({path:req.url});socket.write('HTTP/1.1 101 UPGRADED\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n');socket.write('__INFRA_PID__=42\r\n\x1b[32mOlá\x1b[0m $ ');socket.on('data',data=>socket.write(data));});
 server.listen(socketPath);await once(server,'listening');
 t.after(async()=>{peer?.destroy();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});});
 const tty=await createDockerTTY({socketPath}).open(container,'sh',80,24,'/var/www/html'),output=[];tty.onData(c=>output.push(c));tty.resume();
 await new Promise(r=>setTimeout(r,25));assert.equal(Buffer.concat(output).toString(),'\x1b[32mOlá\x1b[0m $ ');
 tty.write('\x03');await new Promise(r=>setTimeout(r,25));assert.equal(Buffer.concat(output).at(-1),3);
 await tty.resize(100,30);await tty.close();
 assert.equal(calls[0].data.WorkingDir,'/var/www/html');assert.equal(calls[0].data.Tty,true);assert.equal(calls[0].data.AttachStdin,true);assert.deepEqual(calls[0].data.ConsoleSize,[24,80]);
 assert.ok(calls.some(c=>c.path.includes('/resize?h=30&w=100')));
 const kill=calls.find(c=>c.data?.Cmd?.includes('42'));assert.ok(kill);assert.match(kill.path,new RegExp('/containers/'+container+'/exec'));
});

test('HTTP terminal exige login, CSRF, container do projeto e sessão proprietária; logout encerra TTY',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'infra-terminal-api-'));await fs.writeFile(path.join(root,'.env'),'APP_DOMAIN=localhost\nAPP_DIRECTORY=/tmp\n');
 const tty=fakeTTY(),opened=[];let project='infra';
 const executor=async(_,args)=>{
  if(args.includes('config')&&args.includes('--format'))return {stdout:JSON.stringify({name:'infra',services:{php:{},panel:{}}})};
  if(args.includes('ps')&&args.includes('-q'))return {stdout:container};
  if(args[0]==='inspect')return {stdout:JSON.stringify([{Id:container,State:{Running:true},Config:{Labels:{'com.docker.compose.project':project,'com.docker.compose.service':'php'}}}])};
  return {stdout:''};
 };
 const server=createPanel({root,username:'admin',password:'a-long-test-password',executor,terminalEnabled:true,terminalEngine:{open:async(...args)=>{opened.push(args);return tty;}}});server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});});
 const login=async(username='admin',password='a-long-test-password')=>{const res=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username,password})});const {csrf}=await res.json();return {Cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':csrf,'Content-Type':'application/json'};};
 const open= headers=>fetch(base+'/api/services/php/terminal',{method:'POST',headers,body:JSON.stringify({shell:'sh',cols:80,rows:24})});
 assert.equal((await open({})).status,401);const headers=await login();assert.equal((await open({Cookie:headers.Cookie})).status,403);
 project='foreign';assert.equal((await open(headers)).status,403);project='infra';
 const res=await open(headers);assert.equal(res.status,201);const {id}=await res.json();
 const other=await login();assert.equal((await fetch(base+`/api/terminal/${id}/input`,{method:'POST',headers:other,body:'{"data":"hello"}'})).status,404);
 assert.equal((await fetch(base+`/api/terminal/${id}/input`,{method:'POST',headers,body:'{"data":"hello"}'})).status,200);assert.deepEqual(tty.writes,['hello']);
 await fetch(base+'/api/logout',{method:'POST',headers,body:'{}'});assert.equal(tty.closed,1);
 const appOpen=await fetch(base+'/api/apps/main/terminal',{method:'POST',headers:other,body:JSON.stringify({shell:'sh',cols:80,rows:24})});assert.equal(appOpen.status,201);assert.equal(opened.at(-1)[4],'/var/www/html');
 await fetch(base+'/api/logout',{method:'POST',headers:other,body:'{}'});
 const fresh=await login();assert.equal((await fetch(base+'/api/apps/app2/terminal',{method:'POST',headers:fresh,body:JSON.stringify({shell:'sh',cols:80,rows:24})})).status,409);
 const list=await (await fetch(base+'/api/panel-users',{headers:fresh})).json();
 const user={username:'operator',name:'Terminal da aplicação',admin:false,enabled:true,password:'operator-password-long',permissions:['terminal.apps'],terminalApps:['main'],terminalServices:[],services:[],databases:[]};
 const saved=await fetch(base+'/api/panel-users/save',{method:'POST',headers:fresh,body:JSON.stringify({revision:list.revision,user})});assert.equal(saved.status,200);const record=await saved.json();
 const limited=await login('operator','operator-password-long');
 assert.equal((await fetch(base+'/api/config',{headers:limited})).status,403);
 assert.equal((await open(limited)).status,403);
 assert.equal((await fetch(base+'/api/apps/app2/terminal',{method:'POST',headers:limited,body:JSON.stringify({shell:'sh',cols:80,rows:24})})).status,403);
 const granted=await fetch(base+'/api/apps/main/terminal',{method:'POST',headers:limited,body:JSON.stringify({shell:'sh',cols:80,rows:24})});assert.equal(granted.status,201);const grant=await granted.json();
 assert.equal((await fetch(base+`/api/terminal/${grant.id}/input`,{method:'POST',headers:limited,body:'{"data":"pwd\\r"}'})).status,200);
 const revision=(await(await fetch(base+'/api/panel-users',{headers:fresh})).json()).revision;
 const before=tty.closed;
 assert.equal((await fetch(base+'/api/panel-users/save',{method:'POST',headers:fresh,body:JSON.stringify({revision,user:{...user,id:record.user.id,password:'',permissions:[],terminalApps:[]}})})).status,200);
 assert.equal(tty.closed,before+1);
 assert.equal((await fetch(base+`/api/terminal/${grant.id}/input`,{method:'POST',headers:limited,body:'{"data":"pwd"}'})).status,401);

 const nextRevision=(await(await fetch(base+'/api/panel-users',{headers:fresh})).json()).revision;
 assert.equal((await fetch(base+'/api/panel-users/save',{method:'POST',headers:fresh,body:JSON.stringify({revision:nextRevision,user:{...user,id:record.user.id,password:'',permissions:['terminal.services'],terminalApps:[],terminalServices:['php']}})})).status,200);
 const serviceUser=await login('operator','operator-password-long');
 assert.equal((await open(serviceUser)).status,201);
 assert.equal((await fetch(base+'/api/apps/main/terminal',{method:'POST',headers:serviceUser,body:JSON.stringify({shell:'sh',cols:80,rows:24})})).status,403);
 assert.equal((await fetch(base+'/api/services/panel/terminal',{method:'POST',headers:serviceUser,body:JSON.stringify({shell:'sh',cols:80,rows:24})})).status,403);
 await fetch(base+'/api/logout',{method:'POST',headers:serviceUser,body:'{}'});

});
