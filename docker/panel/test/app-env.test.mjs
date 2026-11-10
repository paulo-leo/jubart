import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAppEnv } from '../app-env.mjs';

test('cria e edita .env somente no projeto cadastrado, com revisão e proteção de links', async t => {
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'app-env-'));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const root=path.join(base,'infra'), directory=path.join(base,'project');
  await fs.mkdir(root);await fs.mkdir(directory);
  await fs.writeFile(path.join(root,'.env'),'INFRA_PASSWORD=preserve\n');
  const config={applications:[{id:'main',directory}]};
  const editor=createAppEnv({root,loadConfig:async()=>({config})});
  assert.equal((await editor.read('main')).exists,false);
  const content='APP_NAME="Meu projeto"\nDB_PASSWORD=secret\n# comentário\n';
  const created=await editor.save('main',{content,revision:null,directory});
  assert.equal((await fs.stat(path.join(directory,'.env'))).mode&0o777,0o600);
  assert.equal((await editor.read('main',true)).content,content);
  assert.equal((await editor.read('main')).content,undefined);
  await assert.rejects(editor.save('main',{content:'overwrite',revision:null,directory}),{status:409});
  await fs.appendFile(path.join(directory,'.env'),'EXTERNAL_CHANGE=true\n');
  await assert.rejects(editor.save('main',{content:'overwrite',revision:created.revision,directory}),{status:409});
  const current=await editor.read('main',true);
  await editor.save('main',{content:content+'UPDATED=true\n',revision:current.revision,directory});
  assert.match(await fs.readFile(path.join(directory,'.env'),'utf8'),/UPDATED=true/);
  await assert.rejects(editor.save('main',{content:'',revision:current.revision,directory:root}),{status:409});
  await assert.rejects(editor.save('main',{content:'x'.repeat(65537),revision:current.revision,directory}));
  await assert.rejects(editor.read('../infra'),{status:404});
  await fs.unlink(path.join(directory,'.env'));
  await fs.symlink(path.join(root,'.env'),path.join(directory,'.env'));
  await assert.rejects(editor.read('main',true),{status:403});
  await assert.rejects(editor.save('main',{content:'bad',revision:null,directory}),{status:403});
  assert.equal(await fs.readFile(path.join(root,'.env'),'utf8'),'INFRA_PASSWORD=preserve\n');
  config.applications[0].directory=root;
  await assert.rejects(editor.read('main'),{status:403});
});

test('salvamentos concorrentes com a mesma revisão não sobrescrevem o primeiro', async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'app-env-race-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const root=path.join(base,'infra'),directory=path.join(base,'app');await fs.mkdir(root);await fs.mkdir(directory);
  const editor=createAppEnv({root,loadConfig:async()=>({config:{applications:[{id:'main',directory}]}})});
  const results=await Promise.allSettled(['FIRST=true','SECOND=true'].map(content=>editor.save('main',{content,directory,revision:null})));
  assert.deepEqual(results.map(r=>r.status),['fulfilled','rejected']);
  assert.equal(await fs.readFile(path.join(directory,'.env'),'utf8'),'FIRST=true');
});
