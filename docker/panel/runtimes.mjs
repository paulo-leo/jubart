const memoryFields=id=>({mem_limit:'${CONTAINER_MEMORY_'+id.toUpperCase().replaceAll('-','_')+':-0}',memswap_limit:'${CONTAINER_MEMORY_'+id.toUpperCase().replaceAll('-','_')+':-0}'});
import {validateConfig,slots} from './core.mjs';
// Substitui completamente os atributos PHP que não pertencem ao novo runtime.
export function runtimeCompose(config){
 validateConfig(config);
 const lines=['# Gerado pelo painel. Não editar; use apps.json.','services:'];
 for(const app of config.applications){
  if(!['main','app2','app3'].includes(app.id)){const tool={...memoryFields('node-'+app.id),image:'node:${APP_NODE_VERSION:-${NODE_VERSION}}',profiles:['tools-'+app.id],working_dir:'/var/www/html',user:'${NODE_UID:-1000}:${NODE_GID:-1000}',entrypoint:['npm'],command:['--version'],environment:{NPM_CONFIG_CACHE:'/tmp/npm-cache'},networks:['app'],volumes:[{type:'bind',source:app.directory,target:'/var/www/html',bind:{create_host_path:false}}]};lines.push(`  node-${app.id}: ${JSON.stringify(tool)}`);}

  if(app.type==='php'&&!['main','app2','app3'].includes(app.id)){
   const prefix=slots[app.id].prefix;const service={...memoryFields(slots[app.id].service),extends:{file:'compose.yaml',service:'php'},container_name:slots[app.id].service,profiles:[app.id],environment:{PHP_HTTP_PORT:String(app.port),PHP_DOCUMENT_ROOT:app.documentRoot,PHP_SERVER_MODE:app.mode,APP_URL:'${'+prefix+'_URL}',INERTIA_SSR_ENABLED:'false',DB_DATABASE:'${'+prefix+'_DB_DATABASE:-'+app.id+'}',DB_USERNAME:'${'+prefix+'_DB_USERNAME:-'+app.id+'}',DB_PASSWORD:'${'+prefix+'_DB_PASSWORD:-}',REDIS_PREFIX:app.id+'_',REDIS_DB:'0',REDIS_CACHE_DB:'1'},volumes:[{type:'bind',source:app.directory,target:'/var/www/html',bind:{create_host_path:false}}]};
   lines.push(`  ${slots[app.id].service}: !override ${JSON.stringify(service)}`);continue;
  }
  if(app.type==='php'){
   // Herança explícita do arquivo base evita herdar um main convertido em Node/Estática.
   if(app.id!=='main' && config.applications.find(a=>a.id==='main').type!=='php')lines.push(`  ${slots[app.id].service}: !override ${JSON.stringify({extends:{file:'compose.yaml',service:slots[app.id].service}})}`);
   continue;
  }
  const service={...memoryFields(slots[app.id].service),image:app.type==='node'?'node:${APP_NODE_VERSION:-${NODE_VERSION}}':'caddy:${STATIC_CADDY_VERSION:-2-alpine@sha256:78bd35025c7ba85961dd149ae670315129954e77abe2383ac47c89106b35ade9}',restart:'unless-stopped',working_dir:app.type==='node'?app.workingDirectory:'/srv',command:app.type==='node'?['sh','-lc',`exec ${app.startCommand}`]:['caddy','run','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'],networks:['app','proxy'],volumes:[{type:'bind',source:app.directory,target:'/var/www/html',read_only:app.type==='static',bind:{create_host_path:false}}],environment:app.type==='node'?{NODE_ENV:'production',HOST:'0.0.0.0',PORT:String(app.port)}:{HTTP_PORT:String(app.port),STATIC_ROOT:'/var/www/html/'+app.buildDirectory,SPA_TRY:app.spa?'try_files {path} /index.html':'# SPA desativado'}};
  if(app.type==='node')service.env_file=[{path:app.directory+'/.env',required:false}];
  if(app.type==='static')service.volumes.push({type:'bind',source:'./docker/static/Caddyfile',target:'/etc/caddy/Caddyfile',read_only:true});
  service.container_name=slots[app.id].service;if(app.id!=='main')service.profiles=[app.id];
  lines.push(`  ${slots[app.id].service}: !override ${JSON.stringify(service)}`);
 }
 return lines.length===2?'services: {}\n':lines.join('\n')+'\n';
}

export function extraAppRoutes(config){
 validateConfig(config);const routers={},services={};
 for(const app of config.applications.filter(a=>a.enabled&&!['main','app2','app3'].includes(a.id))){
  const key='managed-'+app.id;services[key]={loadBalancer:{passHostHeader:true,servers:[{url:`http://${slots[app.id].service}:${app.port}`}]}};
  routers[key+'-http']={rule:`Host(\`${app.domain}\`)`,entryPoints:['web'],service:key,...(config.proxy.tls?{middlewares:['force-https']}: {})};
  if(config.proxy.tls)routers[key+'-https']={rule:`Host(\`${app.domain}\`)`,entryPoints:['websecure'],service:key,tls:{certResolver:'letsencrypt'}};
 }
 return JSON.stringify({http:{routers,services}},null,2)+'\n';
}
