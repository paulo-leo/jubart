import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {memoryKey,memoryValue,storageReport,createResourceAPI} from '../resources.mjs';
import {fromEnv} from '../core.mjs';

test('limites validam serviço e MiB sem interpolação arbitrária',()=>{
 assert.equal(memoryKey('php-app4'),'CONTAINER_MEMORY_PHP_APP4');assert.equal(memoryValue(512),'512m');assert.equal(memoryValue(0),'0');
 for(const value of [-1,1,63,64.5,'512',1048577])assert.throws(()=>memoryValue(value));for(const id of ['x;ls','../php','PHP'])assert.throws(()=>memoryKey(id));
});
test('disco isola projeto e conta volume compartilhado uma única vez',async()=>{
 const label=service=>({'com.docker.compose.project':'infra','com.docker.compose.service':service});
 const data=await storageReport({root:'/tmp',definition:{name:'infra'},readDisk:async()=>({LayersSize:1000,Images:[{}],Containers:[{Id:'a',Labels:label('php'),SizeRw:10,Mounts:[{Type:'volume',Name:'shared'}]},{Id:'b',Labels:label('worker'),SizeRw:20,Mounts:[{Type:'volume',Name:'shared'}]},{Id:'c',Labels:{'com.docker.compose.project':'other'},SizeRw:900}],Volumes:[{Name:'shared',UsageData:{Size:100}},{Name:'other',UsageData:{Size:700}}]})});
 assert.equal(data.containers.length,2);assert.equal(data.projectWritable,30);assert.equal(data.projectVolumes,100);assert.equal(data.volumes[0].containers.length,2);assert.equal(data.docker.layers,1000);
});
test('RAM atualiza somente container do projeto e persiste no ambiente e Compose gerado',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'resource-'));try{
 await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'.env'),'CONTAINER_MEMORY_PHP=0\n');const calls=[];
 const config=fromEnv({APP_DIRECTORY:'/tmp',APP_DOMAIN:'localhost',HTTP_PORT:'8080',HTTPS_PORT:'8443'});
 const api=createResourceAPI({root,readEnv:()=>fs.readFile(path.join(root,'.env'),'utf8'),loadConfig:async()=>({config}),composeConfig:async()=>({name:'infra',services:{php:{}}}),docker:async args=>{calls.push(args);if(args[0]==='ps')return 'abc';if(args[0]==='inspect')return JSON.stringify([{Id:'abc',Config:{Labels:{'com.docker.compose.service':'php'}},HostConfig:{Memory:0},State:{Status:'running'}}]);return '';},startOperation:(label,task)=>task()});
 const result=await api.save({service:'php',memoryMiB:512,previous:'0'});await result.operation;
 assert(calls.some(args=>JSON.stringify(args)===JSON.stringify(['update','--memory','512m','--memory-swap','512m','abc'])));assert.match(await fs.readFile(path.join(root,'.env'),'utf8'),/CONTAINER_MEMORY_PHP=512m/);
 await assert.rejects(api.save({service:'external',memoryMiB:512,previous:'0'}));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
