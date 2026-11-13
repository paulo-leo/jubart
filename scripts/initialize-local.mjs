import {initializeProxyNetwork,readDockerNetworkState} from '../docker/panel/proxy-network.mjs';
import fs from 'node:fs/promises';
import {parseEnv} from '../docker/panel/core.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareQuickStart} from '../docker/panel/quick-start.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await prepareQuickStart(root,{hostRoot:process.env.JUBART_HOST_DIRECTORY||root});
console.log('Inicialização local preparada. Caminhos e senhas de exemplo foram configurados; valores personalizados foram preservados.');
console.log('Acesso padrão: http://localhost:9090. Consulte PANEL_USERNAME e PANEL_PASSWORD no seu .env.');

if(process.env.JUBART_PROXY_AUTOINIT==='true'){
 const env=parseEnv(await fs.readFile(path.join(root,'.env'),'utf8'));
 const engine=readDockerNetworkState();
 const [networks,containers]=await Promise.all([engine.networks(),engine.containers(env.COMPOSE_PROJECT_NAME||'laravel')]);
 const result=await initializeProxyNetwork(root,{networks,containers,hostRoutes:JSON.parse(process.env.JUBART_HOST_ROUTES||'null')});
 if(result.status==='migration_required')console.log('Instalação existente: rede e IP preservados. Use a migração explícita em Como acessar.');
 else console.log('Reserva do proxy: '+result.status+(result.ipv4?' · '+result.ipv4:''));
}
