import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {EventEmitter,once} from 'node:events';
import {createHealthReport, probeHealthHTTP} from '../mcp-health.mjs';
import {fromEnv} from '../core.mjs';
import {createIntegration} from '../integration.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-health-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'config'));
  const env = 'MARIADB_ENABLED=false\nPOSTGRES_ENABLED=false\n';
  await fs.writeFile(path.join(root, '.env'), env);
  await fs.writeFile(path.join(root, 'config/automation.json'), JSON.stringify({workers: [], schedulers: []}));
  const config = fromEnv({APP_DOMAIN: 'main.example.com'});
  const services = ['panel', 'traefik', 'valkey', 'error-pages', 'php'].map(name => ({name, containerId: 'a'.repeat(12), state: 'running', health: 'healthy'}));
  services.push({name: 'php-app3', state: 'not_created', health: null});
  const definition = {services: Object.fromEntries(services.map(row => [row.name, {}]))};
  const state = {project: 'test', services};
  const endpoints = [], commands = [], sql = [], failures = new Map();
  let now = 100000, snapshots = 0;
  const deps = {root, snapshot: async () => { snapshots++; return state; }, loadConfig: async () => ({config, revision: 'current'}), composeConfig: async () => definition,
    compose: async args => { commands.push(args); return 'PONG\n'; },
    readDatabases: async engine => { sql.push(engine); return {servers: [{engine, status: 'available'}]}; },
    probeHTTP: async endpoint => { endpoints.push(endpoint); return {kind: 'http', status: failures.get(endpoint.service) || 'passed', endpoint, httpStatus: failures.has(endpoint.service) ? 503 : 200}; },
    now: () => now,
  };
  return {root, env, config, state, definition, endpoints, commands, sql, failures, deps, api: createHealthReport(deps), advance() { now += 5001; }, snapshots: () => snapshots};
}

test('saúde combina Docker, HTTP, rota do proxy e PING; serviços desativados não geram falha', async t => {
  const f = await fixture(t), report = await f.api.read();
  assert.equal(report.status, 'operational');
  assert.equal(report.services.find(row => row.name === 'php-app3').status, 'disabled');
  assert.equal(report.applications.find(row => row.id === 'app3').status, 'disabled');
  assert.ok(report.services.find(row => row.name === 'php').checks.some(check => check.kind === 'http' && check.status === 'passed'));
  assert.ok(report.applications.find(row => row.id === 'main').routing.endpoint.host === 'main.example.com');
  assert.equal(f.sql.length, 0);
  assert.equal(f.commands.length, 1);
  assert.deepEqual(f.commands[0].slice(0, 5), ['exec', '-T', 'valkey', 'sh', '-c']);
  assert.match(f.commands[0][5], /PING$/);
  assert.ok(f.endpoints.every(endpoint => endpoint.path === '/' || endpoint.path === '/robots.txt' || endpoint.path === '/health' || endpoint.path === '/metrics'));
});

test('container running sem healthcheck ou teste de protocolo continua desconhecido', async t => {
  const f = await fixture(t);
  f.state.services.push({name: 'custom-worker', state: 'running', health: null});
  f.definition.services['custom-worker'] = {};
  const report = await f.api.read();
  assert.equal(report.services.find(row => row.name === 'custom-worker').status, 'unknown');
  assert.equal(report.status, 'unknown');
});

test('detecta healthcheck unhealthy e HTTP 5xx mesmo com processo ativo', async t => {
  const f = await fixture(t);
  f.state.services.find(row => row.name === 'php').health = 'unhealthy';
  f.failures.set('php', 'failed');
  const report = await f.api.read();
  assert.equal(report.services.find(row => row.name === 'php').status, 'degraded');
  assert.equal(report.applications[0].status, 'degraded');
  assert.equal(report.status, 'degraded');
  assert.ok(report.issues.some(issue => issue.service === 'php'));
});

test('inclui serviços esperados ausentes e distingue estado parado de consulta Docker indisponível', async t => {
  const f = await fixture(t);
  f.state.services = f.state.services.filter(row => row.name !== 'php');
  const report = await f.api.read();
  assert.equal(report.services.find(row => row.name === 'php').status, 'unavailable');
  assert.equal(report.services.find(row => row.name === 'php').state, 'not_created');
  const unknown = createHealthReport({...f.deps, snapshot: async () => { throw new Error('PRIVATE-DOCKER'); }});
  const missing = await unknown.read();
  assert.equal(missing.status, 'unknown');
  assert.equal(missing.sources.docker, false);
  assert.equal(missing.applications.find(app => app.id === 'main').status, 'unknown');
  assert.doesNotMatch(JSON.stringify(missing), /PRIVATE-DOCKER/);
});

test('banco healthy exige consulta SQL e erro de autenticação permanece não confirmado', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.root, '.env'), f.env.replace('POSTGRES_ENABLED=false', 'POSTGRES_ENABLED=true'));
  f.state.services.push({name: 'postgres', state: 'running', health: 'healthy'});
  let report = await f.api.read();
  assert.equal(report.services.find(row => row.name === 'postgres').status, 'operational');
  assert.deepEqual(f.sql, ['postgres']);
  const failed = createHealthReport({...f.deps, readDatabases: async () => { throw new Error('PRIVATE-SQL-CREDENTIAL'); }});
  report = await failed.read();
  assert.equal(report.services.find(row => row.name === 'postgres').status, 'unknown');
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE-SQL-CREDENTIAL/);
});

test('dependência indisponível degrada o app mesmo quando seu endpoint responde', async t => {
  const f = await fixture(t);
  f.definition.services.php.environment = {REDIS_HOST: 'valkey'};
  f.state.services.find(row => row.name === 'valkey').state = 'exited';
  const report = await f.api.read();
  const app = report.services.find(row => row.name === 'php');
  assert.equal(app.status, 'degraded');
  assert.deepEqual(app.dependencies, [{name: 'valkey', status: 'unavailable'}]);
  assert.equal(report.status, 'degraded');
});

test('rota inválida ou negada não é ocultada por healthcheck Docker saudável', async t => {
  const f = await fixture(t);
  const api = createHealthReport({...f.deps, probeHTTP: async endpoint => ({kind: 'http', status: endpoint.host ? 'unknown' : 'passed', httpStatus: endpoint.host ? 403 : 200, endpoint})});
  const report = await api.read();
  assert.equal(report.services.find(row => row.name === 'php').status, 'operational');
  assert.equal(report.applications.find(row => row.id === 'main').status, 'unknown');
  assert.equal(report.status, 'unknown');
});

test('cache coalesce consultas, mantém horários da amostra e filtros não restringem o escopo', async t => {
  const f = await fixture(t);
  const [first, second] = await Promise.all([f.api.read(), f.api.read()]);
  assert.equal(f.snapshots(), 1);
  assert.equal(first.observedAt, second.observedAt);
  f.state.services.find(row => row.name === 'php').state = 'exited';
  assert.equal((await f.api.read()).services.find(row => row.name === 'php').status, 'operational');
  f.advance();
  const selected = await f.api.read({service: 'php'});
  assert.equal(f.snapshots(), 2);
  assert.equal(selected.status, 'unavailable');
  assert.equal(selected.infrastructureStatus, 'degraded');
  assert.deepEqual(selected.services.map(row => row.name), ['php']);
  assert.equal((await f.api.read({app: 'app3'})).status, 'disabled');
  await assert.rejects(f.api.read({service: 'foreign'}), error => error.status === 403);
});

test('sondagem usa GET, preserva Host nativo, não lê corpo nem segue redirecionamentos', async () => {
  const calls=[];let destroyed=false;
  const endpoint={service:'traefik',port:80,path:'/',host:'main.example.com'};
  const response=await probeHealthHTTP(endpoint,(options,callback)=>{calls.push(options);const request=new EventEmitter();request.end=()=>callback({statusCode:302,destroy(){destroyed=true;}});return request;});
  assert.equal(response.status,'passed');assert.equal(response.httpStatus,302);assert.equal(response.redirect,true);assert.equal(calls[0].method,'GET');assert.equal(calls[0].headers.Host,'main.example.com');assert.equal(destroyed,true);
  const failed=await probeHealthHTTP(endpoint,()=>{throw new Error('PRIVATE-TOKEN');});assert.equal(failed.status,'failed');assert.doesNotMatch(JSON.stringify(failed),/PRIVATE-TOKEN/);
});

test('requisição HTTP real envia o domínio no Host sem seguir Location',async t=>{
  let requests=0,host;
  const server=http.createServer((req,res)=>{requests++;host=req.headers.host;res.writeHead(host==='app.example.com'?302:404,{Location:'http://127.0.0.1:9/should-not-follow'});res.end('PRIVATE-BODY');});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const result=await probeHealthHTTP({service:'127.0.0.1',port:server.address().port,path:'/',host:'app.example.com'});
  assert.equal(result.status,'passed');assert.equal(result.httpStatus,302);assert.equal(requests,1);assert.equal(host,'app.example.com');assert.doesNotMatch(JSON.stringify(result),/PRIVATE-BODY/);
});

test('cache sem PONG e registro inválido não produzem confirmação falsa', async t => {
  const f=await fixture(t);
  const ping=createHealthReport({...f.deps,compose:async()=> 'PRIVATE-NOAUTH'});
  let report=await ping.read();assert.equal(report.services.find(service=>service.name==='valkey').status,'degraded');assert.doesNotMatch(JSON.stringify(report),/PRIVATE-NOAUTH/);
  await fs.writeFile(path.join(f.root,'config/automation.json'),'{}');
  report=await createHealthReport(f.deps).read();assert.equal(report.status,'unknown');assert.equal(report.sources.automation,false);
});

test('janela de sondagens evita iniciar testes HTTP sem prazo e mantém resultado desconhecido', async t => {
  const f=await fixture(t);let clock=0,calls=0;
  const api=createHealthReport({...f.deps,now:()=>clock,probeHTTP:async endpoint=>{calls++;clock=20000;return {kind:'http',status:'passed',endpoint};}});
  const report=await api.read();assert.equal(calls,1);assert.ok(report.services.some(service=>service.checks.some(check=>check.message?.includes('Janela de sondagens'))));assert.equal(report.status,'unknown');
});

test('read é exigido antes das sondagens e não há URL ou comando fornecido pelo cliente', async t => {
  const f=await fixture(t);
  const integration=createIntegration({...f.deps,keys:{audit:async()=>{}},clean:async value=>value});
  const key={id:'agent',scopes:['read'],actions:[]};
  await assert.rejects(integration.read({...key,scopes:[]},{resource:'health'}),error=>error.status===403);
  for(const extra of [{url:'http://outside.example'},{command:'docker restart'},{sql:'SELECT 1'}])await assert.rejects(integration.read(key,{resource:'health',...extra}),error=>error.status===400);
  assert.equal(f.snapshots(),0);assert.equal(f.endpoints.length,0);assert.equal(f.commands.length,0);
});
