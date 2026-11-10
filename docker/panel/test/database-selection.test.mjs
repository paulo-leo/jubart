import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {databaseEnabled, databaseEngineForService, parseEnv, patchEnv, fromEnv} from '../core.mjs';

test('seleção dos bancos valida flags e é preservada ao salvar aplicações', () => {
  assert.equal(databaseEnabled({}, 'mariadb'), true);
  assert.equal(databaseEnabled({POSTGRES_ENABLED:'false'}, 'postgres'), false);
  assert.throws(() => databaseEnabled({MARIADB_ENABLED:'yes'}, 'mariadb'));
  assert.equal(databaseEngineForService('backup'), 'mariadb');
  assert.equal(databaseEngineForService('php'), null);
  const source='MARIADB_ENABLED=false\nPOSTGRES_ENABLED=true\nCOMPOSE_PROFILES=vite\nAPP_DIRECTORY=/tmp/main\n';
  const result=parseEnv(patchEnv(source, fromEnv(parseEnv(source))));
  assert.equal(result.MARIADB_ENABLED,'false');
  assert.equal(result.POSTGRES_ENABLED,'true');
  assert.ok(result.COMPOSE_PROFILES.split(',').includes('db-mariadb-true'));
  assert.ok(result.COMPOSE_PROFILES.split(',').includes('db-postgres-true'));
});

test('Compose inicia somente os bancos e auxiliares selecionados, mantendo PHP independente', () => {
  const cwd=fileURLToPath(new URL('../../../',import.meta.url));
  for(const maria of [true,false]) for(const postgres of [true,false]){
    const result=spawnSync('docker',['compose','config','--services'],{
      cwd,encoding:'utf8',env:{...process.env,MARIADB_ENABLED:String(maria),POSTGRES_ENABLED:String(postgres),COMPOSE_PROFILES:'db-mariadb-true,db-postgres-true'}
    });
    assert.equal(result.status,0,result.stderr);
    const services=result.stdout.trim().split('\n');
    for(const name of ['mariadb','backup','phpmyadmin'])assert.equal(services.includes(name),maria,name);
    for(const name of ['postgres','backup-postgres'])assert.equal(services.includes(name),postgres,name);
    for(const name of ['php','panel','valkey','traefik'])assert.ok(services.includes(name),name);
  }
});

test('API de banco desativado não executa SQL nem inicia backups', async () => {
  const {createDatabaseAPI}=await import('../database-api.mjs');
  let calls=0;
  const api=createDatabaseAPI({root:'/tmp',readEnv:async()=> 'MARIADB_ENABLED=false\nPOSTGRES_ENABLED=false\n',compose:async()=>{calls++;throw new Error('não deve executar');},startOperation:()=>{calls++;}});
  for(const engine of ['mariadb','postgres']) {
    for(const [method,route] of [['GET',''],['POST','/backup-run'],['POST','/create-database']]) {
      const result=await api.handle('/api/databases/'+engine+route,method,{name:'example'});
      assert.equal(result.status,409);
    }
  }
  assert.equal(calls,0);
});
