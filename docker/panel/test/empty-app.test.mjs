import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inspectEmptyApp} from '../empty-app.mjs';
test('remoção exige pasta vazia, aplicação adicional e ausência de automações',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'empty-app-'));try{
 await fs.mkdir(path.join(root,'project'));await fs.mkdir(path.join(root,'config'));
 const config={applications:[{id:'main',directory:'project'},{id:'app2',directory:'project'}]};
 assert.equal((await inspectEmptyApp(root,config,'main')).canRemove,false);
 assert.equal((await inspectEmptyApp(root,config,'app2')).canRemove,true);
 await fs.writeFile(path.join(root,'project/.env'),'');assert.equal((await inspectEmptyApp(root,config,'app2')).canRemove,false);await fs.unlink(path.join(root,'project/.env'));
 await fs.writeFile(path.join(root,'config/automation.json'),JSON.stringify({jobs:[{app:'app2'}]}));assert.equal((await inspectEmptyApp(root,config,'app2')).canRemove,false);await fs.unlink(path.join(root,'config/automation.json'));
 await fs.symlink(path.join(root,'project'),path.join(root,'link'));config.applications[1].directory='link';assert.equal((await inspectEmptyApp(root,config,'app2')).canRemove,false);
 config.applications[1].directory='.';assert.equal((await inspectEmptyApp(root,config,'app2')).canRemove,false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
