import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fromEnv,parseEnv} from '../core.mjs';
import {operationPreview} from '../operation-preview.mjs';
import {readDocumentation} from '../documentation.mjs';
test('todas as imagens externas são fixadas por digest, incluindo estágios de build',async()=>{
 const root=path.resolve(import.meta.dirname,'../../..'),env=parseEnv(await fs.readFile(path.join(root,'.env.example'),'utf8')),lock=JSON.parse(await fs.readFile(path.join(root,'config/images.lock.json'),'utf8'));
 assert.equal(Object.keys(lock.images).length,10);for(const item of Object.values(lock.images))assert.match(item.reference,/@sha256:[a-f0-9]{64}$/);
 for(const key of ['MARIADB_VERSION','PHPMYADMIN_VERSION','NODE_VERSION','TRAEFIK_VERSION','VALKEY_VERSION','POSTGRES_VERSION','STATIC_CADDY_VERSION','COMPOSER_IMAGE','DOCKER_CLI_IMAGE'])assert.match(env[key],/@sha256:[a-f0-9]{64}$/);
 assert.match(env.FRANKENPHP_DIGEST,/^sha256:[a-f0-9]{64}$/);
 for(const file of ['docker/php/Dockerfile','docker/panel/Dockerfile','docker/backup/Dockerfile','docker/backup/Dockerfile.postgres']){const text=await fs.readFile(path.join(root,file),'utf8');assert.doesNotMatch(text,/FROM docker:cli|--from=composer:2\b/);assert.match(text,/sha256:[a-f0-9]{64}/);}
 try{execFileSync('docker',['compose','version'],{stdio:'pipe'});}catch{return;}
 const config=JSON.parse(execFileSync('docker',['compose','--profile','*','config','--format','json'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}));for(const service of Object.values(config.services))if(service.image&&!service.build)assert.match(service.image,/@sha256:[a-f0-9]{64}$/);
});
test('prévia mostra comandos/SQL sem executá-los ou reproduzir senhas; README é lido do arquivo',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'transparency-'));try{
 await fs.mkdir(path.join(root,'config'));await fs.copyFile(path.resolve(import.meta.dirname,'../../../config/images.lock.json'),path.join(root,'config/images.lock.json'));await fs.writeFile(path.join(root,'.env'),'DB_PASSWORD=TOP_SECRET\n');await fs.writeFile(path.join(root,'README.md'),'# Documentação dinâmica');
 const config=fromEnv({});const p=await operationPreview({root,route:'/services/php/stop',data:{},config});assert.equal(p.commands[0].text,'docker compose stop --timeout 90 php');
 const sql=await operationPreview({root,route:'/databases/mariadb/create-user',data:{user:'teste',host:'%',password:'TOP_SECRET'},config});assert.ok(sql.commands.some(c=>c.kind==='sql'&&c.text.includes('CREATE USER')));assert.equal(JSON.stringify(sql).includes('TOP_SECRET'),false);
 const doc=await readDocumentation(root);assert.match(doc.markdown,/dinâmica/);assert.equal(doc.technologies.length,10);assert.equal(JSON.stringify(doc).includes('TOP_SECRET'),false);await fs.writeFile(path.join(root,'README.md'),'# Alterada');assert.match((await readDocumentation(root)).markdown,/Alterada/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
