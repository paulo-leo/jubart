import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {phpRuntimeArguments,phpRuntimeCode} from '../php-runtime-probe.mjs';
import {publicPHPProbe} from '../mcp-runtime.mjs';
test('PHP real: coleta PHAR sem executar stub, classe Composer, auto_prepend ou auto_append',{
 skip:process.env.JUBART_PHP_DOCKER_QA!=='1',timeout:60000,
},async()=>{
 const run=promisify(execFile),docker=async args=>(await run('docker',args,{timeout:30000,maxBuffer:256*1024})).stdout,name='jubart-runtime-qa-'+randomBytes(6).toString('hex');
 try{
  const ids=(await docker(['ps','-q','--filter','label=com.docker.compose.project=laravel','--filter','label=com.docker.compose.service=php'])).trim().split(/\s+/).filter(Boolean);assert.equal(ids.length,1);const [source]=JSON.parse(await docker(['inspect',ids[0]]));
  await docker(['run','-d','--pull=never','--name',name,'--label','com.docker.compose.project='+name,'--network','none','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=8m','--cap-drop=ALL','--security-opt=no-new-privileges:true','--memory','192m','--pids-limit','32','--entrypoint','/usr/local/bin/php',source.Image,'-r','while(true){sleep(30);}']);
  const setup=String.raw`$archive=new Phar('/tmp/composer.phar');$archive->setStub('<?php file_put_contents("/tmp/stub-ran","bad"); __HALT_COMPILER();');$archive['src/Composer/Composer.php']='<?php /* const VERSION = "1.8.2"; */ file_put_contents("/tmp/class-ran","bad"); class Composer { public const VERSION = "9.8.7"; public const SOURCE_VERSION = ""; public const BRANCH_ALIAS_VERSION = ""; }';unset($archive);rename('/tmp/composer.phar','/tmp/composer');mkdir('/tmp/probe-ini');file_put_contents('/tmp/prepend.php','<?php file_put_contents("/tmp/prepend-ran","bad");');file_put_contents('/tmp/append.php','<?php file_put_contents("/tmp/append-ran","bad");');file_put_contents('/tmp/probe-ini/test.ini',"auto_prepend_file=/tmp/prepend.php\nauto_append_file=/tmp/append.php\nmemory_limit=64M\ndisplay_errors=On\n");`;
  await docker(['exec',name,'/usr/local/bin/php','-d','phar.readonly=0','-r',setup]);
  // The fixture replaces a fixed standard path only inside this disposable container.
  const args=phpRuntimeArguments.slice(0,-1).concat(phpRuntimeCode.replace("'/usr/local/bin/composer'","'/tmp/composer'"));
  const raw=JSON.parse(await docker(['exec','--env','PHP_INI_SCAN_DIR=/usr/local/etc/php/conf.d:/tmp/probe-ini','--workdir','/',name,'/usr/local/bin/php',...args]));assert.equal(raw.composer.version,'9.8.7');const result=publicPHPProbe(raw);assert.equal(result.ini.memory_limit,'64M');assert.ok(['1','On'].includes(result.ini.display_errors));assert.ok(result.extensions.length>0);
  const guards=JSON.parse(await docker(['exec',name,'/usr/local/bin/php','-r',"echo json_encode(array_map('file_exists',['/tmp/stub-ran','/tmp/class-ran','/tmp/prepend-ran','/tmp/append-ran']));"]));assert.deepEqual(guards,[false,false,false,false]);
 }finally{await docker(['rm','-f',name]).catch(()=>{});}
});
