// Opt-in: a single disposable container, no network, host projects or published ports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,randomUUID} from 'node:crypto';
import {createAppShells} from '../mcp-app-shell.mjs';
test('MCP Bash real: TTY Docker mantém cd/variáveis e fecha somente o shell na revogação',{
 skip:process.env.JUBART_MCP_DOCKER_QA!=='1',timeout:60000,
},async()=>{
 const execute=promisify(execFile),docker=async args=>(await execute('docker',args,{timeout:30000,maxBuffer:2*1024*1024})).stdout;
 const name='jubart-bash-qa-'+randomBytes(6).toString('hex'),root=await fs.mkdtemp('/tmp/'+name+'-');let manager,allowed=true;
 try{
  const image=(await fs.readFile(new URL('../../../config/cli-image',import.meta.url),'utf8')).trim();await docker(['image','inspect',image]);
  await docker(['run','-d','--pull=never','--name',name,'--init','--network','none','--read-only','--tmpfs','/var/www/html:rw,noexec,nosuid,nodev,size=4m','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=4m','--cap-drop=ALL','--security-opt=no-new-privileges:true','--memory','96m','--pids-limit','64','--label','com.docker.compose.project='+name,'--label','com.docker.compose.service=php',image,'node','-e','setInterval(()=>{},1000)']);
  const before=JSON.parse(await docker(['inspect',name]))[0];
  manager=createAppShells({root,docker,loadConfig:async()=>({config:{applications:[{id:'main',type:'php',enabled:true}]}}),snapshot:async()=>({project:name,services:[{name:'php',containerId:before.Id.slice(0,12),state:'running'}]}),authorize:async()=>allowed,heartbeatMs:50});
  const key={id:'qa',scopes:['execute'],actions:['terminal.container']},session=await manager.open(key,{app:'main',requestId:randomUUID()});
  await manager.input(key,{sessionId:session.sessionId,requestId:randomUUID(),data:"cd /tmp\nexport JUBART_QA_VAR='kept'\n"});
  await manager.input(key,{sessionId:session.sessionId,requestId:randomUUID(),data:"printf '__JUBART_%s_%s_%s__\\n' 'TTY' \"$PWD\" \"$JUBART_QA_VAR\"\n"});
  let output='',cursor=0;for(let i=0;i<80;i++){const part=await manager.read(key,{sessionId:session.sessionId,cursor});cursor=part.cursor;output+=part.output;if(output.includes('__JUBART_TTY_/tmp_kept__'))break;await new Promise(resolve=>setTimeout(resolve,50));}assert.match(output,/__JUBART_TTY_\/tmp_kept__/);
  allowed=false;for(let i=0;i<80&&manager.hasApp('main');i++)await new Promise(resolve=>setTimeout(resolve,25));assert.equal(manager.hasApp('main'),false);await manager.dispose();
  const after=JSON.parse(await docker(['inspect',name]))[0];assert.equal(after.State.Running,true);assert.equal(after.State.StartedAt,before.State.StartedAt);
 }finally{await manager?.dispose();await docker(['rm','-f',name]).catch(()=>{});await fs.rm(root,{recursive:true,force:true});}
});
