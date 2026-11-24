// Opt-in integration: local images only, isolated containers, no published ports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {proxyHostRoutes} from '../proxy-hosts.mjs';
const execute=promisify(execFile);

test('Traefik real filtra métodos em todos os domínios, preserva o verbo e recarrega a opção Todos',{
 skip:process.env.JUBART_METHODS_DOCKER_QA!=='1',timeout:60000,
},async()=>{
 const project=path.resolve(import.meta.dirname,'../../..'),root=await fs.mkdtemp(path.join(os.tmpdir(),'jubart-methods-')),name='jubart-methods-test-'+randomBytes(6).toString('hex');
 const docker=async args=>(await execute('docker',args,{cwd:project,timeout:45000,maxBuffer:2*1024*1024})).stdout;
 try{
  const traefikImage=(await docker(['compose','images','-q','traefik'])).trim().split('\n')[0],nodeImage=(await docker(['compose','images','-q','panel'])).trim().split('\n')[0];
  assert.ok(/^(?:sha256:)?[a-f0-9]{12,64}$/.test(traefikImage),'Traefik local não encontrado');assert.ok(/^(?:sha256:)?[a-f0-9]{12,64}$/.test(nodeImage),'Imagem local do painel não encontrada');
  const base={name:'Teste',scheme:'http',host:'127.0.0.1',port:3001,enabled:true,tls:false,forceHttps:false,passHostHeader:true,allowedIPs:[]};
  const records=[{...base,id:'proxy-aabbccddeeff',domains:['one.example.com','two.example.com'],methods:['GET','POST','OPTIONS']},{...base,id:'proxy-001122334455',domains:['legacy.example.com']}];
  const config=proxyHostRoutes(records),unrestricted=proxyHostRoutes(records.map(record=>({...record,methods:[]})));
  await fs.writeFile(path.join(root,'routes.yml'),config);
  await docker(['run','-d','--pull=never','--name',name,'--network','none','--user',`${process.getuid()}:${process.getgid()}`,'--read-only','--cap-drop=ALL','--pids-limit','128','--memory','256m','--mount',`type=bind,source=${root},target=/routes,readonly`,traefikImage,'--entrypoints.web.address=:8080','--providers.file.directory=/routes','--providers.file.watch=true','--global.checknewversion=false','--global.sendanonymoususage=false','--log.level=ERROR']);
  const script=`
   const http=await import('node:http'),fs=await import('node:fs/promises');
   const seen=[];const upstream=http.createServer((req,res)=>{seen.push({method:req.method,host:req.headers.host});res.end(req.method);});
   await new Promise(resolve=>upstream.listen(3001,'127.0.0.1',resolve));
   let lastStatus;
   const request=(host,method)=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:8080,path:'/test',headers:{Host:host},method},res=>{res.resume();res.on('end',()=>{lastStatus=res.statusCode;resolve(res.statusCode);});});req.setTimeout(2000,()=>req.destroy(new Error('Timeout HTTP')));req.on('error',reject);req.end();});
   const wait=async predicate=>{for(let i=0;i<80;i++){try{if(await predicate())return;}catch{}await new Promise(resolve=>setTimeout(resolve,150));}throw new Error('Traefik não aplicou as rotas esperadas. Último HTTP: '+lastStatus); };
   try{
    await wait(async()=>await request('one.example.com','GET')===200);seen.length=0;
    let assertions=0;
    for(const host of ['one.example.com','two.example.com'])for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']){
     const allowed=['GET','POST','OPTIONS'].includes(method),before=seen.length,status=await request(host,method);
     if(status!==(allowed?200:404)||seen.length!==before+(allowed?1:0))throw new Error(host+' '+method+' status '+status);
     if(allowed&&(seen.at(-1).method!==method||seen.at(-1).host!==host))throw new Error('O verbo ou Host foi alterado.');assertions++;
    }
    if(await request('legacy.example.com','PATCH')!==200||await request('unknown.example.com','GET')!==404)throw new Error('Rota legada ou isolamento de domínio incorreto.');assertions+=2;
    await fs.writeFile('/routes/next.tmp',${JSON.stringify(unrestricted)});await fs.rename('/routes/next.tmp','/routes/routes.yml');
    await wait(async()=>await request('one.example.com','DELETE')===200);
    for(const host of ['one.example.com','two.example.com'])for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']){if(await request(host,method)!==200)throw new Error('Todos continuou restringindo '+host+' '+method);assertions++;}
    process.stdout.write(JSON.stringify({assertions,passed:true})+'\\n');
   }finally{await new Promise(resolve=>upstream.close(resolve));}
  `;
  let output;try{output=await docker(['run','--rm','--pull=never','--network','container:'+name,'--user',`${process.getuid()}:${process.getgid()}`,'--read-only','--cap-drop=ALL','--pids-limit','128','--memory','256m','--mount',`type=bind,source=${root},target=/routes`,'--entrypoint','node',nodeImage,'--input-type=module','-e',script]);}catch(error){const logs=await docker(['logs',name]).catch(()=> '');throw new Error(String(error.stderr||error.message).slice(-1600)+' · '+logs.slice(-3000));}
  const result=JSON.parse(output);assert.equal(result.passed,true);assert.equal(result.assertions,30);
 }finally{
  await docker(['rm','-f',name]).catch(()=>{});
  await fs.rm(root,{recursive:true,force:true});
 }
});
