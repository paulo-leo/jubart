import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { automationCompose } from '../automation.mjs';

test('Compose real resolve serviços gerados sem colidir com container php ou expor portas', async t => {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
  try { execFileSync('docker',['compose','version'],{stdio:'pipe'}); } catch { t.skip('CLI Docker Compose indisponível');return; }
  const generated=path.join(root,'config',`.automation-test-${process.pid}.json`);
  t.after(()=>fs.rm(generated,{force:true}));
  await fs.writeFile(generated,JSON.stringify(automationCompose({version:1,workers:[{id:'worker-aabbccddeeff',app:'app2',queue:'emails',connection:'redis',tries:3,sleep:3,timeout:60,stopGrace:90,enabled:true}],schedulers:[{id:'scheduler-aabbccddeeff',app:'main',enabled:false}],jobs:[]})));
  const config=JSON.parse(execFileSync('docker',['compose','--profile','automation','--profile','automation-disabled','--profile','app2','-f','compose.yaml','-f',generated,'config','--format','json'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const worker=config.services['worker-aabbccddeeff'],scheduler=config.services['scheduler-aabbccddeeff'];
  assert.notEqual(worker.container_name,config.services.php.container_name);
  assert.notEqual(scheduler.container_name,config.services.php.container_name);
  assert.equal(worker.environment.DB_DATABASE,config.services['php-app2']?.environment.DB_DATABASE || 'app2');
  assert.equal(worker.environment.QUEUE_CONNECTION,'redis');
  assert.ok(worker.command.includes('queue:work'));assert.ok(scheduler.command.includes('schedule:work'));
  assert.equal(worker.ports,undefined);assert.equal(scheduler.ports,undefined);
  assert.ok(worker.volumes.some(v=>v.target==='/opt/infra/automation.php'));
  assert.equal(worker.volumes.filter(v=>v.target==='/var/www/html').length,1);
  assert.deepEqual(scheduler.profiles,['automation-disabled']);
});
