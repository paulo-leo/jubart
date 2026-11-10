import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createPHPAPI,phpFiles,validatePHP} from '../php-api.mjs';
import {fromEnv} from '../core.mjs';
test('PHP guarda arquivos e valores permitidos, verifica revisão e aplica só a PHP sem excluir volumes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'php-api-'));try{
 await fs.mkdir(path.join(root,'docker/php'),{recursive:true});for(const name of phpFiles)await fs.writeFile(path.join(root,'docker/php',name),name==='extensions.list'?'pdo_mysql\nredis\n':'; initial\n');await fs.writeFile(path.join(root,'.env'),'PHP_VERSION=8.4.27\nFRANKENPHP_VERSION=1\nDB_PASSWORD=keep-private\n');
 const calls=[],stops=[],config=fromEnv({});config.applications[1].enabled=true;config.applications[1].type='static';const api=createPHPAPI({root,readEnv:()=>fs.readFile(path.join(root,'.env'),'utf8'),loadConfig:async()=>({config}),compose:async args=>{calls.push(args);return '{}';},automation:{stopForApp:async id=>stops.push(id),recreateEnabled:async()=>calls.push(['recreate-automation'])},startOperation:(label,run)=>{return {label,run};}});
 const initial=(await api.handle('/api/php','GET')).body;assert.equal(JSON.stringify(initial).includes('keep-private'),false);
 const data={...initial,files:{...initial.files,'php.ini':'memory_limit = ${PHP_MEMORY_LIMIT}\n'},settings:{PHP_VERSION:'8.4.27',FRANKENPHP_VERSION:'1',PHP_MEMORY_LIMIT:'512M',PHP_INSTALL_MYSQLI:'true'}};
 const saved=(await api.handle('/api/php/save','POST',data)).body;assert.notEqual(saved.revision,initial.revision);assert.match(await fs.readFile(path.join(root,'.env'),'utf8'),/PHP_MEMORY_LIMIT=512M/);assert.match(await fs.readFile(path.join(root,'.env'),'utf8'),/DB_PASSWORD=keep-private/);
 await assert.rejects(api.handle('/api/php/save','POST',data),/alterada/);
 assert.throws(()=>validatePHP({...data,files:{...data.files,'../../evil':'x'}}),/permitido/);assert.throws(()=>validatePHP({...data,files:{...data.files,'extensions.list':'redis;echo hacked'}}),/Extensão/);assert.throws(()=>validatePHP({...data,settings:{PHP_MEMORY_LIMIT:'1G\nEVIL=true'}}),/Valor inválido/);assert.throws(()=>validatePHP({...data,files:{...data.files,'php.ini':'not a directive'}}),/Diretiva/);
 const result=await api.handle('/api/php/apply','POST',{revision:saved.revision});await result.body.operation.run();assert.deepEqual(stops,['main']);const up=calls.find(c=>c.includes('up'));assert.ok(up.includes('php'));assert.equal(up.includes('php-app2'),false);assert.equal(calls.some(c=>c.includes('down')||c.includes('-v')||c.includes('--volumes')),false);
 assert.ok(JSON.parse(await fs.readFile(path.join(root,'.panel-state/php-before-save.json'),'utf8')).files);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
