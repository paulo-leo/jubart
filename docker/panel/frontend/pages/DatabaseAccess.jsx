import React,{useState} from 'react';
import {Button,Editor,Modal,Select,usePanel,useResource} from '../ui.jsx';

const systemDatabases=['mysql','sys','information_schema','performance_schema','postgres','template0','template1'];
export const applicationDatabase=name=>!systemDatabases.includes(name);
const nameField={name:'user',label:'Novo usuário de aplicação',required:true,pattern:'[a-z][a-z0-9_]{0,47}',maxLength:48};

export function DatabaseAccessSetup({engine:initialEngine='postgres',database:initialDatabase='',onClose,onSaved}){
 const panel=usePanel(),[engine,setEngine]=useState(initialEngine),[selected,setSelected]=useState(initialDatabase),[database,setDatabase]=useState(initialDatabase);
 const inventory=useResource(`/databases/${engine}`,true,0),dbs=(inventory.data?.inventory?.databases||[]).filter(d=>applicationDatabase(d.name));
 if(!database)return <Modal id="database-access-picker" title="Configurar acesso ao banco" onClose={onClose}>
  <p>Escolha o banco para criar uma conta de aplicação e uma conexão pronta para o console SQL.</p>
  <Select label="Servidor" value={engine} onChange={value=>{setEngine(value);setSelected('');}} options={[{value:'postgres',label:'PostgreSQL'},{value:'mariadb',label:'MariaDB'}]}/>
  <Select label="Banco" value={selected||dbs[0]?.name||''} onChange={setSelected} options={dbs.map(d=>({value:d.name,label:d.name}))}/>
  {(inventory.error||inventory.data?.inventoryError)&&<p className="alert theme-danger" role="alert">{inventory.error||inventory.data.inventoryError}</p>}
  {inventory.data&&!dbs.length&&<p>Nenhum banco de aplicação disponível. Crie um banco em Dados → Bancos de dados.</p>}
  <div className="editor-actions"><Button onClick={onClose}>Cancelar</Button><Button primary disabled={!dbs.some(d=>d.name===(selected||dbs[0]?.name))} onClick={()=>setDatabase(selected||dbs[0].name)}>Continuar</Button></div>
 </Modal>;
 const suggested=(database.replace(/[^a-z0-9_]/g,'_').replace(/^[^a-z]+/,'')||'database').slice(0,40)+'_app';
 return <Editor id="database-access-editor" title={`Configurar acesso · ${engine} · ${database}`} initial={{database,user:suggested,password:'',permission:'readwrite'}}
  description="Cria uma conta separada, concede permissões e salva uma conexão após testar o login. A conta administrativa do PostgreSQL inicial fica protegida; use uma conta de aplicação no console. Contas existentes não terão a senha alterada."
  fields={[
   {name:'database',label:'Banco',readOnly:true},
   {...nameField,help:'Se esse nome já existe, escolha outro ou gerencie as permissões da conta em Usuários dos bancos.'},
   {name:'password',label:'Senha (vazio = gerar)',type:'password',generatePassword:true,minLength:16,maxLength:128,autoComplete:'new-password',help:'Depois de confirmar, consulte a senha no cofre em Usuários dos bancos.'},
   {name:'permission',label:'Permissões',type:'select',options:[{value:'readwrite',label:'Leitura e escrita'},{value:'readonly',label:'Somente leitura'}]},
  ]} submitLabel="Revisar acesso" onClose={onClose} onSave={async values=>{
   const result=await panel.mutate(`/databases/${engine}/setup-access`,values);
   if(!result.cancelled)onSaved?.();
   return result;
  }}/>;
}

export function DatabasePasswordReset({connection,onClose,onSaved}){
 const panel=usePanel(),inventory=useResource(`/databases/${connection.engine}`,true,0);
 const accounts=(inventory.data?.inventory?.users||[]).filter(u=>u.name===connection.user&&!u.admin),hosts=accounts.map(u=>u.host);
 return <Editor id="database-password-reset" title={`Redefinir senha · ${connection.user}`} initial={{user:connection.user,host:connection.engine==='postgres'?'network':'%',password:''}}
  description="Altera a senha no servidor, atualiza o cofre e as conexões salvas desta conta. Clientes externos e arquivos .env dos projetos precisam receber a nova senha. Se a conta atende outros bancos, esses acessos também usam a nova senha."
  fields={[{name:'user',label:'Usuário',readOnly:true},{name:'host',label:'Host da conta',readOnly:connection.engine==='postgres',help:hosts.length?'Hosts encontrados: '+hosts.join(', '):'MariaDB: informe o host exato da conta, normalmente %.'},{name:'password',label:'Nova senha (vazio = gerar)',type:'password',generatePassword:true,minLength:16,maxLength:128,autoComplete:'new-password'}]}
  onClose={onClose} onSave={async values=>{const result=await panel.mutate(`/databases/${connection.engine}/password`,values);if(!result.cancelled)onSaved?.();return result;}}/>;
}

export function DatabaseAddresses({engine,connection}){
 const loopback=['127.0.0.1','::1','localhost'].includes(connection.bindAddress);
 return <p className="info-line">Aplicações na rede Docker: <code>{engine}:{connection.port}</code>. Cliente no servidor: <code>{loopback?connection.bindAddress:'IP_DO_SERVIDOR'}:{connection.hostPort}</code> (publicação configurada).
  {loopback?' Para acessar de outro computador, use o túnel SSH do DBeaver/pgAdmin; o endereço do banco no túnel é o loopback do servidor.':' Para acesso remoto, confira a publicação e o firewall em Proxy & acessos.'} Selecione o nome do banco desejado e uma conta de aplicação. O usuário do painel é diferente do usuário do banco.</p>;
}
