import test from 'node:test';
import assert from 'node:assert/strict';
import {fromEnv,parseEnv,patchEnv,validateConfig} from '../core.mjs';
test('painel importa/publica porta e subdomínio HTTPS sem expor credenciais',()=>{
 const c=fromEnv({PANEL_BIND_ADDRESS:'0.0.0.0',PANEL_PORT:'19090',PANEL_DOMAIN:'painel.exemplo.com',PANEL_PROXY_ENABLED:'true',PANEL_TLS_ENABLED:'true',PANEL_COOKIE_SECURE:'true',TRAEFIK_TLS_ENABLED:'true',ACME_EMAIL:'admin@exemplo.com'});
 validateConfig(c);const env=parseEnv(patchEnv('PANEL_PASSWORD=secret-value\n',c));assert.equal(env.PANEL_PORT,'19090');assert.equal(env.PANEL_DOMAIN,'painel.exemplo.com');assert.equal(env.PANEL_TLS_ENABLED,'true');assert.equal(env.PANEL_PASSWORD,'secret-value');assert.equal(JSON.stringify(c).includes('secret-value'),false);
 const conflict=structuredClone(c);conflict.applications[0].domain='painel.exemplo.com';assert.throws(()=>validateConfig(conflict),/Subdomínio/);
 for(const change of [{port:8080},{domain:'evil`)'},{domain:''},{secureCookie:false}]){const bad=structuredClone(c);Object.assign(bad.proxy.panel,change);assert.throws(()=>validateConfig(bad));}
});
