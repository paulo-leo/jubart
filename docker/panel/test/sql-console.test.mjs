import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {validateSQLInput,createResultCollector,createSQLConsole,runSQL,SQL_LIMITS} from '../sql-console.mjs';
const input={engine:'mariadb',database:'appdb',user:'appuser',password:'database-secret',sql:'SELECT 1'};
test('SQL valida banco/conta, desativação e tamanho sem permitir host arbitrário',()=>{
 const valid=validateSQLInput('mariadb',{...input,host:'attacker'});assert.equal(valid.host,undefined);
 for(const data of [{user:'root'},{database:'mysql'},{sql:'\0'},{sql:'x'.repeat(65537)},{password:''}])assert.throws(()=>validateSQLInput('mariadb',{...input,...data}));
 assert.throws(()=>validateSQLInput('postgres',{...input,user:'dbadmin'},{POSTGRES_USER:'dbadmin'}));
 assert.throws(()=>validateSQLInput('mariadb',input,{MARIADB_ENABLED:'false'}));
});
test('resultados preservam colunas repetidas, NULL e bigint; limitam linhas, bytes e células',()=>{
 const c=createResultCollector({...SQL_LIMITS,rows:2,cell:5});c.fields(['id','id','valor']);assert.equal(c.row([1,2,null]),true);assert.equal(c.row([3n,Buffer.from('a'),'texto longo']),true);assert.equal(c.row([4,5,6]),false);
 assert.deepEqual(c.result.columns,['id','id','valor']);assert.equal(c.result.rows[0][2],null);assert.equal(c.result.rows[1][0],'3');assert.equal(c.result.truncated,true);assert.equal(c.result.cellTruncated,true);
 const bytes=createResultCollector({...SQL_LIMITS,bytes:5});bytes.fields(['x']);assert.equal(bytes.row(['abcde']),false);assert.equal(bytes.result.rows.length,0);
});
const mysqlFake=(grants=['GRANT SELECT ON `appdb`.* TO `appuser`@`%`'],emit)=>{const conn=new EventEmitter();conn.destroyed=0;conn.calls=[];conn.destroy=()=>conn.destroyed++;conn.query=(sql,callback)=>{conn.calls.push(sql);if(callback){queueMicrotask(()=>callback(null,sql.startsWith('SHOW GRANTS')?grants.map(g=>[g]):{}));return;}const query=new EventEmitter();queueMicrotask(()=>emit(query));return query;};return conn;};
test('MariaDB transmite linhas sem sobrescrever nomes e retorna linhas afetadas; privilégios globais são recusados',async()=>{
 const connection=mysqlFake(undefined,q=>{q.emit('fields',[{name:'id'},{name:'id'}]);q.emit('result',[1,null]);q.emit('end');});let options;
 const result=await runSQL(input,{mysqlFactory:o=>{options=o;return connection;}});assert.deepEqual(result.rows,[[1,null]]);assert.equal(result.returnedRows,1);assert.equal(options.host,'mariadb');assert.equal(options.multipleStatements,false);assert.ok(connection.destroyed);
 const update=mysqlFake(undefined,q=>{q.emit('result',{affectedRows:3});q.emit('end');});assert.equal((await runSQL({...input,sql:'UPDATE example SET a=1'},{mysqlFactory:()=>update})).affectedRows,3);
 const admin=mysqlFake(['GRANT ALL PRIVILEGES ON *.* TO `appuser`@`%`'],()=>{});await assert.rejects(runSQL(input,{mysqlFactory:()=>admin}),/globais/);assert.equal(admin.calls.length,1);
});
test('PostgreSQL usa protocolo de uma instrução e tipos posicionais; recusa roles administrativas',async()=>{
 const conn=new EventEmitter();conn.connect=async()=>{};conn.end=async()=>{};conn.query=async query=>{if(typeof query==='string')return {rows:[{rolsuper:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,rolbypassrls:false,server_access:false}]};assert.equal(query.queryMode,'extended');assert.equal(query._result.rowAsArray,true);queueMicrotask(()=>{query.emit('row',[null,'42'],{fields:[{name:'a'},{name:'b'}]});query.emit('end',{command:'SELECT',rowCount:1,fields:[{name:'a'},{name:'b'}]});});};
 const result=await runSQL({...input,engine:'postgres'},{pgFactory:()=>conn});assert.deepEqual(result.rows,[[null,'42']]);assert.equal(result.affectedRows,0);
 const dangerous=new EventEmitter();dangerous.connect=async()=>{};dangerous.end=async()=>{};dangerous.query=async()=>({rows:[{rolsuper:true}]});await assert.rejects(runSQL({...input,engine:'postgres'},{pgFactory:()=>dangerous}),/administrativos/);
});
test('consulta termina por limite e timeout, sem acumular resultados ilimitados',async()=>{
 const limited=mysqlFake(undefined,q=>{q.emit('fields',[{name:'a'}]);for(let i=0;i<10;i++)q.emit('result',[i]);q.emit('end');});const result=await runSQL(input,{mysqlFactory:()=>limited,limits:{...SQL_LIMITS,rows:2}});assert.equal(result.rows.length,2);assert.equal(result.partial,true);assert.equal(result.truncated,true);
 const hanging=mysqlFake(undefined,()=>{});await assert.rejects(runSQL(input,{mysqlFactory:()=>hanging,limits:{...SQL_LIMITS,timeoutMs:10}}),/Tempo limite/);assert.ok(hanging.destroyed);
});
test('console audita hash sem SQL/senha, valida inventário e libera o bloqueio após erro',async()=>{
 const audit=[];let runs=0;const api=createSQLConsole({readEnv:async()=>'',databases:{handle:async()=>({body:{inventory:{databases:[{name:'appdb'}]}}})},audit:async e=>audit.push(e),runner:async data=>{runs++;if(runs===1)throw new Error('falha '+data.password);return {rows:[],columns:[],returnedRows:0,affectedRows:0};}});
 await assert.rejects(api.execute('mariadb',input,'admin'),e=>!e.message.includes(input.password));await api.execute('mariadb',input,'admin');assert.ok(audit.every(a=>!JSON.stringify(a).includes(input.password)&&!JSON.stringify(a).includes('SELECT 1')));assert.equal(audit[0].sqlHash.length,64);
 await assert.rejects(api.execute('mariadb',{...input,database:'unknown'},'admin'),/não encontrado/);assert.equal(runs,2);
});

test('API SQL exige administrador e CSRF; retorna tabela pelo banco cadastrado',async t=>{
 const {createPanel}=await import('../server.mjs');const {createPanelUsers}=await import('../panel-users.mjs');
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const {once}=await import('node:events');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'infra-sql-api-'));await fs.writeFile(path.join(root,'.env'),'APP_DIRECTORY=/tmp\nAPP_DOMAIN=localhost\n');
 const users=createPanelUsers({root,bootstrapUsername:'admin'});const listed=await users.list();await users.save({revision:listed.revision,user:{username:'viewer',name:'Consulta painel',admin:false,enabled:true,password:'viewer-password-long',permissions:[],services:[],databases:[]}},users.bootstrap());
 let executions=0;const transferAccounts=[];
 const server=createPanel({root,username:'admin',password:'administrator-password',transferRunner:async({job,password,output,onBytes})=>{transferAccounts.push({user:job.user,password,kind:job.kind});if(job.kind==='export')await fs.writeFile(output,'SELECT 1;');onBytes(9);},executor:async(_,args,options)=>({stdout:options?.input?.includes("'kind'")?JSON.stringify({kind:'database',name:'appdb'}):'{}'}),sqlRunner:async data=>{executions++;assert.equal(data.database,'appdb');return {columns:['teste'],rows:[[1]],returnedRows:1,affectedRows:0,durationMs:1};}});server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;t.after(async()=>{server.closeAllConnections();await server.shutdown();await fs.rm(root,{recursive:true,force:true});});
 const login=async(username,password)=>{const res=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username,password})});const data=await res.json();return {Cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':data.csrf,'Content-Type':'application/json'};};
 let queryData=input;const query=headers=>fetch(base+'/api/databases/mariadb/sql',{method:'POST',headers,body:JSON.stringify(queryData)});
 assert.equal((await query({})).status,401);const admin=await login('admin','administrator-password');assert.equal((await query({Cookie:admin.Cookie})).status,403);
 const limited=await login('viewer','viewer-password-long');assert.equal((await query(limited)).status,403);
 assert.equal((await query(admin)).status,404);const post=(route,data,headers=admin)=>fetch(base+route,{method:'POST',headers,body:JSON.stringify(data)});const listedConnections=await(await fetch(base+'/api/database-connections',{headers:admin})).json();assert.equal((await post('/api/database-connections/save',{...input,name:'Teste',revision:listedConnections.revision},{Cookie:admin.Cookie,'Content-Type':'application/json'})).status,403);const saved=await(await post('/api/database-connections/save',{...input,name:'Teste',revision:listedConnections.revision})).json();assert.ok(saved.connection.id);assert.ok(!JSON.stringify(saved).includes(input.password));queryData={sql:'SELECT 1',connectionId:saved.connection.id};assert.equal((await post('/api/databases/mariadb/sql-connect',{connectionId:saved.connection.id})).status,200);assert.equal((await post('/api/databases/postgres/sql-connect',{connectionId:saved.connection.id})).status,400);const response=await query(admin);assert.equal(response.status,200);assert.deepEqual((await response.json()).rows,[[1]]);assert.equal(executions,2);assert.equal((await post('/api/transfers/export',{engine:'mariadb',database:'appdb'})).status,404);const exported=await post('/api/transfers/export',{connectionId:saved.connection.id,user:'wronguser',password:'wrong-password'});assert.equal(exported.status,202);const upload=await fetch(base+'/api/transfers/upload',{method:'POST',headers:admin,body:'SELECT 1;'});assert.equal(upload.status,200);const uploaded=await upload.json();assert.equal((await post('/api/transfers/import',{connectionId:saved.connection.id,uploadId:uploaded.uploadId})).status,202);for(let i=0;i<100;i++){const list=await(await fetch(base+'/api/transfers',{headers:admin})).json();if(list.jobs.every(j=>j.state==='success'))break;await new Promise(r=>setTimeout(r,10));}assert.equal(transferAccounts.length,2);for(const account of transferAccounts){assert.equal(account.user,input.user);assert.equal(account.password,input.password);}const current=await(await fetch(base+'/api/database-connections',{headers:admin})).json();await post('/api/database-connections/remove',{id:saved.connection.id,revision:current.revision});assert.equal((await query(admin)).status,404);
});

test('transferências resolvem credenciais no servidor, mas console exige credenciais digitadas',async t=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const {createVault}=await import('../databases.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'infra-sql-credentials-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const secret='automatic-secret-password',vaultSecret='vault-secret-password';const env=`DB_DATABASE=appdb\nDB_USERNAME=appuser\nDB_PASSWORD=${secret}\nPANEL_VAULT_KEY=${'a'.repeat(64)}\nPOSTGRES_USER=infra_admin\nPOSTGRES_PASSWORD=admin-secret\n`;
 const readEnv=async()=>env,vault=createVault(root,readEnv);await vault.save('mariadb','saveduser','%',vaultSecret);await vault.save('postgres','saveduser','network',vaultSecret);
 const inventory={databases:[{name:'appdb'},{name:'other'}],users:[{name:'saveduser',host:'%',knownPassword:true,admin:false,locked:false}],grants:[{database:'appdb',grantee:"'saveduser'@'%'",user:'saveduser'}]};
 const used=[];const api=createSQLConsole({root,readEnv,databases:{handle:async()=>({body:{inventory}})},audit:async()=>{},runner:async input=>{used.push(input);return {rows:[],columns:[],returnedRows:0,affectedRows:0};}});
 const options=await api.connections('mariadb','appdb');assert.equal(options.connections.length,2);assert.equal(options.connections[0].id,'env:DB');assert.ok(!JSON.stringify(options).includes(secret));assert.ok(!JSON.stringify(options).includes(vaultSecret));
 const resolved=await api.resolveCredentials('mariadb',{database:'appdb',credentialId:'env:DB'});assert.equal(resolved.credentials.password,secret);assert.equal(resolved.credentials.user,'appuser');await assert.rejects(api.execute('mariadb',{database:'appdb',credentialId:'env:DB',sql:'SELECT 1'},'admin'),/Digite usuário e senha/);
 assert.equal((await api.resolveCredentials('mariadb',{database:'appdb',credentialId:'vault:saveduser:%'})).credentials.password,vaultSecret);
 const pgOptions=await api.connections('postgres','appdb');assert.equal(pgOptions.connections[0].id,'vault:saveduser:network');assert.equal(pgOptions.connections.some(c=>c.user==='infra_admin'),false);
 assert.equal((await api.resolveCredentials('postgres',{database:'appdb',credentialId:'vault:saveduser:network'})).credentials.password,vaultSecret);await assert.rejects(api.connect('postgres',{database:'appdb',credentialId:'vault:saveduser:network'},'admin'),/Digite usuário e senha/);
 assert.deepEqual((await api.connections('mariadb','other')).connections,[]);
 await assert.rejects(api.resolveCredentials('mariadb',{database:'other',credentialId:'env:DB'}),/indisponível/);
 await assert.rejects(api.resolveCredentials('mariadb',{database:'appdb',credentialId:'vault:root:localhost'}),/indisponível/);
 assert.equal(used.length,0);for(const engine of ['mariadb','postgres']){await assert.rejects(api.connect(engine,{database:'appdb',user:'appuser'},'admin'),/senha/);const connected=await api.connect(engine,{database:'appdb',user:'appuser',password:'typed-password',sql:'DROP TABLE ignored;'},'admin');assert.equal(connected.connected,true);assert.equal(used.at(-1).password,'typed-password');assert.equal(used.at(-1).sql,'SELECT 1 AS connected;');}
});
