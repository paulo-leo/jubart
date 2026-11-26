import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createIntegration} from '../integration.mjs';
import {createMCPKeys, executionActions} from '../mcp-keys.mjs';
import {fromEnv} from '../core.mjs';

async function fixture(t, {defer = false} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-infra-'));
  t.after(async () => { await new Promise(r => setTimeout(r, 150)); await fs.rm(root, {recursive: true, force: true}); });
  await fs.mkdir(path.join(root, '.panel-state/mcp'), {recursive: true});
  await fs.writeFile(path.join(root, '.env'), 'APP_DOMAIN=localhost\n');
  const config = fromEnv({APP_DOMAIN: 'localhost', COMPOSE_PROFILES: 'app2'});
  const names = ['php', 'php-app2', 'postgres', 'traefik', 'panel', 'worker-aaaaaaaaaaaa', 'websocket-main'];
  const services = names.map((name, i) => ({name, state: 'running', containerId: String(i + 1).repeat(12), image: 'image', automation: name.startsWith('worker-'), mounts: []}));
  services[0].mounts = [{type: 'volume', name: 'shared', source: '/private/docker/shared', target: '/data', writable: true}, {type: 'bind', source: '/secret/project', target: '/app', writable: true}];
  services[1].mounts = [{type: 'volume', name: 'hidden', source: '/private/docker/hidden', target: '/data', writable: true}, {type: 'volume', name: 'shared', target: '/shared', writable: true}];
  services[2].mounts = [{type: 'volume', name: 'postgres-data', target: '/var/lib/postgresql', writable: true}];
  const state = {project: 'test', services, volumes: ['shared', 'hidden', 'postgres-data', 'unused'].map(name => ({name, driver: 'local', mountpoint: '/private/docker/' + name, options: {password: 'driver-secret'}}))};
  const inspections = new Map(services.map(s => [s.containerId, {Id: s.containerId.repeat(5) + '1234', Config: {Labels: {'com.docker.compose.project': 'test', 'com.docker.compose.service': s.name}}}]));
  const commands = [], events = [], tasks = [], logCalls = [];
  let operation;
  const startOperation = (label, work) => {
    operation = {id: randomUUID(), state: 'running', startedAt: new Date().toISOString()};
    const current = operation;
    const task = async () => { try { await work(); current.state = 'success'; } catch (e) { current.state = 'error'; current.message = e.message; } };
    if (defer) tasks.push(task); else void task();
    return current;
  };
  const integration = createIntegration({root, keys: {audit: async e => events.push(e)}, snapshot: async () => state, loadConfig: async () => ({config, revision: 'current'}),
    docker: async args => { commands.push(args); return args[0] === 'inspect' ? JSON.stringify([inspections.get(args[1])]) : ''; },
    compose: async () => { throw new Error('Unexpected Compose mutation'); }, automation: {},
    serviceLogs: async (...args) => { logCalls.push(args); return 'password=hidden token=abc production-secret\n' + 'x'.repeat(40000); },
    clean: async text => text.replaceAll('production-secret', '[oculto]'), startOperation, getOperation: () => operation});
  const key = {id: 'agent', scopes: ['read', 'execute'], applications: [], services: ['postgres', 'traefik'], actions: ['container.start', 'container.stop', 'container.restart']};
  return {root, integration, key, commands, events, tasks, logCalls, state, config, inspections};
}

test('chaves antigas e novas monitoram todos os serviços e aplicações desta instalação', async t => {
  const {integration, key} = await fixture(t);
  for (const current of [key, {...key,services:[],applications:['main']}, {...key,services:[],applications:[]}, {...key,services:undefined,applications:['main']}]) {
    const result=await integration.read(current,{resource:'context'});
    assert.equal(result.services.length,7);
    assert.equal(result.applications.length,3);
    assert.equal(result.capabilities.scope,'infrastructure');
    assert.deepEqual(result.capabilities.services,['*']);
    assert.equal((await integration.read(current,{resource:'logs',service:'php'})).service,'php');
  }
  assert.deepEqual((await integration.read(key,{resource:'applications',app:'app2'})).applications.map(a=>a.id),['app2']);
  await assert.rejects(integration.read(key,{resource:'logs',service:'foreign'}),e=>e.status===403);
});

test('volumes abrangem toda a instalação; filtros reduzem resultados sem limites por chave', async t => {
  const {integration,key}=await fixture(t);
  const result=await integration.read(key,{resource:'volumes'});
  assert.deepEqual(result.volumes.map(v=>v.name),['hidden','postgres-data','shared','unused']);
  assert.deepEqual(result.volumes.find(v=>v.name==='shared').mounts.map(m=>m.service),['php','php-app2']);
  for(const secret of ['/private','/secret','driver-secret'])assert.equal(JSON.stringify(result).includes(secret),false);
  assert.deepEqual((await integration.read(key,{resource:'volumes',service:'php'})).volumes.map(v=>v.name),['shared']);
  assert.deepEqual((await integration.read(key,{resource:'volumes',app:'app2'})).volumes.map(v=>v.name),['hidden','shared']);
  assert.deepEqual((await integration.read({...key,applications:['main'],services:[]},{resource:'volumes',service:'postgres'})).volumes.map(v=>v.name),['postgres-data']);
});

test('controle usa ID completo validado, tem prévia, auditoria, recibo idempotente e estado próprio', async t => {
  const {integration, key, commands, events, state} = await fixture(t);
  for (const action of ['container.start', 'container.stop', 'container.restart']) {
    const operation = {action, service: 'traefik', containerId: state.services[3].containerId};
    const preview = await integration.plan(key, {operation});
    assert.equal(preview.executes, false);
    assert.equal(commands.every(c => c[0] === 'inspect'), action === 'container.start');
    assert.match(preview.commands[0].text, /^docker (?:start|stop|restart) /);
    const payload = {requestId: randomUUID(), operation};
    const receipt = await integration.execute(key, payload);
    await new Promise(r => setTimeout(r, 5));
    const mutations = commands.filter(c => c[0] !== 'inspect');
    assert.equal(mutations.at(-1)[0], action.split('.')[1]);
    assert.equal(mutations.at(-1).at(-1).length, 64);
    assert.equal((await integration.execute(key, payload)).operation.id, receipt.operation.id);
    assert.equal(commands.filter(c => c[0] !== 'inspect').length, mutations.length);
    await assert.rejects(integration.execute(key, {...payload, operation: {...operation, service: 'postgres'}}), e => e.status === 409);
    assert.equal((await integration.operation(key, receipt.operation.id)).operation.state, 'success');
    await assert.rejects(integration.operation({...key, id: 'other'}, receipt.operation.id), e => e.status === 403);
  }
  assert.ok(events.some(e => e.event === 'execution.requested' && e.target === 'traefik'));
});

test('controle recusa permissão insuficiente, painel, automações, IDs antigos, projeto alheio e flags extras', async t => {
  const {integration, key, state, inspections, commands} = await fixture(t);
  const payload = {requestId: randomUUID(), operation: {action: 'container.restart', service: 'traefik', containerId: state.services[3].containerId}};
  for (const denied of [{...key, actions: []}, {...key, scopes: ['read']}]) {
    await assert.rejects(integration.execute(denied, payload), e => e.status === 403);
    await assert.rejects(integration.plan(denied, {operation: payload.operation}), e => e.status === 403);
  }
  for (const name of ['panel', 'worker-aaaaaaaaaaaa', 'websocket-main']) {
    const service = state.services.find(s => s.name === name);
    await assert.rejects(integration.execute({...key, services: ['*']}, {...payload, requestId: randomUUID(), operation: {...payload.operation, service: name, containerId: service.containerId}}), e => e.status === 403);
  }
  await assert.rejects(integration.execute(key, {...payload, operation: {...payload.operation, containerId: 'abcdefabcdef'}}), e => e.status === 409);
  await assert.rejects(integration.execute(key, {...payload, operation: {...payload.operation, command: 'anything'}}), e => e.status === 400);
  const inspected = inspections.get(payload.operation.containerId);
  for (const labels of [{'com.docker.compose.project': 'foreign', 'com.docker.compose.service': 'traefik'}, {'com.docker.compose.project': 'test', 'com.docker.compose.service': 'postgres'}, {'com.docker.compose.project': 'test', 'com.docker.compose.service': 'traefik', 'com.docker.compose.oneoff': 'True'}]) {
    inspected.Config.Labels = labels;
    await assert.rejects(integration.execute(key, payload), e => e.status === 403);
  }
  assert.equal(commands.some(c => c[0] !== 'inspect'), false);
});

test('identidade é revalidada dentro da tarefa e bancos/aplicações desabilitados não iniciam', async t => {
  const {root, integration, key, state, config, tasks, commands} = await fixture(t, {defer: true});
  const payload = {requestId: randomUUID(), operation: {action: 'container.restart', service: 'traefik', containerId: state.services[3].containerId}};
  const receipt = await integration.execute(key, payload);
  state.services[3].containerId = 'abcdefabcdef';
  await tasks.shift()();
  assert.equal((await integration.operation(key, receipt.operation.id)).operation.state, 'error');
  assert.equal(commands.some(c => c[0] !== 'inspect'), false);
  await fs.writeFile(path.join(root, '.env'), 'POSTGRES_ENABLED=false\n');
  await assert.rejects(integration.plan(key, {operation: {action: 'container.start', service: 'postgres', containerId: state.services[2].containerId}}), e => e.status === 409);
  config.applications[0].enabled = false;
  await assert.rejects(integration.plan({...key, applications: ['main']}, {operation: {action: 'container.start', service: 'php', containerId: state.services[0].containerId}}), e => e.status === 409);
});

test('logs limitam linhas, intervalo e bytes e não aceitam comandos ou seleção arbitrária', async t => {
  const {integration, key, logCalls} = await fixture(t);
  const result = await integration.read(key, {resource: 'logs', service: 'postgres', tail: '200', since: '10m'});
  assert.ok(Buffer.byteLength(result.logs) <= 32768);
  assert.deepEqual(logCalls[0], ['postgres', ['--profile', '*'], {tail: 200, since: '10m'}]);
  for (const extra of [{tail: 1001}, {tail: 0}, {since: '--follow'}, {since: 'yesterday'}, {command: 'docker ps'}]) {
    await assert.rejects(integration.read(key, {resource: 'logs', service: 'postgres', ...extra}), e => e.status === 400);
  }
});

test('chaves existentes ganham o escopo global sem alterar token, expiração ou ações', async t => {
  const {root}=await fixture(t),keys=createMCPKeys(root);
  const created=await keys.create({name:'Infra',scopes:['read','execute'],actions:['container.restart']},'admin');
  assert.equal(created.key.scope,'infrastructure');
  assert.deepEqual(created.key.services,['*']);assert.deepEqual(created.key.applications,['*']);
  const file=path.join(root,'.panel-state/mcp/keys.json'),rows=JSON.parse(await fs.readFile(file,'utf8'));
  rows[0].applications=['main'];rows[0].services=['php'];delete rows[0].scope;
  await fs.writeFile(file,JSON.stringify(rows));
  const authenticated=await keys.authenticate({socket:{remoteAddress:'local'},headers:{authorization:'Bearer '+created.token}});
  assert.deepEqual(authenticated.applications,['*']);assert.deepEqual(authenticated.services,['*']);assert.equal(authenticated.scope,'infrastructure');
  assert.equal(authenticated.expiresAt,created.key.expiresAt);assert.deepEqual(authenticated.actions,['container.restart']);
  assert.deepEqual((await keys.list())[0].services,['*']);
  assert.equal((await fs.readFile(file,'utf8')).includes(created.token),false);
  assert.ok(executionActions.includes('container.stop'));
});
