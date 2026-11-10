export function byteSize(value) {
  const match = String(value).trim().match(/^([\d.]+)\s*(B|kB|KB|KiB|MB|MiB|GB|GiB|TB|TiB)?$/i);
  if (!match) return null;
  const unit = (match[2] || 'B').toLowerCase();
  const multiplier = { b: 1, kb: 1e3, kib: 1024, mb: 1e6, mib: 1024 ** 2, gb: 1e9, gib: 1024 ** 3, tb: 1e12, tib: 1024 ** 4 }[unit];
  const result = Number(match[1]) * multiplier;
  return Number.isFinite(result) ? result : null;
}
export function parseDockerStats(text) {
  return text.trim().split('\n').filter(Boolean).map(line => {
    const row = JSON.parse(line), memory = (row.MemUsage || '').split('/'), network = (row.NetIO || '').split('/'), io = (row.BlockIO || '').split('/');
    return { id: row.ID || row.Container, name: row.Name || row.Container, cpuPercent: Number.parseFloat(row.CPUPerc) || 0, memoryBytes: byteSize(memory[0]), memoryLimitBytes: byteSize(memory[1]), memoryPercent: Number.parseFloat(row.MemPerc) || 0, rxBytes: byteSize(network[0]), txBytes: byteSize(network[1]), readBytes: byteSize(io[0]), writeBytes: byteSize(io[1]), pids: Number.parseInt(row.PIDs) || 0 };
  });
}
export function parsePrometheus(text) {
  const metrics = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([a-zA-Z_:][\w:]*)(?:\{(.*)\})?\s+([\d.eE+-]+)(?:\s+\d+)?$/);
    if (!match || !Number.isFinite(Number(match[3]))) continue;
    const labels = {};
    for (const label of (match[2] || '').matchAll(/(\w+)="((?:\\.|[^"\\])*)"/g)) labels[label[1]] = label[2].replace(/\\n/g, '\n').replace(/\\(["\\])/g, '$1');
    metrics.push({ name: match[1], labels, value: Number(match[3]) });
  }
  const web = metrics.filter(m => ['web', 'websecure'].includes(m.labels.entrypoint));
  const requests = web.filter(m => m.name === 'traefik_entrypoint_requests_total');
  const sum = items => items.reduce((total, m) => total + m.value, 0);
  const statuses = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 };
  for (const request of requests) { const group = /^[2345]\d\d$/.test(request.labels.code || '') ? request.labels.code[0] + 'xx' : 'other'; statuses[group] += request.value; }
  const routes = new Map();
  for (const item of metrics.filter(m => m.name === 'traefik_router_requests_total' && !m.labels.router?.endsWith('@internal'))) {
    const name = item.labels.router || 'Sem identificação';
    const current = routes.get(name) || { name, requests: 0, errors: 0 }; current.requests += item.value;
    if (/^5/.test(item.labels.code)) current.errors += item.value;
    routes.set(name, current);
  }
  return { total: sum(requests), statuses, durationSum: sum(web.filter(m => m.name === 'traefik_entrypoint_request_duration_seconds_sum')), durationCount: sum(web.filter(m => m.name === 'traefik_entrypoint_request_duration_seconds_count')), routes: [...routes.values()], processStartedAt: metrics.find(m => m.name === 'process_start_time_seconds')?.value ?? null };
}
export function httpDelta(current, previous, seconds) {
  const reset = previous && (current.total < previous.total || (current.processStartedAt !== null && previous.processStartedAt !== null && current.processStartedAt !== previous.processStartedAt));
  if (!previous || reset || seconds <= 0) return { requestsPerSecond: null, meanLatencyMs: null, errorsPerSecond: null, reset: !!reset };
  const count = current.durationCount - previous.durationCount, duration = current.durationSum - previous.durationSum;
  return { requestsPerSecond: (current.total - previous.total) / seconds, errorsPerSecond: Math.max(0, current.statuses['5xx'] - previous.statuses['5xx']) / seconds, meanLatencyMs: count > 0 && duration >= 0 ? duration / count * 1000 : null, reset: false };
}
export function createMetricsCollector({ docker, composeConfig, fetcher = fetch, intervalMs = 5000, historyLimit = 120, metricsUrl = 'http://traefik:8082/metrics' }) {
  const interval = Math.max(3000, Math.min(60000, Number(intervalMs) || 5000));
  let pending = null, cached = null, history = [], previousHttp = null, previousContainers = new Map(), previousAt = 0, host = null;
  async function collect() {
    const definition = await composeConfig();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(definition.name)) throw new Error('Projeto inválido.');
    const ids = (await docker(['ps', '-q', '--filter', `label=com.docker.compose.project=${definition.name}`])).trim().split(/\s+/).filter(Boolean);
    const [statsResult, httpResult, hostResult] = await Promise.allSettled([
      ids.length ? docker(['stats', '--no-stream', '--format', '{{json .}}', ...ids], { timeout: 10000 }) : Promise.resolve(''),
      fetcher(metricsUrl, { signal: AbortSignal.timeout(4000) }).then(async response => { if (!response.ok) throw new Error('Endpoint de métricas indisponível.'); const body = await response.text(); if (body.length > 4 * 1024 * 1024) throw new Error('Métricas excederam o limite de leitura.'); return parsePrometheus(body); }),
      host ? Promise.resolve(host) : docker(['info', '--format', '{"cpus":{{.NCPU}},"memoryBytes":{{.MemTotal}}}'], { timeout: 5000 }).then(JSON.parse),
    ]);
    if (hostResult.status === 'fulfilled') host = hostResult.value;
    const at = Date.now(), seconds = previousAt ? (at - previousAt) / 1000 : 0;
    const containers = statsResult.status === 'fulfilled' ? parseDockerStats(statsResult.value) : [];
    let rx = 0, tx = 0, baseline = false;
    for (const container of containers) {
      const old = previousContainers.get(container.id);
      container.rxPerSecond = old && seconds > 0 && container.rxBytes >= old.rxBytes ? (container.rxBytes - old.rxBytes) / seconds : null;
      container.txPerSecond = old && seconds > 0 && container.txBytes >= old.txBytes ? (container.txBytes - old.txBytes) / seconds : null;
      if (container.rxPerSecond !== null) { rx += container.rxPerSecond; tx += container.txPerSecond || 0; baseline = true; }
    }
    const totalCpu = containers.reduce((sum, c) => sum + c.cpuPercent, 0), memoryBytes = containers.reduce((sum, c) => sum + (c.memoryBytes || 0), 0);
    const totals = { cpuPercent: host?.cpus ? totalCpu / host.cpus : null, cpuCores: totalCpu / 100, memoryBytes, memoryPercent: host?.memoryBytes ? memoryBytes / host.memoryBytes * 100 : null, pids: containers.reduce((sum, c) => sum + c.pids, 0), rxPerSecond: baseline ? rx : null, txPerSecond: baseline ? tx : null };
    let http = null;
    if (httpResult.status === 'fulfilled') { http = { ...httpResult.value, ...httpDelta(httpResult.value, previousHttp, seconds) }; previousHttp = httpResult.value; }
    else previousHttp = null;
    const current = { at, host, containers, totals: statsResult.status === 'fulfilled' ? totals : null, http, dockerError: statsResult.status === 'rejected' ? 'Falha na coleta Docker. Tente atualizar.' : null, httpError: httpResult.status === 'rejected' ? 'Métricas HTTP indisponíveis. Recrie o Traefik com a configuração de métricas e verifique sua rede.' : null };
    history.push({ at, cpu: current.totals?.cpuPercent ?? null, memory: current.totals?.memoryPercent ?? null, requests: http?.requestsPerSecond ?? null, latency: http?.meanLatencyMs ?? null, rx: current.totals?.rxPerSecond ?? null, tx: current.totals?.txPerSecond ?? null });
    history = history.slice(-historyLimit);
    previousContainers = new Map(containers.map(c => [c.id, c])); previousAt = at;
    cached = { current, history, intervalMs: interval, historyLimit };
    return cached;
  }
  return async () => {
    if (cached && Date.now() - cached.current.at < interval) return cached;
    if (!pending) pending = collect().finally(() => { pending = null; });
    return pending;
  };
}
