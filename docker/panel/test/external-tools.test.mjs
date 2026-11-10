import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateExternalTool,createExternalTools} from '../external-tools.mjs';
const tool={name:'Pipeline',app:'main',provider:'github_actions',enabled:true,owner:'example',repository:'project',workflow:'deploy.yml',ref:'main'};
test('integração valida provedor, aplicação, workflow e URL sem permitir endereço arbitrário na API GitHub',()=>{
 assert.equal(validateExternalTool(tool,[{id:'main'}]).url,'https://github.com/example/project/actions');
 for(const change of [{owner:'x/y'},{repository:'../repo'},{workflow:'../x.yml'},{ref:'../main'},{app:'app99'},{provider:'unknown'}])assert.throws(()=>validateExternalTool({...tool,...change},[{id:'main'}]));
 for(const url of ['javascript:alert(1)','https://user:password@tool.example'])assert.throws(()=>validateExternalTool({...tool,provider:'other',url},[{id:'main'}]));
});
test('token é cifrado, preservado ao editar, usado somente em api.github.com e nunca exposto na consulta/auditoria',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'external-tools-'));try{
 const token='github_pat_'+'x'.repeat(40),calls=[];const api=createExternalTools({root,loadConfig:async()=>({config:{applications:[{id:'main'}]}}),readEnv:async()=>`PANEL_VAULT_KEY=${'a'.repeat(64)}`,fetcher:async(url,options)=>{calls.push({url,options});if(options.method==='POST')return {ok:true,status:204};return {ok:true,status:200,text:async()=>JSON.stringify(url.includes('/runs?')?{workflow_runs:[{id:1,name:'Deploy',status:'completed',conclusion:'success',html_url:'https://github.com/example/project/actions/runs/1'}]}:{workflows:[{id:10,name:'Deploy',path:'.github/workflows/deploy.yml'}]})};}});
 const initial=await api.list();await api.save({tool,token,revision:initial.revision},'admin');const listed=await api.list(),id=listed.tools[0].id;
 assert(listed.tools[0].credentialConfigured);assert(!JSON.stringify(listed).includes(token));assert(!(await fs.readFile(path.join(root,'.panel-state/external-tools/secrets.json'),'utf8')).includes(token));
 const status=await api.status(id);assert.equal(status.runs[0].conclusion,'success');assert(calls.every(c=>c.url.startsWith('https://api.github.com/repos/example/project/actions/')));assert(calls.every(c=>c.options.headers.Authorization==='Bearer '+token&&c.options.redirect==='error'));
 await api.dispatch(id,'admin');assert.equal(JSON.parse(calls.at(-1).options.body).ref,'main');assert(!(await fs.readFile(path.join(root,'.panel-state/external-tools/audit.jsonl'),'utf8')).includes(token));
 await assert.rejects(api.save({tool,revision:initial.revision},'admin'));
 await api.save({tool:{...tool,id,name:'Editado'},token:'',revision:listed.revision},'admin');assert((await api.list()).tools[0].credentialConfigured);
 const updated=await api.list();await api.save({tool:{...tool,id},removeCredential:true,revision:updated.revision},'admin');assert(!(await api.list()).tools[0].credentialConfigured);await assert.rejects(api.dispatch(id,'admin'));
 const current=await api.list();await api.remove({id,revision:current.revision},'admin');assert.equal((await api.list()).tools.length,0);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('links de outras ferramentas não fazem chamadas à rede e erros GitHub não revelam segredos',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'external-tools-'));try{
 let network=0;const api=createExternalTools({root,loadConfig:async()=>({config:{applications:[{id:'main'}]}}),readEnv:async()=>'',fetcher:async()=>{network++;throw new Error('private-token');}});
 await api.save({tool:{...tool,provider:'forgejo_actions',url:'https://forgejo.example/app'},revision:(await api.list()).revision},'admin');await assert.rejects(api.status((await api.list()).tools[0].id));assert.equal(network,0);
 await api.save({tool,revision:(await api.list()).revision},'admin');const id=(await api.list()).tools.find(t=>t.provider==='github_actions').id;await assert.rejects(api.status(id),error=>{assert(!error.message.includes('private-token'));return true;});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
