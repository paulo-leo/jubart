// Read-only inventory for the host CLI, using the panel's SQL definitions.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {parseEnv,databaseEnabled} from './core.mjs';
import {mariaInventorySQL,pgInventorySQL} from './databases.mjs';

export async function inspectDatabases(root,selected='all',{run=runWithInput,env}={}){
 if(!['all','mariadb','postgres'].includes(selected))throw new Error('Use --engine mariadb ou --engine postgres.');
 root=path.resolve(root);
 env??=parseEnv(await fs.readFile(path.join(root,'.env'),'utf8'));
 return {servers:await Promise.all((selected==='all'?['mariadb','postgres']:[selected]).map(async engine=>{
  const pg=engine==='postgres',prefix=pg?'POSTGRES':'MARIADB';
  const server={engine,enabled:databaseEnabled(env,engine),connection:{host:engine,port:pg?5432:3306,bindAddress:env[prefix+'_BIND_ADDRESS']||'127.0.0.1',hostPort:Number(env[prefix+'_PORT']||(pg?5432:3306)),defaultDatabase:env[pg?'POSTGRES_DB':'DB_DATABASE']||'',adminUser:pg?(env.POSTGRES_USER||'infra_admin'):'root'},databases:[],users:[],grants:[]};
  if(!server.enabled)return {...server,status:'disabled'};
  const command=pg?'PGPASSWORD="$POSTGRES_PASSWORD" exec psql --host=127.0.0.1 --username="$POSTGRES_USER" --dbname=postgres --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1':'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb --user=root --batch --raw --skip-column-names';
  try{
   // execFile has no stdin option; write only the fixed inventory SQL to stdin.
   const result=await run('docker',['compose','exec','-T',engine,'sh','-c',command],{cwd:root,timeout:25000,maxBuffer:4*1024*1024,input:pg?pgInventorySQL:mariaInventorySQL});
   const rows=result.stdout.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
   return {...server,status:'available',databases:rows.filter(r=>r.kind==='database'),users:rows.filter(r=>r.kind==='user').map(r=>({...r,admin:[true,1,'1','true'].includes(r.admin),locked:[true,1,'1','true'].includes(r.locked)})),grants:rows.filter(r=>r.kind==='grant')};
  }catch{return {...server,status:'unavailable',error:'Não foi possível consultar o banco. Confira jubart status, permissões do Docker e autenticação administrativa. Alterar apenas o .env não redefine senhas de um volume já inicializado.'};}
 }))};
}
// Promise execFile does not forward input: supply it through the child stream.
function runWithInput(file,args,options){return new Promise((resolve,reject)=>{
 const {input,...settings}=options;
 const child=execFile(file,args,settings,(error,stdout)=>error?reject(error):resolve({stdout}));
 child.stdin.on('error',()=>{});
 child.stdin.end(input);
});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>8192)throw new Error('Requisição inválida.');}
  const data=JSON.parse(input);
  process.stdout.write(JSON.stringify(await inspectDatabases(data.root,data.engine,{run:runWithInput}))+'\n');
 }catch{process.stdout.write(JSON.stringify({error:'Não foi possível consultar os bancos. Confira Node.js, Docker e os arquivos da instalação.'})+'\n');process.exitCode=1;}
}
