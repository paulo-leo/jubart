import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {validatePHP} from '../php-api.mjs';
const root=path.resolve(import.meta.dirname,'../../..');
test('metadados npm possuem licenças open source revisadas e inventário sincronizado',async()=>{
 const lock=JSON.parse(await fs.readFile(path.join(root,'docker/panel/package-lock.json'),'utf8'));const report=JSON.parse(await fs.readFile(path.join(root,'config/dependencies.licenses.json'),'utf8'));const allowed=new Set(['MIT','ISC','BSD-2-Clause','BSD-3-Clause','Apache-2.0']);
 const entries=Object.entries(lock.packages).filter(([key])=>key);assert.equal(report.packages.length,entries.length);
 for(const [location,p]of entries){assert(allowed.has(p.license),`Revisar licença de ${location}: ${p.license}`);assert(report.packages.some(item=>item.location===location&&item.version===p.version&&item.license===p.license));}
});
test('ODBC Microsoft não pode ser ativado pelo backend nem pelo instalador de drivers',()=>{
 assert.throws(()=>validatePHP({settings:{PHP_INSTALL_SQLSERVER:'true'},files:{}}),/open source/);
 assert.throws(()=>execFileSync('sh',[path.join(root,'docker/php/install-db-drivers.sh')],{env:{...process.env,PHP_INSTALL_SQLSERVER:'true',PHP_INSTALL_POSTGRESQL:'false',PHP_INSTALL_SQLITE:'false',PHP_INSTALL_MYSQLI:'false'},stdio:'pipe'}),error=>{assert.match(error.stderr.toString(),/open source/);return true;});
});
