import { showDialog, closeDialog } from '/bootstrap-ui.js';
export function initAutomation({ api, notice, waitOperation, escape: esc, getApps, openLogs }) {
  const $ = selector => document.querySelector(selector);
  let registry = null, details = null, selectedJob = null, busy = false;
  const appId = () => $('#automation-app').value || 'main';
  function processState(id) { return registry?.processes?.find(p => p.id === id)?.state || 'not_created'; }
  function badge(id) { const state = processState(id); return `<span class="badge ${state === 'running' ? 'good' : state === 'restarting' ? 'bad' : 'neutral'}">${esc({ running: 'Em execução', exited: 'Parado', restarting: 'Reiniciando', not_created: 'Não criado' }[state] || state)}</span>`; }
  function buttons(item) { return `<div class="action-group"><button class="button small" data-auto-id="${item.id}" data-automation-action="logs">Logs</button><button class="button small" data-auto-id="${item.id}" data-automation-action="${processState(item.id) === 'running' ? 'restart' : 'start'}">${processState(item.id) === 'running' ? 'Recriar' : 'Iniciar'}</button><button class="button small danger" data-auto-id="${item.id}" data-automation-action="stop">Parar</button><button class="button small danger" data-auto-id="${item.id}" data-automation-action="remove">Remover cadastro</button></div>`; }
  function render() {
    const app = appId(), workers = registry.config.workers.filter(w => w.app === app), jobs = registry.config.jobs.filter(j => j.app === app), schedulers = registry.config.schedulers.filter(s => s.app === app);
    const sizes = details?.statistics?.queues || [], failed = details?.statistics?.failed || [];
    const unavailable = details?.statisticsError || !details?.statistics || sizes.some(q => q.error);
    const total = unavailable ? '—' : sizes.reduce((sum, q) => sum + (q.counts?.total || 0), 0);
    $('#automation-summary').innerHTML = [[workers.length, 'Filas cadastradas'], [total, 'Jobs na fila (driver)'], [workers.filter(w => processState(w.id) === 'running').length, 'Workers em execução'], [details?.statisticsError || details?.statistics?.failedError ? '—' : failed.length, 'Falhas listadas (até 30)']].map(([value, label]) => `<article class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></article>`).join('');
    $('#worker-table').innerHTML = workers.length ? `<table><thead><tr><th>FILA / CONEXÃO</th><th>JOBS</th><th>WORKER</th><th>AÇÕES</th></tr></thead><tbody>${workers.map(w => { const size = sizes.find(s => s.id === w.id);return `<tr><td><strong>${esc(w.queue)}</strong><div class="muted">${esc(w.connection)} · timeout ${w.timeout}s</div></td><td><span class="queue-count">${size?.counts?.total ?? '—'}</span><div class="muted">${size?.error ? esc(size.error) : size?.counts ? `Pendentes: ${size.counts.pending ?? '—'} · reservados: ${size.counts.reserved ?? '—'} · atrasados: ${size.counts.delayed ?? '—'}` : 'Consulta indisponível'}</div></td><td>${badge(w.id)}</td><td>${buttons(w)}</td></tr>`;}).join('')}</tbody></table>` : '<p class="empty">Nenhum worker cadastrado para esta aplicação.</p>';
    $('#job-table').innerHTML = jobs.length ? `<table><thead><tr><th>JOB</th><th>CLASSE</th><th>AÇÕES</th></tr></thead><tbody>${jobs.map(j => `<tr><td>${esc(j.name)}</td><td><code>${esc(j.class)}</code></td><td><div class="action-group"><button class="button small" data-auto-id="${j.id}" data-automation-action="dispatch" ${workers.length ? '' : 'disabled'}>Enfileirar</button><button class="button small danger" data-auto-id="${j.id}" data-automation-action="remove">Remover cadastro</button></div></td></tr>`).join('')}</tbody></table>` : '<p class="empty">Registre uma classe de job para enviar execuções pelo painel.</p>';
    $('#failed-table').innerHTML = failed.length ? `<table><thead><tr><th>ID</th><th>FILA</th><th>DATA DA FALHA</th><th>AÇÃO</th></tr></thead><tbody>${failed.map(f => `<tr><td class="small-mono">${esc(f.id)}</td><td>${esc(f.connection)} / ${esc(f.queue)}</td><td>${esc(f.failedAt)}</td><td><button class="button small" data-failed-id="${esc(f.id)}" data-automation-action="retry">Reenviar</button></td></tr>`).join('')}</tbody></table>` : `<p class="empty">${esc(details?.statistics?.failedError || details?.statisticsError || 'Nenhum job falho registrado.')}</p>`;
    $('#scheduler-table').innerHTML = schedulers.length ? `<table><thead><tr><th>AGENDADOR</th><th>ESTADO</th><th>AÇÕES</th></tr></thead><tbody>${schedulers.map(s => `<tr><td>schedule:work<div class="muted">Tarefas definidas na aplicação</div></td><td>${badge(s.id)}</td><td>${buttons(s)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">Nenhum agendador cadastrado. Registre apenas um por aplicação.</p>';
    $('#register-scheduler').disabled = schedulers.length > 0;
    $('#schedule-output').textContent = details?.schedules || details?.scheduleError || 'Nenhuma tarefa disponível para consulta.';
  }
  async function refresh() {
    if (busy || !getApps().length || $('#view-automation').hidden) return;
    busy = true;
    try {
      const apps = getApps().filter(a => a.enabled), previous = appId();
      $('#automation-app').innerHTML = apps.map(a => `<option value="${a.id}">${esc(a.name)} · ${a.id}</option>`).join('');
      if (apps.some(a => a.id === previous)) $('#automation-app').value = previous;
      registry = await api('/automation');
      details = await api(`/automation/apps/${appId()}`);
      render();
      if (details.statisticsError) notice(details.statisticsError, 'error');
    } catch (e) { notice(e.message, 'error'); } finally { busy = false; }
  }
  async function register(kind, formData = {}) {
    if (!registry) return;
    const data = await api('/automation/register', { method: 'POST', body: JSON.stringify({ ...formData, kind, app: appId(), revision: registry.revision }) });
    await waitOperation(data.operation); await refresh();
  }
  $('#automation-refresh').addEventListener('click', refresh);
  $('#automation-app').addEventListener('change', refresh);
  document.querySelector('[data-tab=automation]').addEventListener('click', () => setTimeout(refresh, 0));
  $('#worker-form').addEventListener('submit', async event => { event.preventDefault(); try { await register('worker', Object.fromEntries(new FormData(event.target))); } catch (e) { notice(e.message, 'error'); } });
  $('#job-form').addEventListener('submit', async event => { event.preventDefault(); try { await register('job', Object.fromEntries(new FormData(event.target))); } catch (e) { notice(e.message, 'error'); } });
  $('#register-scheduler').addEventListener('click', async () => { try { await register('scheduler'); } catch (e) { notice(e.message, 'error'); } });
  $('#run-schedule').addEventListener('click', async () => {
    
    try { await waitOperation((await api(`/automation/apps/${appId()}/schedule-run`, { method: 'POST', body: '{}' })).operation); await refresh(); } catch (e) { notice(e.message, 'error'); }
  });
  $('#close-dispatch').addEventListener('click', () => closeDialog($('#dispatch-dialog')));
  $('#dispatch-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const data = new FormData(event.target), args = JSON.parse(data.get('arguments'));
      if (!Array.isArray(args)) throw new Error('Use um array JSON, por exemplo [] ou [123, "mensagem"].');
      const result = await api(`/automation/${selectedJob}/dispatch`, { method: 'POST', body: JSON.stringify({ worker: data.get('worker'), arguments: args, ...Object.fromEntries(Object.entries(registry.config.jobs.find(j=>j.id===selectedJob)||{}).filter(([key])=>['name','class','app'].includes(key))) }) });
      closeDialog($('#dispatch-dialog')); await waitOperation(result.operation); await refresh();
    } catch (e) { notice(e.message, 'error'); }
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-automation-action]'); if (!button) return;
    const id = button.dataset.autoId, action = button.dataset.automationAction;
    try {
      if (action === 'retry') {
        
        await waitOperation((await api(`/automation/apps/${appId()}/retry`, { method: 'POST', body: JSON.stringify({ id: button.dataset.failedId }) })).operation); await refresh();
      } else if (id && action === 'logs') {
        await openLogs(id, async () => (await api(`/automation/${id}/logs`)).logs);
      } else if (id && action === 'dispatch') {
        const job = registry.config.jobs.find(j => j.id === id); selectedJob = id;
        $('#dispatch-job').textContent = `${job.name} · ${job.class}`;
        $('#dispatch-worker').innerHTML = registry.config.workers.filter(w => w.app === job.app).map(w => `<option value="${w.id}">${esc(w.queue)} · ${esc(w.connection)}</option>`).join('');
        $('#dispatch-form').elements.arguments.value = '[]'; showDialog($('#dispatch-dialog'));
      } else if (id && ['start', 'stop', 'restart', 'remove'].includes(action)) {
        
        await waitOperation((await api(`/automation/${id}/${action}`, { method: 'POST', body: JSON.stringify(Object.fromEntries(Object.entries([...registry.config.workers,...registry.config.schedulers,...registry.config.jobs].find(item=>item.id===id)||{}).filter(([key])=>['app','queue','connection','name','timeout','stopGrace'].includes(key)))) })).operation); await refresh();
      }
    } catch (e) { notice(e.message, 'error'); }
  });
  setInterval(refresh, 15000);
}
