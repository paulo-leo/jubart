import http from 'node:http';
import {randomBytes} from 'node:crypto';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const dimensions=(cols,rows)=>{if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<20||cols>300||rows<5||rows>120)throw fail('Dimensões do terminal inválidas.');};

// Socket já montado no painel. Os caminhos e comandos do Engine não vêm do cliente.
export function createDockerTTY({socketPath='/var/run/docker.sock'}={}) {
 const request=(method,path,data)=>new Promise((resolve,reject)=>{
  const body=data===undefined?null:Buffer.from(JSON.stringify(data));
  const req=http.request({socketPath,path:'/v1.47'+path,method,headers:body?{'Content-Type':'application/json','Content-Length':body.length}:{}},res=>{
   let output='';res.on('data',chunk=>{output+=chunk;if(output.length>1024*1024)res.destroy(fail('Resposta Docker excessiva.'));});
   res.on('error',reject);res.on('end',()=>{if(res.statusCode>=300)return reject(fail('Docker recusou a operação do terminal.'));try{resolve(output?JSON.parse(output):{});}catch{reject(fail('Resposta Docker inválida.'));}});
  });req.setTimeout(10000,()=>req.destroy(fail('Docker não respondeu.')));req.on('error',reject);req.end(body);
 });
 return {async open(container,shell,cols,rows,workingDirectory){
  const {Id}=await request('POST',`/containers/${container}/exec`,{...(workingDirectory?{WorkingDir:workingDirectory}:{}),AttachStdin:true,AttachStdout:true,AttachStderr:true,Tty:true,ConsoleSize:[rows,cols],Env:['TERM=xterm-256color'],Cmd:['sh','-c','printf "__INFRA_PID__=%s\\n" "$$"; exec "$1" -i','--',shell]});
  let pid=null,header=Buffer.alloc(0),stream;
  const ready=new Promise((resolve,reject)=>{
   const req=http.request({socketPath,path:`/v1.47/exec/${Id}/start`,method:'POST',headers:{Connection:'Upgrade',Upgrade:'tcp','Content-Type':'application/json'} });
   req.on('upgrade',(res,socket,head)=>{stream=socket;socket.pause();if(head.length)socket.unshift(head);resolve(socket);});
   req.on('response',res=>{res.resume();reject(fail('Docker não abriu a sessão TTY.'));});req.on('error',reject);
   req.setTimeout(10000,()=>req.destroy(fail('Tempo excedido ao conectar TTY.')));req.end(JSON.stringify({Detach:false,Tty:true}));
  });
  const socket=await ready;socket.setTimeout(0);
  const listeners=new Set(),exits=new Set();let ended=false;
  socket.on('error',()=>{});
  socket.on('data',chunk=>{
   if(pid===null){header=Buffer.concat([header,chunk]);const end=header.indexOf(10);if(end<0){if(header.length>128)socket.destroy();return;}
    const match=header.subarray(0,end).toString().trim().match(/^__INFRA_PID__=([1-9][0-9]*)$/);if(!match){socket.destroy();return;}pid=match[1];chunk=header.subarray(end+1);header=Buffer.alloc(0);
   }
   if(chunk.length)for(const fn of listeners)fn(chunk);
  });
  socket.on('close',()=>{ended=true;for(const fn of exits)fn();});
  return {onData(fn){listeners.add(fn);},onExit(fn){exits.add(fn);if(ended)queueMicrotask(fn);},resume(){socket.resume();},write(data){if(socket.writableLength>65536)throw fail('Entrada do terminal congestionada.');socket.write(data);},resize(c,r){return request('POST',`/exec/${Id}/resize?h=${r}&w=${c}`);},async close(){
   // HUP encerra o shell conhecido dentro do mesmo container; nenhum PID do host.
   if(pid&&!ended){try{const result=await request('POST',`/containers/${container}/exec`,{Cmd:['sh','-c','kill -HUP "$1" 2>/dev/null || true','--',pid]});await request('POST',`/exec/${result.Id}/start`,{Detach:true,Tty:false});}catch{}}
   socket.destroy();
  }};
 }};
}

export function createTerminalManager({engine=createDockerTTY(),audit=async()=>{},onBusy=()=>{},authorize=async()=>true,idleMs=15*60000,maxMs=60*60000}={}) {
 const terminals=new Map();let opening=false;
 const get=(id,owner)=>{const t=terminals.get(id);if(!t||t.owner!==owner)throw fail('Sessão de terminal não encontrada.',404);return t;};
 async function close(id,reason='closed'){
  const t=terminals.get(id);if(!t)return;terminals.delete(id);clearInterval(t.timer);t.response?.end(`event: exit\ndata: ${JSON.stringify({reason})}\n\n`);
  try{await t.tty.close();}finally{onBusy(false);await audit({actor:t.actor,event:'terminal.close',service:t.service,reason}).catch(()=>{});}
 }
 const send=(t,chunk)=>{
  if(t.response){if(t.response.writableLength>1024*1024){void close(t.id,'slow-client');return;}t.response.write(`data: ${JSON.stringify(chunk.toString('base64'))}\n\n`);}
  else {t.buffer.push(chunk);t.bytes+=chunk.length;if(t.bytes>256*1024)void close(t.id,'output-limit');}
 };
 return {async open({container,service,shell,cols,rows,owner,actor,workingDirectory}){
  if(!/^[a-f0-9]{12,64}$/.test(container)||!['sh','bash'].includes(shell))throw fail('Container ou shell inválido.');dimensions(cols,rows);
  if(workingDirectory!==undefined&&(!/^\/var\/www\/html(?:\/[A-Za-z0-9_.-]+)*$/.test(workingDirectory)||workingDirectory.split('/').includes('..')))throw fail('Diretório da aplicação inválido.');
  if(opening||terminals.size)throw fail('Já existe um terminal ativo. Encerre a sessão anterior.',409);
  opening=true;onBusy(true);let tty,createdId;
  try{
   tty=await engine.open(container,shell,cols,rows,workingDirectory);
   const id=randomBytes(24).toString('hex'),t={id,owner,actor,service,tty,buffer:[],bytes:0,response:null,started:Date.now(),lastInput:Date.now()};terminals.set(id,t);createdId=id;
   tty.onData(chunk=>send(t,chunk));tty.onExit(()=>{void close(id,'process-exited');});
   t.timer=setInterval(async()=>{try{if(Date.now()-t.lastInput>idleMs||Date.now()-t.started>maxMs||!await authorize(owner))return await close(id,'expired');t.response?.write(': keepalive\n\n');}catch{await close(id,'authorization-failed');}},10000);t.timer.unref();
   await audit({actor,event:'terminal.open',service,shell});tty.resume();return {id};
  }catch(error){if(createdId)await close(createdId,'open-failed');else if(tty)await tty.close();onBusy(false);throw error;}finally{opening=false;}
 },attach(id,owner,req,res){const t=get(id,owner);if(t.response)throw fail('Terminal já conectado.',409);
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'});res.flushHeaders();t.response=res;
  for(const chunk of t.buffer)send(t,chunk);t.buffer=[];t.bytes=0;
  res.on('close',()=>{void close(id,'disconnected');});
 },async input(id,owner,data){const t=get(id,owner);if(typeof data!=='string'||!data.length||Buffer.byteLength(data)>8192)throw fail('Entrada inválida (máximo 8 KiB).');t.lastInput=Date.now();t.tty.write(data);return {ok:true};},async resize(id,owner,cols,rows){const t=get(id,owner);dimensions(cols,rows);await t.tty.resize(cols,rows);return {ok:true};},async close(id,owner){get(id,owner);await close(id);return {ok:true};},async closeOwner(owner){await Promise.all([...terminals.values()].filter(t=>t.owner===owner).map(t=>close(t.id,'logout')));},async dispose(){await Promise.all([...terminals.keys()].map(id=>close(id,'server-shutdown')));}};
}
