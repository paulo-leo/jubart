import {websocketFromEnv,validateWebsockets} from './websocket-config.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const slots = { main: { service: 'php', prefix: 'APP' }, app2: { service: 'php-app2', prefix: 'APP_2' }, app3: { service: 'php-app3', prefix: 'APP_3' } };
for(let n=4;n<=100;n++)slots[`app${n}`]={service:`php-app${n}`,prefix:`APP_${n}`};
export function parseEnv(text) {
  const result = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) value = value.slice(1, -1);
    result[match[1]] = value;
  }
  return result;
}
// Perfis fixos ativos; os flags movem os serviços desativados para perfis inativos.
export function databaseEnabled(env, engine) {
  const key = engine === 'mariadb' ? 'MARIADB_ENABLED' : 'POSTGRES_ENABLED';
  const value = env[key] ?? 'true';
  if (!['true', 'false'].includes(value)) throw new Error(key + ' deve ser true ou false.');
  return value === 'true';
}
export function databaseEngineForService(service) {
  if (['mariadb', 'backup', 'phpmyadmin'].includes(service)) return 'mariadb';
  if (['postgres', 'backup-postgres'].includes(service)) return 'postgres';
  return null;
}
export function databasePortsFromEnv(env) {
  return Object.fromEntries([['mariadb','MARIADB',3306],['postgres','POSTGRES',5432]].map(([id,prefix,port])=>[id,{bindAddress:env[`${prefix}_BIND_ADDRESS`]||'127.0.0.1',port:Number(env[`${prefix}_PORT`]||port)}]));
}
export function phpmyadminAccessFromEnv(env){return {bindAddress:env.PHPMYADMIN_BIND_ADDRESS||'127.0.0.1',port:Number(env.PHPMYADMIN_PORT||8081)};}
export function panelAccessFromEnv(env){return {bindAddress:env.PANEL_BIND_ADDRESS||'127.0.0.1',port:Number(env.PANEL_PORT||9090),domain:env.PANEL_DOMAIN||'',proxyEnabled:env.PANEL_PROXY_ENABLED==='true',tls:env.PANEL_TLS_ENABLED==='true',secureCookie:env.PANEL_COOKIE_SECURE==='true'};}
export function fromEnv(env) {
  return { version: 1, proxy: { phpmyadmin:phpmyadminAccessFromEnv(env), panel: panelAccessFromEnv(env), bindAddress: env.HTTP_BIND_ADDRESS || '127.0.0.1', httpPort: Number(env.HTTP_PORT || 8080), httpsPort: Number(env.HTTPS_PORT || 8443), tls: env.TRAEFIK_TLS_ENABLED === 'true', email: env.ACME_EMAIL || '', databases: databasePortsFromEnv(env) }, applications: Object.entries(slots).filter(([id,slot])=>['main','app2','app3'].includes(id)||env[`${slot.prefix}_DIRECTORY`]).map(([id, slot]) => ({
    id, type: env[`${slot.prefix}_TYPE`] || 'php', startCommand: env[`${slot.prefix}_START_COMMAND`] || 'npm start', workingDirectory: env[`${slot.prefix}_WORKING_DIRECTORY`] || '/var/www/html', buildDirectory: env[`${slot.prefix}_BUILD_DIRECTORY`] || 'dist', spa: env[`${slot.prefix}_SPA`] === 'true', name: id === 'main' ? 'Aplicação principal' : `Aplicação ${id.slice(3)}`, enabled: id === 'main' || (env.COMPOSE_PROFILES || '').split(',').includes(id),
    directory: env[`${slot.prefix}_DIRECTORY`] || `./${id}`, domain: env[`${slot.prefix}_DOMAIN`] || `${id}.localhost`,
    documentRoot: env[id === 'main' ? 'PHP_DOCUMENT_ROOT' : `${slot.prefix}_DOCUMENT_ROOT`] || '/var/www/html/public',
    mode: env[id === 'main' ? 'PHP_SERVER_MODE' : `${slot.prefix}_SERVER_MODE`] || 'traditional',
    port: Number(env[id === 'main' ? 'PHP_HTTP_PORT' : `${slot.prefix}_HTTP_PORT`] || 8000),
    websocket:websocketFromEnv(env,slot.prefix,{type:env[`${slot.prefix}_TYPE`]||'php',domain:env[`${slot.prefix}_DOMAIN`]||`${id}.localhost`},{tls:env.TRAEFIK_TLS_ENABLED==='true'}),
  })) };
}
const assert = (test, message) => { if (!test) throw new Error(message); };
export function validateConfig(config) {
  assert(config?.version === 1 && Array.isArray(config.applications), 'Formato JSON inválido.');
  const proxy = config.proxy;
  assert(proxy && ['127.0.0.1', '0.0.0.0'].includes(proxy.bindAddress), 'Endereço deve ser 127.0.0.1 ou 0.0.0.0.');
  for (const port of [proxy.httpPort, proxy.httpsPort]) assert(Number.isInteger(port) && port > 0 && port <= 65535, 'Porta pública inválida.');
  assert(proxy.httpPort !== proxy.httpsPort, 'Portas HTTP e HTTPS devem ser diferentes.');
  if(proxy.panel){
    const p=proxy.panel;assert(['127.0.0.1','0.0.0.0'].includes(p.bindAddress),'IP de publicação do painel inválido.');
    assert(Number.isInteger(p.port)&&p.port>0&&p.port<=65535,'Porta do painel inválida.');
    assert(typeof p.proxyEnabled==='boolean'&&typeof p.tls==='boolean'&&typeof p.secureCookie==='boolean','Configuração de acesso do painel inválida.');
    assert(typeof p.domain==='string'&&(!p.domain||(p.domain.length<=253&&p.domain.split('.').every(l=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(l)))),'Domínio do painel inválido.');
    if(p.proxyEnabled)assert(!!p.domain,'Informe o subdomínio do painel.');
    if(p.proxyEnabled&&p.tls)assert(proxy.tls&&p.secureCookie,'HTTPS do painel exige HTTPS global e cookie seguro.');
    assert(![proxy.httpPort,proxy.httpsPort,...Object.values(proxy.databases||{}).map(v=>v.port)].includes(p.port),'Porta do painel conflita com outro serviço.');
  }
  if (proxy.databases) {
    const used = new Map([[proxy.httpPort, 'HTTP'], [proxy.httpsPort, 'HTTPS']]);
    for (const id of ['mariadb','postgres']) {
      const value=proxy.databases[id];
      assert(value && ['127.0.0.1','0.0.0.0'].includes(value.bindAddress), 'Endereço de publicação do banco inválido.');
      assert(Number.isInteger(value.port) && value.port>0 && value.port<=65535, 'Porta de banco inválida.');
      assert(!used.has(value.port), `Porta ${value.port} repetida entre serviços publicados.`);used.set(value.port,id);
    }
  }
  if(proxy.phpmyadmin){const p=proxy.phpmyadmin;assert(['127.0.0.1','0.0.0.0'].includes(p.bindAddress)&&Number.isInteger(p.port)&&p.port>0&&p.port<=65535,'Acesso phpMyAdmin inválido.');assert(![proxy.httpPort,proxy.httpsPort,proxy.panel?.port,...Object.values(proxy.databases||{}).map(v=>v.port)].includes(p.port),'Porta phpMyAdmin conflita com outro serviço.');}
  assert(typeof proxy.tls === 'boolean', 'TLS inválido.');
  assert(typeof proxy.email === 'string' && !/[\r\n'"\\]/.test(proxy.email) && proxy.email.length < 200, 'Email inválido.');
  if (proxy.tls) assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(proxy.email), 'Informe um email para certificados.');
  const ids = new Set(), domains = new Set();
  assert(config.applications.length>=1&&config.applications.length<=100&&config.applications.some(a=>a.id==='main'), 'Mantenha a aplicação principal; limite de 100 aplicações.');
  for (const app of config.applications) {
    assert(Object.hasOwn(slots, app.id) && !ids.has(app.id), 'Identificador de aplicação inválido/duplicado.'); ids.add(app.id);
    app.documentRoot ??= '/var/www/html/public'; app.mode ??= 'traditional'; app.type ??= 'php'; app.startCommand ??= 'npm start'; app.workingDirectory ??= '/var/www/html'; app.buildDirectory ??= 'dist'; app.spa ??= false;
    assert(['php','node','static'].includes(app.type), 'Tipo inválido.');
    assert(typeof app.startCommand === 'string' && app.startCommand.trim() && app.startCommand.length <= 2048 && !/[\x00-\x1f$']/.test(app.startCommand), 'Comando inválido: não use caracteres de controle ou interpolação $ ou aspas simples.');
    assert(/^\/var\/www\/html(?:\/[A-Za-z0-9_.-]+)*$/.test(app.workingDirectory) && !app.workingDirectory.split('/').includes('..'), 'Diretório de trabalho inválido.');
    assert(typeof app.buildDirectory === 'string' && /^(?:\.|[A-Za-z0-9_-][A-Za-z0-9_.-]*)(?:\/[A-Za-z0-9_.-]+)*$/.test(app.buildDirectory) && !app.buildDirectory.split('/').includes('..') && typeof app.spa === 'boolean', 'Diretório de build ou modo SPA inválido.');
    assert(typeof app.enabled === 'boolean' && (app.id !== 'main' || app.enabled), 'A aplicação principal deve permanecer habilitada.');
    assert(typeof app.name === 'string' && app.name.trim().length > 0 && app.name.length <= 80, 'Nome inválido.');
    assert(typeof app.directory === 'string' && app.directory.trim() && app.directory.length < 1024 && !/[\x00-\x1f'"\\$]/.test(app.directory), 'Diretório inválido; não use aspas, variáveis ou caracteres de controle.');
    assert(typeof app.domain === 'string' && app.domain.length <= 253 && app.domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)), 'Domínio inválido: use somente hostname, sem protocolo/porta.');
    if(app.enabled && proxy.panel?.proxyEnabled)assert(app.domain.toLowerCase()!==proxy.panel.domain.toLowerCase(),'Subdomínio do painel já usado por uma aplicação.');
    if (app.enabled) { assert(!domains.has(app.domain.toLowerCase()), 'Há domínios ativos duplicados.'); domains.add(app.domain.toLowerCase()); }
    assert(typeof app.documentRoot === 'string' && /^\/var\/www\/html(?:\/[A-Za-z0-9_.-]+)*$/.test(app.documentRoot) && !app.documentRoot.split('/').includes('..'), 'Document root deve estar dentro de /var/www/html.');
    assert(['traditional', 'octane'].includes(app.mode), 'Modo de servidor inválido.');
    assert(Number.isInteger(app.port) && app.port >= 1024 && app.port <= 65535 && app.port !== 2019, 'Porta PHP inválida; use 1024–65535, exceto 2019.');
  }
  validateWebsockets(config);
  return config;
}
export function patchEnv(text, config) {
  validateConfig(config);
  const current = parseEnv(text), proxy = config.proxy;
  const profiles = new Set((current.COMPOSE_PROFILES || '').split(',').filter(x => x && !/^app[0-9]+$/.test(x)));
  profiles.add('db-mariadb-true');
  profiles.add('db-postgres-true');
  const values = { COMPOSE_FILE: current.COMPOSE_FILE ? [...new Set([...current.COMPOSE_FILE.split(':'), 'config/apps.compose.yaml'])].join(':') : 'compose.yaml:config/automation.compose.json:config/apps.compose.yaml', HTTP_BIND_ADDRESS: proxy.bindAddress, HTTP_PORT: proxy.httpPort, HTTPS_PORT: proxy.httpsPort, TRAEFIK_TLS_ENABLED: String(proxy.tls), ACME_EMAIL: proxy.email };
  if(proxy.panel)for(const [k,v] of Object.entries({BIND_ADDRESS:proxy.panel.bindAddress,PORT:proxy.panel.port,DOMAIN:proxy.panel.domain,PROXY_ENABLED:proxy.panel.proxyEnabled,TLS_ENABLED:proxy.panel.tls,COOKIE_SECURE:proxy.panel.secureCookie}))values['PANEL_'+k]=String(v);
  if(proxy.databases) for(const [id,prefix] of [['mariadb','MARIADB'],['postgres','POSTGRES']]) {
    values[`${prefix}_BIND_ADDRESS`]=proxy.databases[id].bindAddress;
    values[`${prefix}_PORT`]=proxy.databases[id].port;
  }
  if(proxy.phpmyadmin){values.PHPMYADMIN_BIND_ADDRESS=proxy.phpmyadmin.bindAddress;values.PHPMYADMIN_PORT=proxy.phpmyadmin.port;}
  for (const app of config.applications) {
    const prefix = slots[app.id].prefix;
    const w=app.websocket;for(const [key,value] of Object.entries({ENABLED:w.enabled,PROVIDER:w.provider,ROUTING:w.routing,DOMAIN:w.domain,PORT:w.port,TLS:w.tls,NODE_COMMAND:w.nodeCommand,NODE_PATH:w.nodePath,ORIGINS:w.origins.join(',')}))values[prefix+'_WEBSOCKET_'+key]=String(value);
    if (app.id !== 'main' && app.enabled) profiles.add(app.id);
    const publicPort = proxy.tls ? proxy.httpsPort : proxy.httpPort;
    values[`${prefix}_URL`] = `${proxy.tls ? 'https' : 'http'}://${app.domain}${publicPort === (proxy.tls ? 443 : 80) ? '' : ':' + publicPort}`;
    values[`${prefix}_DOMAIN`] = app.domain;
    for (const [key, value] of Object.entries({TYPE:app.type,START_COMMAND:app.startCommand,WORKING_DIRECTORY:app.workingDirectory,BUILD_DIRECTORY:app.buildDirectory,SPA:String(app.spa)})) values[`${prefix}_${key}`]=value;
    values[`${prefix}_DIRECTORY`] = app.directory;
    values[app.id === 'main' ? 'PHP_DOCUMENT_ROOT' : `${prefix}_DOCUMENT_ROOT`] = app.documentRoot;
    values[app.id === 'main' ? 'PHP_SERVER_MODE' : `${prefix}_SERVER_MODE`] = app.mode;
    values[app.id === 'main' ? 'PHP_HTTP_PORT' : `${prefix}_HTTP_PORT`] = app.port;
  }
  if(config.applications.some(a=>a.enabled&&a.websocket.enabled))profiles.add('websocket');else profiles.delete('websocket');
  values.COMPOSE_PROFILES = [...profiles].join(',');
  const remaining = new Set(Object.keys(values));
  const result = text.split('\n').map(line => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (!match || !Object.hasOwn(values, match[1])) return line;
    remaining.delete(match[1]);
    return `${match[1]}='${values[match[1]]}'`;
  });
  for (const key of remaining) result.push(`${key}='${values[key]}'`);
  return result.join('\n');
}
export async function atomicWrite(filename, content, mode = 0o600) {
  const tmp = `${filename}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    const previous = await fs.stat(filename).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    await fs.writeFile(tmp, content, { mode });
    // Preserva o proprietário do host quando o painel roda como root.
    if (previous && process.getuid?.() === 0) await fs.chown(tmp, previous.uid, previous.gid);
    await fs.rename(tmp, filename);
  }
  finally { await fs.unlink(tmp).catch(() => {}); }
}
export async function checkPaths(config, root) {
  for (const app of config.applications.filter(a => a.enabled)) {
    const source = path.resolve(root, app.directory);
    const info = await fs.stat(source).catch(() => null);
    assert(info?.isDirectory(), `Diretório da aplicação ${app.id} não existe no host: ${source}`);
    const publicDir = app.type === 'static' ? path.join(source,app.buildDirectory) : app.type === 'node' ? path.join(source,app.workingDirectory.slice('/var/www/html'.length)) : path.join(source, app.documentRoot.slice('/var/www/html'.length));
    assert((await fs.stat(publicDir).catch(() => null))?.isDirectory(), `Diretório público/de trabalho da aplicação ${app.id} não existe.`);
    assert((await fs.realpath(publicDir)).startsWith((await fs.realpath(source))+path.sep) || (await fs.realpath(publicDir))===(await fs.realpath(source)), 'Diretório publicado deve permanecer dentro do projeto.');
    if(app.type === 'static') assert((await fs.stat(path.join(publicDir,'index.html')).catch(()=>null))?.isFile(), 'Build estático precisa conter index.html.');
  }
}
