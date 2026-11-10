import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validatePackageAction,auditPackageLock,packageContext,packageCommandPlan,createAppPackages} from '../app-packages.mjs';
test('pacotes exigem versões exatas e comandos definidos; licenças ausentes bloqueiam instalação',()=>{
 validatePackageAction({manager:'npm',action:'add',package:'@scope/package',version:'1.2.3'});validatePackageAction({manager:'composer',action:'add',package:'vendor/package',version:'1.2.3'});
 for(const change of [{package:'--global'},{package:'https://evil.test/a'},{version:'latest'},{version:'^1.2.3'},{version:'1.2.3;ls'}])assert.throws(()=>validatePackageAction({manager:'npm',action:'add',package:'sample',version:'1.2.3',...change}));
 assert.throws(()=>auditPackageLock('npm',{packages:{'node_modules/x':{}}}));assert.throws(()=>auditPackageLock('composer',{packages:[{name:'private/pkg',license:['proprietary']}]}));assert.equal(auditPackageLock('npm',{packages:{'':{},'node_modules/x':{license:'MIT'}}}),1);
 const plan=packageCommandPlan({user:'1000:1000',workdir:'/var/www/html',service:'node'},{manager:'npm',action:'add',package:'sample',version:'1.2.3'});assert(plan.commands[0].includes('--package-lock-only'));assert(plan.commands[0].includes('--save-exact'));assert(plan.commands.every(c=>c.includes('--ignore-scripts')&&c.includes('timeout')));
});
test('instalação usa container temporário com UID/GID do projeto; falha na licença restaura manifestos',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'packages-'));try{
 const project=path.join(root,'project');await fs.mkdir(project);const manifest='{"dependencies":{"sample":"1.2.3"},"scripts":{"build":"echo build"}}';await fs.writeFile(path.join(project,'package.json'),manifest);const lock={lockfileVersion:3,packages:{'':{},'node_modules/sample':{version:'1.2.3',license:'MIT'}}};await fs.writeFile(path.join(project,'package-lock.json'),JSON.stringify(lock));const config={applications:[{id:'main',type:'php',directory:project,name:'Project'}]};const calls=[];let rejectLicense=false;
 const api=createAppPackages({root,loadConfig:async()=>({config}),startOperation:(label,run)=>({run}),compose:async args=>{calls.push(args);if(rejectLicense&&args.includes('--package-lock-only')){await fs.writeFile(path.join(project,'package.json'),'{}');await fs.writeFile(path.join(project,'package-lock.json'),JSON.stringify({packages:{'node_modules/sample':{license:'proprietary'}}}));}return '';}});
 const inventory=await api.inventory('main','npm');assert.equal(inventory.packages[0].installed,'1.2.3');const install=await api.execute('main',{manager:'npm',action:'install'});await install.operation.run();assert(calls[0].includes('ci'));assert(calls[0].includes('--user'));assert(calls[0].includes('--no-deps'));
 rejectLicense=true;const op=await api.execute('main',{manager:'npm',action:'add',package:'sample',version:'2.0.0'});await assert.rejects(op.operation.run(),/Licença/);assert.equal(await fs.readFile(path.join(project,'package.json'),'utf8'),manifest);assert.equal(calls.filter(c=>c.includes('ci')).length,1);
 await assert.rejects(api.execute('main',{manager:'npm',action:'script',script:'nonexistent'}));
 const context=await packageContext({root,config,appId:'main',manager:'npm'});assert.equal(context.service,'node');config.applications[0].directory=root;await assert.rejects(packageContext({root,config,appId:'main',manager:'npm'}));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
