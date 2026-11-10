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
 let executions=0;
 const server=createPanel({root,username:'admin',password:'administrator-password',executor:async(_,args,options)=>({stdout:options?.input?.includes("'kind'")?JSON.stringify({kind:'database',name:'appdb'}):'{}'}),sqlRunner:async data=>{executions++;assert.equal(data.database,'appdb');return {columns:['teste'],rows:[[1]],returnedRows:1,affectedRows:0,durationMs:1};}});server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;t.after(async()=>{server.closeAllConnections();await server.shutdown();await fs.rm(root,{recursive:true,force:true});});
 const login=async(username,password)=>{const res=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({username,password})});const data=await res.json();return {Cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':data.csrf,'Content-Type':'application/json'};};
 const query=headers=>fetch(base+'/api/databases/mariadb/sql',{method:'POST',headers,body:JSON.stringify(input)});
 assert.equal((await query({})).status,401);const admin=await login('admin','administrator-password');assert.equal((await query({Cookie:admin.Cookie})).status,403);
 const limited=await login('viewer','viewer-password-long');assert.equal((await query(limited)).status,403);
 const response=await query(admin);assert.equal(response.status,200);assert.deepEqual((await response.json()).rows,[[1]]);assert.equal(executions,1);
});

test('credenciais automáticas usam .env/cofre sem expor senhas e ficam vinculadas ao banco',async t=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const {createVault}=await import('../databases.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'infra-sql-credentials-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const secret='automatic-secret-password',vaultSecret='vault-secret-password';const env=`DB_DATABASE=appdb\nDB_USERNAME=appuser\nDB_PASSWORD=${secret}\nPANEL_VAULT_KEY=${'a'.repeat(64)}\nPOSTGRES_USER=infra_admin\nPOSTGRES_PASSWORD=admin-secret\n`;
 const readEnv=async()=>env,vault=createVault(root,readEnv);await vault.save('mariadb','saveduser','%',vaultSecret);await vault.save('postgres','saveduser','network',vaultSecret);
 const inventory={databases:[{name:'appdb'},{name:'other'}],users:[{name:'saveduser',host:'%',knownPassword:true,admin:false,locked:false}],grants:[{database:'appdb',grantee:"'saveduser'@'%'",user:'saveduser'}]};
 const used=[];const api=createSQLConsole({root,readEnv,databases:{handle:async()=>({body:{inventory}})},audit:async()=>{},runner:async input=>{used.push(input);return {rows:[],columns:[],returnedRows:0,affectedRows:0};}});
 const options=await api.connections('mariadb','appdb');assert.equal(options.connections.length,2);assert.equal(options.connections[0].id,'env:DB');assert.ok(!JSON.stringify(options).includes(secret));assert.ok(!JSON.stringify(options).includes(vaultSecret));
 await api.execute('mariadb',{database:'appdb',credentialId:'env:DB',sql:'SELECT 1'},'admin');assert.equal(used[0].password,secret);assert.equal(used[0].user,'appuser');
 await api.execute('mariadb',{database:'appdb',credentialId:'vault:saveduser:%',sql:'SELECT 1'},'admin');assert.equal(used[1].password,vaultSecret);
 const pgOptions=await api.connections('postgres','appdb');assert.equal(pgOptions.connections[0].id,'vault:saveduser:network');assert.equal(pgOptions.connections.some(c=>c.user==='infra_admin'),false);
 await api.execute('postgres',{database:'appdb',credentialId:'vault:saveduser:network',sql:'SELECT 1'},'admin');assert.equal(used[2].password,vaultSecret);
 assert.deepEqual((await api.connections('mariadb','other')).connections,[]);
 await assert.rejects(api.execute('mariadb',{database:'other',credentialId:'env:DB',sql:'SELECT 1'},'admin'),/indisponível/);
 await assert.rejects(api.execute('mariadb',{database:'appdb',credentialId:'vault:root:localhost',sql:'SELECT 1'},'admin'),/indisponível/);
});
