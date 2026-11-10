import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
test('Compose aplica IPs/portas externos e engine padrão sem trocar portas internas ou volumes',t=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
 try{execFileSync('docker',['compose','version'],{stdio:'pipe'});}catch{t.skip('Docker Compose indisponível');return;}
 const config=JSON.parse(execFileSync('docker',['compose','config','--format','json'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,MARIADB_BIND_ADDRESS:'127.0.0.1',MARIADB_PORT:'13306',POSTGRES_BIND_ADDRESS:'0.0.0.0',POSTGRES_PORT:'15432',PANEL_BIND_ADDRESS:'0.0.0.0',PANEL_PORT:'19090',MARIADB_DEFAULT_STORAGE_ENGINE:'InnoDB'}}));
 for(const [service,ip,published,target] of [['mariadb','127.0.0.1','13306',3306],['postgres','0.0.0.0','15432',5432],['panel','0.0.0.0','19090',3000]]){
  const port=config.services[service].ports[0];assert.equal(port.host_ip,ip);assert.equal(port.published,published);assert.equal(port.target,target);
 }
 assert.ok(config.services.mariadb.command.includes('--default-storage-engine=InnoDB'));
 assert.ok(config.services.mariadb.volumes.some(v=>v.type==='volume'&&v.source==='mariadb_data'));
 assert.ok(config.services.postgres.volumes.some(v=>v.type==='volume'&&v.source==='postgres_data'));
});
