import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import {createPanel} from '../server.mjs';
test('arquitetura não possui página pública e APIs administrativas exigem autenticação',async t=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'jubart-public-architecture-'));await fs.writeFile(path.join(root,'.env'),'APP_DOMAIN=private-local.example\nDB_PASSWORD=never-publish-this-secret\n');const server=createPanel({root,username:'admin',password:'administrator-password'});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await server.shutdown();await fs.rm(root,{recursive:true,force:true});});const base='http://127.0.0.1:'+server.address().port,response=await fetch(base+'/how-it-works');assert.equal(response.status,404);for(const route of ['/api/config','/api/plugins','/api/mercure','/api/panel-maintenance','/api/topology','/api/status','/api/documentation','/api/infra-env'])assert.equal((await fetch(base+route)).status,401);assert.equal((await fetch(base+'/how-it-works',{method:'POST'})).status,405);});
