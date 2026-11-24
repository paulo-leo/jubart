import {createProxyHosts,assertProxyHostDomains} from './proxy-hosts.mjs';
import {createProxyNetwork,proxyComposeArgs} from './proxy-network.mjs';
import {createPanelMaintenance} from './panel-maintenance.mjs';
import {createMercure} from './mercure.mjs';
import {createPlugins} from './plugins.mjs';
import {createTopology} from './topology.mjs';
import {createConfigurationTransfer} from './configuration-transfer.mjs';
import {initializeLocalConfig} from './local-config.mjs';
import {createDatabaseConnections,defaultConnectionDiscovery} from './database-connections.mjs';
import {createServerSettings} from './server-settings.mjs';
import {createPanelLinks,decodePanelShare} from './panel-links.mjs';
import {createPMASettings} from './phpmyadmin-settings.mjs';
import {createPanelPassword} from './panel-password.mjs';
import {createLoginProtection} from './login-protection.mjs';
import {createSecurity} from './security.mjs';
import {createInternalHealth} from './internal-health.mjs';
import {createWebsockets} from './websockets.mjs';
import {websocketFromEnv} from './websocket-config.mjs';
import {createInfraEnv} from './infra-env.mjs';
import {createCertificates} from './certificates.mjs';
import {connectionInfo} from './connection-guide.mjs';
import {phpmyadminAccessFromEnv} from './core.mjs';
import {createServiceAccess} from './service-access.mjs';
import {createSQLConsole} from './sql-console.mjs';
import {createTerminalManager} from './terminal.mjs';
import {createPanelUsers,hasPermission,databaseAllowed,terminalAllowed,terminalRouteAllowed} from './panel-users.mjs';
import {createDelegatedAccess,delegatedServiceRoute} from './delegated-access.mjs';
import {createRuntimeVersions} from './runtime-versions.mjs';
import {createAppPackages} from './app-packages.mjs';
import {createExternalTools} from './external-tools.mjs';
import {createAppProcesses} from './app-processes.mjs';
import {createRequestCaptures} from './request-captures.mjs';
import {createResourceAPI,storageReport} from './resources.mjs';
import {inspectEmptyApp} from './empty-app.mjs';
import {createMCPKeys,executionActions} from './mcp-keys.mjs';
import {createIntegration} from './integration.mjs';
import {handleMCP} from './mcp-transport.mjs';
import {createTransfers} from './sql-transfers.mjs';
import {createHostInfo} from './host-info.mjs';
import {readDocumentation} from './documentation.mjs';
import {operationPreview} from './operation-preview.mjs';
import {createPHPAPI} from './php-api.mjs';
import {runtimeCompose,extraAppRoutes} from './runtimes.mjs';
import http from 'node:http';
import { createAppEnv } from './app-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createDatabaseAPI } from './database-api.mjs';
import { createMetricsCollector } from './metrics.mjs';
import { createAutomationAPI } from './automation-api.mjs';
import { slots, databaseEnabled, databaseEngineForService, panelAccessFromEnv, parseEnv, fromEnv, databasePortsFromEnv, validateConfig, patchEnv, atomicWrite, checkPaths } from './core.mjs';

const runFile = (command, args, options) => new Promise((resolve, reject) => {
  const { input, ...execOptions } = options;
  const child = execFile(command, args, execOptions, (error, stdout, stderr) => {
    if (error) { error.stderr = stderr; error.stdout = stdout; reject(error); } else resolve({ stdout, stderr });
  });
  child.stdin.on('error', () => {});
  child.stdin.end(input || '');
});
const here = path.dirname(fileURLToPath(import.meta.url));
export function createPanel({ root = process.env.PANEL_WORKSPACE_DIRECTORY || process.cwd(), username = process.env.PANEL_USERNAME, password = process.env.PANEL_PASSWORD, executor = runFile, metricsFetcher = fetch, terminalEnabled = process.env.PANEL_TERMINAL_ENABLED === 'true', secureCookie = process.env.PANEL_COOKIE_SECURE === 'true', transferRunner, terminalEngine, sqlRunner } = {}) {
  if (!username || !password || password.length < 16) throw new Error('Defina PANEL_USERNAME e PANEL_PASSWORD com no mínimo 16 caracteres no .env.');
  const localReady=initializeLocalConfig(root);localReady.catch(()=>{});
  const envFile = path.join(root, '.env'), configFile = path.join(root, 'config/apps.json');
  const panelPassword=createPanelPassword({root,fallback:password,audit:event=>panelUsers.audit(event)});
  const sessions = new Map();
  const panelUsers=createPanelUsers({root,bootstrapUsername:username});
  const panelLinks=createPanelLinks({root,users:panelUsers,audit:event=>panelUsers.audit(event)});
  async function establishSession(principal,res,grantId,grantExpiry){const now=Date.now();for(const [id,value]of sessions)if(value.expires<now)sessions.delete(id);if(sessions.size>=100)sessions.delete(sessions.keys().next().value);const id=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex'),expires=Math.min(now+8*3600*1000,grantExpiry||Infinity);sessions.set(id,{csrf,expires,userId:principal.id,version:principal.version,...(grantId?{grantId}:{})});await panelUsers.audit({actor:principal.username,event:grantId?'session.link.login':'session.login',...(grantId?{grantId}:{})});res.setHeader('Set-Cookie',`infra_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor((expires-now)/1000)}${secureCookie?'; Secure':''}`);return send(res,200,{username:principal.username,csrf,access:principal});}
  const instanceId=randomBytes(8).toString('hex');
  const terminals=createTerminalManager({engine:terminalEngine,audit:event=>panelUsers.audit(event),onBusy:value=>{terminalBusy=value;},authorize:async owner=>{const session=sessions.get(owner);if(!session||session.expires<Date.now())return false;const user=await panelUsers.principal(session.userId);return !!((user?.admin||hasPermission(user,'terminal.apps')||hasPermission(user,'terminal.services'))&&user.version===session.version);}});
  let operation = null, counter = 0, terminalBusy = false;
  const readEnv = async () => fs.readFile(envFile, 'utf8');
  const digest = data => createHash('sha256').update(data).digest('hex');
  const clean = async text => {
    const env = parseEnv(await readEnv());
    for (const [name, value] of Object.entries(env)) if (/PASSWORD|SECRET|TOKEN|ACCESS_KEY|VAULT_KEY/.test(name) && value.length > 3) text = text.split(value).join('[oculto]');
    return text;
  };
  async function docker(args, options = {}) {
    try { return (await executor('docker', args, { cwd: root, timeout: 120000, maxBuffer: 2 * 1024 * 1024, ...options })).stdout; }
    catch (error) { throw new Error(await clean(String(error.stderr || error.message || 'Falha ao acessar Docker.').slice(-12000))); }
  }
  const compose = (args, envPath, options = {}) => docker(['compose', '--project-directory', root, '--env-file', envPath || envFile, '-f', path.join(root, 'compose.yaml'), '-f', path.join(root, 'config/automation.compose.json'), '-f', options.runtimeFile || path.join(root,'config/apps.compose.yaml'), ...proxyComposeArgs(root), ...args], options);
  async function loadConfig() {
    await fs.mkdir(path.dirname(configFile), { recursive: true });
    let text;
    try { text = await fs.readFile(configFile, 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      text = JSON.stringify(fromEnv(parseEnv(await readEnv())), null, 2) + '\n';
      await atomicWrite(configFile, text);
    }
    const config=JSON.parse(text);
    config.proxy.panel ??= panelAccessFromEnv(parseEnv(await readEnv()));
    config.proxy.phpmyadmin ??= phpmyadminAccessFromEnv(parseEnv(await readEnv()));
    config.proxy.databases ??= databasePortsFromEnv(parseEnv(await readEnv()));
    const wsEnv=parseEnv(await readEnv());for(const app of config.applications)app.websocket??=websocketFromEnv(wsEnv,slots[app.id].prefix,app,config.proxy);
    return { config: validateConfig(config), revision: digest(text) };
  }
  const topology=createTopology({root,readEnv,loadConfig,composeConfig,snapshot});
  const appEnv = createAppEnv({ root, loadConfig });
  async function composeConfig() { return JSON.parse(await compose(['--profile', '*', 'config', '--format', 'json'])); }
  async function snapshot() {
    const definition = await composeConfig();
    const project = definition.name;
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(project)) throw new Error('Nome de projeto Compose inválido.');
    const ids = (await docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`])).trim().split(/\s+/).filter(Boolean);
    const containers = ids.length ? JSON.parse(await docker(['inspect', ...ids])) : [];
    const services = Object.entries(definition.services).filter(([name]) => !name.startsWith('node')).map(([name, def]) => {
      const list = containers.filter(c => c.Config?.Labels?.['com.docker.compose.service'] === name && c.Config?.Labels?.['com.docker.compose.oneoff']?.toLowerCase() !== 'true');
      const c = list[0];
      return { name, profiles: def.profiles || [], container: c?.Name?.replace(/^\//, '') || null, state: c?.State?.Status || 'not_created', health: c?.State?.Health?.Status || null, image: def.image || `${project}-${name}`, containerId: c?.Id?.slice(0, 12) || null, createdAt: c?.Created || null, startedAt: c?.State?.StartedAt || null, finishedAt: c?.State?.FinishedAt || null, exitCode: c?.State?.ExitCode ?? null, restartCount: c?.RestartCount || 0, workingDir: c?.Config?.WorkingDir || def.working_dir || '/', networks:Object.entries(c?.NetworkSettings?.Networks||{}).map(([name,n])=>({name,ipv4:n.IPAddress||null,ipv6:n.GlobalIPv6Address||null})), ports: Object.entries(c?.NetworkSettings?.Ports || {}).flatMap(([port, bindings]) => (bindings || []).map(b => `${b.HostIp}:${b.HostPort} → ${port}`)), mounts: (c?.Mounts || []).map(m => ({ type: m.Type, source: m.Source, target: m.Destination, writable: m.RW })), restartPolicy:c?.HostConfig?.RestartPolicy?.Name||def.restart||'no', protected: name === 'panel', automation: /^(worker|scheduler)-/.test(name) };
    });
    const names = (await docker(['volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`])).trim().split(/\s+/).filter(Boolean);
    const volumes = names.length ? JSON.parse(await docker(['volume', 'inspect', ...names])).map(v => ({ name: v.Name, driver: v.Driver, mountpoint: v.Mountpoint, created: v.CreatedAt })) : [];
    const saved = await loadConfig();
    const current = fromEnv(parseEnv(await readEnv()));
    return { project, services, volumes, terminalEnabled, ...saved, applied: digest(JSON.stringify(current)) === digest(JSON.stringify({ ...saved.config, applications: saved.config.applications.map(a => ({ ...a, name: current.applications.find(x => x.id === a.id)?.name||a.name })) })), operation };
  }
  function startOperation(label, task) {
    if(panelMaintenance.isRunning())throw Object.assign(new Error('Aguarde a manutenção do painel terminar.'),{status:409});
    if (terminalBusy) throw Object.assign(new Error('Aguarde o comando do console terminar.'), { status: 409 });
    if (operation?.state === 'running') throw Object.assign(new Error('Há uma operação em andamento. Aguarde.'), { status: 409 });
    operation = { id: `${instanceId}-${++counter}`, label, state: 'running', startedAt: new Date().toISOString() };
    const current = operation;
    Promise.resolve().then(task).then(() => { current.state = 'success'; current.message = 'Operação concluída.'; }).catch(async error => { current.state = 'error'; current.message = await clean(error.message); }).finally(() => { current.finishedAt = new Date().toISOString(); });
    return current;
  }
  const collectMetrics = createMetricsCollector({ docker, composeConfig, fetcher: metricsFetcher, intervalMs: process.env.PANEL_METRICS_INTERVAL_MS, metricsUrl: `http://traefik:${process.env.TRAEFIK_METRICS_PORT || 8082}/metrics` });
  const cutoffFile = path.join(root, '.panel-state/log-cutoffs.json');
  async function readCutoffs() { try { return JSON.parse(await fs.readFile(cutoffFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; return {}; } }
  async function serviceLogs(service, profiles = []) {
    const since = (await readCutoffs())[service];
    return clean(await compose([...profiles, '--profile', 'automation', '--profile', 'automation-disabled', 'logs', '--no-color', '--timestamps', '--tail=1000', ...(since ? ['--since', since] : []), service]));
  }
  const infraEnv=createInfraEnv({readEnv,audit:event=>panelUsers.audit(event)});
  const configurationTransfer=createConfigurationTransfer({root,readEnv,loadConfig,audit:event=>panelUsers.audit(event)});
  const proxyHosts=createProxyHosts({root,readEnv,loadConfig,startOperation,audit:event=>panelUsers.audit(event)});
  const certificates=createCertificates({root,readEnv,loadConfig,proxyEndpoints:()=>proxyHosts.endpoints(),composeConfig,docker,compose,startOperation,audit:event=>panelUsers.audit(event)});
  const serverSettings=createServerSettings({root,readEnv,compose,loadConfig,startOperation,audit:event=>panelUsers.audit(event)});
  const proxyNetwork=createProxyNetwork({root,readEnv,composeConfig,compose,docker,startOperation,audit:event=>panelUsers.audit(event)});
  const pmaSettings=createPMASettings({root,readEnv,compose,startOperation,audit:event=>panelUsers.audit(event)});
  const serviceAccess=createServiceAccess({root,readEnv,loadConfig,compose,docker,composeConfig,startOperation,audit:event=>panelUsers.audit(event)});
  const mercure=createMercure({root,readEnv,loadConfig,composeConfig,docker,startOperation,audit:event=>panelUsers.audit(event)});
  const websockets=createWebsockets({root,readEnv,loadConfig,compose,composeConfig,startOperation,audit:event=>panelUsers.audit(event),serviceLogs});
  const databases = createDatabaseAPI({ root, compose, readEnv, startOperation, composeConfig, syncConnections:data=>databaseConnections.syncPassword(data), saveConnection:(data,actor)=>databaseConnections.saveAccess(data,actor) });
  const sqlConsole=createSQLConsole({root,readEnv,databases,audit:event=>panelUsers.audit(event),runner:sqlRunner,canExecute:()=>!panelMaintenance.isRunning()});
  const databaseConnections=createDatabaseConnections({root,readEnv,discoverDefaults:defaultConnectionDiscovery({root,readEnv,databases}),testConnection:(engine,data,actor)=>sqlConsole.connect(engine,data,actor),audit:event=>panelUsers.audit(event)});
  const automation = createAutomationAPI({ root, compose, loadConfig, readEnv, clean, startOperation, serviceLogs });
  const phpAPI=createPHPAPI({root,readEnv,loadConfig,compose,startOperation,automation,afterApply:()=>websockets.recreateProvider('reverb')});
  const transfers=createTransfers({root,runner:transferRunner,canStart:()=>!panelMaintenance.isRunning()});
  const panelMaintenance=createPanelMaintenance({root,composeConfig,docker,isBusy:()=>operation?.state==='running'||terminalBusy||sqlConsole.isBusy()||transfers.isBusy(),audit:event=>panelUsers.audit(event)});
  const hostInfo=createHostInfo({docker});
  const delegated=createDelegatedAccess({snapshot,databases,compose,startOperation,users:panelUsers});
  const runtimeVersions=createRuntimeVersions({root,readEnv,loadConfig,compose,startOperation,phpAPI,websockets});
  const appPackages=createAppPackages({root,loadConfig,compose,startOperation});
  const plugins=createPlugins({root,composeConfig,docker,startOperation,audit:event=>panelUsers.audit(event)});
  const externalTools=createExternalTools({root,loadConfig,readEnv});
  const appProcesses=createAppProcesses({root,loadConfig,composeConfig,docker,startOperation});
  const captures=createRequestCaptures({root,loadConfig,compose,collectMetrics});
  const resources=createResourceAPI({root,docker,composeConfig,readEnv,loadConfig,startOperation});
  const security=createSecurity({root,loadConfig,composeConfig,docker,startOperation,audit:event=>panelUsers.audit(event)});
  const loginProtection=createLoginProtection({root,resolveAddress:req=>security.clientAddress(req),audit:event=>panelUsers.audit(event)});
  const mcpKeys=createMCPKeys(root);
  const integration=createIntegration({root,keys:mcpKeys,snapshot,automation,compose,serviceLogs,loadConfig,getOperation:()=>operation,clean,websockets,startOperation});
  function send(res, status, body, type = 'application/json; charset=utf-8') {
    res.writeHead(status, { 'Content-Type': type }); res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
  }
  async function body(req) {
    let text = '';
    for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > (/^\/api\/configuration-transfer\/(export|preview|import)(?:\?|$)/.test(req.url)?1048576:262144)) throw Object.assign(new Error('Requisição muito grande.'), { status: 413 }); }
    try { return JSON.parse(text || '{}'); } catch { throw Object.assign(new Error('JSON inválido.'), { status: 400 }); }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      await localReady;
      const url = new URL(req.url, 'http://localhost');
      if (!['GET', 'POST', 'PUT'].includes(req.method)) return send(res, 405, { error: 'Método não permitido.' });
      if (req.method !== 'GET' && req.headers.origin && req.headers.origin !== `${secureCookie ? 'https' : 'http'}://${req.headers.host}`) return send(res, 403, { error: 'Origem inválida.' });
      if(url.pathname==='/mcp'||url.pathname.startsWith('/api/ai/')){
        let apiKey;try{apiKey=await mcpKeys.authenticate(req);}catch(error){if(error.status===401)res.setHeader('WWW-Authenticate','Bearer realm="jubart"');throw error;}
        if(url.pathname==='/mcp'){if(req.method!=='POST')return send(res,405,{error:'MCP stateless usa POST.'});const payload=await body(req);await mcpKeys.audit({event:'mcp.request',keyId:apiKey.id,method:typeof payload.method==='string'?payload.method.slice(0,80):'invalid'});return await handleMCP(req,res,payload,apiKey,integration);}
        if(url.pathname==='/api/ai/read'&&req.method==='GET')return send(res,200,await integration.read(apiKey,Object.fromEntries(url.searchParams)));
        if(url.pathname==='/api/ai/plan'&&req.method==='POST')return send(res,200,await integration.plan(apiKey,await body(req)));
        if(url.pathname==='/api/ai/execute'&&req.method==='PUT')return send(res,202,await integration.execute(apiKey,await body(req)));
        const apiOperation=url.pathname.match(/^\/api\/ai\/operations\/([a-zA-Z0-9_-]+)$/);if(apiOperation&&req.method==='GET')return send(res,200,await integration.operation(apiKey,apiOperation[1]));
        return send(res,405,{error:'Endpoint/método de integração não permitido.'});
      }
      const token = req.headers.cookie?.match(/(?:^|;\s*)infra_session=([a-f0-9]+)/)?.[1];
      const session = sessions.get(token);
      if (session && session.expires < Date.now()) sessions.delete(token);
      const authenticated = session && session.expires > Date.now();
      if(url.pathname==='/api/panel-links/exchange'&&req.method==='POST')return send(res,200,await panelLinks.exchange(await body(req)));
      if(url.pathname==='/api/panel-links/redeem'&&req.method==='POST'){if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'Origem inválida.'});const access=await panelLinks.redeem(await body(req));return establishSession(access.principal,res,access.grantId,access.expiresAt);}
      if(url.pathname==='/api/login/status'&&req.method==='GET')return send(res,200,await loginProtection.status(req));
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const data=await body(req);
        const result=await loginProtection.attempt(req,async()=>{let principal=null;
          if(typeof data.password==='string'&&data.password.length<=512&&typeof data.username==='string'&&data.username.length<=128){if(data.username===username){if(await panelPassword.verify(data.password))principal=panelUsers.bootstrap();}else principal=await panelUsers.authenticate(data.username,data.password);}return principal;});
        if(result.blocked){res.setHeader('Retry-After',String(result.retryAfterSeconds));return send(res,429,{error:'Acesso temporariamente bloqueado por tentativas incorretas.',retryAfterMs:result.retryAfterMs,retryAfterSeconds:result.retryAfterSeconds});}
        if(!result.principal)return send(res,401,{error:'Usuário ou senha inválidos.'});
        return establishSession(result.principal,res);
      }
      if (url.pathname.startsWith('/api/')) {
        if (!authenticated) return send(res, 401, { error: 'Entre para continuar.' });
        const principal=await panelUsers.principal(session.userId);
        if(!principal||principal.version!==session.version||session.grantId&&!await panelLinks.sessionAllowed(session.grantId,principal)){sessions.delete(token);return send(res,401,{error:'Acesso alterado ou desativado. Entre novamente.'});}
        const actor=principal.username;
        if (req.method !== 'GET' && req.headers['x-csrf-token'] !== session.csrf) return send(res, 403, { error: 'Sessão inválida. Entre novamente.' });
        if (url.pathname === '/api/session' && req.method === 'GET') return send(res, 200, { username:principal.username,csrf:session.csrf,access:principal });
        if (url.pathname === '/api/logout' && req.method === 'POST') { await terminals.closeOwner(token); sessions.delete(token); res.setHeader('Set-Cookie', 'infra_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return send(res, 200, { ok: true }); }
        if(!principal.admin){
          if(url.pathname==='/api/access/terminals'&&req.method==='GET'){const saved=(await loadConfig()).config,data=await snapshot();return send(res,200,{terminalEnabled,applications:saved.applications.filter(a=>terminalAllowed(principal,'apps',a.id)).map(a=>({id:a.id,name:a.name,enabled:a.enabled,service:slots[a.id].service,state:data.services.find(s=>s.name===slots[a.id].service)?.state||'not_created'})),services:data.services.filter(s=>terminalAllowed(principal,'services',s.name)&&s.name!=='panel'&&!s.name.startsWith('node')&&!s.automation).map(s=>({name:s.name,state:s.state}))});}
          if(url.pathname==='/api/access/summary'&&req.method==='GET')return send(res,200,await delegated.summary(principal));
          if(url.pathname==='/api/access/monitor'&&req.method==='GET'&&hasPermission(principal,'monitor.read'))return send(res,200,await hostInfo());
          if(url.pathname==='/api/access/backups'&&req.method==='GET'&&(hasPermission(principal,'backups.read')||hasPermission(principal,'backups.run')))return send(res,200,await delegated.backupInventory(principal));
          if(url.pathname==='/api/access/backups/run'&&req.method==='POST'){const result=await delegated.runBackup(principal,await body(req));session.lastOperation=result.operation;return send(res,202,result);}
          if(url.pathname==='/api/operation'&&req.method==='GET')return send(res,200,{operation:session.lastOperation||null});
          if(url.pathname==='/api/operation-preview'&&req.method==='POST'){
            const payload=await body(req),route=payload.route,data=payload.data||{};
            if(route==='/logout')return send(res,200,await operationPreview({root,route,data:{},config:(await loadConfig()).config}));
            if(typeof route==='string'&&(delegatedServiceRoute(principal,'/api'+route,'POST')||terminalRouteAllowed(principal,'/api'+route,'POST')))return send(res,200,await operationPreview({root,route,data,config:(await loadConfig()).config,compose}));
            if(route==='/access/backups/run'&&databaseAllowed(principal,data.engine,data.database,'run'))return send(res,200,await operationPreview({root,route,data,config:(await loadConfig()).config,compose}));
            await panelUsers.audit({actor,event:'access.denied',route:typeof route==='string'?route.slice(0,200):'invalid'});return send(res,403,{error:'Operação não autorizada.'});
          }
          if(!delegatedServiceRoute(principal,url.pathname,req.method)&&!terminalRouteAllowed(principal,url.pathname,req.method)){await panelUsers.audit({actor,event:'access.denied',route:url.pathname.slice(0,200)});return send(res,403,{error:'Você não possui permissão para esta área ou recurso.'});}
        }
        if(req.method!=='GET'&&panelMaintenance.isRunning()&&!['/api/logout','/api/operation-preview'].includes(url.pathname))return send(res,409,{error:'Aguarde a manutenção do painel terminar.'});
        if(url.pathname==='/api/panel-maintenance'&&req.method==='GET')return send(res,200,await panelMaintenance.read());
        if(url.pathname==='/api/panel-maintenance/start-services'&&req.method==='POST')return send(res,202,await panelMaintenance.startServices(actor));
        if(url.pathname==='/api/panel-maintenance/rebuild'&&req.method==='POST')return send(res,202,await panelMaintenance.rebuild(actor));
        if(url.pathname==='/api/panel-users'&&req.method==='GET'){
          const listed=await panelUsers.list(),definition=await composeConfig(),databaseChoices=[];
          const results=await Promise.allSettled(['mariadb','postgres'].map(engine=>databases.handle(`/api/databases/${engine}`,'GET',{})));
          results.forEach((result,index)=>{if(result.status==='fulfilled')for(const db of result.value.body.inventory?.databases||[]){if(/^[a-z][a-z0-9_]{0,47}$/.test(db.name)&&!['mysql','postgres','template0','template1','sys','information_schema','performance_schema'].includes(db.name))databaseChoices.push({engine:index===0?'mariadb':'postgres',database:db.name});}});
          return send(res,200,{...listed,applications:(await loadConfig()).config.applications.map(a=>({id:a.id,name:a.name})),services:[...new Set([...Object.keys(definition.services),...listed.users.flatMap(u=>u.services)])].filter(n=>n!=='panel'&&n!=='*'&&!n.startsWith('node')&&!/^(worker|scheduler)-/.test(n)),databases:[...new Map([...databaseChoices,...listed.users.flatMap(u=>u.databases)].map(d=>[d.engine+':'+d.database,d])).values()]});
        }
        if(url.pathname==='/api/panel-users/save'&&req.method==='POST'){const result=await panelUsers.save(await body(req),principal);for(const [id,entry] of sessions)if(entry.userId===result.user.id){await terminals.closeOwner(id);sessions.delete(id);}return send(res,200,result);}
        if(url.pathname==='/api/php'||url.pathname.startsWith('/api/php/')){
          if(req.method!=='GET'&&(operation?.state==='running'||terminalBusy))return send(res,409,{error:'Aguarde a operação atual.'});
          const result=await phpAPI.handle(url.pathname,req.method,req.method==='GET'?{}:await body(req));
          return send(res,result?.status||404,result?.body||{error:'Operação PHP desconhecida.'});
        }
        if(url.pathname==='/api/operation-preview'&&req.method==='POST'){const payload=await body(req);if(typeof payload.route!=='string'||!payload.route.startsWith('/'))return send(res,400,{error:'Operação inválida.'});if(/^\/proxy-hosts\/(save|toggle|remove|apply)$/.test(payload.route))return send(res,200,await proxyHosts.confirmation(payload.route.split('/')[2],payload.data||{}));if(['/proxy-network/apply','/proxy-network/rollback'].includes(payload.route))return send(res,200,await proxyNetwork.confirmation(payload.data||{},payload.route.endsWith('/rollback')));if(payload.route==='/panel-maintenance/start-services')return send(res,200,panelMaintenance.confirmation('services'));if(payload.route==='/panel-maintenance/rebuild')return send(res,200,panelMaintenance.confirmation());const mercurePlan=payload.route.match(/^\/mercure\/(main|app[0-9]+)\/apply$/);if(mercurePlan)return send(res,200,await mercure.confirmation(mercurePlan[1],payload.data||{}));if(payload.route.startsWith('/plugins/'))return send(res,200,await plugins.confirmation(payload.route,payload.data||{}));return send(res,200,await operationPreview({root,route:payload.route,data:payload.data||{},config:(await loadConfig()).config,compose}));}
        if(url.pathname==='/api/security/password'&&req.method==='POST'){
          if(principal.id!=='bootstrap')return send(res,403,{error:'Entre com a conta administradora do .env para trocar sua senha.'});
          const data=await body(req);const check=await loginProtection.attempt(req,async()=>{if(!await panelPassword.verify(data.currentPassword))return null;await panelPassword.change(data,actor);for(const [id,entry]of sessions)if(entry.userId==='bootstrap'){sessions.delete(id);await terminals.closeOwner(id);}return principal;});
          if(check.blocked){res.setHeader('Retry-After',String(check.retryAfterSeconds));return send(res,429,{error:'Tentativas excedidas. Aguarde o bloqueio do login terminar.',retryAfterMs:check.retryAfterMs,retryAfterSeconds:check.retryAfterSeconds});}
          if(!check.principal)return send(res,403,{error:'Senha atual incorreta.'});
          res.setHeader('Set-Cookie','infra_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(res,200,{ok:true});
        }
        if(url.pathname==='/api/security/login'&&req.method==='GET')return send(res,200,await loginProtection.read());
        if(url.pathname==='/api/security/login'&&req.method==='POST')return send(res,200,await loginProtection.save(await body(req),actor));
        if(url.pathname==='/api/security'&&req.method==='GET')return send(res,200,await security.read());
        if(url.pathname==='/api/security/restore'&&req.method==='POST')return send(res,202,await security.restore(actor));
        if(url.pathname==='/api/security/quotas'&&req.method==='POST')return send(res,202,await security.quotas(await body(req),actor));
        if(url.pathname==='/api/security/save'&&req.method==='POST')return send(res,202,await security.save(await body(req),actor));
        if(url.pathname==='/api/security/preview'&&req.method==='POST')return send(res,200,await security.preview(await body(req)));
        if(url.pathname==='/api/mercure'&&req.method==='GET')return send(res,200,await mercure.read());
        const mercureRoute=url.pathname.match(/^\/api\/mercure\/(main|app[0-9]+)\/(apply|keys|logs)$/);
        if(mercureRoute){const [,id,action]=mercureRoute;if(action==='logs'&&req.method==='GET')return send(res,200,await mercure.logs(id));if(action==='keys'&&req.method==='POST')return send(res,200,await mercure.reveal(id,actor));if(action==='apply'&&req.method==='POST')return send(res,202,await mercure.apply(id,await body(req),actor));return send(res,405,{error:'Método não permitido.'});}
        if(url.pathname==='/api/websockets'&&req.method==='GET')return send(res,200,await websockets.read());
        const wsRoute=url.pathname.match(/^\/api\/websockets\/(main|app[0-9]+)\/(apply|start|stop|restart|logs)$/);if(wsRoute){const [,id,action]=wsRoute;if(action==='logs'&&req.method==='GET')return send(res,200,await websockets.logs(id));if(req.method==='POST'&&action!=='logs')return send(res,202,action==='apply'?await websockets.apply(id,await body(req),actor):await websockets.control(id,action,actor));}
        if(url.pathname==='/api/topology'&&req.method==='GET')return send(res,200,await topology.read());
        if(url.pathname==='/api/infra-env'&&req.method==='GET')return send(res,200,await infraEnv.read(actor));
        if(url.pathname==='/api/infra-env/reveal'&&req.method==='POST')return send(res,200,await infraEnv.reveal(await body(req),actor));
        const runningVersion=url.pathname.match(/^\/api\/runtime-versions\/(php|node)\/running$/);if(runningVersion&&req.method==='GET')return send(res,200,await runtimeVersions.running(runningVersion[1]));
        if(url.pathname==='/api/proxy-hosts'&&req.method==='GET')return send(res,200,await proxyHosts.read());
        const proxyHostAction=url.pathname.match(/^\/api\/proxy-hosts\/(save|toggle|remove|apply)$/);
        if(proxyHostAction&&req.method==='POST')return send(res,202,await proxyHosts.change(proxyHostAction[1],await body(req),actor));
        if(url.pathname==='/api/certificates'&&req.method==='GET')return send(res,200,await certificates.read());
        if(url.pathname==='/api/certificates/recheck'&&req.method==='POST')return send(res,202,await certificates.check(actor));
        if(url.pathname==='/api/certificates/inspect'&&req.method==='POST')return send(res,200,await certificates.inspect((await body(req)).id));
        if(url.pathname==='/api/proxy-network'&&req.method==='GET')return send(res,200,await proxyNetwork.read());
        if(url.pathname==='/api/proxy-network/apply'&&req.method==='POST')return send(res,202,await proxyNetwork.apply(await body(req),actor));
        if(url.pathname==='/api/proxy-network/rollback'&&req.method==='POST')return send(res,202,await proxyNetwork.rollback(await body(req),actor));
        if(url.pathname==='/api/connection-guide'&&req.method==='GET'){const status=await snapshot();return send(res,200,connectionInfo(await readEnv(),status.services,(await loadConfig()).config.applications));}
        if(url.pathname==='/api/panel-links'&&req.method==='GET')return send(res,200,await panelLinks.read());
        if(url.pathname==='/api/panel-links/preview'&&req.method==='POST'){const data=decodePanelShare((await body(req)).token);return send(res,200,{name:data.name,url:data.url,expiresAt:data.expiresAt});}
        if(url.pathname==='/api/panel-links/issue'&&req.method==='POST')return send(res,200,await panelLinks.issue(await body(req),actor));
        if(url.pathname==='/api/panel-links/import'&&req.method==='POST')return send(res,200,await panelLinks.import(await body(req),actor));
        const linkRoute=url.pathname.match(/^\/api\/panel-links\/([a-f0-9]{24})\/(open|remove|revoke)$/);if(linkRoute&&req.method==='POST'){const [,id,action]=linkRoute;if(action==='revoke'){const result=await panelLinks.revoke(id,actor);for(const [token,entry]of sessions)if(entry.grantId===id){sessions.delete(token);await terminals.closeOwner(token);}return send(res,200,result);}return send(res,200,await panelLinks[action](id,actor));}
        if(url.pathname==='/api/server-settings'&&req.method==='GET')return send(res,200,await serverSettings.read());
        if(url.pathname==='/api/server-settings'&&req.method==='POST')return send(res,202,await serverSettings.apply(await body(req),actor));
        if(url.pathname==='/api/phpmyadmin/settings'&&req.method==='GET')return send(res,200,await pmaSettings.read());
        if(url.pathname==='/api/phpmyadmin/settings'&&req.method==='POST')return send(res,202,await pmaSettings.apply(await body(req),actor));
        if(url.pathname==='/api/service-access'&&req.method==='GET')return send(res,200,await serviceAccess.read());
        const accessRoute=url.pathname.match(/^\/api\/service-access\/(mariadb|postgres|phpmyadmin)$/);if(accessRoute&&req.method==='POST')return send(res,202,await serviceAccess.apply(accessRoute[1],await body(req),actor));
        if(url.pathname==='/api/documentation'&&req.method==='GET')return send(res,200,await readDocumentation(root));
        if(url.pathname==='/api/runtime-versions'&&req.method==='GET')return send(res,200,await runtimeVersions.read());
        const versionsRoute=url.pathname.match(/^\/api\/runtime-versions\/(php|node)\/(resolve|save|apply)$/);
        if(versionsRoute&&req.method==='POST'){if(operation?.state==='running'||terminalBusy)return send(res,409,{error:'Aguarde a operação atual.'});const [,kind,action]=versionsRoute,data=await body(req);return send(res,action==='apply'?202:200,await runtimeVersions[action](kind,data));}
        const packagesRoute=url.pathname.match(/^\/api\/app-packages\/(main|app[0-9]+)$/);
        if(packagesRoute){if(req.method==='GET')return send(res,200,await appPackages.inventory(packagesRoute[1],url.searchParams.get('manager')||'npm'));if(req.method==='POST')return send(res,202,await appPackages.execute(packagesRoute[1],await body(req)));return send(res,405,{error:'Método não permitido.'});}
        if(url.pathname==='/api/external-tools'&&req.method==='GET')return send(res,200,await externalTools.list());
        if(url.pathname==='/api/external-tools/save'&&req.method==='POST')return send(res,200,await externalTools.save(await body(req),actor));
        if(url.pathname==='/api/external-tools/remove'&&req.method==='POST')return send(res,200,await externalTools.remove(await body(req),actor));
        const externalRoute=url.pathname.match(/^\/api\/external-tools\/([a-f0-9]{16})\/(status|dispatch)$/);
        if(externalRoute){if(externalRoute[2]==='status'&&req.method==='GET')return send(res,200,await externalTools.status(externalRoute[1]));if(externalRoute[2]==='dispatch'&&req.method==='POST')return send(res,200,await externalTools.dispatch(externalRoute[1],actor));return send(res,405,{error:'Método não permitido.'});}
        const processRoute=url.pathname.match(/^\/api\/app-processes\/(main|app[0-9]+)(?:\/(signal))?$/);
        if(processRoute){const [,id,action]=processRoute;if(req.method==='GET'&&!action)return send(res,200,await appProcesses.list(id));if(req.method==='POST'&&action==='signal')return send(res,202,await appProcesses.signal(id,await body(req),actor));return send(res,405,{error:'Método não permitido.'});}
        if(url.pathname==='/api/captures'&&req.method==='GET')return send(res,200,await captures.list());
        if(url.pathname==='/api/captures/save'&&req.method==='POST')return send(res,200,await captures.save(await body(req)));
        if(url.pathname==='/api/captures/remove'&&req.method==='POST')return send(res,200,await captures.remove(await body(req)));
        if(url.pathname==='/api/captures/clear'&&req.method==='POST')return send(res,200,await captures.clear());
        if(url.pathname==='/api/storage'&&req.method==='GET')return send(res,200,await storageReport({root,definition:await composeConfig()}));
        if(url.pathname==='/api/resources'&&req.method==='GET')return send(res,200,await resources.list());
        if(url.pathname==='/api/resources/memory'&&req.method==='POST')return send(res,202,await resources.save(await body(req)));
        if(url.pathname==='/api/host'&&req.method==='GET')return send(res,200,await hostInfo());
        if(url.pathname==='/api/configuration-transfer'&&req.method==='GET')return send(res,200,await configurationTransfer.read());
        const migrationRoute=url.pathname.match(/^\/api\/configuration-transfer\/(export|preview|import)$/);if(migrationRoute&&req.method==='POST'){if(operation?.state==='running'||terminalBusy)return send(res,409,{error:'Aguarde a operação atual.'});return send(res,200,await configurationTransfer[migrationRoute[1]](await body(req),actor));}
        if(url.pathname==='/api/plugins'&&req.method==='GET')return send(res,200,await plugins.list());
        if(url.pathname==='/api/plugins/preview'&&req.method==='POST')return send(res,200,await plugins.preview(await body(req)));
        if(url.pathname==='/api/plugins/install'&&req.method==='POST')return send(res,202,await plugins.install(await body(req),actor));
        const pluginRoute=url.pathname.match(/^\/api\/plugins\/([a-z][a-z0-9-]{2,39})(?:\/(start|stop|restart|remove|logs|ports))?$/);
        if(pluginRoute){const [,id,action]=pluginRoute;if(req.method==='GET'&&!action)return send(res,200,await plugins.details(id));if(req.method==='GET'&&action==='logs')return send(res,200,await plugins.logs(id));if(req.method==='POST'&&action==='ports')return send(res,202,await plugins.configurePorts(id,await body(req),actor));if(req.method==='POST'&&['start','stop','restart','remove'].includes(action))return send(res,202,await plugins.action(id,action,await body(req),actor));return send(res,405,{error:'Método não permitido.'});}
        if(url.pathname==='/api/database-connections'&&req.method==='GET')return send(res,200,await databaseConnections.list());
        const connectionAction=url.pathname.match(/^\/api\/database-connections\/(test|save|remove)$/);if(connectionAction&&req.method==='POST')return send(res,200,await databaseConnections[connectionAction[1]](await body(req),actor));
        if(url.pathname==='/api/transfers'&&req.method==='GET')return send(res,200,await transfers.list());
        if(url.pathname==='/api/transfers/upload'&&req.method==='POST')return send(res,200,await transfers.upload(req));
        const download=url.pathname.match(/^\/api\/transfers\/([a-f0-9]{32})\/download$/);
        if(download&&req.method==='GET'){await transfers.download(download[1],res);return;}
        if(['/api/transfers/export','/api/transfers/import'].includes(url.pathname)&&req.method==='POST')return send(res,202,await transfers.enqueue(url.pathname.endsWith('/import')?'import':'export',await (async()=>{const data=await body(req),saved=await databaseConnections.resolve(data.connectionId,{engine:data.engine,database:data.database});return {...data,...saved};})()));
        if(url.pathname==='/api/mcp/keys'&&req.method==='GET')return send(res,200,{keys:await mcpKeys.list(),actions:executionActions,applications:(await loadConfig()).config.applications.map(({id,name})=>({id,name}))});
        if(url.pathname==='/api/mcp/keys'&&req.method==='POST'){const input=await body(req),known=new Set((await loadConfig()).config.applications.map(a=>a.id));if(Array.isArray(input.applications)&&input.applications.some(id=>id!=='*'&&!known.has(id)))return send(res,400,{error:'Aplicação não cadastrada.'});return send(res,201,await mcpKeys.create(input,actor));}
        const revokeKey=url.pathname.match(/^\/api\/mcp\/keys\/([a-f0-9]{16})\/revoke$/);if(revokeKey&&req.method==='POST')return send(res,200,await mcpKeys.revoke(revokeKey[1],actor));
        const mcpDocument=url.pathname.match(/^\/api\/mcp\/documents\/(skill|reference|technical)$/);if(mcpDocument&&req.method==='GET'){const files={skill:'.github/skills/jubart-mcp/SKILL.md',reference:'.github/skills/jubart-mcp/references/api.md',technical:'docs/MCP.md'};const text=await fs.readFile(path.join(root,files[mcpDocument[1]]),'utf8');res.writeHead(200,{'Content-Type':'text/markdown; charset=utf-8','Cache-Control':'no-store','Content-Disposition':'inline; filename="'+(mcpDocument[1]==='skill'?'SKILL.md':mcpDocument[1]+'.md')+'"'});return res.end(text);}
        if(url.pathname==='/api/mcp/audit'&&req.method==='GET')return send(res,200,{events:await mcpKeys.auditList()});
        const emptyRoute=url.pathname.match(/^\/api\/apps\/(main|app[0-9]+)\/(empty-status|remove-empty)$/);
        if(emptyRoute){
          const [,id,action]=emptyRoute,current=await loadConfig();
          if(action==='empty-status'&&req.method==='GET')return send(res,200,await inspectEmptyApp(root,current.config,id));
          if(action!=='remove-empty'||req.method!=='POST')return send(res,405,{error:'Método não permitido.'});
          const data=await body(req);
          if(data.revision!==current.revision)return send(res,409,{error:'Configuração alterada. Atualize antes de remover.'});
          const eligibility=await inspectEmptyApp(root,current.config,id);
          if(!eligibility.canRemove)return send(res,409,{error:eligibility.reason});
          return send(res,202,{operation:startOperation('Remover cadastro de aplicação vazia',async()=>{
            const latest=await loadConfig();if(latest.revision!==data.revision)throw new Error('Configuração alterada. Atualize antes de remover.');
            const check=await inspectEmptyApp(root,latest.config,id);if(!check.canRemove)throw new Error(check.reason);
            const next=validateConfig({...latest.config,applications:latest.config.applications.filter(a=>a.id!==id)});
            const service=slots[id].service,definition=await composeConfig();
            if(Object.hasOwn(definition.services,service)){
              await compose(['--profile','*','stop','--timeout','30',service]);
              await compose(['--profile','*','rm','-f',service]);
            }
            if(!(await inspectEmptyApp(root,latest.config,id)).canRemove)throw new Error('A pasta deixou de estar vazia; cadastro preservado.');
            const state=path.join(root,'.panel-state');await fs.mkdir(state,{recursive:true,mode:0o700});
            await atomicWrite(path.join(state,'apps-before-remove.json'),JSON.stringify(latest.config,null,2));
            await mercure.reconcile(next);
            await atomicWrite(configFile,JSON.stringify(next,null,2)+'\n');
            await atomicWrite(envFile,patchEnv(await readEnv(),next));
            await atomicWrite(path.join(root,'config/apps.compose.yaml'),runtimeCompose(next));
            await atomicWrite(path.join(root,'docker/traefik/extra-apps.yml'),extraAppRoutes(next),0o644);
          })});
        }
        const envRoute = url.pathname.match(/^\/api\/apps\/(main|app[0-9]+)\/env(\/status)?$/);
        if (envRoute) {
          if (req.method === 'GET') return send(res, 200, await appEnv.read(envRoute[1], !envRoute[2]));
          if (req.method !== 'PUT' || envRoute[2]) return send(res, 405, { error: 'Método não permitido.' });
          if (operation?.state === 'running' || terminalBusy) return send(res, 409, { error: 'Aguarde a operação atual.' });
          return send(res, 200, await appEnv.save(envRoute[1], await body(req)));
        }
        const sqlConnect=url.pathname.match(/^\/api\/databases\/(mariadb|postgres)\/sql-connect$/);
        if(sqlConnect){if(req.method!=='POST')return send(res,405,{error:'Use POST.'});return send(res,200,await sqlConsole.connect(sqlConnect[1],await (async()=>{const data=await body(req);return databaseConnections.resolve(data.connectionId,{engine:sqlConnect[1],database:data.database});})(),actor));}
        const sqlConnections=url.pathname.match(/^\/api\/databases\/(mariadb|postgres)\/sql-connections$/);
        if(sqlConnections){if(req.method!=='GET')return send(res,405,{error:'Use GET.'});return send(res,200,await sqlConsole.connections(sqlConnections[1],url.searchParams.get('database')));}
        const sqlRoute=url.pathname.match(/^\/api\/databases\/(mariadb|postgres)\/sql$/);
        if(sqlRoute){if(req.method!=='POST')return send(res,405,{error:'Use POST para executar SQL.'});return send(res,200,await sqlConsole.execute(sqlRoute[1],await (async()=>{const data=await body(req),saved=await databaseConnections.resolve(data.connectionId,{engine:sqlRoute[1],database:data.database});return {...data,...saved,credentialId:'manual'};})(),actor));}

        if (url.pathname.startsWith('/api/databases/')) {
          if (req.method !== 'GET' && (operation?.state === 'running' || terminalBusy)) return send(res, 409, { error: 'Aguarde a operação atual.' });
          const result = await databases.handle(url.pathname, req.method, req.method === 'GET' ? {} : await body(req), actor);
          return send(res, result.status, result.body);
        }
        if (url.pathname.startsWith('/api/automation')) {
          if (req.method !== 'GET' && operation?.state === 'running') return send(res, 409, { error: 'Aguarde a operação atual.' });
          const result = await automation.handle(url.pathname, req.method, req.method === 'GET' ? {} : await body(req));
          return send(res, result.status, result.body);
        }
        if (url.pathname === '/api/config' && req.method === 'GET') return send(res, 200, await loadConfig());
        if (url.pathname === '/api/status' && req.method === 'GET') return send(res, 200, await snapshot());
        if (url.pathname === '/api/metrics' && req.method === 'GET') return send(res, 200, await collectMetrics());
        if (url.pathname === '/api/operation' && req.method === 'GET') return send(res, 200, { operation });
        if (url.pathname === '/api/config' && req.method === 'PUT') {
          if (operation?.state === 'running') return send(res, 409, { error: 'Aguarde a operação atual.' });
          const data = await body(req), current = await loadConfig();
          if (data.revision !== current.revision) return send(res, 409, { error: 'Configuração alterada em outra sessão. Atualize a página.' });
          validateConfig(data.config);
          await assertProxyHostDomains(root,data.config);
          await atomicWrite(configFile, JSON.stringify(data.config, null, 2) + '\n');
          return send(res, 200, await loadConfig());
        }
        if (url.pathname === '/api/config/import' && req.method === 'POST') {
          if (operation?.state === 'running') return send(res, 409, { error: 'Aguarde a operação atual.' });
          const data = await body(req), current = await loadConfig();
          if (data.revision !== current.revision) return send(res, 409, { error: 'Configuração alterada. Atualize antes de importar.' });
          const imported=fromEnv(parseEnv(await readEnv()));await assertProxyHostDomains(root,imported);
          await atomicWrite(configFile, JSON.stringify(imported, null, 2) + '\n');
          return send(res, 200, await loadConfig());
        }
        if (url.pathname === '/api/apply' && req.method === 'POST') {
          const expected = (await body(req)).revision;
          const saved = await loadConfig();
          if (expected !== saved.revision) return send(res, 409, { error: 'Atualize a configuração antes de aplicar.' });
          const op = startOperation('Aplicar apontamentos e proxy', async () => {
            await assertProxyHostDomains(root,saved.config);
            await checkPaths(saved.config, root);
            const oldEnv = await readEnv(), next = patchEnv(oldEnv, saved.config);
            const staged = path.join(root, '.env.panel-staged');
            const runtimeStaged=path.join(root,'config/apps.staged.yaml');
            try { await atomicWrite(staged, next); await atomicWrite(runtimeStaged,runtimeCompose(saved.config)); await compose(['config', '--quiet'], staged, {runtimeFile:runtimeStaged}); }
            finally { await fs.unlink(staged).catch(() => {}); await fs.unlink(runtimeStaged).catch(()=>{}); }
            const state = path.join(root, '.panel-state'); await fs.mkdir(state, { recursive: true, mode: 0o700 });
            await atomicWrite(path.join(state, 'env-before-apply'), oldEnv);
            await atomicWrite(path.join(state,'runtimes-before-apply.yaml'),await fs.readFile(path.join(root,'config/apps.compose.yaml'),'utf8').catch(()=> 'services: {}\n')); 
            if (await readEnv() !== oldEnv) throw new Error('O .env foi alterado durante a validação. Revise e tente novamente.');
            await websockets.stopRemoved(saved.config);
            await mercure.reconcile(saved.config);
            await atomicWrite(path.join(root,'config/apps.compose.yaml'),runtimeCompose(saved.config));
            await fs.mkdir(path.join(root,'docker/traefik'),{recursive:true});
            await atomicWrite(path.join(root,'docker/traefik/extra-apps.yml'),extraAppRoutes(saved.config),0o644);
            await atomicWrite(envFile, next);
            for (const app of saved.config.applications) await automation.stopForApp(app.id, !app.enabled || app.type !== 'php');
            for (const app of saved.config.applications.filter(a => a.id !== 'main' && !a.enabled)) {
              await compose(['--profile', app.id, 'stop', '--timeout', '30', slots[app.id].service]);
              await compose(['--profile', app.id, 'rm', '-f', slots[app.id].service]);
            }
            const selected = saved.config.applications.filter(a => a.enabled).map(a => slots[a.id].service);
            const previousPorts=databasePortsFromEnv(parseEnv(oldEnv));
            for(const id of ['mariadb','postgres']) if(JSON.stringify(previousPorts[id])!==JSON.stringify(saved.config.proxy.databases[id])) selected.push(id);
            await compose(['up', '-d', '--build', '--force-recreate', ...selected, 'traefik']);
            await automation.recreateEnabled();
            await websockets.recreateProvider();
          });
          return send(res, 202, { operation: op });
        }
        if (url.pathname === '/api/logs/clear' && req.method === 'POST') {
          const data = await body(req), definition = await composeConfig();
          if (!Object.hasOwn(definition.services, data.service) || !/^[a-z0-9-]+$/.test(data.service)) return send(res, 403, { error: 'Serviço inválido.' });
          const cutoffs = await readCutoffs(); cutoffs[data.service] = new Date().toISOString();
          await fs.mkdir(path.dirname(cutoffFile), { recursive: true, mode: 0o700 });
          await atomicWrite(cutoffFile, JSON.stringify(cutoffs));
          return send(res, 200, { ok: true, since: cutoffs[data.service] });
        }
        const interactiveOpen=url.pathname.match(/^\/api\/services\/([a-z0-9-]+)\/terminal$/);
        const appTerminal=url.pathname.match(/^\/api\/apps\/(main|app[0-9]+)\/terminal$/);
        const interactiveSession=url.pathname.match(/^\/api\/terminal\/([a-f0-9]{48})\/(stream|input|resize|close)$/);
        if(interactiveOpen||appTerminal||interactiveSession){
          if(!terminalEnabled)return send(res,403,{error:'Terminal desativado. Habilite PANEL_TERMINAL_ENABLED e recrie o painel.'});
          if((interactiveOpen||appTerminal)&&req.method==='POST'){
            if(terminalBusy||operation?.state==='running')return send(res,409,{error:'Aguarde a operação ou encerre o terminal atual.'});
            let app;
            if(appTerminal){app=(await loadConfig()).config.applications.find(a=>a.id===appTerminal[1]);if(!app?.enabled)return send(res,409,{error:'Salve, habilite e aplique a aplicação antes de abrir o terminal.'});}
            const service=app?slots[app.id].service:interactiveOpen[1],definition=await composeConfig();
            if(!terminalAllowed(principal,app?'apps':'services',app?.id||service))return send(res,403,{error:'Terminal não autorizado para este recurso.'});
            if(!Object.hasOwn(definition.services,service)||service==='panel'||service.startsWith('node')||/^(worker|scheduler)-/.test(service))return send(res,403,{error:'Terminal indisponível para esse serviço.'});
            const ids=(await compose(['--profile','*','ps','-q',service])).trim().split(/\s+/).filter(Boolean);
            if(ids.length!==1||!/^[a-f0-9]{12,64}$/.test(ids[0]))return send(res,409,{error:'O serviço precisa ter exatamente um container em execução.'});
            const [container]=JSON.parse(await docker(['inspect',ids[0]]));
            if(!container.State?.Running||container.Config?.Labels?.['com.docker.compose.project']!==definition.name||container.Config?.Labels?.['com.docker.compose.service']!==service)return send(res,403,{error:'Container fora do projeto ou parado.'});
            const data=await body(req);
            return send(res,201,await terminals.open({container:container.Id,service,shell:data.shell,cols:data.cols,rows:data.rows,owner:token,actor,workingDirectory:app?(app.type==='node'?app.workingDirectory:'/var/www/html'):undefined}));
          }
          if(interactiveSession){const [,id,action]=interactiveSession;
            if(action==='stream'&&req.method==='GET')return terminals.attach(id,token,req,res);
            if(req.method==='POST'){
              const data=await body(req);
              if(action==='input')return send(res,200,await terminals.input(id,token,data.data));
              if(action==='resize')return send(res,200,await terminals.resize(id,token,data.cols,data.rows));
              if(action==='close')return send(res,200,await terminals.close(id,token));
            }
          }
          return send(res,405,{error:'Método inválido para o terminal.'});
        }
        const terminalMatch = url.pathname.match(/^\/api\/services\/([a-z0-9-]+)\/exec$/);
        if (terminalMatch && req.method === 'POST') {
          if (!terminalEnabled) return send(res, 403, { error: 'Terminal desativado. Habilite PANEL_TERMINAL_ENABLED no .env e recrie o painel.' });
          if (terminalBusy || operation?.state === 'running') return send(res, 409, { error: 'Aguarde o comando ou operação administrativa atual.' });
          const service = terminalMatch[1], definition = await composeConfig();
          if (!Object.hasOwn(definition.services, service) || service === 'panel' || service.startsWith('node')) return send(res, 403, { error: 'Terminal indisponível para esse serviço.' });
          const data = await body(req);
          if (typeof data.command !== 'string' || !data.command.trim() || data.command.length > 4096 || data.command.includes('\0') || !['sh', 'bash'].includes(data.shell)) return send(res, 400, { error: 'Comando inválido (máximo 4096 caracteres).' });
          // Escopo pelo serviço/projeto do Compose; o shell só é executado DENTRO do container.
          let stdout = '', stderr = '', exitCode = 0, timedOut = false;
          terminalBusy = true;
          try {
            const result = await executor('docker', ['compose', '--project-directory', root, '--env-file', envFile, '-f', path.join(root, 'compose.yaml'), '-f', path.join(root, 'config/automation.compose.json'), '-f', path.join(root,'config/apps.compose.yaml'), ...proxyComposeArgs(root), '--profile', '*', 'exec', '-T', service, 'sh', '-c', 'command -v timeout >/dev/null 2>&1 || { echo "A imagem precisa do utilitário timeout para usar o console." >&2; exit 125; }; exec timeout -k 2s 25s "$1" -lc "$2"', '--', data.shell, data.command], { cwd: root, timeout: 30000, maxBuffer: 512 * 1024, killSignal: 'SIGTERM' });
            stdout = result.stdout || ''; stderr = result.stderr || '';
          } catch (error) { stdout = error.stdout || ''; stderr = error.stderr || error.message; exitCode = Number.isInteger(error.code) ? error.code : 1; timedOut = !!error.killed || exitCode === 124 || exitCode === 137; }
          finally { terminalBusy = false; }
          return send(res, 200, { stdout: await clean(stdout), stderr: await clean(stderr), exitCode, timedOut });
        }
        const serviceMatch = url.pathname.match(/^\/api\/services\/([a-z0-9-]+)\/(start|stop|restart|logs)$/);
        if (serviceMatch) {
          const [, service, action] = serviceMatch;
          const definition = await composeConfig();
          if (!Object.hasOwn(definition.services, service) || (service === 'panel' && action !== 'logs') || service.startsWith('node') || /^(worker|scheduler)-/.test(service)) return send(res, 403, { error: 'Serviço não gerenciável por esta operação.' });
          const profile = /^php-app[0-9]+$/.test(service) ? ['--profile',service.slice(4)] : [];
          if (action === 'logs' && req.method === 'GET'){await panelUsers.audit({actor,event:'service.logs',service});return send(res,200,{logs:await serviceLogs(service,profile)});}
          if (req.method !== 'POST') return send(res, 405, { error: 'Use POST para operações.' });
          if (action === 'start'||action === 'restart') {
            const engine = databaseEngineForService(service);
            if (engine && !databaseEnabled(parseEnv(await readEnv()), engine)) return send(res, 409, {error: 'Banco desativado no .env da infraestrutura. Habilite-o antes de iniciar este serviço.'});
            const config = (await loadConfig()).config;
            const app = config.applications.find(a => slots[a.id].service === service);
            if (app && !app.enabled) return send(res, 400, { error: 'Habilite e aplique a aplicação antes de iniciar.' });
          }
          const op = startOperation(`${action}: ${service}`, async () => {await panelUsers.audit({actor,event:'service.'+action,service,result:'requested'});try{await compose([...profile, ...(action === 'start' ? ['up', '-d', service] : [action, '--timeout', '90', service])]);await panelUsers.audit({actor,event:'service.'+action,service,result:'success'});}catch(error){await panelUsers.audit({actor,event:'service.'+action,service,result:'failed'});throw error;}});
          if(!principal.admin)session.lastOperation=op;
          return send(res, 202, { operation: op });
        }
        return send(res, 404, { error: 'Operação não encontrada.' });
      }
      if (req.method !== 'GET') return send(res, 405, { error: 'Método inválido.' });
      const assets = { '/whale.svg': ['whale.svg', 'image/svg+xml; charset=utf-8'], '/whale-animated.svg': ['whale-animated.svg', 'image/svg+xml; charset=utf-8'], '/icon-animated.svg': ['icon-animated.svg', 'image/svg+xml; charset=utf-8'], '/icon.svg': ['icon.svg', 'image/svg+xml; charset=utf-8'], '/favicon.ico': ['icon.svg', 'image/svg+xml; charset=utf-8'], '/apple-ui.css': ['apple-ui.css', 'text/css; charset=utf-8'], '/modern-ui.css': ['modern-ui.css', 'text/css; charset=utf-8'], '/react-app.css': ['react-app.css', 'text/css; charset=utf-8'], '/react-app.js': ['react-app.js', 'text/javascript; charset=utf-8'], '/react-app.css.LEGAL.txt': ['react-app.css.LEGAL.txt', 'text/plain; charset=utf-8'], '/react-app.js.LEGAL.txt': ['react-app.js.LEGAL.txt', 'text/plain; charset=utf-8'], '/bootstrap-ui.js': ['bootstrap-ui.js', 'text/javascript; charset=utf-8'], '/vendor/bootstrap/bootstrap.min.css': ['vendor/bootstrap/bootstrap.min.css', 'text/css; charset=utf-8'], '/vendor/bootstrap/bootstrap.bundle.min.js': ['vendor/bootstrap/bootstrap.bundle.min.js', 'text/javascript; charset=utf-8'], '/change-plan.js': ['change-plan.js', 'text/javascript; charset=utf-8'], '/theme.js': ['theme.js', 'text/javascript; charset=utf-8'], '/ui.js': ['ui.js', 'text/javascript; charset=utf-8'], '/icons.js': ['icons.js', 'text/javascript; charset=utf-8'], '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/automation-ui.js': ['automation-ui.js', 'text/javascript; charset=utf-8'], '/dialogs.js': ['dialogs.js', 'text/javascript; charset=utf-8'], '/service-ui.js': ['service-ui.js', 'text/javascript; charset=utf-8'], '/metrics-ui.js': ['metrics-ui.js', 'text/javascript; charset=utf-8'], '/database-ui.js': ['database-ui.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
      const asset = assets[url.pathname];
      if (!asset) return send(res, 404, 'Não encontrado.', 'text/plain');
      return send(res, 200, await fs.readFile(path.join(here, 'public', asset[0]), 'utf8'), asset[1]);
    } catch (error) { if(res.headersSent||res.destroyed){res.destroy();return;} return send(res, error.status || 400, { error: await clean(error.message).catch(() => 'Não foi possível concluir a operação.') }); }
  });
  server.security=security;
  server.on('close',()=>{if(security.authServer.listening){security.authServer.closeAllConnections();security.authServer.close();}});
  server.internalHealth=createInternalHealth({root,loadConfig,composeConfig,docker,snapshot,compose});
  server.on('close',()=>{if(server.internalHealth.listening){server.internalHealth.closeAllConnections();server.internalHealth.close();}});
  server.on('listening',()=>captures.start());
  server.on('close',()=>{captures.stop();void terminals.dispose();});
  server.shutdown=async()=>{await terminals.dispose();await new Promise(resolve=>server.close(resolve));};
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createPanel();
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void server.shutdown().finally(()=>process.exit(0));});
  await server.security.sync().catch(()=>console.error('Políticas de segurança inválidas; revise o arquivo privado de estado.'));
  server.security.authServer.listen(3002,'0.0.0.0',()=>console.log('Autorização interna disponível na porta não publicada 3002.'));
  server.internalHealth.listen(3001,'0.0.0.0',()=>console.log('Saúde interna disponível na porta não publicada 3001.'));
  server.listen(3000, '0.0.0.0', () => console.log('Jubart disponível na porta interna 3000.'));
}
