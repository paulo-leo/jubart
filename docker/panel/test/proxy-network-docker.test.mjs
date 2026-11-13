import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {createProxyNetwork,initializeProxyNetwork,proxyComposeArgs} from '../proxy-network.mjs';

const execute=promisify(execFile);
test('Docker local isolado: instalação, migração, recriação com IP fixo e rollback preservam aplicação/rede', {skip:process.env.JUBART_PROXY_DOCKER_TEST!=='1',timeout:120000},async()=>{
 const docker=async args=>(await execute('docker',args,{timeout:90000,maxBuffer:4*1024*1024})).stdout;
 const fixture=async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'jubart-proxy-docker-')),project='jubart-proxy-test-'+randomBytes(5).toString('hex');
  await fs.writeFile(path.join(root,'.env'),'COMPOSE_PROJECT_NAME='+project+'\n');
  await fs.writeFile(path.join(root,'compose.yaml'),`services:
  traefik:
    image: traefik:v3.7
    command: ["--entrypoints.web.address=:80", "--log.level=ERROR"]
    mem_limit: 96m
    networks:
      proxy:
        ipv4_address: \${JUBART_TRAEFIK_IPV4:-}
  php:
    image: node:24.22.2
    command: ["node", "-e", "setInterval(()=>{},1000)"]
    mem_limit: 96m
    networks: [proxy]
networks:
  proxy:
    driver: bridge
`);
  const compose=async args=>docker(['compose','--project-name',project,'--project-directory',root,'--env-file',path.join(root,'.env'),'-f',path.join(root,'compose.yaml'),...proxyComposeArgs(root),...args]);
  const tasks=[];const api=createProxyNetwork({root,readEnv:()=>fs.readFile(path.join(root,'.env'),'utf8'),composeConfig:async()=>JSON.parse(await compose(['config','--format','json'])),compose,docker,startOperation:(label,task)=>{tasks.push(task);return {id:'integration'};},audit:async()=>{}});
  return {root,project,compose,api,run:()=>tasks.shift()(),cleanup:async()=>{try{await compose(['down','--timeout','3','--remove-orphans']);}finally{await fs.rm(root,{recursive:true,force:true});}}};
 };
 const existing=await fixture();
 try{
  await existing.compose(['up','-d','--no-build']);
  const before=await existing.api.read();assert.equal(before.available,true);assert.equal(before.fixed,false);
  const phpBefore=(await existing.compose(['ps','-q','php'])).trim();
  await existing.api.apply({revision:before.revision},'integration');await existing.run();
  const after=await existing.api.read();assert.equal(after.fixed,true);assert.equal(after.ipv4,before.ipv4);assert.equal(after.network,before.network);
  assert.equal((await existing.compose(['ps','-q','php'])).trim(),phpBefore);
  await existing.compose(['up','-d','--no-deps','--no-build','--force-recreate','traefik']);
  const recreated=await existing.api.read();assert.equal(recreated.fixed,true);assert.equal(recreated.ipv4,before.ipv4);
  await existing.api.rollback({revision:recreated.revision},'integration');await existing.run();
  const rollback=await existing.api.read();assert.equal(rollback.available,true);assert.equal(rollback.fixed,false);assert.equal(rollback.network,before.network);
  assert.equal((await existing.compose(['ps','-q','php'])).trim(),phpBefore);
 }finally{await existing.cleanup();}
 const fresh=await fixture();
 try{
  const ids=(await docker(['network','ls','-q'])).trim().split(/\s+/).filter(Boolean);
  const networks=ids.length?JSON.parse(await docker(['network','inspect',...ids])):[];
  const routes=JSON.parse((await execute('ip',['-j','-4','route','show','table','all'])).stdout);
  const allocation=await initializeProxyNetwork(fresh.root,{networks,containers:[],hostRoutes:routes});assert.equal(allocation.status,'prepared');
  await fresh.compose(['up','-d','--no-build']);
  const current=await fresh.api.read();assert.equal(current.fixed,true);assert.equal(current.ipv4,allocation.ipv4);
  const phpID=(await fresh.compose(['ps','-q','php'])).trim();
  const php=JSON.parse(await docker(['inspect',phpID]))[0],address=php.NetworkSettings.Networks[current.network].IPAddress;
  assert.notEqual(address,allocation.ipv4);assert.ok(Number(address.split('.')[3])>=128);
  await fresh.compose(['up','-d','--no-deps','--no-build','--force-recreate','traefik']);
  assert.equal((await fresh.api.read()).ipv4,allocation.ipv4);
 }finally{await fresh.cleanup();}
});
