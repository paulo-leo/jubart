import path from 'node:path';
import fs from 'node:fs/promises';
import { createAutomationStore, newId, validateAutomation } from './automation.mjs';
import { slots, parseEnv, atomicWrite } from './core.mjs';
export function createAutomationAPI({ root, compose, loadConfig, readEnv, clean, startOperation, serviceLogs }) {
  const store = createAutomationStore(root);
  const all = ['--profile', 'automation', '--profile', 'automation-disabled'];
  const profile = app => app === 'main' ? [] : ['--profile', app];
  async function activeApp(id) {
    if (!Object.hasOwn(slots, id)) throw new Error('Aplicação inválida.');
    const config = (await loadConfig()).config;
    if ((config.applications.find(a=>a.id===id)?.type || 'php') !== 'php') throw new Error('Automações Laravel exigem aplicação PHP.');
    if (!config.applications.find(a => a.id === id)?.enabled) throw new Error('Habilite e aplique a aplicação primeiro.');
    return slots[id].service;
  }
  async function persist(config) {
    validateAutomation(config);
    await store.save(config);
    const text = await readEnv(), values = parseEnv(text);
    const profiles = new Set((values.COMPOSE_PROFILES || '').split(',').filter(Boolean));
    if ([...config.workers, ...config.schedulers].some(i => i.enabled)) profiles.add('automation');
    else profiles.delete('automation');
    const line = `COMPOSE_PROFILES='${[...profiles].join(',')}'`;
    const next = /^COMPOSE_PROFILES=/m.test(text) ? text.replace(/^COMPOSE_PROFILES=.*$/m, line) : text + '\n' + line + '\n';
    await atomicWrite(path.join(root, '.env'), next);
  }
  async function bridge(app, action, data) {
    const service = await activeApp(app);
    const output = await compose([...profile(app), 'exec', '-T', service, 'php', '/opt/infra/automation.php', action], undefined, { input: JSON.stringify(data), timeout: 20000 });
    const marker = output.lastIndexOf('__INFRA_JSON__');
    if (marker < 0) throw new Error('Não foi possível consultar Laravel. Recrie o PHP e prepare suas dependências.');
    const result = JSON.parse(output.slice(marker + '__INFRA_JSON__'.length));
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }
  async function state() {
    const saved = await store.load();
    const output = await compose([...all, '--profile', 'app2', '--profile', 'app3', 'ps', '-a', '--format', 'json']);
    let containers;
    try { containers = JSON.parse(output || '[]'); if (!Array.isArray(containers)) containers = [containers]; }
    catch { containers = output.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
    return { ...saved, processes: [...saved.config.workers, ...saved.config.schedulers].map(item => ({ id: item.id, state: containers.find(c => c.Service === item.id)?.State || 'not_created' })) };
  }
  async function stopForApp(app, disable = false) {
    const config = (await store.load()).config;
    const processes = [...config.workers, ...config.schedulers].filter(p => p.app === app);
    for (const p of processes) { await compose([...all, 'stop', '--timeout', String(p.stopGrace || 90), p.id]); if (disable) p.enabled = false; }
    if (disable && processes.length) await persist(config);
  }
  async function recreateEnabled() {
    const config = (await store.load()).config;
    const names = [...config.workers, ...config.schedulers].filter(p => p.enabled).map(p => p.id);
    if (names.length) await compose([...all, 'up', '-d', '--build', '--force-recreate', ...names]);
  }
  async function handle(route, method, data) {
    if (route === '/api/automation' && method === 'GET') return { status: 200, body: await state() };
    if (route === '/api/automation/register' && method === 'POST') {
      const saved = await store.load();
      if (data.revision !== saved.revision) throw new Error('Cadastro alterado. Atualize a tela antes de salvar.');
      await activeApp(data.app);
      let item;
      if (data.kind === 'worker') {
        item = { id: newId('worker'), app: data.app, queue: data.queue, connection: data.connection, sleep: Number(data.sleep), tries: Number(data.tries), timeout: Number(data.timeout), stopGrace: Number(data.stopGrace), enabled: false };
        saved.config.workers.push(item);
      } else if (data.kind === 'scheduler') {
        item = { id: newId('scheduler'), app: data.app, enabled: false }; saved.config.schedulers.push(item);
      } else if (data.kind === 'job') {
        item = { id: newId('job'), app: data.app, name: data.name, class: data.class }; saved.config.jobs.push(item);
      } else throw new Error('Tipo de cadastro inválido.');
      validateAutomation(saved.config);
      return { status: 202, body: { operation: startOperation('Registrar automação', async () => { await persist(saved.config); await compose([...all, 'config', '--quiet']); }) } };
    }
    const details = route.match(/^\/api\/automation\/apps\/(main|app[0-9]+)$/);
    if (details && method === 'GET') {
      const app = details[1], saved = await store.load();
      const queues = saved.config.workers.filter(w => w.app === app).map(w => ({ id: w.id, queue: w.queue, connection: w.connection }));
      const service = await activeApp(app);
      let statistics, statisticsError, schedules, scheduleError;
      try { statistics = await bridge(app, 'status', { queues }); } catch (e) { statisticsError = await clean(e.message); }
      try { schedules = await compose([...profile(app), 'exec', '-T', service, 'php', 'artisan', 'schedule:list', '--no-ansi'], undefined, { timeout: 20000 }); } catch (e) { scheduleError = await clean(e.message); }
      return { status: 200, body: { statistics, statisticsError, schedules: schedules ? await clean(schedules) : '', scheduleError } };
    }
    const action = route.match(/^\/api\/automation\/(worker|scheduler|job)-([a-f0-9]{12})\/(start|stop|restart|logs|dispatch|remove)$/);
    if (action) {
      const id = `${action[1]}-${action[2]}`, verb = action[3], saved = await store.load();
      const item = [...saved.config.workers, ...saved.config.schedulers, ...saved.config.jobs].find(p => p.id === id);
      if (!item) throw new Error('Automação não encontrada.');
      if (verb === 'logs' && method === 'GET' && action[1] !== 'job') return { status: 200, body: { logs: await serviceLogs(id, all) } };
      if (method !== 'POST') throw new Error('Use POST para esta operação.');
      if (verb === 'dispatch' && action[1] === 'job') {
        const worker = saved.config.workers.find(w => w.id === data.worker && w.app === item.app);
        if (!worker || !Array.isArray(data.arguments) || JSON.stringify(data.arguments).length > 16000) throw new Error('Selecione uma fila da aplicação e argumentos como array JSON (até 16 KB).');
        return { status: 202, body: { operation: startOperation('Enfileirar job registrado', () => bridge(item.app, 'dispatch', { class: item.class, queue: worker.queue, connection: worker.connection, arguments: data.arguments })) } };
      }
      if (verb === 'dispatch') throw new Error('Somente jobs registrados podem ser enviados.');
      if (action[1] === 'job' && verb !== 'remove') throw new Error('Ação inválida para job.');
      if (verb === 'logs') throw new Error('Ação inválida.');
      if (verb === 'start' || verb === 'restart') await activeApp(item.app);
      return { status: 202, body: { operation: startOperation(`${verb}: ${id}`, async () => {
        if (verb === 'stop' || verb === 'remove') {
          if (action[1] !== 'job') await compose([...all, 'stop', '--timeout', String(item.stopGrace || 90), id]);
          if (verb === 'remove') {
            if (action[1] !== 'job') await compose([...all, 'rm', '-f', id]);
            for (const collection of ['workers', 'schedulers', 'jobs']) saved.config[collection] = saved.config[collection].filter(p => p.id !== id);
          } else item.enabled = false;
          await persist(saved.config);
        } else if (verb === 'start' || verb === 'restart') {
          if (action[1] === 'worker') await bridge(item.app, 'validate-worker', { connection: item.connection, queue: item.queue, timeout: item.timeout });
          else await compose([...profile(item.app), 'exec', '-T', slots[item.app].service, 'php', 'artisan', 'schedule:list', '--no-ansi'], undefined, { timeout: 20000 });
          item.enabled = true; await persist(saved.config);
          await compose([...all, 'config', '--quiet']);
          // Recria para receber imagem, .env e diretório atuais.
          await compose([...all, 'up', '-d', '--build', '--force-recreate', id]);
        }
      }) } };
    }
    const command = route.match(/^\/api\/automation\/apps\/(main|app[0-9]+)\/(retry|schedule-run)$/);
    if (command && method === 'POST') {
      const service = await activeApp(command[1]);
      if (command[2] === 'retry' && !(typeof data.id === 'string' && /^(?:[0-9]+|[a-fA-F0-9-]{36})$/.test(data.id))) throw new Error('ID de falha inválido.');
      const args = command[2] === 'retry' ? ['queue:retry', data.id] : ['schedule:run'];
      return { status: 202, body: { operation: startOperation(command[2] === 'retry' ? 'Reenviar job falho' : 'Executar tarefas devidas agora', async () => { await compose([...profile(command[1]), 'exec', '-T', service, 'php', 'artisan', ...args, '--no-interaction'], undefined, { timeout: 120000 }); }) } };
    }
    return { status: 404, body: { error: 'Operação não encontrada.' } };
  }
  return { handle, stopForApp, recreateEnabled };
}
