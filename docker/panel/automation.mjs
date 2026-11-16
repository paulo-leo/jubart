import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { slots, atomicWrite } from './core.mjs';
const assert = (test, message) => { if (!test) throw new Error(message); };
export const emptyAutomation = () => ({ version: 1, workers: [], schedulers: [], jobs: [] });
export const newId = prefix => `${prefix}-${randomBytes(6).toString('hex')}`;
export function validateAutomation(config) {
  assert(config?.version === 1 && ['workers', 'schedulers', 'jobs'].every(k => Array.isArray(config[k]) && config[k].length <= 50), 'Cadastro de automações inválido (máximo 50 por categoria).');
  const ids = new Set(), queues = new Set(), schedulers = new Set();
  for (const item of [...config.workers, ...config.schedulers, ...config.jobs]) {
    assert(typeof item.id === 'string' && /^(worker|scheduler|job)-[a-f0-9]{12}$/.test(item.id) && !ids.has(item.id), 'ID inválido/duplicado.'); ids.add(item.id);
    assert(Object.hasOwn(slots, item.app), 'Aplicação inválida.');
  }
  for (const w of config.workers) {
    assert(typeof w.queue === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(w.queue), 'Nome da fila deve conter letras, números, ponto, hífen ou sublinhado.');
    assert(['redis', 'database'].includes(w.connection), 'Use conexão redis ou database.');
    for (const [key, min, max] of [['tries', 1, 20], ['timeout', 1, 3600], ['sleep', 1, 60], ['stopGrace', 10, 3700]]) assert(Number.isInteger(w[key]) && w[key] >= min && w[key] <= max, `${key} fora do intervalo permitido.`);
    assert(w.stopGrace > w.timeout, 'O tempo de parada deve ser maior que o timeout.');
    assert(typeof w.enabled === 'boolean', 'Estado do worker inválido.');
    const key = `${w.app}:${w.connection}:${w.queue}`; assert(!queues.has(key), 'Essa fila já tem um worker cadastrado.'); queues.add(key);
  }
  for (const s of config.schedulers) { assert(typeof s.enabled === 'boolean', 'Estado do Scheduler inválido.'); assert(!schedulers.has(s.app), 'Há um Scheduler cadastrado para essa aplicação.'); schedulers.add(s.app); }
  for (const job of config.jobs) {
    assert(typeof job.name === 'string' && job.name.length > 0 && job.name.length <= 80, 'Nome do job inválido.');
    assert(typeof job.class === 'string' && /^App\\Jobs\\[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)*$/.test(job.class), 'Use uma classe existente em App\\Jobs.');
  }
  return config;
}
function automationBase(app, id) {
  const prefix = slots[app].prefix;
  const memory='${CONTAINER_MEMORY_'+id.toUpperCase().replaceAll('-','_')+':-0}';
  const base = { cpus:'${CONTAINER_CPUS_'+id.toUpperCase().replaceAll('-','_')+':-0}',pids_limit:'${CONTAINER_PIDS_'+id.toUpperCase().replaceAll('-','_')+':--1}',mem_limit:memory,memswap_limit:memory,extends: { file: 'compose.yaml', service: 'php' }, healthcheck: { test: ['NONE'] }, container_name: '${COMPOSE_PROJECT_NAME:-laravel}-' + id };
  if (app === 'main') return base;
  return { ...base, environment: {
    APP_URL: '${' + prefix + '_URL}',
    PHP_SERVER_MODE: '${' + prefix + '_SERVER_MODE:-traditional}',
    INERTIA_SSR_ENABLED: 'false',
    DB_DATABASE: '${' + prefix + '_DB_DATABASE}', DB_USERNAME: '${' + prefix + '_DB_USERNAME}', DB_PASSWORD: '${' + prefix + '_DB_PASSWORD}',
    REDIS_PREFIX: '${' + prefix + '_REDIS_PREFIX}', REDIS_DB: '${' + prefix + '_REDIS_DB}', REDIS_CACHE_DB: '${' + prefix + '_REDIS_CACHE_DB}',
  }, volumes: [{ type: 'bind', source: '${' + prefix + '_DIRECTORY}', target: '/var/www/html', bind: { create_host_path: false } }] };
}
export function automationCompose(config) {
  validateAutomation(config);
  const services = {};
  for (const worker of config.workers) services[worker.id] = {
    ...automationBase(worker.app, worker.id),
    profiles: worker.enabled ? ['automation'] : ['automation-disabled'],
    command: ['php', 'artisan', 'queue:work', worker.connection, `--queue=${worker.queue}`, `--sleep=${worker.sleep}`, `--tries=${worker.tries}`, `--timeout=${worker.timeout}`, '--no-interaction'],
    environment: { ...automationBase(worker.app, worker.id).environment, QUEUE_CONNECTION: worker.connection },
    stop_grace_period: `${worker.stopGrace}s`,
    labels: { 'io.infra-control.automation': 'worker', 'io.infra-control.app': worker.app },
  };
  for (const scheduler of config.schedulers) services[scheduler.id] = {
    ...automationBase(scheduler.app, scheduler.id),
    profiles: scheduler.enabled ? ['automation'] : ['automation-disabled'],
    command: ['php', 'artisan', 'schedule:work', '--no-interaction'], stop_grace_period: '90s',
    labels: { 'io.infra-control.automation': 'scheduler', 'io.infra-control.app': scheduler.app },
  };
  return { services };
}
export function createAutomationStore(root) {
  const file = path.join(root, 'config/automation.json'), composeFile = path.join(root, 'config/automation.compose.json');
  return {
    async load() {
      let text;
      try { text = await fs.readFile(file, 'utf8'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; text = JSON.stringify(emptyAutomation(), null, 2) + '\n'; await fs.mkdir(path.dirname(file), { recursive: true }); await atomicWrite(file, text); }
      return { config: validateAutomation(JSON.parse(text)), revision: createHash('sha256').update(text).digest('hex') };
    },
    async save(config) {
      validateAutomation(config);
      // Arquivo gerado só contém referências aos serviços, nunca senhas.
      await atomicWrite(composeFile, JSON.stringify(automationCompose(config), null, 2) + '\n');
      await atomicWrite(file, JSON.stringify(config, null, 2) + '\n');
    },
  };
}
