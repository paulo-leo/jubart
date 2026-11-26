import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createObservability} from '../mcp-observability.mjs';
import {createIntegration} from '../integration.mjs';
import {fromEnv, parseEnv} from '../core.mjs';
import {mariaInventorySQL, pgInventorySQL} from '../databases.mjs';
import {proxyHostRoutes} from '../proxy-hosts.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-observation-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const env = 'APP_DOMAIN=api.example.com\nAPP_DIRECTORY=/private/app\nTRAEFIK_TLS_ENABLED=true\nACME_EMAIL=admin@example.com\nDB_PASSWORD=PRIVATE-DATABASE\nPANEL_VAULT_KEY=PRIVATE-KEY\n';
  const config = fromEnv(parseEnv(env));
  const hosts = [{id: 'proxy-aabbccddeeff', name: 'API externa', domains: ['external.example.com'], methods: ['POST'], scheme: 'http', host: 'upstream', port: 8080, enabled: true, tls: true, forceHttps: true, passHostHeader: false, allowedIPs: ['10.0.0.0/8'], password: 'PRIVATE-HOST'}];
  const files = {'.env': env, 'config/apps.json': JSON.stringify({...config, password: 'PRIVATE-CONFIG'}), 'config/proxy-hosts.json': JSON.stringify({version: 1, hosts}), 'docker/traefik/proxy-hosts.yml': proxyHostRoutes(hosts)};
  for (const [file, text] of Object.entries(files)) { await fs.mkdir(path.dirname(path.join(root, file)), {recursive: true}); await fs.writeFile(path.join(root, file), text); }
  const queries = [], state = {project: 'test', applied: true, services: [{name: 'php', containerId: 'a'.repeat(12), state: 'running'}], volumes: [{name: 'data'}]};
  let unavailable = null;
  const compose = async (args, _env, options) => {
    const engine = args[2];
    assert.ok(['mariadb', 'postgres'].includes(engine));
    assert.deepEqual(args.slice(0, 2), ['exec', '-T']);
    assert.equal(options.input, engine === 'mariadb' ? mariaInventorySQL : pgInventorySQL);
    queries.push(engine);
    if (engine === unavailable) throw new Error('PRIVATE-ERROR');
    return [{kind: 'database', name: engine + '_db', bytes: 1024, password: 'PRIVATE-ROW'},
      {kind: 'user', name: 'app_user', host: engine === 'mariadb' ? '%' : 'network', admin: 0, locked: 0, passwordHash: 'PRIVATE-HASH'},
      {kind: 'grant', user: 'app_user', database: engine + '_db', privileges: 'CONNECT', secret: 'PRIVATE-GRANT'}].map(row => JSON.stringify(row)).join('\n');
  };
  const deps = {root, compose, snapshot: async () => state, loadConfig: async () => ({config, revision: 'current'}),
    panelUsers: {list: async () => ({users: [{id: 'bootstrap', username: 'admin', name: 'Administrador', admin: true, enabled: true, passwordHash: 'PRIVATE-LOGIN', passwordSalt: 'PRIVATE-SALT'}]})},
    topology: {read: async () => ({project: 'test', sources: {docker: true, compose: true}, applications: [{id: 'main', domain: 'api.example.com', directory: '/private/app', database: {host: 'postgres', database: 'main_db', password: 'PRIVATE-TOPOLOGY'}, runtime: {state: 'running', mounts: [{type: 'bind', source: '/private/app', target: '/var/www/html', writable: true}]}}], shared: []})},
    certificates: {read: async () => ({tlsConfigured: true, storageState: 'readable', certificates: [{domain: 'api.example.com', status: 'valid', expiresAt: '2030-01-01T00:00:00Z', privateKey: 'PRIVATE-CERTIFICATE'}], privateKey: 'PRIVATE-ACME'})},
    hostInfo: async () => ({available: true, cpuPercent: 10, memoryUsed: 1024, password: 'PRIVATE-HOST-INFO'}),
    collectMetrics: async () => ({current: {totals: {memoryBytes: 1000}, http: {requestsPerSecond: 2}}, history: [], intervalMs: 5000, secret: 'PRIVATE-METRICS'}),
  };
  return {root, env, files, deps, queries, state, api: createObservability(deps), unavailable(engine) { unavailable = engine; }};
}

test('proxies e redirecionamentos reutilizam o cadastro sem retornar campos desconhecidos nem gravar arquivos', async t => {
  const {api, root, files} = await fixture(t);
  const result = await api.read({resource: 'proxies'});
  assert.equal(result.available, true);
  const host = result.routes.find(route => route.id === 'proxy-aabbccddeeff');
  assert.equal(host.destination, 'http://upstream:8080');
  assert.deepEqual(host.methods, ['POST']);
  assert.deepEqual(host.allowedIPs, ['10.0.0.0/8']);
  assert.equal(result.hostFileMatches, true);
  const redirect = (await api.read({resource: 'redirects'})).redirects.find(route => route.id === host.id);
  assert.deepEqual(redirect.saved, {enabled: true, fromScheme: 'http', toScheme: 'https', permanent: true});
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-/);
  for (const [file, text] of Object.entries(files)) assert.equal(await fs.readFile(path.join(root, file), 'utf8'), text);
});

test('inventário de bancos usa somente SQL fixo e conta contas, bancos e grants sem credenciais', async t => {
  const {api, queries} = await fixture(t);
  const result = await api.read({resource: 'databases'});
  assert.equal(result.complete, true);
  assert.deepEqual(result.counts, {databases: 2, users: 2, grants: 2});
  assert.deepEqual(new Set(queries), new Set(['mariadb', 'postgres']));
  assert.deepEqual(result.servers[0].users, [{name: 'app_user', host: '%', admin: false, locked: false}]);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-/);
  const filtered = await api.read({resource: 'database-users', engine: 'postgres'});
  assert.deepEqual(filtered.servers.map(server => server.engine), ['postgres']);
  assert.deepEqual(filtered.counts, {databases: 1, users: 1, grants: 1});
});

test('servidor indisponível ou desabilitado não é contado como inventário vazio', async t => {
  const f = await fixture(t);
  f.unavailable('postgres');
  let result = await f.api.read({resource: 'databases'});
  assert.equal(result.complete, false);
  assert.equal(result.counts.databases, null);
  assert.equal(result.counts.users, null);
  assert.deepEqual(result.observedCounts, {databases: 1, users: 1, grants: 1});
  assert.equal(result.servers[1].status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-ERROR/);
  f.queries.length = 0;
  await fs.writeFile(path.join(f.root, '.env'), f.env + 'POSTGRES_ENABLED=false\n');
  result = await f.api.read({resource: 'databases'});
  assert.equal(result.servers[1].status, 'disabled');
  assert.equal(result.servers[1].counts.users, null);
  assert.deepEqual(f.queries, ['mariadb']);
});

test('inventário vazio confirmado mantém zero e fonte ausente mantém contagem desconhecida', async t => {
  const f=await fixture(t);
  const empty=createObservability({...f.deps,readDatabases:async()=>({servers:[{engine:'mariadb',status:'available',enabled:true,databases:[],users:[],grants:[]},{engine:'postgres',status:'available',enabled:true,databases:[],users:[],grants:[]}]})});
  assert.deepEqual((await empty.read({resource:'databases'})).counts,{databases:0,users:0,grants:0});
  const missing=createObservability({...f.deps,readDatabases:async()=>({servers:[]})});
  assert.equal((await missing.read({resource:'databases'})).counts.databases,null);
});

test('usuários distinguem painel e bancos; topologia e certificados omitem hashes, chaves e caminhos do host', async t => {
  const {api} = await fixture(t);
  const users = await api.read({resource: 'users'});
  assert.equal(users.panelUsers.counts.users, 1);
  assert.equal(users.databaseUsers.counts.users, 2);
  const topology = await api.read({resource: 'topology'});
  assert.equal(topology.applications[0].database.host, 'postgres');
  assert.deepEqual(topology.applications[0].runtime.mounts, [{type: 'bind', target: '/var/www/html', writable: true}]);
  const certs = await api.read({resource: 'certificates'});
  assert.equal(certs.certificates[0].status, 'valid');
  const host = await api.read({resource: 'host'}), metrics = await api.read({resource: 'metrics'});
  assert.equal(host.memoryUsed, 1024);
  assert.equal(metrics.current.http.requestsPerSecond, 2);
  for (const data of [users, topology, certs, host, metrics]) assert.doesNotMatch(JSON.stringify(data), /PRIVATE-|\/private\//);
});

test('panorama preserva resultados das outras fontes quando um inventário falha', async t => {
  const f = await fixture(t); f.unavailable('postgres');
  const overview = await f.api.read({resource: 'overview'});
  assert.equal(overview.scope, 'infrastructure');
  assert.equal(overview.infrastructure.counts.containers, 1);
  assert.equal(overview.proxies.available, true);
  assert.equal(overview.panelUsers.counts.users, 1);
  assert.equal(overview.databases.complete, false);
  const api = createObservability({...f.deps, readProxies: async () => { throw new Error('PRIVATE-ERROR'); }});
  const partial = await api.read({resource: 'overview'});
  assert.equal(partial.proxies.available, false);
  assert.equal(partial.infrastructure.available, true);
  assert.doesNotMatch(JSON.stringify(partial), /PRIVATE-ERROR/);
});

test('MCP exige read, valida engine e rejeita SQL/comandos em todas as consultas ampliadas', async t => {
  const {deps, queries} = await fixture(t);
  const integration = createIntegration({...deps, keys: {audit: async () => {}}, clean: async value => value});
  const key = {id: 'reader', scopes: ['read'], actions: []};
  for (const resource of ['overview', 'proxies', 'databases', 'database-users', 'users', 'panel-users', 'topology', 'certificates', 'host', 'metrics']) {
    await assert.rejects(integration.read({...key, scopes: []}, {resource}), error => error.status === 403);
    assert.ok(await integration.read(key, {resource}));
  }
  const before = queries.length;
  for (const extra of [{engine: 'foreign'}, {sql: 'DROP DATABASE anything'}, {command: 'docker exec'}]) await assert.rejects(integration.read(key, {resource: 'databases', ...extra}), error => error.status === 400);
  assert.equal(queries.length, before);
});
