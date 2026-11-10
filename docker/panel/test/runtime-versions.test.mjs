import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runtimeTag,resolveRuntime,createRuntimeVersions} from '../runtime-versions.mjs';
import {fromEnv} from '../core.mjs';
test('resolve somente imagens Node/FrankenPHP e preserva digest do registro',async()=>{
 assert.throws(()=>runtimeTag('node',{tag:'latest'}));assert.throws(()=>runtimeTag('php',{phpVersion:'8;ls',frankenVersion:'1'}));const calls=[];const digest='sha256:'+'a'.repeat(64);
 const result=await resolveRuntime('node',{tag:'24-bookworm-slim'},async(url,options)=>{calls.push({url,options});return url.includes('auth.docker.io')?{ok:true,json:async()=>({token:'registry-token'})}:{ok:true,headers:{get:()=>digest}};});assert.equal(result.reference,`node:24-bookworm-slim@${digest}`);assert.equal(calls[1].options.method,'HEAD');assert.equal(calls[1].options.redirect,'error');
});
test('troca Node das aplicações sem alterar o Node do painel; aplica somente serviços afetados',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'versions-'));try{
 const digest='sha256:'+'b'.repeat(64);await fs.writeFile(path.join(root,'.env'),`NODE_VERSION=24-bookworm-slim@${digest}\nPHP_VERSION=8.4.27\nFRANKENPHP_VERSION=1\nFRANKENPHP_DIGEST=${digest}\n`);const config=fromEnv({});config.applications[1].enabled=true;config.applications[1].type='node';const calls=[];
 const api=createRuntimeVersions({root,readEnv:()=>fs.readFile(path.join(root,'.env'),'utf8'),loadConfig:async()=>({config}),compose:async args=>{calls.push(args);return args.includes('ps')?JSON.stringify([{Service:'vite',State:'running'}]):'';},startOperation:(label,run)=>({run})});
 const initial=await api.read();await api.save('node',{tag:'22-bookworm-slim',digest,revision:initial.revision});const env=await fs.readFile(path.join(root,'.env'),'utf8');assert.match(env,/NODE_VERSION=24-bookworm-slim/);assert.match(env,/APP_NODE_VERSION=22-bookworm-slim/);assert.match(await fs.readFile(path.join(root,'config/apps.compose.yaml'),'utf8'),/APP_NODE_VERSION/);
 await assert.rejects(api.save('node',{tag:'22-bookworm-slim',digest,revision:initial.revision}));const next=await api.read();const op=await api.apply('node',{revision:next.revision});await op.operation.run();const up=calls.find(c=>c.includes('up'));assert(up.includes('php-app2'));assert(up.includes('vite'));assert(!up.includes('panel'));assert(!up.includes('php'));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
