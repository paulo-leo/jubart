import { showDialog, closeDialog } from '/bootstrap-ui.js';
import { changePlan } from '/change-plan.js';
import { initUI, requestUI, requestOrigin, operationBusy } from '/ui.js';
import { initDatabases } from '/database-ui.js';
import { initMetrics } from '/metrics-ui.js';
import { initServiceUI } from '/service-ui.js';
import { confirmAction } from '/dialogs.js';
import { initAutomation } from '/automation-ui.js';
const $ = selector => document.querySelector(selector);
const state = { csrf: '', config: null, revision: '', snapshot: null, dirty: false, operation: null, tab: 'overview', refreshing: false };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const titles = { overview: ['Visão geral', 'Seus serviços, aplicações e dados. Tudo sob controle.'], databases: ['Bancos de dados', 'Administre bancos, contas, acessos e proteção dos dados.'], metrics: ['Métricas em tempo real', 'Acompanhe recursos dos containers e o tráfego das aplicações.'], apps: ['Aplicações', 'Organize os projetos e seus diretórios em um único lugar.'], proxy: ['Proxy & acessos', 'Um ponto de entrada. Vários destinos.'], automation: ['Filas, jobs & Scheduler', 'Controle o trabalho em segundo plano de cada aplicação.'], volumes: ['Volumes & diretórios', 'Saiba onde os dados persistem, sem alterar seu conteúdo.'] };
async function api(route, options = {}) {
  const origin=requestOrigin();
  if(options.method && options.method !== 'GET' && route !== '/login') {
    const payload=options.body?JSON.parse(options.body):{};
    if(route==='/apply')payload.config=state.config;
    if(!await confirmAction(changePlan(route,payload)))throw Object.assign(new Error(''),{cancelled:true});
  }
  return requestUI(route,options,async()=>{
    const response=await fetch(`/api${route}`,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':state.csrf,...options.headers},credentials:'same-origin'});
    const data=await response.json();
    if(!response.ok){if(response.status===401)showLogin();throw new Error(data.error||'Não foi possível concluir.');}
    return data;
  },origin);
}
function notice(message,type=''){const el=$('#notice');el.hidden=!message;el.className=`notice ${type}`;el.setAttribute('role',type==='error'?'alert':'status');el.setAttribute('aria-live',type==='error'?'assertive':'polite');el.textContent=message;}
function showLogin(){$('#app-env-content').value='';closeDialog($('#app-env-dialog'));closeDialog($('#app-editor-dialog'));$('#login').hidden=false;$('#dashboard').hidden=true;state.csrf='';}
async function enter(session){state.csrf=session.csrf;$('#user-name').textContent=session.username;$('#login').hidden=true;$('#dashboard').hidden=false;const saved=await api('/config');state.config=saved.config;state.revision=saved.revision;state.dirty=false;renderForms();await refresh();}
function publicURL(app){const p=state.config.proxy,port=p.tls?p.httpsPort:p.httpPort;return `${p.tls?'https':'http'}://${app.domain}${port===(p.tls?443:80)?'':':'+port}`;}
function renderApplicationList(){
 const services=state.snapshot?.services||[];
 $('#app-list').innerHTML=state.config.applications.map(app=>{
 const service=app.id==='main'?'php':'php-'+app.id,running=services.find(s=>s.name===service)?.state==='running';
 return `<tr class="application-row" data-app-open="${app.id}"><td><div class="service-cell"><span class="service-icon">◇</span><div><button class="application-name" data-app-open="${app.id}" aria-label="Ver e editar ${escape(app.name)}">${escape(app.name)}</button><div class="service-container">${service}</div></div></div></td><td><span class="badge ${app.id==='main'?'main-badge':'neutral'}">${app.id==='main'?'Principal · main':'Adicional · '+app.id}</span></td><td><span class="domain-label">${escape(app.domain)}</span><div class="muted small-text">${app.mode==='octane'?'Octane':'Tradicional'}</div></td><td><code class="port-label">${app.port}</code><div class="muted small-text">interna</div></td><td><span class="badge ${app.enabled?'good':'neutral'}">${app.enabled?'Habilitada':'Desabilitada'}</span><div class="muted small-text">${running?'Container em execução':'Container não está em execução'}</div></td><td><button class="button small" data-app-open="${app.id}">Ver detalhes →</button></td></tr>`;}).join('');
}
function openApplication(id){const app=state.config.applications.find(a=>a.id===id);if(!app)return;const form=$('#app-editor-form');form.dataset.appId=id;$('#app-editor-title').textContent=app.name;$('#app-editor-slot').textContent=id==='main'?'APLICAÇÃO PRINCIPAL · PHP':`APLICAÇÃO ADICIONAL · PHP-${id.toUpperCase()}`;for(const key of ['name','domain','directory','documentRoot','mode','port'])form.elements.namedItem(key).value=app[key];form.elements.enabled.checked=app.enabled;form.elements.enabled.disabled=id==='main';$('#app-editor-url').textContent=publicURL(app);$('#app-editor-url').href=publicURL(app);$('#app-editor-error').textContent='';showDialog($('#app-editor-dialog'));loadAppEnvStatus(id);}
function renderForms(){
 renderApplicationList();const p=state.config.proxy;
 $('#proxy-form').innerHTML=`<label>Endereço de publicação<select data-proxy="bindAddress"><option value="127.0.0.1" ${p.bindAddress==='127.0.0.1'?'selected':''}>127.0.0.1 · somente local</option><option value="0.0.0.0" ${p.bindAddress==='0.0.0.0'?'selected':''}>0.0.0.0 · todas as interfaces</option></select></label><label>Email para certificados<input data-proxy="email" type="email" value="${escape(p.email)}" placeholder="contato@dominio.com"></label><label>Porta pública HTTP<input type="number" data-proxy="httpPort" value="${p.httpPort}"></label><label>Porta pública HTTPS<input type="number" data-proxy="httpsPort" value="${p.httpsPort}"></label><label class="checkbox"><input type="checkbox" data-proxy="tls" ${p.tls?'checked':''}> Habilitar HTTPS / Let's Encrypt</label>`;
 $('#database-ports-form').innerHTML=Object.entries(p.databases).map(([id,value])=>`<fieldset class="proxy-db-group"><legend>${id==='mariadb'?'MariaDB':'PostgreSQL'}</legend><label>Acesso no host<select data-db-port-service="${id}" data-db-port-field="bindAddress"><option value="127.0.0.1" ${value.bindAddress==='127.0.0.1'?'selected':''}>Somente local · 127.0.0.1</option><option value="0.0.0.0" ${value.bindAddress==='0.0.0.0'?'selected':''}>Rede / público · 0.0.0.0</option></select></label><label>Porta publicada no host<input type="number" min="1" max="65535" required data-db-port-service="${id}" data-db-port-field="port" value="${value.port}"></label><p class="muted">Interna: ${id}:${id==='mariadb'?3306:5432} · Host configurado: <span data-db-port-preview="${id}"></span></p></fieldset>`).join('');renderRoutes();renderDraft();
}
$('#proxy-standard-ports').addEventListener('click',async()=>{if(!await confirmAction({title:'Usar as portas 80 e 443?',message:'Revise as portas de entrada compartilhadas.',summary:[['HTTP',80],['HTTPS',443]],execution:'Alterar as portas no rascunho da interface.',impact:'Só entram em vigor após Salvar JSON e Aplicar configuração. Portas ocupadas podem impedir a subida.',confirmLabel:'Usar portas padrão'}))return;state.config.proxy.httpPort=80;state.config.proxy.httpsPort=443;state.dirty=true;renderForms();});
function renderRoutes(){for(const [id,value] of Object.entries(state.config.proxy.databases)){const el=document.querySelector(`[data-db-port-preview="${id}"]`);if(el)el.textContent=`${value.bindAddress}:${value.port}`;}$('#route-map').innerHTML=state.config.applications.filter(a=>a.enabled).map(a=>`<div class="route"><a class="app-link" href="${escape(publicURL(a))}" target="_blank" rel="noopener noreferrer">${escape(a.domain)} ↗</a><span class="muted">→ Traefik →</span><code>${a.id==='main'?'php':'php-'+a.id}:${a.port}</code><span class="badge ${state.config.proxy.tls?'good':'neutral'}">${state.config.proxy.tls?'HTTPS':'HTTP local'}</span></div>`).join('');}
function renderDraft(){const text=state.dirty?'Alterações não salvas':state.snapshot?.applied?'Configuração aplicada':'JSON salvo · conferir aplicação';$('#draft-badge').textContent=text;$('#proxy-draft-status').textContent=text;}
function renderSnapshot(){
 const data=state.snapshot;$('#project-name').textContent=data.project;
 const running=data.services.filter(s=>s.state==='running').length,alerts=data.services.filter(s=>s.health==='unhealthy'||s.state==='restarting'||s.state==='dead').length;
 $('#stats').innerHTML=[[running,'Serviços em execução',`${data.services.length} serviços gerenciados`],[state.config.applications.filter(a=>a.enabled).length,'Aplicações habilitadas','Apontamentos no JSON'],[data.volumes.length,'Volumes persistentes','Dados preservados nas operações'],[alerts,'Pontos de atenção',alerts?'Confira saúde e logs dos serviços':'Nenhum alerta de execução detectado']].map(([value,label,foot])=>`<article class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></article>`).join('');
 const date=value=>!value||value.startsWith('0001-')?'—':new Date(value).toLocaleString('pt-BR'),labels={running:'Em execução',exited:'Parado',created:'Criado',restarting:'Reiniciando',not_created:'Não criado',dead:'Falha',paused:'Pausado'};
 $('#services').innerHTML=data.services.map(s=>`<tr><td><div class="service-cell"><span class="service-icon">◇</span><div><div class="service-name">${escape(s.name)}</div><div class="service-container">${escape(s.container||s.image)}</div></div></div></td><td><span class="badge ${s.state==='running'?'good':s.state==='restarting'?'bad':'neutral'}">${labels[s.state]||escape(s.state)}</span></td><td><span class="badge ${s.health==='healthy'?'good':s.health==='unhealthy'?'bad':'neutral'}">${s.health==='healthy'?'Saudável':s.health==='unhealthy'?'Falha de saúde':s.health==='starting'?'Verificando':'Sem healthcheck'}</span></td><td class="small-text">${escape(date(s.startedAt))}<div class="muted">Criado: ${escape(date(s.createdAt))}</div></td><td><div class="service-ports">${escape((s.ports||[]).join(' · ')||'Sem porta publicada')}</div><div class="muted">${s.restartCount||0} reinícios</div></td><td><div class="action-group"><button class="button small" data-service="${s.name}" data-service-action="details">Detalhes</button>${!s.automation?`<button class="button small" data-service="${s.name}" data-service-action="logs">Logs</button>`:''}${s.automation?'<button class="button small" data-tab="automation">Gerenciar automação</button>':s.protected?'<span class="muted">Use o terminal para este serviço</span>':`${data.terminalEnabled&&s.state==='running'?`<button class="button small" data-service="${s.name}" data-service-action="terminal">Terminal</button>`:''}${s.state==='running'?`<button class="button small" data-service="${s.name}" data-service-action="restart">Reiniciar</button><button class="button small danger" data-service="${s.name}" data-service-action="stop">Parar</button>`:`<button class="button small" data-service="${s.name}" data-service-action="start">Iniciar</button>`}`}</div></td></tr>`).join('');
 $('#volume-list').innerHTML=data.volumes.map(v=>`<article class="volume-card"><h3>▤ ${escape(v.name)}</h3><p>Driver: ${escape(v.driver)}</p><p><code>${escape(v.mountpoint)}</code></p><p>Criado: ${escape(v.created||'—')}</p></article>`).join('')||'<p class="empty">Nenhum volume nomeado criado para este projeto.</p>';
 $('#mount-list').innerHTML=`<table><thead><tr><th>SERVIÇO</th><th>TIPO</th><th>ORIGEM NO HOST</th><th>DESTINO</th><th>ACESSO</th></tr></thead><tbody>${data.services.flatMap(s=>s.mounts.map(m=>`<tr><td>${escape(s.name)}</td><td>${escape(m.type)}</td><td><code>${escape(m.source)}</code></td><td><code>${escape(m.target)}</code></td><td>${m.writable?'Leitura/escrita':'Somente leitura'}</td></tr>`)).join('')}</tbody></table>`;
 $('#updated').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR');renderApplicationList();renderDraft();
}
async function refresh(){if(state.refreshing||!state.csrf)return;state.refreshing=true;try{state.snapshot=await api('/status');renderSnapshot();$('#footer-state').textContent='Conectado';}catch(error){notice(error.message,'error');$('#footer-state').textContent='Verifique a conexão com Docker';}finally{state.refreshing=false;}}
async function waitOperation(op){state.operation=op;notice(`${op.label} · em andamento. A recriação pode interromper brevemente os acessos.`);operationBusy(true);document.querySelectorAll('[data-action], [data-service-action], [data-automation-action]').forEach(b=>b.disabled=true);try{while(state.operation?.state==='running'){await new Promise(resolve=>setTimeout(resolve,1500));state.operation=(await api('/operation')).operation;}notice(state.operation?.message||'Operação finalizada.',state.operation?.state==='success'?'success':'error');}finally{operationBusy(false);document.querySelectorAll('[data-action], [data-service-action], [data-automation-action]').forEach(b=>b.disabled=false);await refresh();}}
async function save(){const saved=await api('/config',{method:'PUT',body:JSON.stringify({config:state.config,revision:state.revision})});state.config=saved.config;state.revision=saved.revision;state.dirty=false;renderDraft();notice('JSON salvo. Clique em Aplicar configuração para atualizar os serviços.','success');}
$('#login-form').addEventListener('submit',async event=>{event.preventDefault();$('#login-error').textContent='';try{await enter(await api('/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(event.target)))}));event.target.reset();}catch(error){$('#login-error').textContent=error.message;}});
$('#profile-logout').addEventListener('click',()=>$('#logout').click());
$('#logout').addEventListener('click',async()=>{try{await api('/logout',{method:'POST'});showLogin();}catch(error){if(error.message)notice(error.message,'error');}});
$('#refresh').addEventListener('click',refresh);
$('#proxy-form').addEventListener('submit',event=>event.preventDefault());
$('#database-ports-form').addEventListener('submit',event=>event.preventDefault());
$('#app-list').addEventListener('click',event=>{
  const row = event.target.closest('[data-app-open]'); if (row) openApplication(row.dataset.appOpen);
});
$('#close-app-editor').addEventListener('click', () => closeDialog($('#app-editor-dialog')));
$('#cancel-app-editor').addEventListener('click', () => closeDialog($('#app-editor-dialog')));
$('#app-editor-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target, app = state.config.applications.find(a => a.id === form.dataset.appId);
  const values = Object.fromEntries(new FormData(form));
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 2019) { $('#app-editor-error').textContent = 'Use uma porta interna entre 1024 e 65535, exceto 2019.'; return; }
  if(!await confirmAction({title:'Guardar alterações da aplicação?',message:'Confira o apontamento que será guardado no rascunho.',summary:[['Aplicação',values.name],['Domínio',values.domain],['Diretório',values.directory],['Raiz pública',values.documentRoot],['Modo',values.mode],['Porta interna',port],['Habilitada',app.id==='main'||form.elements.enabled.checked?'Sim':'Não']],execution:'Atualizar somente o rascunho da aplicação na interface.',impact:'Ainda será necessário Salvar JSON e Aplicar configuração para alterar os containers.',confirmLabel:'Guardar no rascunho'}))return;
  Object.assign(app, { name: values.name.trim(), domain: values.domain.trim(), directory: values.directory.trim(), documentRoot: values.documentRoot.trim(), mode: values.mode, port, enabled: app.id === 'main' || form.elements.namedItem('enabled').checked });
  state.dirty = true; renderApplicationList(); renderRoutes(); renderDraft();
  closeDialog($('#app-editor-dialog'));
  notice('Alteração guardada no rascunho. Use Salvar JSON e depois Aplicar configuração para atualizar os containers.');
});

document.addEventListener('input', event => {
  const target = event.target;
  if (target.dataset.field) {
    const app = state.config.applications.find(a => a.id === target.closest('[data-app]').dataset.app);
    app[target.dataset.field] = target.type === 'checkbox' ? target.checked : target.type === 'number' ? Number(target.value) : target.value;
  } else if (target.dataset.dbPortService) state.config.proxy.databases[target.dataset.dbPortService][target.dataset.dbPortField] = target.type === 'number' ? Number(target.value) : target.value;
  else if (target.dataset.proxy) state.config.proxy[target.dataset.proxy] = target.type === 'checkbox' ? target.checked : target.type === 'number' ? Number(target.value) : target.value;
  else return;
  state.dirty = true; renderDraft(); renderRoutes();
});
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  try {
    if (button.dataset.appOpen) openApplication(button.dataset.appOpen);
    if (button.dataset.tab) {
      state.tab = button.dataset.tab; $('.page-heading .live-badge').hidden = state.tab === 'metrics'; document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== 'view-' + state.tab);
      document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
      $('#page-title').textContent = titles[state.tab][0]; $('#page-description').textContent = titles[state.tab][1];
    }
    if (button.dataset.action === 'import') {
      
      const saved = await api('/config/import', { method: 'POST', body: JSON.stringify({ revision: state.revision }) });
      state.config = saved.config; state.revision = saved.revision; state.dirty = false; renderForms(); notice('Apontamentos importados do .env. Nenhum container foi alterado.', 'success');
    }
    if (button.dataset.action === 'save') await save();
    if (button.dataset.action === 'apply') {
      if (state.dirty) throw new Error('Salve o JSON antes de aplicar.');
      
      await waitOperation((await api('/apply', { method: 'POST', body: JSON.stringify({ revision: state.revision }) })).operation);
    }
    if (button.dataset.serviceAction) {
      const action = button.dataset.serviceAction, service = button.dataset.service;
      if (action === 'logs') await serviceUI.openLogs(service, async () => (await api(`/services/${service}/logs`)).logs);
      else if (action === 'details') serviceUI.openDetails(service);
      else if (action === 'terminal') serviceUI.openTerminal(service);
      else await waitOperation((await api(`/services/${service}/${action}`, { method: 'POST' })).operation);
    }
  } catch (error) { notice(error.message, 'error'); }
});
initUI();
initDatabases({ api, escape, notice, waitOperation });
initMetrics({ api, escape, getApps: () => state.config?.applications || [] });
const serviceUI = initServiceUI({ api, notice, getSnapshot: () => state.snapshot });
initAutomation({ api, notice, waitOperation, escape, openLogs: serviceUI.openLogs, getApps: () => state.config?.applications || [] });
setInterval(() => { if (!state.operation || state.operation.state !== 'running') refresh(); }, 10000);
api('/session').then(enter).catch(() => showLogin());
window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });

document.documentElement.dataset.panelReady = 'true';

let appEnvInfo = null, appEnvEditing = null;
async function loadAppEnvStatus(id) {
  appEnvInfo = null;
  $('#app-env-open').disabled = true;
  $('#app-env-status').textContent = 'Verificando arquivo no diretório salvo…';
  try {
    const info = await api(`/apps/${id}/env/status`);
    if ($('#app-editor-form').dataset.appId !== id) return;
    appEnvInfo = info;
    $('#app-env-open').textContent = info.exists ? 'Editar .env' : 'Criar .env';
    $('#app-env-status').textContent = `${info.exists ? 'Arquivo existente' : 'Arquivo não encontrado'} · ${info.directory}/.env`;
    $('#app-env-open').disabled = false;
  } catch (error) { $('#app-env-status').textContent = error.message; $('#app-env-open').textContent = 'Indisponível'; }
}
$('#app-env-open').addEventListener('click', async () => {
  const form = $('#app-editor-form'), id = form.dataset.appId;
  if (!appEnvInfo) return;
  if (form.elements.directory.value !== appEnvInfo.configuredDirectory) { $('#app-editor-error').textContent = 'Guarde o diretório no rascunho e salve o JSON antes de editar o .env do novo projeto.'; return; }
  $('#app-env-open').disabled = true;
  try {
    const info = await api(`/apps/${id}/env`);
    appEnvEditing = { ...info, id, original: info.content };
    $('#app-env-title').textContent = `${info.exists ? 'Editar' : 'Criar'} .env · ${$('#app-editor-title').textContent}`;
    $('#app-env-path').textContent = `${info.directory}/.env`;
    $('#app-env-content').value = info.content;
    $('#app-env-error').textContent = '';
    $('#app-env-save').textContent = info.exists ? 'Salvar arquivo' : 'Criar arquivo';
    showDialog($('#app-env-dialog'));
  } catch (error) { $('#app-editor-error').textContent = error.message; }
  finally { $('#app-env-open').disabled = false; }
});
async function closeAppEnv() {
  if ($('#app-env-save').disabled) return;
  if (appEnvEditing && $('#app-env-content').value !== appEnvEditing.original && !await confirmAction({ title: 'Descartar alterações do .env?', message: 'As alterações ainda não foram salvas no arquivo.', confirmLabel: 'Descartar alterações', tone: 'danger', execution: 'Fechar o editor e descartar o texto ainda não salvo.', impact: 'As alterações locais serão perdidas. O arquivo existente no projeto permanece como está.' })) return;
  $('#app-env-content').value = '';
  closeDialog($('#app-env-dialog'));
}
$('#app-env-close').addEventListener('click', closeAppEnv);
$('#app-env-cancel').addEventListener('click', closeAppEnv);
$('#app-env-dialog').addEventListener('panel-dialog-cancel', event => { event.preventDefault(); closeAppEnv(); });
$('#app-env-dialog').addEventListener('close', () => { if ($('#app-env-dialog').open) return; $('#app-env-content').value = ''; appEnvEditing = null; });
$('#app-env-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!appEnvEditing) return;
  $('#app-env-save').disabled = true;
  try {
    const { id, revision, directory } = appEnvEditing;
    await api(`/apps/${id}/env`, { method: 'PUT', body: JSON.stringify({ content: $('#app-env-content').value, revision, directory }) });
    $('#app-env-content').value = '';
    closeDialog($('#app-env-dialog'));
    await loadAppEnvStatus(id);
    notice('.env da aplicação salvo. Se necessário, atualize o cache de configuração e reinicie os processos da aplicação.', 'success');
  } catch (error) { $('#app-env-error').textContent = error.message; }
  finally { $('#app-env-save').disabled = false; }
});
