import {createHealthReport} from './mcp-health.mjs';
import {inspectProxies} from './proxy-cli.mjs';
import {inspectDatabases} from './database-cli.mjs';

export const observabilityResources = ['health', 'operational', 'overview', 'proxies', 'routes', 'redirects', 'databases', 'database-users', 'users', 'panel-users', 'topology', 'certificates', 'host', 'metrics'];
const pick = (value, fields) => Object.fromEntries(fields.filter(field => value?.[field] !== undefined).map(field => [field, value[field]]));
const list = value => Array.isArray(value) ? value : [];
const publicRoute = route => ({...pick(route, ['id', 'name', 'kind', 'domains', 'enabled', 'destination', 'methods', 'tls', 'forceHttps', 'passHostHeader', 'allowedIPs', 'rule', 'registered', 'settings']),
  configured: route.configured ? pick(route.configured, ['domains', 'enabled', 'destination', 'methods', 'tls', 'forceHttps', 'rule']) : null});
const runtime = value => ({...pick(value, ['state', 'health', 'ports']), mounts: list(value?.mounts).map(mount => pick(mount, ['type', 'target', 'writable']))});
const sumCounts = servers => {
  const complete = servers.every(server => server.status === 'available');
  const observedCounts = {databases: 0, users: 0, grants: 0};
  for (const server of servers) if (server.status === 'available') for (const field of Object.keys(observedCounts)) observedCounts[field] += server.counts[field];
  return {complete, counts: complete ? {...observedCounts} : {databases: null, users: null, grants: null}, observedCounts};
};

export function createObservability({root, compose, snapshot, loadConfig, composeConfig, panelUsers, topology, certificates, hostInfo, collectMetrics, healthProbe,
  readProxies = () => inspectProxies(root),
  readDatabases = engine => inspectDatabases(root, engine, {run: async (_file, args, options) => ({stdout: await compose(args.slice(1), undefined, options)})}),
}) {
  const health = createHealthReport({root,snapshot,loadConfig,composeConfig,compose,readDatabases,probeHTTP:healthProbe});
  const safe = async (name, work) => {
    try { return {available: true, ...await work()}; }
    catch { return {available: false, error: `Não foi possível consultar ${name}. Confira os serviços e as permissões no painel.`}; }
  };
  async function proxies() {
    return safe('os proxies', async () => {
      const data = await readProxies(), routes = list(data.routes).map(publicRoute);
      const redirects = routes.filter(route => route.forceHttps || route.configured?.forceHttps).map(route => ({id: route.id, domains: route.domains, enabled: route.enabled,
        saved: {enabled: !!route.forceHttps, fromScheme: 'http', toScheme: 'https', permanent: true},
        configured: route.configured ? {enabled: !!route.configured.forceHttps, domains: route.configured.domains} : null}));
      return {observedAt: new Date().toISOString(), ...pick(data, ['source', 'hostFileMatches', 'warnings', 'settings', 'environment']), routes, redirects,
        counts: {routes: routes.length, enabledRoutes: routes.filter(route => route.enabled).length, proxyHosts: routes.filter(route => route.kind === 'Host de proxy').length, redirects: redirects.length},
        note: 'Cadastro e configuração em arquivos; não comprova recarga pelo Traefik, DNS, conectividade ou resposta HTTP. configured distingue o ambiente do cadastro salvo.'};
    });
  }
  async function databases(engine = 'all') {
    let data;
    try { data = await readDatabases(engine); }
    catch { data = {servers: (engine === 'all' ? ['mariadb', 'postgres'] : [engine]).map(engine => ({engine, enabled: null, status: 'unavailable'}))}; }
    const servers = (engine === 'all' ? ['mariadb', 'postgres'] : [engine]).map(name => {
      const server = list(data.servers).find(server => server.engine === name) || {engine: name, enabled: null, status: 'unavailable'};
      const available = server.status === 'available';
      const databases = available ? list(server.databases).map(row => pick(row, ['name', 'bytes', 'tables', 'owner', 'connections'])) : [];
      const users = available ? list(server.users).map(row => pick(row, ['name', 'host', 'admin', 'locked'])) : [];
      const grants = available ? list(server.grants).map(row => pick(row, ['user', 'grantee', 'database', 'privileges'])) : [];
      return {engine: server.engine, enabled: server.enabled, status: server.status,
        connection: pick(server.connection, ['host', 'port', 'bindAddress', 'hostPort', 'defaultDatabase', 'adminUser']),
        databases, users, grants, counts: available ? {databases: databases.length, users: users.length, grants: grants.length} : {databases: null, users: null, grants: null},
        ...(!available ? {error: server.status === 'disabled' ? 'Servidor desabilitado; o conteúdo persistido não foi consultado.' : 'Inventário indisponível; não significa ausência de bancos ou usuários.'} : {})};
    });
    return {observedAt: new Date().toISOString(), servers, ...sumCounts(servers),
      note: 'Inventário SQL fixo, sem SQL arbitrário ou conteúdo de tabelas. MariaDB exclui schemas internos; PostgreSQL inclui postgres e exclui templates. Usuários MariaDB são contas nome+host; PostgreSQL lista roles fora de pg_%, inclusive sem login. Grants PostgreSQL representam CONNECT efetivo, não todos os privilégios. Contagens null indicam inventário incompleto; observedCounts soma somente servidores consultados.'};
  }
  async function users() {
    return safe('os usuários do painel', async () => {
      if (!panelUsers) throw new Error('Unavailable');
      const data = await panelUsers.list();
      const users = list(data.users).map(user => pick(user, ['id', 'username', 'name', 'admin', 'enabled', 'permissions', 'services', 'terminalServices', 'terminalApps', 'databases', 'createdAt', 'updatedAt']));
      return {users, counts: {users: users.length, enabled: users.filter(user => user.enabled).length, administrators: users.filter(user => user.admin).length},
        note: 'Contas do painel, incluindo o administrador inicial. Não são usuários dos bancos nem contas SSH do host.'};
    });
  }
  async function topologyInfo() {
    return safe('a topologia', async () => {
      if (!topology) throw new Error('Unavailable');
      const data = await topology.read();
      return {...pick(data, ['generatedAt', 'revision', 'project', 'sources', 'proxy', 'note']), applications: list(data.applications).map(app => ({
        ...pick(app, ['id', 'name', 'type', 'enabled', 'service', 'domain', 'internalPort', 'entry', 'networks', 'definitionAvailable', 'mountMatchesConfig']), database: app.database ? pick(app.database, ['host','engine','database','port','managed','source']) : null, cache: app.cache ? pick(app.cache, ['host','managed','source']) : null, runtime: runtime(app.runtime)})),
        shared: list(data.shared).map(service => ({id: service.id, ...runtime(service)}))};
    });
  }
  async function certificateInfo() {
    return safe('os certificados', async () => {
      if (!certificates) throw new Error('Unavailable');
      const data = await certificates.read();
      return {...pick(data, ['checkedAt', 'storageState', 'tlsConfigured', 'automatic', 'endpoints', 'warnings', 'note']),
        certificates: list(data.certificates).map(certificate => pick(certificate, ['id', 'domain', 'sans', 'resolver', 'source', 'fingerprint', 'subject', 'issuer', 'subjectAltName', 'serial', 'validFrom', 'expiresAt', 'remainingHours', 'status']))};
    });
  }
  async function overview(engine) {
    const [infrastructure, proxy, database, panel] = await Promise.all([
      safe('a infraestrutura', async () => {
        const [state, saved] = await Promise.all([snapshot(), loadConfig()]);
        return {project: state.project, configurationApplied: state.applied, counts: {applications: saved.config.applications.length,
          enabledApplications: saved.config.applications.filter(app => app.enabled).length, services: state.services.length, containers: state.services.filter(service => service.containerId).length,
          runningServices: state.services.filter(service => service.state === 'running').length, unhealthyServices: state.services.filter(service => service.health === 'unhealthy').length, volumes: list(state.volumes).length}};
      }), proxies(), databases(engine), users(),
    ]);
    return {observedAt: new Date().toISOString(), scope: 'infrastructure', infrastructure, proxies: proxy, databases: database, panelUsers: panel};
  }
  return {async read(data) {
    if (data.resource === 'health' || data.resource === 'operational') return health.read(data);
    if (data.resource === 'overview') return overview(data.engine);
    if (['proxies', 'routes', 'redirects'].includes(data.resource)) {
      const result = await proxies();
      return data.resource === 'redirects' ? {...pick(result, ['available', 'error', 'observedAt', 'redirects', 'counts', 'note'])} : result;
    }
    if (['databases', 'database-users'].includes(data.resource)) return databases(data.engine);
    if (data.resource === 'panel-users') return users();
    if (data.resource === 'users') {
      const [database, panel] = await Promise.all([databases(data.engine), users()]);
      return {databaseUsers: {servers: database.servers.map(server => ({...pick(server, ['engine', 'status', 'enabled', 'users', 'grants', 'counts', 'error'])})), complete: database.complete, counts: database.counts, observedCounts: database.observedCounts, note: database.note}, panelUsers: panel};
    }
    if (data.resource === 'topology') return topologyInfo();
    if (data.resource === 'certificates') return certificateInfo();
    if (data.resource === 'host') return safe('o host', async () => {
      if (!hostInfo) throw new Error('Unavailable');
      return pick(await hostInfo(), ['source', 'available', 'errors', 'name', 'os', 'kernel', 'architecture', 'cpuModel', 'cpus', 'cpuPercent', 'memoryTotal', 'memoryAvailable', 'memoryUsed', 'swapTotal', 'swapFree', 'uptimeSeconds', 'load', 'dockerVersion', 'containers', 'containersRunning', 'note']);
    });
    if (data.resource === 'metrics') return safe('as métricas', async () => {
      if (!collectMetrics) throw new Error('Unavailable');
      return pick(await collectMetrics(), ['current', 'history', 'intervalMs', 'historyLimit']);
    });
    throw new Error('Recurso de observação desconhecido.');
  }};
}
