import test from 'node:test';
import assert from 'node:assert/strict';
import { fromEnv, parseEnv, patchEnv, validateConfig } from '../core.mjs';
const envText = "APP_DIRECTORY=/projects/main\nAPP_DOMAIN=localhost\nCOMPOSE_PROFILES=vite,app2\nDB_PASSWORD='keep-secret'\nHTTP_PORT=8080\n";
const config = () => fromEnv(parseEnv(envText));
test('importa apontamentos sem incluir senhas', () => {
  const value = config();
  assert.equal(value.applications[0].directory, '/projects/main');
  assert.equal(value.applications[1].enabled, true);
  assert.equal(JSON.stringify(value).includes('keep-secret'), false);
});
test('aplica portas, domínios e perfis preservando credenciais e Vite', () => {
  const value = config();
  value.proxy.httpPort = 80;
  value.applications[1].domain = 'financeiro.localhost';
  value.applications[1].directory = '/projects/Financeiro Local';
  value.applications[1].port = 9000;
  value.applications[2].enabled = true;
  const result = parseEnv(patchEnv(envText, value));
  assert.equal(result.DB_PASSWORD, 'keep-secret');
  assert.equal(result.APP_2_URL, 'http://financeiro.localhost');
  assert.equal(result.APP_2_HTTP_PORT, '9000');
  assert.equal(result.COMPOSE_PROFILES, 'vite,db-mariadb-true,db-postgres-true,app2,app3');
});
test('rejeita injeção no hostname, caminho, raiz pública e portas conflitantes', () => {
  for (const change of [c => c.applications[0].domain = 'foo`) || true', c => c.applications[0].directory = '/tmp/$(command)', c => c.applications[0].documentRoot = '/var/www/html/../secret', c => c.applications[0].port = 2019, c => c.proxy.httpsPort = c.proxy.httpPort]) {
    const value = config(); change(value); assert.throws(() => validateConfig(value));
  }
});
test('rejeita domínios duplicados e desabilitar principal', () => {
  const value = config(); value.applications[1].domain = 'localhost';
  assert.throws(() => validateConfig(value));
  value.applications[1].enabled = false; value.applications[0].enabled = false;
  assert.throws(() => validateConfig(value));
});
test('proxy importa e aplica portas TCP dos bancos sem gravar credenciais no JSON',()=>{
 const value=fromEnv(parseEnv(envText+'MARIADB_PORT=13306\nPOSTGRES_PORT=15432\n'));
 assert.equal(value.proxy.databases.mariadb.port,13306);
 value.proxy.databases.postgres.bindAddress='0.0.0.0';
 const applied=parseEnv(patchEnv(envText,value));
 assert.equal(applied.POSTGRES_PORT,'15432');assert.equal(applied.POSTGRES_BIND_ADDRESS,'0.0.0.0');assert.equal(applied.DB_PASSWORD,'keep-secret');
 for(const change of [v=>v.proxy.databases.mariadb.port=80,v=>v.proxy.databases.postgres.port=13306,v=>v.proxy.databases.postgres.port=65536,v=>v.proxy.databases.mariadb.bindAddress='$(id)']){
  const bad=structuredClone(value);bad.proxy.httpPort=80;change(bad);assert.throws(()=>validateConfig(bad));
 }
});
