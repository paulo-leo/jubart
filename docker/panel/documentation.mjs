import fs from 'node:fs/promises';
import path from 'node:path';
import {parseEnv} from './core.mjs';
export async function readDocumentation(root){
 const markdown=await fs.readFile(path.join(root,'README.md'),'utf8');
 const lock=JSON.parse(await fs.readFile(path.join(root,'config/images.lock.json'),'utf8'));
 const env=parseEnv(await fs.readFile(path.join(root,'.env'),'utf8'));
 const refs={'dunglas/frankenphp':`dunglas/frankenphp:${env.FRANKENPHP_VERSION}-php${env.PHP_VERSION}-bookworm@${env.FRANKENPHP_DIGEST}`,'mariadb':'mariadb:'+env.MARIADB_VERSION,'phpmyadmin':'phpmyadmin:'+env.PHPMYADMIN_VERSION,'node':'node:'+env.NODE_VERSION,'traefik':'traefik:'+env.TRAEFIK_VERSION,'valkey/valkey':'valkey/valkey:'+env.VALKEY_VERSION,'postgres':'postgres:'+env.POSTGRES_VERSION,'caddy':'caddy:'+env.STATIC_CADDY_VERSION,'composer':env.COMPOSER_IMAGE,'docker':env.DOCKER_CLI_IMAGE};
 const descriptions={'dunglas/frankenphp':'Executa PHP tradicional ou Laravel Octane; INIs e extensões são geridos na guia PHP.','mariadb':'Banco SQL compartilhado, com volume persistente e backups.','phpmyadmin':'Administração web do MariaDB.','node':'Executa aplicações Node.js, ferramentas npm e compila a interface React.','traefik':'Proxy por domínio/subdomínio e certificados HTTPS.','valkey/valkey':'Cache, sessões e filas compatíveis com o protocolo Redis.','postgres':'Banco PostgreSQL com volume e backup próprios.','caddy':'Serve builds estáticos e rotas SPA sem servidor Node.js.','composer':'Gerenciador de dependências PHP incluído na imagem de aplicação.','docker':'CLI e plugin Compose usados pelo painel para operar a infraestrutura.'};
 const technologies=Object.entries(lock.images).map(([tag,value])=>({name:tag.slice(0,tag.lastIndexOf(':')),tag,locked:value.reference,configured:refs[tag.slice(0,tag.lastIndexOf(':'))]||'Não configurado',matches:refs[tag.slice(0,tag.lastIndexOf(':'))]===value.reference,description:descriptions[tag.slice(0,tag.lastIndexOf(':'))]||''}));
 const here=import.meta.dirname;const pkg=JSON.parse(await fs.readFile(path.join(here,'package.json'),'utf8'));const bootstrap=JSON.parse(await fs.readFile(path.join(here,'public/vendor/bootstrap/manifest.json'),'utf8'));
 return {markdown,source:'README.md',resolvedAt:lock.resolvedAt,technologies,libraries:{...pkg.dependencies,...pkg.devDependencies,bootstrap:bootstrap.version},note:'Referências configuradas e lock do repositório; não representam uma inspeção das imagens já em execução. Dependências APT/extensões compiladas não possuem lock completo de artefatos.'};
}
