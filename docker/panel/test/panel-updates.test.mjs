import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {gzipSync} from 'node:zlib';
import {createOfficialSource,blobHash,parseReleaseArchive,publicReleasePath} from '../official-release.mjs';
import {createPanelUpdates} from '../panel-updates.mjs';
import {createPanelMaintenance} from '../panel-maintenance.mjs';
import {updatePanel} from '../panel-update-worker.mjs';
import {releaseState,releaseOverlay,jsonFile,escapedDefinition} from '../update-files.mjs';
const oldVersion='1.3.0',newVersion='1.4.0',commit='e'.repeat(40),digest='sha256:'+'f'.repeat(64),cliDigest='sha256:'+'9'.repeat(64);
const bytes=value=>Buffer.from(value);
function release(version){return new Map(Object.entries({'docker/panel/package.json':JSON.stringify({version}),'docker/panel/package-lock.json':JSON.stringify({version,packages:{'':{version}}}),'config/cli-image':'paulo2021/jubart:cli-'+version+'\n','compose.yaml':'services:\n  panel: {}\n','scripts/example.sh':'echo '+version+'\n','README.md':'Original documentation','docker/traefik/apps.yml':'route '+version} ).map(([name,value])=>[name,bytes(value)]));}
const tree=archive=>Object.fromEntries([...archive].map(([name,value])=>[name,{sha:blobHash(value),mode:name.endsWith('.sh')?0o755:0o644}]));
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'jubart-official-update-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const base=release(oldVersion),target=release(newVersion),calls=[],audits=[];let now=Date.now(),busy=false,failHealth=false,failPull=false,mutateOnPull=false;let image='sha256:'+'1'.repeat(64),version=oldVersion,panelId='a'.repeat(64),serial=0;
 for(const [name,value]of base){await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),value,{mode:tree(base)[name].mode});}
 await fs.writeFile(path.join(root,'.env'),"PANEL_PASSWORD=never-expose-update-secret\nCOMPOSE_FILE=compose.yaml\nEXACT='literal-$VALUE'\n");await fs.mkdir(path.join(root,'config'),{recursive:true});await fs.writeFile(path.join(root,'config/apps.json'),'{"preserve":"private-app-config"}');
 const definition={name:'infra',services:{panel:{image:'local-panel',healthcheck:{test:['CMD','true']},build:{context:'./docker/panel'},environment:{EXACT:'literal-$VALUE'},volumes:[{type:'bind',source:root,target:root}]},php:{image:'original-app'}}};
 const panel=()=>({Id:panelId,Image:image,State:{Running:true,StartedAt:'panel-'+serial,Health:{Status:failHealth&&version===newVersion?'unhealthy':'healthy'}},Config:{Labels:{'com.docker.compose.project':'infra','com.docker.compose.service':'panel'}},Mounts:[{Type:'bind',Source:root,Destination:root,RW:true},{Type:'bind',Source:'/var/run/docker.sock',Destination:'/var/run/docker.sock',RW:true}]});
 const app={Id:'b'.repeat(64),Image:'sha256:'+'2'.repeat(64),State:{Running:true,StartedAt:'unchanged-start'},Config:{Labels:{'com.docker.compose.project':'infra','com.docker.compose.service':'php'}},Mounts:[{Type:'bind',Source:path.join(root,'docker/traefik/apps.yml'),Destination:'/live-config',RW:false},{Type:'volume',Source:'/var/lib/docker/volumes/private/_data',Destination:'/data',Name:'preserved-volume',RW:true}]};
 const docker=async args=>{calls.push(args);
  if(args[0]==='pull'){if(failPull)throw Object.assign(Error('download falhou'),{output:'network never-expose-update-secret'});if(mutateOnPull)await fs.appendFile(path.join(root,'scripts/example.sh'),'external edit');return 'downloaded';}
  if(args[0]==='image'&&args[1]==='inspect')return JSON.stringify([{Os:'linux',Architecture:'amd64',Config:{Labels:{'org.opencontainers.image.version':newVersion,'org.opencontainers.image.revision':commit,'org.opencontainers.image.source':'https://github.com/paulo-leo/jubart'}}}]);
  if(args[0]==='ps')return args.includes('-aq')?panelId+'\n'+app.Id:panelId;
  if(args[0]==='inspect')return JSON.stringify(args.slice(1).map(id=>id===app.Id?app:panel()));
  if(args[0]==='create')return 'c'.repeat(64);
  if(args[0]==='start')return '';
  if(args[0]==='run')return newVersion;
  if(args[0]==='exec')return version;
  if(args[0]==='compose'){
   if(args.includes('up')){const filename=args[args.indexOf('-f')+1],frozen=JSON.parse(await fs.readFile(filename,'utf8'));assert.equal(frozen.services.panel.environment.EXACT,'literal-$$VALUE','não duplicar escape do ambiente');version=frozen.services.panel.image.includes(digest)?newVersion:oldVersion;image=version===newVersion?digest:'sha256:'+'1'.repeat(64);serial++;panelId=(serial%2?'d':'a').repeat(64);return 'applied';}
   if(args.includes('ps'))return panelId;
   return '';
  }
  throw Error('Comando inesperado: '+args.join(' '));
 };
 const source={tags:async()=>[{version:newVersion,commit,url:'https://github.com/paulo-leo/jubart/tree/v'+newVersion},{version:oldVersion,commit:'8'.repeat(40)}],tree:async sha=>tree(sha===commit?target:base),archive:async()=>new Map(target),image:async(v,cli)=>({tag:(cli?'cli-':'')+v,digest:cli?cliDigest:digest,reference:'paulo2021/jubart@'+(cli?cliDigest:digest)})};
 const maintenance=createPanelMaintenance({root,composeConfig:async()=>definition,docker,isBusy:()=>busy,audit:async event=>audits.push(event)}),updates=createPanelUpdates({root,runningVersion:oldVersion,composeConfig:async()=>definition,docker,maintenance,source,now:()=>now});
 return {root,base,target,calls,audits,docker,maintenance,updates,app,source,definition,clock:ms=>now+=ms,busy:v=>busy=v,failHealth:v=>failHealth=v,failPull:v=>failPull=v,mutateOnPull:v=>mutateOnPull=v,version:()=>version,worker:job=>updatePanel({root,id:job.id,project:'infra',run:docker,delay:async()=>{},healthAttempts:1})};
}
test('atualização oficial: catálogo é consultado explicitamente e a prévia não altera código/configurações',async t=>{
 const f=await fixture(t),before=await fs.readFile(path.join(f.root,'.env'),'utf8');assert.equal((await f.updates.read()).checkedAt,null);const catalog=await f.updates.check();assert.equal(catalog.versions[0].version,newVersion);
 const plan=await f.updates.preview(newVersion);assert.equal(plan.canApply,true);assert.ok(plan.deferred.includes('docker/traefik/apps.yml'));assert.ok(plan.changes.some(row=>row.path==='scripts/example.sh'));assert.equal(await fs.readFile(path.join(f.root,'.env'),'utf8'),before);assert.equal(await fs.readFile(path.join(f.root,'scripts/example.sh'),'utf8'),'echo '+oldVersion+'\n');assert.equal(f.calls.some(args=>['pull','create','start'].includes(args[0])),false);assert.doesNotMatch(JSON.stringify(plan),/never-expose|private-app-config/);
});
test('atualização oficial: aplica código, fixa imagens, verifica saúde e preserva serviços/dados/segredos',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.root,'README.md'),'documentação personalizada');const plan=await f.updates.preview(newVersion);assert.ok(plan.preserved.includes('README.md'));const {job}=await f.updates.apply({planId:plan.planId},'admin');assert.ok(f.calls.find(args=>args[0]==='create').includes('/opt/panel/panel-update-worker.mjs'));await f.worker(job);
 const state=(await f.maintenance.read()).job;assert.equal(state.state,'success',state.message);assert.equal(f.version(),newVersion);assert.equal(await fs.readFile(path.join(f.root,'scripts/example.sh'),'utf8'),'echo '+newVersion+'\n');assert.equal(await fs.readFile(path.join(f.root,'docker/traefik/apps.yml'),'utf8'),'route '+oldVersion);assert.equal(await fs.readFile(path.join(f.root,'README.md'),'utf8'),'documentação personalizada');assert.equal(await fs.readFile(path.join(f.root,'config/apps.json'),'utf8'),'{"preserve":"private-app-config"}');
 assert.equal(await fs.readFile(path.join(f.root,'config/cli-image'),'utf8'),'paulo2021/jubart@'+cliDigest+'\n');const env=await fs.readFile(path.join(f.root,'.env'),'utf8');assert.match(env,/PANEL_PASSWORD=never-expose-update-secret/);assert.match(env,/EXACT='literal-\$VALUE'/);assert.ok(env.includes(releaseOverlay));assert.match(await fs.readFile(path.join(f.root,releaseOverlay),'utf8'),/build: !reset null/);
 assert.ok(f.calls.filter(args=>args.includes('up')).every(args=>args.slice(-8).join(' ')==='up -d --no-deps --no-build --pull never panel'||args.includes('--no-deps')&&args.at(-1)==='panel'));assert.equal(f.calls.some(args=>['down','stop','restart','prune'].some(verb=>args.includes(verb))),false);assert.equal(f.app.State.StartedAt,'unchanged-start');assert.equal((await f.updates.read()).rollbackAvailable,true);assert.doesNotMatch(JSON.stringify(await f.updates.read()),/never-expose|private-app-config/);
});
test('atualização oficial: conflitos, links e planos vencidos ou alterados bloqueiam aplicação',async t=>{
 const f=await fixture(t);await fs.appendFile(path.join(f.root,'scripts/example.sh'),'minha alteração');let plan=await f.updates.preview(newVersion);assert.equal(plan.canApply,false);assert.ok(plan.conflicts.includes('scripts/example.sh'));await assert.rejects(f.updates.apply({planId:plan.planId},'admin'),e=>e.status===409);
 await fs.writeFile(path.join(f.root,'scripts/example.sh'),f.base.get('scripts/example.sh'));plan=await f.updates.preview(newVersion);await fs.appendFile(path.join(f.root,'.env'),'EXTERNAL=true\n');await assert.rejects(f.updates.apply({planId:plan.planId},'admin'),/após a prévia/);
 plan=await f.updates.preview(newVersion);f.clock(16*60*1000);await assert.rejects(f.updates.apply({planId:plan.planId},'admin'),/expirou/);
 await fs.rm(path.join(f.root,'scripts/example.sh'));await fs.symlink(path.join(f.root,'.env'),path.join(f.root,'scripts/example.sh'));await assert.rejects(f.updates.preview(newVersion),/não regular/);assert.equal(f.calls.some(args=>args[0]==='create'),false);
});
test('atualização oficial: falha de saúde restaura código, ambiente e painel anterior',async t=>{
 const f=await fixture(t),env=await fs.readFile(path.join(f.root,'.env'),'utf8'),plan=await f.updates.preview(newVersion),{job}=await f.updates.apply({planId:plan.planId},'admin');f.failHealth(true);await f.worker(job);const state=(await f.maintenance.read()).job;assert.equal(state.state,'error');assert.equal(state.rollback,'restored',state.message);assert.equal(f.version(),oldVersion);assert.equal(await fs.readFile(path.join(f.root,'.env'),'utf8'),env);assert.equal(await fs.readFile(path.join(f.root,'config/cli-image'),'utf8'),'paulo2021/jubart:cli-'+oldVersion+'\n');assert.equal(await fs.stat(path.join(f.root,releaseOverlay)).catch(()=>null),null);assert.equal((await f.updates.read()).installed,null);assert.equal(f.app.State.StartedAt,'unchanged-start');
});
test('atualização oficial: download falho e alterações durante download não sobrescrevem arquivos',async t=>{
 const f=await fixture(t);let plan=await f.updates.preview(newVersion),{job}=await f.updates.apply({planId:plan.planId},'admin');f.failPull(true);await f.worker(job);let state=(await f.maintenance.read()).job;assert.equal(state.state,'error');assert.doesNotMatch(JSON.stringify(state),/never-expose/);assert.equal(f.calls.some(args=>args.includes('up')),false);
 f.failPull(false);plan=await f.updates.preview(newVersion);({job}=await f.updates.apply({planId:plan.planId},'admin'));f.mutateOnPull(true);await f.worker(job);state=(await f.maintenance.read()).job;assert.equal(state.state,'error');assert.match(await fs.readFile(path.join(f.root,'scripts/example.sh'),'utf8'),/external edit/);assert.equal(f.calls.some(args=>args.includes('up')),false);
});
test('atualização oficial: retorno manual verifica revisões e restaura o último backup',async t=>{
 const f=await fixture(t),env=await fs.readFile(path.join(f.root,'.env'),'utf8');let plan=await f.updates.preview(newVersion),{job}=await f.updates.apply({planId:plan.planId},'admin');await f.worker(job);assert.equal((await f.maintenance.read()).job.state,'success');
 await fs.appendFile(path.join(f.root,'.env'),'AFTER_UPDATE=true\n');await assert.rejects(f.updates.previewRollback(),/alterado após/);await fs.writeFile(path.join(f.root,'.env'),env.replace('COMPOSE_FILE=compose.yaml',"COMPOSE_FILE='compose.yaml:"+releaseOverlay+"'"));
 plan=await f.updates.previewRollback();assert.equal(plan.version,oldVersion);({job}=await f.updates.apply({planId:plan.planId},'admin'));await f.worker(job);assert.equal((await f.maintenance.read()).job.state,'success');assert.equal(f.version(),oldVersion);assert.equal(await fs.readFile(path.join(f.root,'.env'),'utf8'),env);assert.equal((await f.updates.read()).rollbackAvailable,false);
});
test('atualização oficial: manutenção ocupada e origens/versões não permitidas são rejeitadas',async t=>{
 const f=await fixture(t);await assert.rejects(f.updates.preview('https://evil.example'),/versão/);await assert.rejects(f.updates.preview('2.0.0'),/principais/);await assert.rejects(f.updates.preview('1.2.0'),/retornar/);await assert.rejects(f.updates.apply({planId:'a'.repeat(32),url:'https://evil.example'},'admin'),/inválida/);
 const plan=await f.updates.preview(newVersion);f.busy(true);await assert.rejects(f.updates.apply({planId:plan.planId},'admin'),e=>e.status===409);assert.equal(f.calls.some(args=>args[0]==='create'),false);
});
function tar(entries){const parts=[];for(const [name,value,type='0']of entries){const buffer=Buffer.from(value),header=Buffer.alloc(512);header.write(name,0,100);for(const [offset,size,number]of [[100,8,0o644],[108,8,0],[116,8,0],[124,12,buffer.length],[136,12,0]])header.write(number.toString(8).padStart(size-1,'0')+'\0',offset,size);header.fill(32,148,156);header.write(type,156,1);header.write('ustar\0',257,6);const sum=header.reduce((a,b)=>a+b,0);header.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8);parts.push(header,buffer,Buffer.alloc((512-buffer.length%512)%512));}parts.push(Buffer.alloc(1024));return gzipSync(Buffer.concat(parts));}
test('pacote oficial: verifica hashes, limita entradas e recusa links/traversal/arquivos privados',()=>{
 const files={'README.md':{sha:blobHash(bytes('ok')),mode:0o644}};assert.equal(parseReleaseArchive(tar([['repo/README.md','ok']]),files).get('README.md').toString(),'ok');assert.throws(()=>parseReleaseArchive(tar([['repo/README.md','tampered']]),files),/corresponde/);assert.throws(()=>parseReleaseArchive(tar([['repo/../.env','secret']]),files),/inseguro/);assert.throws(()=>parseReleaseArchive(tar([['repo/README.md','','2']]),files),/não permitida/);assert.throws(()=>parseReleaseArchive(tar([['repo/.env','secret']]),files),/não permitida/);assert.throws(()=>parseReleaseArchive(tar([]),files),/incompleto/);assert.throws(()=>parseReleaseArchive(tar([['repo/README.md','ok'],['repo/README.md','ok']]),files),/não permitida/);
 for(const file of ['.env','.git/config','config/apps.json','config/jubart-release.compose.yaml','docker/traefik/proxy-hosts.yml','docker/panel/node_modules/evil','/tmp/evil','scripts/../.env'])assert.equal(publicReleasePath(file),false,file);
});
test('origem oficial: catálogo fixo, imagens amd64 por digest e redirecionamentos fechados',async()=>{
 const urls=[],source=createOfficialSource({fetcher:async url=>{urls.push(url);if(url.includes('/tags?'))return Response.json([{name:'v1.4.0',commit:{sha:commit}},{name:'v1.5.0-beta',commit:{sha:commit}}]);return Response.json({images:[{os:'linux',architecture:'amd64',digest}]});}});assert.equal((await source.tags()).length,1);assert.equal((await source.image(newVersion)).reference,'paulo2021/jubart@'+digest);assert.ok(urls.every(url=>url.startsWith('https://api.github.com/repos/paulo-leo/jubart/')||url.startsWith('https://hub.docker.com/v2/repositories/paulo2021/jubart/')));
 const bad=createOfficialSource({fetcher:async()=>new Response(null,{status:302,headers:{location:'https://evil.example/archive'}})});await assert.rejects(bad.tags(),/Origem/);
});
