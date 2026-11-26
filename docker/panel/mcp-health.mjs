import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseEnv, slots, databaseEnabled} from './core.mjs';

const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
const aggregate = rows => {
  const active = rows.filter(row => row.expected !== false);
  if (!active.length) return rows.length ? 'disabled' : 'unknown';
  if (active.every(row => row.status === 'unavailable')) return 'unavailable';
  if (active.some(row => ['unavailable', 'degraded'].includes(row.status))) return 'degraded';
  return active.some(row => row.status !== 'operational') ? 'unknown' : 'operational';
};
const port = value => Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 65535 ? Number(value) : null;

export async function probeHealthHTTP(endpoint, requester = http.request) {
  const start = Date.now();
  try {
    const httpStatus = await new Promise((resolve, reject) => {
      let request, settled = false;
      const finish = (error, status) => { if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(status); };
      const timer = setTimeout(() => { finish(new Error('HTTP timeout')); request?.destroy(); }, 2000);
      try {
        request = requester({hostname:endpoint.service, port:endpoint.port, path:endpoint.path, method:'GET', headers:endpoint.host?{Host:endpoint.host}:{}}, response => {
          finish(null,response.statusCode);response.destroy();
        });
        request.once('error',error=>finish(error));request.end();
      } catch(error) { finish(error); }
    });
    const status = httpStatus >= 200 && httpStatus < 400 ? 'passed' : httpStatus >= 500 ? 'failed' : 'unknown';
    return {kind:'http',status,httpStatus,redirect:httpStatus>=300&&httpStatus<400,durationMs:Date.now()-start,endpoint,
      message:status==='passed'?'HTTP respondeu; redirecionamentos não são seguidos e o destino/TLS não é confirmado.':status==='failed'?'O endpoint respondeu com erro HTTP 5xx.':'HTTP respondeu, mas acesso negado/endpoint ausente não confirma funcionamento.'};
  } catch {
    return {kind:'http',status:'failed',durationMs:Date.now()-start,endpoint,message:'Não foi possível obter resposta HTTP dentro do prazo; confira rede, porta e serviço.'};
  }
}

async function mapLimit(rows, work, limit = 6) {
  let index = 0;
  const result = new Array(rows.length);
  await Promise.all(Array.from({length: Math.min(limit, rows.length)}, async () => {
    while (index < rows.length) { const current = index++; result[current] = await work(rows[current]); }
  }));
  return result;
}

export function createHealthReport({root, snapshot, loadConfig, composeConfig, compose, readDatabases,
  probeHTTP = probeHealthHTTP, now = Date.now, cacheMs = 5000,
}) {
  let cached = null, pending = null;
  async function collect() {
    const startedAt = new Date(now()).toISOString(), deadline = now() + 15000;
    const checkHTTP = endpoint => now() >= deadline ? Promise.resolve({kind:'http',status:'unknown',endpoint,message:'Janela de sondagens esgotada; endpoint não testado nesta amostra.'}) : probeHTTP(endpoint);
    const sources = {};
    const source = async (name, work, fallback) => {
      try { const value = await work(); sources[name] = true; return value; }
      catch { sources[name] = false; return fallback; }
    };
    const [state, saved, definition, env, registry] = await Promise.all([
      source('docker', snapshot, {services: []}),
      source('configuration', loadConfig, {config: {applications: []}}),
      source('compose', () => composeConfig ? composeConfig() : Promise.reject(), {services: {}}),
      source('environment', async () => parseEnv(await fs.readFile(path.join(root, '.env'), 'utf8')), {}),
      source('automation', async () => {
        try { const value=JSON.parse(await fs.readFile(path.join(root, 'config/automation.json'), 'utf8'));if(!Array.isArray(value.workers)||!Array.isArray(value.schedulers))throw new Error('Invalid registry');return value; }
        catch (error) { if (error.code === 'ENOENT') return {workers: [], schedulers: []}; throw error; }
      }, {workers: [], schedulers: []}),
    ]);
    const apps = saved.config.applications;
    const processes = [...(registry.workers || []), ...(registry.schedulers || [])];
    const expected = new Map(['panel', 'traefik', 'valkey', 'error-pages'].map(name => [name, true]));
    for (const app of apps) {
      expected.set(slots[app.id].service, !!app.enabled);
      expected.set('websocket-' + app.id, !!app.enabled && !!app.websocket?.enabled);
    }
    for (const process of processes) expected.set(process.id, !!process.enabled && apps.some(app => app.id === process.app && app.enabled));
    for (const engine of ['mariadb', 'postgres']) {
      let enabled = null;
      try { if (sources.environment) enabled = databaseEnabled(env, engine); } catch { sources.environment = false; }
      expected.set(engine, enabled);
      if (engine === 'mariadb') expected.set('phpmyadmin', enabled);
      expected.set(engine === 'mariadb' ? 'backup' : 'backup-postgres', enabled === null ? null : enabled && env[engine === 'mariadb' ? 'BACKUP_ENABLED' : 'PG_BACKUP_ENABLED'] === 'true');
    }
    const profiles = new Set((env.COMPOSE_PROFILES || '').split(',').filter(Boolean));
    for (const [name, def] of Object.entries(definition.services || {})) if (!expected.has(name)) expected.set(name, !def.profiles?.length || def.profiles.some(profile => profiles.has(profile)));
    const rows = new Map((state.services || []).map(service => [service.name, service]));
    if (sources.docker) for (const [name, required] of expected) if (required && !rows.has(name)) rows.set(name, {name, state: 'not_created', health: null});
    const checks = await mapLimit([...rows.values()], async service => {
      const required = expected.has(service.name) ? expected.get(service.name) : null;
      const result = {...pick(service, ['name', 'containerId', 'state', 'health', 'restartCount', 'configured']), expected: required, checks: []};
      if (required === false) return {...result, status: 'disabled', message: 'Não é esperado pela configuração atual; não é tratado como falha.', configurationMismatch: service.state === 'running'};
      if (service.state !== 'running') return {...result, status: sources.docker ? 'unavailable' : 'unknown', message: 'O container esperado não está em execução.'};
      result.checks.push({kind: 'docker', status: 'passed', message: 'Container em execução; isso não comprova o funcionamento da aplicação.'});
      if (service.health) result.checks.push({kind: 'healthcheck', status: service.health === 'healthy' ? 'passed' : service.health === 'unhealthy' ? 'failed' : 'unknown', value: service.health});
      const app = apps.find(app => slots[app.id].service === service.name), def = definition.services?.[service.name];
      let endpoint;
      if (app) {
        const internalPort = port(def?.environment?.PHP_HTTP_PORT || def?.environment?.PORT || app.port);
        if (internalPort) endpoint = {service: service.name, port: internalPort, path: app.type === 'php' ? '/robots.txt' : '/'};
      } else if (service.name === 'panel') endpoint = {service: '127.0.0.1', port: 3000, path: '/'};
      else if (service.name === 'error-pages') endpoint = {service: 'error-pages', port: 8080, path: '/health'};
      else if (service.name === 'phpmyadmin') endpoint = {service: 'phpmyadmin', port: 80, path: '/'};
      else if (service.name === 'traefik' && port(env.TRAEFIK_METRICS_PORT || 8082)) endpoint = {service: 'traefik', port: port(env.TRAEFIK_METRICS_PORT || 8082), path: '/metrics'};
      if (endpoint) {
        try { result.checks.push(await checkHTTP(endpoint)); }
        catch { result.checks.push({kind: 'http', status: 'unknown', message: 'Teste HTTP não pôde ser concluído.'}); }
      }
      if (['mariadb', 'postgres'].includes(service.name)) {
        try {
          const inventory = await readDatabases(service.name), server = inventory.servers?.find(server => server.engine === service.name);
          result.checks.push({kind: 'sql', status: server?.status === 'available' ? 'passed' : 'unknown', message: server?.status === 'available' ? 'Consulta SQL fixa de catálogo concluída.' : 'Consulta SQL não confirmada; pode ser indisponibilidade, credencial ou permissão.'});
        } catch { result.checks.push({kind: 'sql', status: 'unknown', message: 'Consulta SQL não confirmada.'}); }
      }
      if (service.name === 'valkey') {
        try {
          const output = await compose(['exec', '-T', 'valkey', 'sh', '-c', 'REDISCLI_AUTH="$VALKEY_PASSWORD" exec valkey-cli --raw -h 127.0.0.1 -p "$VALKEY_PORT" PING'], undefined, {timeout: 5000});
          result.checks.push({kind: 'cache-ping', status: output.trim() === 'PONG' ? 'passed' : 'failed', message: output.trim() === 'PONG' ? 'Cache respondeu PONG com autenticação.' : 'Cache não confirmou PONG; confira autenticação e disponibilidade.'});
        } catch { result.checks.push({kind: 'cache-ping', status: 'unknown', message: 'PING do cache não foi confirmado.'}); }
      }
      result.status = result.checks.some(check => check.status === 'failed') ? 'degraded' : result.checks.some(check => check.status === 'unknown') || !result.checks.some(check => check.kind !== 'docker' && check.status === 'passed') || required === null ? 'unknown' : 'operational';
      return result;
    });
    const checked = new Map(checks.map(row => [row.name, row]));
    // Resolve dependencies from base observations, without recursive propagation/cycles.
    for (const row of checks) {
      const deps = new Set(Object.keys(definition.services?.[row.name]?.depends_on || {}));
      const environment = definition.services?.[row.name]?.environment || {};
      const configuredHosts = [environment.DB_HOST, environment.REDIS_HOST].filter(host => checked.has(host));
      for (const host of configuredHosts) deps.add(host);
      row.dependencies = [...deps].filter(name => expected.get(name) !== false || configuredHosts.includes(name)).map(name => ({name, status: checked.get(name)?.status || 'unknown'}));
    }
    for (const row of checks) if (row.expected !== false && row.status === 'operational' && row.dependencies.some(dependency => dependency.status !== 'operational')) row.status = 'degraded';
    for (const row of checks) row.message ??= row.status === 'operational' ? 'As verificações listadas passaram.' : row.status === 'degraded' ? 'Uma verificação ou dependência exige atenção; consulte as evidências.' : 'Operacionalidade não confirmada pelas verificações disponíveis.';
    const routes = await mapLimit(apps, async app => {
      if (!app.enabled) return {id: app.id, name: app.name, service: slots[app.id].service, expected: false, status: 'disabled', routing: {kind: 'proxy-http', status: 'not_applicable'}};
      const service = checked.get(slots[app.id].service), proxy = checked.get('traefik');
      let routing = {kind: 'proxy-http', status: 'unknown', message: 'Rota não testada: proxy ou aplicação indisponível.'};
      if (service?.state === 'running' && proxy?.state === 'running') {
        try { routing = {...await checkHTTP({service: 'traefik', port: 80, path: app.type === 'php' ? '/robots.txt' : '/', host: app.domain}), kind: 'proxy-http'}; }
        catch { /* Keep unknown; never expose probe errors or response bodies. */ }
      }
      const base = service?.status || (sources.docker ? 'unavailable' : 'unknown');
      const status = base === 'operational' ? routing.status === 'failed' || proxy?.status === 'unavailable' ? 'degraded' : routing.status === 'unknown' ? 'unknown' : 'operational' : base;
      return {id: app.id, name: app.name, service: slots[app.id].service, domain: app.domain, status, verificationScope: 'backend-http-and-proxy-http', routing};
    });
    const activeChecks = checks.filter(row => row.expected !== false);
    let status = aggregate([...activeChecks, ...routes]);
    if (status === 'operational' && Object.values(sources).some(available => !available)) status = 'unknown';
    return {schemaVersion: 1, scope: 'infrastructure', project: state.project, revision: saved.revision, status, sources, services: checks, applications: routes,
      startedAt, observedAt: new Date(now()).toISOString(), cacheMs,
      issues: [...activeChecks.filter(row => row.status !== 'operational').map(row => ({service: row.name, status: row.status})), ...routes.filter(row => row.expected !== false && row.status !== 'operational').map(row => ({app: row.id, status: row.status}))],
      counts: Object.fromEntries(['operational', 'degraded', 'unavailable', 'unknown', 'disabled'].map(status => [status, checks.filter(row => row.status === status).length])),
      limitations: ['Operacional significa que as verificações listadas passaram; não comprova todas as funções de negócio ou conclusão de jobs.', 'HTTP usa GET, prazo de 2 segundos e não segue redirecionamentos; HTTPS externo, DNS público, login e canais WebSocket não são testados.', 'Workers e backup dependem dos healthchecks disponíveis; processo ativo sem evidência adicional permanece desconhecido.', 'Falha ao consultar SQL/cache pode ser de autenticação ou permissão; não significa automaticamente servidor parado.', 'Sondagens HTTP deixam de iniciar após 15 segundos; testes não concluídos ficam desconhecidos.','Amostra pontual, reutilizada por até 5 segundos; não reinicia serviços nem altera configurações.']};
  }
  return {async read(data = {}) {
    if (!cached || now() - cached.at >= cacheMs) {
      if (!pending) pending = collect().then(value => { cached = {at: now(), value}; return value; }).finally(() => { pending = null; });
      await pending;
    }
    const report = cached.value;
    if (!data.app && !data.service) return report;
    const selected = new Set(data.service ? [data.service] : [slots[data.app]?.service, 'websocket-' + data.app]);
    if (data.service && report.sources.docker && !report.services.some(service => service.name === data.service)) throw Object.assign(new Error('Serviço não pertence à instalação Jubart.'), {status: 403});
    const services = report.services.filter(service => selected.has(service.name));
    const applications = report.applications.filter(app => data.app ? app.id === data.app : app.service === data.service);
    return {...report, infrastructureStatus: report.status, status: aggregate([...services, ...applications]), services, applications,
      issues: report.issues.filter(issue => selected.has(issue.service) || applications.some(app => app.id === issue.app)),
      counts: Object.fromEntries(['operational', 'degraded', 'unavailable', 'unknown', 'disabled'].map(status => [status, services.filter(row => row.status === status).length])), filter: pick(data, ['app', 'service'])};
  }};
}
