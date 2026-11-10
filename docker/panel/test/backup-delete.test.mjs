import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createDatabaseAPI} from '../database-api.mjs';
import {changePlan} from '../public/change-plan.js';

test('exclusão aceita apenas dumps do servidor selecionado e mostra impacto local',async()=>{
 const calls=[];const api=createDatabaseAPI({root:'/tmp',readEnv:async()=>'',compose:async args=>calls.push(args),startOperation:(label,run)=>{calls.push(run);return {state:'running'};}});
 for(const name of ['../mariadb-x.sql.gz','postgres-x.sql.gz','mariadb-x.sql.gz;ls','mariadb-..sql.gz','mariadb-x.sql'])await assert.rejects(api.handle('/api/databases/mariadb/backup-delete','POST',{name}));
 assert.equal(calls.length,0);
 const result=await api.handle('/api/databases/mariadb/backup-delete','POST',{name:'mariadb-example.sql.gz'});assert.equal(result.status,202);await calls.shift()();assert.deepEqual(calls[0],['exec','-T','backup','python3','/opt/backup/backup.py','delete','mariadb-example.sql.gz']);
 const plan=changePlan('/databases/postgres/backup-delete',{name:'postgres-example.sql.gz'});assert.equal(plan.tone,'danger');assert.match(plan.impact,/remota.*preservada/);assert.match(plan.summary.flat().join(' '),/postgres-example/);
});

test('script exclui somente dump e marcadores, rejeita links e trava de backup',()=>{
 const script=new URL('../../backup/backup.py',import.meta.url).pathname;
 execFileSync('python3',['-c',`
import importlib.util, tempfile, pathlib, fcntl
spec=importlib.util.spec_from_file_location('backup',${JSON.stringify(script)})
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
with tempfile.TemporaryDirectory() as folder:
 b.ROOT=pathlib.Path(folder);b.ENGINE='mariadb'
 name='mariadb-test.sql.gz';target=b.ROOT/name
 target.write_bytes(b'dump')
 for suffix in ('.sha256','.uploaded'): target.with_name(name+suffix).write_text('marker')
 untouched=b.ROOT/'keep.sql';untouched.write_text('keep')
 with (b.ROOT/'.backup.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  try: b.delete_backup(name);raise AssertionError('lock ignored')
  except RuntimeError: pass
 assert target.exists()
 b.delete_backup(name)
 assert not target.exists() and untouched.read_text()=='keep'
 assert not target.with_name(name+'.sha256').exists() and not target.with_name(name+'.uploaded').exists()
 target.symlink_to(untouched)
 for invalid in (name,'../keep.sql','postgres-test.sql.gz'):
  try: b.delete_backup(invalid);raise AssertionError('invalid accepted')
  except ValueError: pass
 assert untouched.read_text()=='keep'
`]);
});
