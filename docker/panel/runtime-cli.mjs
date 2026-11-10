// Preparação explícita para uso sem painel. Não executa Docker nem remove volumes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fromEnv,parseEnv,validateConfig,patchEnv,checkPaths,atomicWrite} from './core.mjs';
import {runtimeCompose,extraAppRoutes} from './runtimes.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const text=await fs.readFile(path.join(root,'.env'),'utf8');
const config=validateConfig(process.argv.includes('--from-env')?fromEnv(parseEnv(text)):JSON.parse(await fs.readFile(path.join(root,'config/apps.json'),'utf8')));
await checkPaths(config,root);
await atomicWrite(path.join(root,'config/apps.compose.yaml'),runtimeCompose(config));
await atomicWrite(path.join(root,'config/apps.json'),JSON.stringify(config,null,2)+'\n');
await atomicWrite(path.join(root,'.env'),patchEnv(text,config));
await atomicWrite(path.join(root,'docker/traefik/extra-apps.json'),extraAppRoutes(config),0o644);
console.log('Runtimes preparados. Execute docker compose config --quiet e docker compose up -d --build.');
