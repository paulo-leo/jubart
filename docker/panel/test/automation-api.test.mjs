import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { createPanel } from '../server.mjs';

test('cadastra, inicia, consulta e para fila; registra job e Scheduler com ações limitadas', async t => {
  const root = await fs.mkdtemp('/tmp/infra-automation-test-');
  await fs.writeFile(path.join(root,'.env'),'APP_DIRECTORY=/projects/main\nAPP_DOMAIN=localhost\n');
  const calls = [];
  const executor = async (_, args, options) => {
    calls.push({args, input:options.input});
    if (args.includes('config') && args.includes('--format')) return { stdout: JSON.stringify({name:'laravel',services:{php:{},panel:{}}}) };
    if (args.includes('/opt/infra/automation.php')) {
      const action = args.at(-1), input = JSON.parse(options.input);
      if (action === 'status') return {stdout:'__INFRA_JSON__'+JSON.stringify({ok:true,data:{queues:input.queues.map(q=>({id:q.id,counts:{total:4,pending:3,reserved:1,delayed:0}})),failed:[{id:'123',queue:'emails',connection:'redis',failedAt:'2026-11-09'}]}})};
      if (action === 'validate-worker') return {stdout:'__INFRA_JSON__{"ok":true,"data":{"valid":true}}'};
      assert.equal(action,'dispatch'); assert.equal(input.class,'App\\Jobs\\EnviarEmail'); assert.equal(input.queue,'emails'); assert.deepEqual(input.arguments,[123]);
      return {stdout:'__INFRA_JSON__{"ok":true,"data":{"queued":true}}'};
    }
    if (args.includes('schedule:list')) return {stdout:'0 3 * * * Gerar relatório'};
    if (args.includes('ps')) return {stdout:'[]'};
    return {stdout:''};
  };
  const server=createPanel({root,username:'paulo',password:'panel-test-password',executor}); server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username:'paulo',password:'panel-test-password'})});
  const headers={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':(await login.json()).csrf,'Content-Type':'application/json'};
  const request=async(route,data)=>{const response=await fetch(base+route,{headers,method:data?'POST':'GET',...(data?{body:JSON.stringify(data)}:{})});return {status:response.status,...await response.json()};};
  const wait=async()=>{let result;for(let n=0;n<50;n++){result=(await request('/api/operation')).operation;if(result.state!=='running')break;await new Promise(r=>setTimeout(r,10));}assert.equal(result.state,'success',result.message);};
  let registry=await request('/api/automation');
  assert.equal((await request('/api/automation/register',{revision:registry.revision,kind:'worker',app:'main',queue:'emails',connection:'redis',tries:3,sleep:3,timeout:60,stopGrace:90})).status,202);await wait();
  registry=await request('/api/automation');const worker=registry.config.workers[0];assert.equal(worker.enabled,false);
  assert.equal((await request(`/api/automation/${worker.id}/start`,{})).status,202);await wait();
  const env=await fs.readFile(path.join(root,'.env'),'utf8');assert.match(env,/COMPOSE_PROFILES='automation'/);
  const details=await request('/api/automation/apps/main');assert.equal(details.statistics.queues[0].counts.total,4);assert.match(details.schedules,/relatório/);
  registry=await request('/api/automation');await request('/api/automation/register',{revision:registry.revision,kind:'job',app:'main',name:'Enviar email',class:'App\\Jobs\\EnviarEmail'});await wait();
  registry=await request('/api/automation');const job=registry.config.jobs[0];
  await request(`/api/automation/${job.id}/dispatch`,{worker:worker.id,arguments:[123]});await wait();
  assert.equal((await request(`/api/automation/${job.id}/dispatch`,{worker:'worker-000000000000',arguments:[]})).status,400);
  assert.equal((await request('/api/automation/apps/main/retry',{id:'all;rm'})).status,400);
  registry=await request('/api/automation');await request('/api/automation/register',{revision:registry.revision,kind:'scheduler',app:'main'});await wait();
  registry=await request('/api/automation');const scheduler=registry.config.schedulers[0];await request(`/api/automation/${scheduler.id}/start`,{});await wait();
  await request(`/api/automation/${worker.id}/stop`,{});await wait();
  registry=await request('/api/automation');assert.equal(registry.config.workers[0].enabled,false);assert.equal(registry.config.schedulers[0].enabled,true);
  assert.ok(calls.some(c=>c.args.includes('stop')&&c.args.includes('90')&&c.args.includes(worker.id)));
  assert.equal(calls.some(c=>c.args.includes('down')||c.args.includes('-v')||c.args.includes('queue:clear')),false);
  assert.ok(calls.some(c=>c.args.includes('up')&&c.args.includes('--no-deps')&&c.args.includes(worker.id)));
  const applications=JSON.parse(await fs.readFile(path.join(root,'config/apps.json'),'utf8'));
  applications.applications[0].type='node';await fs.writeFile(path.join(root,'config/apps.json'),JSON.stringify(applications));
  registry=await request('/api/automation');
  assert.equal((await request('/api/automation/register',{revision:registry.revision,kind:'scheduler',app:'main'})).status,400);
  assert.equal((await request(`/api/automation/${scheduler.id}/start`,{})).status,400);

});
