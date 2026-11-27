import fs from 'node:fs/promises';
import path from 'node:path';
import {databaseEnabled, databaseEngineForService, parseEnv, slots} from './core.mjs';

export const containerActions = ['container.start', 'container.stop', 'container.restart'];
export const servicePattern = /^[a-z0-9][a-z0-9_-]{0,100}$/;
const fail = (message, status = 403) => { throw Object.assign(new Error(message), {status}); };

export function containerControllable(service) {
  return service.name !== 'panel' && !service.protected && !service.automation && !/^(?:node|websocket-|worker-|scheduler-)/.test(service.name);
}

export function publicService(service, key) {
  const {name, container, state, health, image, containerId, createdAt, startedAt, finishedAt, exitCode, restartCount, ports, automation, profiles, restartPolicy, networks, configured} = service;
  return {name, container, state, health, image, containerId, createdAt, startedAt, finishedAt, exitCode, restartCount, ports, automation, profiles, restartPolicy, networks, configured,
    protected: !containerControllable(service),
    actions: containerId && containerControllable(service) && key.scopes.includes('execute') ? containerActions.filter(action => key.actions.includes(action)) : [],
    ...(['backup','backup-postgres'].includes(name)?{backupManagement:{engine:name==='backup'?'mariadb':'postgres',configurationResource:'backups',startAction:'container.start',configureAction:'backup.configure',runAction:'backup.run',note:'Iniciar/parar/reiniciar este container é independente de habilitar backups automáticos. Para iniciar o serviço existente, use container.start com o ID atual; não é necessário backup.configure. Configurar agenda/pasta/retenção usa backup.configure; uma cópia imediata usa backup.run. Não habilite a agenda ou altere o outro banco quando o pedido for apenas iniciar este serviço.'}}:{})};
}

export function publicVolumes(state, services, filtered = false) {
  const mounted = new Map();
  for (const service of services) for (const mount of service.mounts || []) {
    if (mount.type !== 'volume' || !mount.name) continue;
    const list = mounted.get(mount.name) || [];
    list.push({service: service.name, target: mount.target, writable: mount.writable});
    mounted.set(mount.name, list);
  }
  const metadata = new Map((state.volumes || []).map(volume => [volume.name, volume]));
  const names = new Set([...mounted.keys(), ...(!filtered ? metadata.keys() : [])]);
  return [...names].sort().map(name => {
    const volume = metadata.get(name);
    return {name, driver: volume?.driver ?? null, created: volume?.created ?? null, mounts: mounted.get(name) || []};
  });
}

export function createContainerControl({root, snapshot, loadConfig, docker}) {
  async function resolve(key, data) {
    const state = await snapshot(), service = state.services.find(s => s.name === data.service);
    if (!service) fail('Serviço não pertence à instalação Jubart.');
    if (!containerControllable(service)) fail('Use a operação específica para este serviço; o painel não pode controlar a si próprio pelo MCP.');
    if (!service.containerId || service.containerId !== data.containerId) fail('Container ausente ou substituído; consulte services novamente.', 409);
    if (!docker) fail('Controle Docker indisponível.', 409);
    let current;
    try { [current] = JSON.parse(await docker(['inspect', data.containerId])); }
    catch { fail('Container indisponível; consulte services novamente.', 409); }
    const labels = current?.Config?.Labels || {};
    if (current?.Id?.slice(0, 12) !== data.containerId || labels['com.docker.compose.project'] !== state.project || labels['com.docker.compose.service'] !== data.service || labels['com.docker.compose.oneoff']?.toLowerCase() === 'true') fail('Container não pertence ao serviço autorizado.', 403);
    const verb = data.action.split('.')[1];
    if (verb !== 'stop') {
      const app = (await loadConfig()).config.applications.find(a => slots[a.id]?.service === data.service);
      if (app && !app.enabled) fail('Aplicação desabilitada; habilite e aplique a configuração no painel.', 409);
      const engine = databaseEngineForService(data.service);
      if (engine && !databaseEnabled(parseEnv(await fs.readFile(path.join(root, '.env'), 'utf8')), engine)) fail('Banco desabilitado na configuração da infraestrutura.', 409);
    }
    return {service, id: current.Id, command: verb === 'start' ? ['start', current.Id] : [verb, '--time', '30', current.Id]};
  }
  return {resolve, async execute(key, data) {
    // Revalidate identity, ownership and configuration inside the queued task.
    const target = await resolve(key, data);
    await docker(target.command);
  }};
}
