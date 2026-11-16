import test from 'node:test';
import assert from 'node:assert/strict';
import { automationCompose, validateAutomation, emptyAutomation } from '../automation.mjs';
const worker = () => ({ id: 'worker-aabbccddeeff', app: 'main', queue: 'emails', connection: 'redis', sleep: 3, tries: 3, timeout: 60, stopGrace: 90, enabled: false });
test('gera workers isolados do servidor HTTP e desabilitados por padrão', () => {
  const config = emptyAutomation(); config.workers.push(worker());
  const service = automationCompose(config).services['worker-aabbccddeeff'];
  assert.deepEqual(service.profiles, ['automation-disabled']);
  assert.equal(service.extends.service, 'php');
  assert.notEqual(service.container_name, 'php');
  assert.ok(service.command.includes('queue:work'));
  assert.ok(service.command.includes('--queue=emails'));
  assert.equal(service.stop_grace_period, '90s');
  assert.equal(service.ports, undefined);
  assert.deepEqual(service.healthcheck, {test:['NONE']});
  config.schedulers.push({id:'scheduler-112233445566',app:'main',enabled:false});
  assert.deepEqual(automationCompose(config).services['scheduler-112233445566'].healthcheck, {test:['NONE']});
});
test('herda diretório e banco corretos de outra aplicação sem gravar credenciais', () => {
  const config = emptyAutomation(), item = worker(); item.app = 'app2'; item.enabled = true; config.workers.push(item);
  const service = automationCompose(config).services[item.id];
  assert.equal(service.environment.DB_PASSWORD, '${APP_2_DB_PASSWORD}');
  assert.equal(service.volumes[0].source, '${APP_2_DIRECTORY}');
  assert.deepEqual(service.profiles, ['automation']);
});
test('rejeita filas injetadas, sync, timeout sem margem e classes fora de App\\Jobs', () => {
  for (const mutate of [w => w.queue = 'default; rm -rf /', w => w.connection = 'sync', w => w.stopGrace = 60]) {
    const config = emptyAutomation(); config.workers.push(worker()); mutate(config.workers[0]); assert.throws(() => validateAutomation(config));
  }
  const config = emptyAutomation(); config.jobs.push({id:'job-aabbccddeeff',app:'main',name:'Inválido',class:'PDO'});
  assert.throws(() => validateAutomation(config));
});
test('evita scheduler duplicado e múltiplos consumidores cadastrados para a mesma fila', () => {
  const config = emptyAutomation(); config.workers.push(worker(), {...worker(), id:'worker-112233445566'}); assert.throws(() => validateAutomation(config));
  const schedule = emptyAutomation(); schedule.schedulers.push({id:'scheduler-aabbccddeeff',app:'main',enabled:false},{id:'scheduler-112233445566',app:'main',enabled:false}); assert.throws(() => validateAutomation(schedule));
});
