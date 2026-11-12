import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareQuickStart} from '../docker/panel/quick-start.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await prepareQuickStart(root,{hostRoot:process.env.JUBART_HOST_DIRECTORY||root});
console.log('Inicialização local preparada. Caminhos e senhas de exemplo foram configurados; valores personalizados foram preservados.');
console.log('Acesso padrão: http://localhost:9090. Consulte PANEL_USERNAME e PANEL_PASSWORD no seu .env.');
