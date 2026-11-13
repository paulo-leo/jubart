import {isIP} from 'node:net';
import {parseEnv,databasePortsFromEnv,panelAccessFromEnv,phpmyadminAccessFromEnv,databaseEnabled,slots} from './core.mjs';
export function trustedProxyInfo(services=[],applications=[]){
 const proxy=services.find(s=>s.name==='traefik'&&s.state==='running');
 return {observedAt:new Date().toISOString(),applications:applications.filter(app=>app.enabled&&app.type==='php').map(app=>{
  const service=services.find(s=>s.name===slots[app.id]?.service),networks=[];
  if(proxy&&service?.state==='running')for(const network of proxy.networks||[]){
   const shared=service.networks?.find(n=>n.name===network.name);
   if(!shared)continue;
   const addresses=[shared.ipv4&&network.ipv4,shared.ipv6&&network.ipv6].filter(ip=>typeof ip==='string'&&isIP(ip));
   if(addresses.length)networks.push({name:network.name,addresses});
  }
  const addresses=[...new Set(networks.flatMap(n=>n.addresses))];
  return {id:app.id,name:app.name,service:slots[app.id]?.service,networks,addresses,envLine:addresses.length?'TRUSTED_PROXIES='+addresses.join(','):null,status:addresses.length?'observed':'unavailable'};
 })};
}
export function connectionInfo(text,services=[],applications=[]){
 const env=parseEnv(text),panel=panelAccessFromEnv(env),db=databasePortsFromEnv(env);
 return {trustedProxies:trustedProxyInfo(services,applications),services:[['panel','Painel administrativo',panel,3000,'HTTP',true],['mariadb','MariaDB',db.mariadb,3306,'TCP',databaseEnabled(env,'mariadb')],['postgres','PostgreSQL',db.postgres,5432,'TCP',databaseEnabled(env,'postgres')],['phpmyadmin','phpMyAdmin',phpmyadminAccessFromEnv(env),80,'HTTP',databaseEnabled(env,'mariadb')]].map(([id,name,access,internalPort,protocol,enabled])=>({id,name,...access,internalPort,protocol,enabled,published:services.find(s=>s.name===id)?.ports||[],state:services.find(s=>s.name===id)?.state||'not_created'})),panel:{domain:panel.domain,proxyEnabled:panel.proxyEnabled,tls:panel.tls,secureCookie:panel.secureCookie},proxy:{httpPort:Number(env.HTTP_PORT||8080),httpsPort:Number(env.HTTPS_PORT||8443)},note:'Os comandos SSH devem ser executados no seu computador. O IP/hostname e as credenciais SSH são do servidor hospedeiro; não são obtidos automaticamente pelo painel.'};
}
