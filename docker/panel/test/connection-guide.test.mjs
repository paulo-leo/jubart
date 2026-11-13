import test from 'node:test';import assert from 'node:assert/strict';import {connectionInfo,trustedProxyInfo} from '../connection-guide.mjs';
test('guia de acesso usa portas configuradas e reais sem divulgar credenciais',()=>{const r=connectionInfo('PANEL_PORT=19090\nPANEL_COOKIE_SECURE=true\nPANEL_PASSWORD=never-expose\nDB_PASSWORD=another-secret\nMARIADB_PORT=13306\nPHPMYADMIN_PORT=18081\nPOSTGRES_ENABLED=false\n',[{name:'panel',state:'running',ports:['127.0.0.1:9090 → 3000/tcp']}]);assert.equal(r.services[0].port,19090);assert.deepEqual(r.services[0].published,['127.0.0.1:9090 → 3000/tcp']);assert.equal(r.panel.secureCookie,true);assert.equal(r.services.find(s=>s.id==='mariadb').port,13306);assert.equal(r.services.find(s=>s.id==='phpmyadmin').port,18081);assert.equal(r.services.find(s=>s.id==='postgres').enabled,false);assert.doesNotMatch(JSON.stringify(r),/never-expose|another-secret/);});

const apps=[{id:'main',name:'API',enabled:true,type:'php'},{id:'app2',name:'Node',enabled:true,type:'node'},{id:'app3',name:'Desativada',enabled:false,type:'php'}];
const network=(name,ipv4,ipv6=null)=>({name,ipv4,ipv6});
const services=(ip='172.20.0.5')=>[{name:'traefik',state:'running',networks:[network('infra_proxy',ip),network('unrelated','10.0.0.1')]},{name:'php',state:'running',networks:[network('infra_proxy','172.20.0.9'),network('infra_app','172.21.0.9')]}];
test('proxy confiável é o IP atual do Traefik na rede comum, sem confiar na rede inteira',()=>{
 const result=trustedProxyInfo(services(),apps);assert.equal(result.applications.length,1);const app=result.applications[0];assert.equal(app.envLine,'TRUSTED_PROXIES=172.20.0.5');assert.deepEqual(app.addresses,['172.20.0.5']);assert.deepEqual(app.networks,[{name:'infra_proxy',addresses:['172.20.0.5']}]);assert.ok(Number.isFinite(Date.parse(result.observedAt)));
 assert.equal(trustedProxyInfo(services('172.20.0.7'),apps).applications[0].envLine,'TRUSTED_PROXIES=172.20.0.7');
});
test('não sugere endereço quando proxy/app estão parados, a rede não é comum ou o IP é inválido',()=>{
 for(const rows of [[],services().map(s=>({...s,state:'exited'})),services().map(s=>s.name==='php'?{...s,networks:[network('other','10.3.0.2')]}:s),services('*')]){const app=trustedProxyInfo(rows,apps).applications[0];assert.equal(app.envLine,null);assert.equal(app.status,'unavailable');}
});
test('inclui IPv6 observado e exclui valores inválidos, sem expor configuração arbitrária',()=>{
 const rows=services();rows[0].networks[0].ipv6='fd00::5';rows[1].networks[0].ipv6='fd00::9';rows[0].secret='hidden';
 const app=trustedProxyInfo(rows,apps).applications[0];assert.equal(app.envLine,'TRUSTED_PROXIES=172.20.0.5,fd00::5');assert.doesNotMatch(JSON.stringify(app),/hidden|172\.20\.0\.9/);
});
