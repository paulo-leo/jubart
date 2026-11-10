import { bootstrapClasses } from '/bootstrap-ui.js';
import { confirmAction } from '/dialogs.js';
import {icon} from '/icons.js';
const $=selector=>document.querySelector(selector);
let trigger=null,requests=0,operation=false;
const inFlight=new Map(), viewRequests=new Map();
function progress(){document.documentElement.classList.toggle('network-busy',requests>0||operation);$('#network-progress').hidden=!(requests>0||operation);}
export function operationBusy(value){operation=value;$('#notice').classList.toggle('working',value);progress();}
// Capture a origem antes que o handler inicie a chamada assíncrona.
document.addEventListener('click',event=>{const b=event.target.closest('button');if(b?.dataset.uiBusy==='true'){event.preventDefault();event.stopImmediatePropagation();return;}trigger=b;setTimeout(()=>{if(trigger===b)trigger=null;},0);},true);
document.addEventListener('submit',event=>{trigger=event.submitter||event.target.querySelector('button[type=submit],button.primary');const b=trigger;if(b?.dataset.uiBusy==='true'){event.preventDefault();event.stopImmediatePropagation();}setTimeout(()=>{if(trigger===b)trigger=null;},0);},true);
export function requestOrigin(){return trigger?.isConnected?trigger:null;}
export async function requestUI(route,options,task,origin=null){
 const mutating=options.method&&options.method!=='GET',key=mutating?`${options.method}:${route}:${options.body||''}`:null;
 if(key&&inFlight.has(key))return inFlight.get(key);
 const button=origin?.isConnected?origin:trigger?.isConnected?trigger:null,wasDisabled=button?.disabled;
 if(button){button.dataset.uiBusy='true';button.classList.add('is-loading');button.setAttribute('aria-busy','true');button.disabled=true;}
 const viewName=route.startsWith('/databases')?'databases':route.startsWith('/automation')?'automation':route==='/metrics'?'metrics':route==='/status'?'overview':null;
 const view=viewName?$('#view-'+viewName):null;
 if(view){viewRequests.set(view,(viewRequests.get(view)||0)+1);view.setAttribute('aria-busy','true');}
 requests++;progress();
 const run=(async()=>{try{return await task();}finally{requests--;progress();if(view){const remaining=(viewRequests.get(view)||1)-1;viewRequests.set(view,remaining);view.setAttribute('aria-busy',String(remaining>0));}if(key)inFlight.delete(key);if(button){delete button.dataset.uiBusy;button.classList.remove('is-loading');button.removeAttribute('aria-busy');button.disabled=wasDisabled;}}})();
 if(key)inFlight.set(key,run);return run;
}
const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const lists=[['services','serviços'],['app-list','aplicações'],['db-list','bancos'],['db-users','usuários'],['db-grants','permissões'],['db-backup-files','backups'],['worker-table','filas'],['job-table','jobs'],['failed-table','falhas'],['scheduler-table','agendadores'],['metrics-containers','containers'],['metrics-routes','rotas'],['mount-list','montagens']];
function installFilter(id,label){
 const root=$('#'+id);if(!root)return;
 const anchor=root.tagName==='TBODY'?root.closest('.table-wrap'):root;
 const bar=document.createElement('div');bar.className='list-filters';bar.innerHTML=`<label class="filter-search">${icon('search')}<span class="sr-only">Buscar ${label}</span><input type="search" placeholder="Buscar ${label}…" autocomplete="off"></label><label class="filter-state"><span class="sr-only">Filtrar ${label} por estado</span><select aria-label="Estado de ${label}"><option value="">Todos os estados</option></select></label><span class="filter-count" role="status"></span><button class="button small filter-clear" type="button">Limpar</button>`;
 anchor.before(bar);
 const empty=document.createElement('p');empty.className='filter-empty';empty.textContent='Nenhum resultado para os filtros atuais.';empty.hidden=true;anchor.after(empty);
 const search=bar.querySelector('input'),select=bar.querySelector('select'),count=bar.querySelector('.filter-count'),clear=bar.querySelector('button');
 let queued=false;
 function apply(){
  queued=false;const rows=Array.from(root.querySelectorAll(root.tagName==='TBODY'?'tr':'tbody tr'));
  const rowStates=row=>id==='db-backup-files'?[row.lastElementChild?.textContent.trim()].filter(Boolean):Array.from(row.querySelectorAll('.badge')).map(b=>b.textContent.trim());
  const states=[...new Set(rows.flatMap(rowStates))].sort();
  const selected=select.value,signature=states.join('|');
  if(select.dataset.signature!==signature){select.replaceChildren(new Option('Todos os estados',''),...states.map(s=>new Option(s,s)));select.dataset.signature=signature;if(states.includes(selected))select.value=selected;}
  bar.querySelector('.filter-state').hidden=!states.length;
  let shown=0;
  for(const row of rows){const match=normalize(row.textContent).includes(normalize(search.value.trim()))&&(!select.value||rowStates(row).includes(select.value));row.hidden=!match;if(match)shown++;}
  const text=`${shown} de ${rows.length} ${label}`;if(count.textContent!==text)count.textContent=text;
  clear.disabled=!search.value&&!select.value;empty.hidden=shown>0||!rows.length;bar.dataset.total=rows.length;
 }
 search.addEventListener('input',apply);select.addEventListener('change',apply);clear.addEventListener('click',()=>{search.value='';select.value='';apply();search.focus();});
 new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(apply);}}).observe(root,{childList:true,subtree:true});apply();
}
const hints={
 directory:'Diretório do projeto no host. Alterar o apontamento não move arquivos nem instala dependências.',documentRoot:'Raiz pública dentro do container. Em Laravel, normalmente /var/www/html/public.',domain:'Hostname usado pelo Traefik para selecionar a aplicação. Não inclua protocolo ou porta.',mode:'Tradicional atende cada requisição normalmente. Octane exige instalação e configuração no projeto.',port:'Porta interna do container ou publicada no host, conforme o campo. Portas internas podem se repetir entre containers.',httpPort:'Porta de entrada HTTP compartilhada entre os domínios. O padrão convencional é 80.',httpsPort:'Porta de entrada HTTPS compartilhada. O padrão convencional é 443.',bindAddress:'127.0.0.1 restringe ao próprio host. 0.0.0.0 escuta em todas as interfaces; restrinja origens no firewall.',tls:'Habilita emissão de certificado para domínios públicos com DNS e portas acessíveis.',email:'Email usado nos registros de emissão dos certificados.',queue:'Nome da fila consumida pelo worker. Deve corresponder à fila usada pela aplicação.',connection:'Driver de fila configurado no Laravel: redis para Valkey ou database para banco.',tries:'Número máximo de tentativas por job antes de registrar falha.',timeout:'Tempo máximo de execução de um job, em segundos.',sleep:'Espera em segundos quando não há jobs disponíveis.',stopGrace:'Tempo para o worker terminar ao receber parada. Deve ser maior que o timeout.',class:'Classe já existente em App\\Jobs. Registrar aqui não cria o código do job.',schedule:'Expressão cron com cinco campos: minuto, hora, dia do mês, mês e dia da semana.',timezone:'Fuso da agenda, por exemplo America/Sao_Paulo.',retentionDays:'Idade dos backups locais que podem ser removidos após um ciclo bem-sucedido. Zero preserva todos.',maxAgeHours:'Idade máxima do último backup para o serviço ser considerado saudável.',databases:'Use * para selecionar todos os bancos elegíveis ou informe nomes separados por vírgula.',password:'Credencial sensível. Na criação de contas de banco, deixar vazio gera uma senha; outros formulários têm regras próprias.',host:'Origem permitida da conta MariaDB. % aceita origens diversas, conforme rede e firewall.',remotePrefix:'Prefixo exclusivo dentro do bucket para os backups deste servidor.',s3Endpoint:'Endereço HTTPS do serviço S3 compatível. AWS normalmente usa o campo vazio.',s3Bucket:'Bucket existente no armazenamento remoto. Nenhum bucket é criado pelo painel.',s3EnvAuth:'Usa a cadeia de credenciais do ambiente/IAM, em vez de chaves explícitas.',enabled:'Ativa este cadastro ou a agenda indicada; não apaga dados ao desativar.',runOnStart:'Executa um backup ao iniciar ou recriar o serviço de backup.',remoteEnabled:'Envia dump e checksum para o armazenamento S3 configurado.',s3AccessKeyId:'Credencial do armazenamento S3. No editor de backup, vazio mantém a atual.',s3SecretAccessKey:'Segredo do armazenamento S3. No editor de backup, vazio mantém o atual.'};
let hintId=0;
function decorate(){
 bootstrapClasses();
 document.querySelectorAll('label').forEach(label=>{
  if(label.querySelector('.field-help')||label.closest('.list-filters,.profile-menu,#login-form'))return;
  const field=label.querySelector('input,select,textarea');if(!field||field.type==='hidden'||['username','name'].includes(field.name))return;
  const key=field.dataset.proxy||field.dataset.dbPortField||field.name;
  const backupDirectory=key==='directory'&&label.closest('#db-action-form')?.elements.namedItem('schedule');
  const text=backupDirectory?'Pasta exclusiva de backups no host. Alterar o destino não move os arquivos antigos.':hints[key];if(!text)return;
  const button=document.createElement('button');button.type='button';button.className='field-help';button.innerHTML=icon('help');button.setAttribute('aria-label','Ajuda: '+label.childNodes[0]?.textContent.trim());
  const tip=document.createElement('span');tip.id=`field-tip-${++hintId}`;tip.role='tooltip';tip.className='field-tooltip';tip.textContent=text;button.setAttribute('aria-describedby',tip.id);button.append(tip);button.addEventListener('click',e=>{e.preventDefault();button.classList.toggle('tip-open');});button.addEventListener('keydown',e=>{if(e.key==='Escape'){button.classList.remove('tip-open');button.blur();}});button.addEventListener('blur',()=>button.classList.remove('tip-open'));label.append(button);
 });
 document.querySelectorAll('.service-icon').forEach(el=>{if(!el.querySelector('svg'))el.innerHTML=icon(el.closest('tr')?.textContent.match(/mariadb|postgres|valkey/)?'databases':'apps');});
 document.querySelectorAll('button.button,button.primary').forEach(button=>{
  const action=button.dataset.serviceAction||button.dataset.automationAction||button.dataset.action;
  const actionHints={logs:'Consulta os registros recentes do serviço.',details:'Mostra datas, estado, portas e informações do container.',terminal:'Abre o console para executar comandos dentro deste container.',start:'Inicia o serviço com a configuração atual.',stop:'Interrompe o serviço sem apagar os volumes.',restart:'Reinicia ou recria este serviço; pode interromper o atendimento.',remove:'Remove este cadastro; não remove volumes.',save:'Salva o rascunho JSON sem reiniciar os serviços.',apply:'Valida e aplica a configuração aos containers. Pode interromper os acessos.',import:'Substitui o rascunho pelos apontamentos atuais do .env.'};
  if(actionHints[action])button.dataset.uiTip=actionHints[action];
  const idHints={'refresh':'Atualiza a listagem dos serviços e seus estados.','logs-export':'Baixa a visualização atual dos logs como arquivo.','logs-clear-history':'Oculta os registros anteriores no painel; não trunca os arquivos do Docker.','db-backup-run':'Cria um dump dos bancos selecionados e envia ao destino remoto, se habilitado.','proxy-standard-ports':'Preenche HTTP 80 e HTTPS 443 no rascunho. Salve e aplique para entrar em vigor.'};
  if(idHints[button.id])button.dataset.uiTip=idHints[button.id];

  if(button.querySelector('.ui-icon')||button.closest('.list-filters')||button.classList.contains('icon-button'))return;
  for(const node of button.childNodes)if(node.nodeType===Node.TEXT_NODE)node.textContent=node.textContent.replace(/^[+↻]\s*/, '');
  const text=button.textContent.trim();let name=/Logs/.test(text)?'logs':/Terminal|Console/.test(text)?'terminal':/Atualizar|Reiniciar|Recriar/.test(text)?'refresh':/Exportar/.test(text)?'download':/Salvar/.test(text)?'save':/Iniciar|Executar|Aplicar/.test(text)?'play':/Parar|Bloquear/.test(text)?'stop':/Criar|Registrar/.test(text)?'plus':/Configurar/.test(text)?'settings':null;
  if(name)button.insertAdjacentHTML('afterbegin',icon(name));
 });
}
function initActionTooltips(){
 const tip=document.createElement('div');tip.id='action-tooltip';tip.className='action-tooltip';tip.role='tooltip';tip.hidden=true;document.body.append(tip);let owner=null;
 function hide(){if(owner){const ids=(owner.getAttribute('aria-describedby')||'').split(' ').filter(id=>id&&id!==tip.id);if(ids.length)owner.setAttribute('aria-describedby',ids.join(' '));else owner.removeAttribute('aria-describedby');}owner=null;tip.hidden=true;}
 function show(button){if(!button?.dataset.uiTip)return;hide();owner=button;tip.textContent=button.dataset.uiTip;(button.closest('dialog')||document.body).append(tip);button.setAttribute('aria-describedby',((button.getAttribute('aria-describedby')||'')+' '+tip.id).trim());tip.hidden=false;const rect=button.getBoundingClientRect();tip.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-tip.offsetWidth-8))+'px';tip.style.top=(rect.bottom+tip.offsetHeight+8<window.innerHeight?rect.bottom+7:Math.max(8,rect.top-tip.offsetHeight-7))+'px';}
 document.addEventListener('mouseover',e=>{if(owner&&owner===document.activeElement)return;const b=e.target.closest('button[data-ui-tip]');if(b!==owner){hide();show(b);}});
 document.addEventListener('focusin',e=>show(e.target.closest('button[data-ui-tip]')));
 document.addEventListener('focusout',hide);document.addEventListener('mouseout',e=>{if(owner&&owner!==document.activeElement&&owner.contains(e.target)&&!owner.contains(e.relatedTarget))hide();});document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});window.addEventListener('scroll',()=>{const active=owner;if(active&&active===document.activeElement)requestAnimationFrame(()=>{if(document.activeElement===active)show(active);});else hide();},true);
}
export function initUI(){
 initActionTooltips();
 const select=$('#theme-choice');select.value=window.panelTheme.get();select.addEventListener('change',async()=>{const value=select.value,previous=window.panelTheme.get();select.value=previous;if(value===previous)return;if(await confirmAction({title:'Alterar aparência?',message:'Escolha a preferência visual deste navegador.',summary:[['Anterior',previous],['Nova preferência',value]],execution:'Salvar a preferência no navegador e aplicar o tema.',impact:'Somente a aparência muda. Serviços e dados não são alterados.',confirmLabel:'Alterar tema'}))window.panelTheme.set(value);});window.addEventListener('panel-theme-change',()=>select.value=window.panelTheme.get());
 const profile=$('#profile-menu');document.addEventListener('click',e=>{if(!profile.contains(e.target))profile.open=false;});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&profile.open){profile.open=false;profile.querySelector('summary').focus();}});
 document.querySelectorAll('[data-tab]').forEach(button=>{const span=button.querySelector('span');span.innerHTML=icon(button.dataset.tab);span.classList.add('nav-icon');});
 lists.forEach(([id,label])=>installFilter(id,label));
 $('#notice').setAttribute('role','status');$('#notice').setAttribute('aria-live','polite');
 let queued=false;new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(()=>{queued=false;decorate();});}}).observe(document.body,{childList:true,subtree:true});decorate();
}
