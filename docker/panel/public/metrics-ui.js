export function initMetrics({ api, escape: esc, getApps }) {
  const $ = selector => document.querySelector(selector);
  let paused = false, busy = false, interval = 5000, timer = null, last = null;
  const number = (value, digits = 1) => value === null || value === undefined ? '—' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits });
  const bytes = value => { if (value === null || value === undefined) return '—'; const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']; let i = 0; while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; } return `${number(value)} ${units[i]}`; };
  function chart(target, history, fields, labels, unit = '') {
    const values = history.flatMap(row => fields.map(field => row[field])).filter(v => v !== null && Number.isFinite(v));
    if (!values.length) { $(target).innerHTML = '<div class="chart-empty">Aguardando amostras disponíveis…</div>'; return; }
    const width = 600, height = 175, left = 54, right = 15, top = 10, bottom = 29, plotHeight = height - top - bottom;
    const peak = Math.max(...values, 0.01), max = Math.max(1, peak * 1.12);
    const timeSpan = Math.max(1, history.at(-1).at - history[0].at);
    const x = index => left + (history[index].at - history[0].at) / timeSpan * (width - left - right);
    const y = value => top + plotHeight - value / max * plotHeight;
    const colors = ['#7ca6ff', '#6dd9b3'];
    const grid = [0, 0.5, 1].map(r => `<line x1="${left}" y1="${y(r * max)}" x2="${width - right}" y2="${y(r * max)}" stroke="#27364d" stroke-dasharray="3 5"/><text x="${left - 8}" y="${y(r * max) + 4}" text-anchor="end">${esc(number(r * max))}${esc(unit)}</text>`).join('');
    const paths = fields.map((field, i) => {
      let continuous = false;
      const d = history.map((row, index) => { const v = row[field]; if (v === null || !Number.isFinite(v)) { continuous = false; return ''; } const command = continuous ? 'L' : 'M'; continuous = true; return `${command}${x(index).toFixed(2)},${y(v).toFixed(2)}`; }).join(' ');
      const lastIndex = history.findLastIndex(row => row[field] !== null && Number.isFinite(row[field]));
      const point = lastIndex >= 0 ? `<circle cx="${x(lastIndex)}" cy="${y(history[lastIndex][field])}" r="3" fill="${colors[i]}"/>` : '';
      return `<path d="${d}" fill="none" stroke="${colors[i]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${point}`;
    }).join('');
    const time = row => row ? new Date(row.at).toLocaleTimeString('pt-BR') : '';
    $(target).innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(labels.join(' e '))}"><title>${esc(labels.join(' e '))} · ${esc(time(history[0]))} a ${esc(time(history.at(-1)))}</title>${grid}${paths}<text x="${left}" y="${height - 3}">${esc(time(history[0]))}</text><text x="${width - right}" y="${height - 3}" text-anchor="end">${esc(time(history.at(-1)))}</text></svg><div class="chart-legend">${labels.map((label, i) => `<span>${i === 0 ? '●' : '◌'} ${esc(label)}: ${esc(number(history.at(-1)?.[fields[i]]))}${esc(unit)}</span>`).join('')}</div>`;
  }
  function render(data) {
    const { current, history } = data, t = current.totals, http = current.http;
    const warning = [current.dockerError, current.httpError, http?.reset ? 'O Traefik reiniciou: a taxa HTTP será retomada com novas amostras.' : ''].filter(Boolean).join('\n');
    $('#metrics-warning').hidden = !warning; $('#metrics-warning').textContent = warning;
    $('#metrics-updated').textContent = `Última amostra: ${new Date(current.at).toLocaleTimeString('pt-BR')} · intervalo ${number(data.intervalMs / 1000)}s · ${history.length}/${data.historyLimit} amostras`;
    $('#metrics-live').textContent = paused ? 'Atualização pausada' : warning ? 'Coleta parcial' : 'Monitoramento ativo';
    $('#metrics-live').className = `badge ${paused ? 'neutral' : warning ? 'warning' : 'good'}`;
    const cards = [
      [number(t?.cpuPercent) + (t?.cpuPercent === null || !t ? '' : '%'), 'CPU do projeto', `${number(t?.cpuCores, 2)} núcleos usados · host com ${number(current.host?.cpus, 0)}`],
      [bytes(t?.memoryBytes), 'Memória do projeto', `${number(t?.memoryPercent)}% de ${bytes(current.host?.memoryBytes)} no host`],
      [number(http?.requestsPerSecond, 2), 'Requisições / segundo', 'Diferença entre duas amostras HTTP'],
      [number(http?.total, 0), 'Requisições acumuladas', 'Desde a inicialização do Traefik'],
      [number(http?.meanLatencyMs) + (http?.meanLatencyMs == null ? '' : ' ms'), 'Latência média', 'Média no intervalo; não é percentil'],
      [number(http?.statuses?.['5xx'], 0), 'Respostas 5xx acumuladas', `${number(http?.errorsPerSecond, 2)} erros/s no intervalo`],
    ];
    $('#metrics-cards').innerHTML = cards.map(([value, label, detail]) => `<article class="stat"><div class="stat-label">${label}</div><div class="stat-value">${esc(value)}</div><div class="stat-foot">${esc(detail)}</div></article>`).join('');
    chart('#chart-cpu', history, ['cpu'], ['CPU'], '%'); chart('#chart-memory', history, ['memory'], ['RAM'], '%');
    chart('#chart-requests', history, ['requests'], ['Requisições/s']); chart('#chart-latency', history, ['latency'], ['Média'], 'ms');
    chart('#chart-network', history, ['rx', 'tx'], ['Entrada B/s', 'Saída B/s']);
    $('#metrics-containers').innerHTML = current.containers.length ? `<table><thead><tr><th>CONTAINER</th><th>CPU (% DE UM NÚCLEO)</th><th>MEMÓRIA / LIMITE</th><th>REDE ↓ / ↑</th><th>I/O LEITURA / ESCRITA</th><th>PIDS</th></tr></thead><tbody>${current.containers.map(c => `<tr><td><strong>${esc(c.name)}</strong><div class="service-container">${esc(c.id)}</div></td><td><span class="queue-count">${number(c.cpuPercent)}%</span></td><td>${bytes(c.memoryBytes)} / ${bytes(c.memoryLimitBytes)}<div class="muted">${number(c.memoryPercent)}% do limite</div></td><td>${bytes(c.rxPerSecond)}/s / ${bytes(c.txPerSecond)}/s<div class="muted">Total: ${bytes(c.rxBytes)} / ${bytes(c.txBytes)}</div></td><td>${bytes(c.readBytes)} / ${bytes(c.writeBytes)}</td><td>${number(c.pids, 0)}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">${esc(current.dockerError || 'Nenhum container em execução para coletar.')}</p>`;
    const routes = http?.routes || [];
    const appName = router => { const id = router.startsWith('app2-') ? 'app2' : router.startsWith('app3-') ? 'app3' : router.startsWith('app-') ? 'main' : null; return getApps().find(a => a.id === id)?.name || router; };
    $('#metrics-routes').innerHTML = routes.length ? `<table><thead><tr><th>APLICAÇÃO / ROTA</th><th>REQUISIÇÕES</th><th>RESPOSTAS 5xx</th></tr></thead><tbody>${routes.map(r => `<tr><td>${esc(appName(r.name))}<div class="muted small-text">${esc(r.name)}</div></td><td>${number(r.requests, 0)}</td><td>${number(r.errors, 0)}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">${esc(current.httpError || 'As rotas aparecerão após receberem tráfego pelo Traefik.')}</p>`;
  }
  async function refresh(force = false) {
    if (busy || !getApps().length || $('#view-metrics').hidden || document.hidden || (paused && !force)) return;
    busy = true; $('#metrics-refresh').disabled = true;
    try { last = await api('/metrics'); interval = last.intervalMs; render(last); }
    catch (error) { $('#metrics-warning').hidden = false; $('#metrics-warning').textContent = error.message; $('#metrics-live').textContent = 'Coleta indisponível'; }
    finally { busy = false; $('#metrics-refresh').disabled = false; clearTimeout(timer); timer = setTimeout(() => refresh(), interval); }
  }
  document.querySelector('[data-tab=metrics]').addEventListener('click', () => { clearTimeout(timer); setTimeout(() => refresh(), 0); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  $('#metrics-refresh').addEventListener('click', () => refresh(true));
  $('#metrics-pause').addEventListener('click', () => { paused = !paused; $('#metrics-pause').textContent = paused ? 'Retomar atualização' : 'Pausar atualização'; if (last) render(last); if (!paused) refresh(); });
}
