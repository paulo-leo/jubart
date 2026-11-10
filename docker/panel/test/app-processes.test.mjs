import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {listProcessesScript,signalProcessScript,parseProcesses,validateSignal,createAppProcesses} from '../app-processes.mjs';
test('lista processos sem argumentos e protege PID 1 e parâmetros de sinal',()=>{
 const rows=parseProcesses(execFileSync('sh',['-c',listProcessesScript],{encoding:'utf8'}));assert(rows.length);assert(rows.every(p=>Number.isInteger(p.pid)&&/^\d+$/.test(p.started)));assert(rows.every(p=>!Object.hasOwn(p,'args')));
 const valid={pid:20,started:'12345',container:'a'.repeat(64),signal:'TERM'};validateSignal(valid);
 for(const change of [{pid:1},{pid:-1},{signal:'STOP'},{started:'1;ls'},{container:'../host'}])assert.throws(()=>validateSignal({...valid,...change}));
 assert.throws(()=>execFileSync('sh',['-c',signalProcessScript,'--','1','1','TERM'],{stdio:'pipe'}));
 assert.throws(()=>execFileSync('sh',['-c',signalProcessScript,'--',String(process.pid),'0','TERM'],{stdio:'pipe'}));
});
test('sinal fica restrito à aplicação, container e namespace verificados; registra auditoria',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'processes-'));try{
 const id='a'.repeat(64),calls=[];let mode='';const labels={'com.docker.compose.project':'infra','com.docker.compose.service':'php'};
 const api=createAppProcesses({root,loadConfig:async()=>({config:{applications:[{id:'main',enabled:true,type:'php',name:'Principal'}]}}),composeConfig:async()=>({name:'infra'}),docker:async args=>{calls.push(args);if(args[0]==='ps')return id;if(args[0]==='inspect')return JSON.stringify([{Id:id,Config:{Labels:labels},HostConfig:{PidMode:mode}}]);if(args.includes(listProcessesScript))return '2\t1\t1234\tS\t512\tworker';return '';},startOperation:(label,task)=>task()});
 assert.equal((await api.list('main')).processes[0].rss,512*1024);
 const data={pid:2,started:'1234',container:id,signal:'TERM'};const op=await api.signal('main',data,'admin');await op.operation;assert(calls.some(args=>args.includes(signalProcessScript)&&args.at(-1)==='TERM'));assert.match(await fs.readFile(path.join(root,'.panel-state/process-actions.jsonl'),'utf8'),/signal-sent/);
 await assert.rejects(api.signal('main',{...data,container:'b'.repeat(64)},'admin'));mode='host';await assert.rejects(api.list('main'));await assert.rejects(api.list('app2'));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
