import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Readable} from 'node:stream';
import {createTransfers,transferCommand} from '../sql-transfers.mjs';
import {createHostInfo} from '../host-info.mjs';
test('fila serializa exports, preserva SQL em disco e não persiste senha de importação',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sql-queue-'));try{await fs.writeFile(path.join(root,'.env'),'POSTGRES_USER=infra_admin\nSQL_UPLOAD_MAX_BYTES=1024\n');let simultaneous=0,max=0;const seen=[];const transfers=createTransfers({root,runner:async({job,input,password,output,onBytes})=>{simultaneous++;max=Math.max(max,simultaneous);await new Promise(r=>setTimeout(r,20));if(job.kind==='export'){await fs.writeFile(output,'CREATE TABLE sample(id int);');onBytes(28);}else{assert.equal(password,'private-secret');seen.push(await fs.readFile(input,'utf8'));}simultaneous--;}});
 await transfers.enqueue('export',{engine:'mariadb',database:'appdb'});await transfers.enqueue('export',{engine:'postgres',database:'appdb'});
 const upload=Readable.from(['INSERT INTO sample VALUES (1);']);upload.headers={};const file=await transfers.upload(upload);await transfers.enqueue('import',{engine:'mariadb',database:'appdb',user:'appuser',password:'private-secret',uploadId:file.uploadId});
 for(let i=0;i<100;i++){if((await transfers.list()).jobs.every(j=>j.state==='success'))break;await new Promise(r=>setTimeout(r,10));}
 const list=await transfers.list();assert.equal(list.jobs.length,3);assert.ok(list.jobs.every(j=>j.state==='success'));assert.equal(max,1);assert.equal(seen.length,1);assert.equal(JSON.stringify(list).includes('private-secret'),false);assert.equal((await fs.readFile(path.join(root,'.panel-state/sql-transfers/jobs.json'),'utf8')).includes('private-secret'),false);
 const tooBig=Readable.from([Buffer.alloc(2048)]);tooBig.headers={};await assert.rejects(transfers.upload(tooBig),/limite/);
 assert.throws(()=>transferCommand('postgres','export','postgres'),/protegido|sistema|reservado/i);assert.throws(()=>transferCommand('mariadb','export','db;rm'),/nome|inválido/i);
 const cmd=transferCommand('postgres','import','appdb','appuser');assert.ok(cmd.includes('65534:65534'));assert.ok(cmd.includes('env'));assert.ok(cmd.includes('-i'));assert.equal(cmd.includes('private-secret'),false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('host lê somente fontes próprias do host e calcula CPU por intervalo',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'host-info-'));try{await fs.mkdir(path.join(base,'proc'));await fs.mkdir(path.join(base,'etc'));const fixtures={'proc/cpuinfo':'processor : 0\nmodel name : Host CPU\n','proc/meminfo':'MemTotal: 1000 kB\nMemAvailable: 400 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n','proc/stat':'cpu 100 0 0 100 0 0 0 0\n','proc/uptime':'12345 100\n','proc/loadavg':'1 2 3 1/2 42','etc/os-release':'PRETTY_NAME="Host OS"\n','etc/hostname':'my-vps\n'};for(const [file,value]of Object.entries(fixtures))await fs.writeFile(path.join(base,file),value);const read=createHostInfo({base,docker:async()=>JSON.stringify({NCPU:1,OperatingSystem:'ignored',KernelVersion:'host-kernel'})});assert.equal((await read()).cpuPercent,null);await fs.writeFile(path.join(base,'proc/stat'),'cpu 150 0 0 150 0 0 0 0\n');const data=await read();assert.equal(data.cpuPercent,50);assert.equal(data.name,'my-vps');assert.equal(data.os,'Host OS');assert.equal(data.memoryUsed,600*1024);assert.equal(data.kernel,'host-kernel');}finally{await fs.rm(base,{recursive:true,force:true});}
});
