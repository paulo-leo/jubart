"""Read-only Linux/Docker monitoring for the host CLI; standard library only."""
from collections import deque
from datetime import datetime
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import termios
import time
import tty
import unicodedata
from jubart_terminal import Viewport, table_lines


# Reuse the panel's parser and its internal endpoint without publishing a port.
HTTP_PROBE = """import {parsePrometheus} from '/opt/panel/metrics.mjs';
const r = await fetch('http://traefik:' + (process.env.TRAEFIK_METRICS_PORT || '8082') + '/metrics', {signal: AbortSignal.timeout(3000)});
if (!r.ok) throw Error('metrics');
const body = await r.text();
if (body.length > 4 * 1024 * 1024) throw Error('size');
console.log(JSON.stringify(parsePrometheus(body)));
"""


def number(value):
    try:
        result = float(str(value).strip().removesuffix('%'))
        return result if math.isfinite(result) and result >= 0 else None
    except (TypeError, ValueError):
        return None


def byte_size(value):
    match = re.fullmatch(r'\s*([\d.]+)\s*(B|[KMGT]i?B)?\s*', str(value), re.I)
    if not match:
        return None
    amount, unit = number(match[1]), (match[2] or 'B').lower()
    power = 'bkmgt'.index(unit[0])
    return amount * (1024 if 'i' in unit else 1000) ** power if amount is not None else None


def human_bytes(value):
    if value is None:
        return '—'
    for unit in ('B', 'KiB', 'MiB', 'GiB', 'TiB'):
        if value < 1024 or unit == 'TiB':
            return f'{value:.1f} {unit}' if unit != 'B' else f'{value:.0f} B'
        value /= 1024


def percent(value):
    return f'{value:.1f}%' if value is not None else '—'


def rate(current, previous, seconds):
    if current is None or previous is None or current < previous or seconds <= 0:
        return None
    return (current - previous) / seconds


def parse_stats(raw, services):
    rows = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        identity = item.get('ID') or item.get('Container', '')
        service = next((service for full, service in services.items() if full.startswith(identity)), None) if identity else None
        if service is None:
            raise ValueError('Container fora da seleção de métricas.')
        memory = str(item.get('MemUsage', '')).split('/')
        network = str(item.get('NetIO', '')).split('/')
        rows.append({'id': next(full for full in services if full.startswith(identity)), 'service': service,
                     'name': item.get('Name', identity), 'cpu': number(item.get('CPUPerc')),
                     'memory': byte_size(memory[0]), 'limit': byte_size(memory[1]) if len(memory) == 2 else None,
                     'memory_percent': number(item.get('MemPerc')), 'pids': number(item.get('PIDs')),
                     'rx': byte_size(network[0]), 'tx': byte_size(network[1]) if len(network) == 2 else None})
    if len(rows) != len(services) or {row['id'] for row in rows} != set(services):
        raise ValueError('Coleta Docker incompleta; aguarde a próxima amostra.')
    return sorted(rows, key=lambda row: (row['service'], row['name']))


class Collector:
    def __init__(self, root, compose, service=None, interface=None, host_only=False, http=False, proc=None, network=True):
        self.root, self.compose = root, compose
        self.proc = Path(proc) if proc is not None else Path('/run/jubart-host/proc' if os.environ.get('JUBART_CONTAINER') == '1' else '/proc')
        self.service, self.interface, self.host_only, self.http = service, interface, host_only, http
        self.network = network
        self.previous_host = None
        self.previous_containers = {}
        self.previous_http = None
        self.history = deque(maxlen=60)

    def host(self):
        host = {'at': time.monotonic(), 'cpus': os.cpu_count() or 1, 'errors': []}
        try:
            fields = next(line.split()[1:] for line in (self.proc / 'stat').read_text().splitlines() if line.startswith('cpu '))
            ticks = [int(value) for value in fields[:8]]  # Guest time is already included in user/nice.
            host['ticks'], host['idle'] = sum(ticks), ticks[3] + ticks[4]
            old = self.previous_host
            if old and 'ticks' in old and host['ticks'] > old['ticks']:
                host['cpu'] = max(0, min(100, (1 - (host['idle'] - old['idle']) / (host['ticks'] - old['ticks'])) * 100))
        except (OSError, ValueError, IndexError, StopIteration):
            host['errors'].append('CPU do host indisponível em /proc/stat.')
        try:
            memory = {key: int(value.split()[0]) * 1024 for line in (self.proc / 'meminfo').read_text().splitlines()
                      for key, value in [line.split(':', 1)]}
            total = memory['MemTotal']
            available = memory.get('MemAvailable', sum(memory.get(key, 0) for key in ('MemFree', 'Buffers', 'Cached', 'SReclaimable')) - memory.get('Shmem', 0))
            if total <= 0:
                raise ValueError()
            used = total - max(0, min(total, available))
            host.update(memory=used, memory_total=total, memory_available=total-used, memory_percent=used/total*100,
                        swap_total=memory.get('SwapTotal', 0), swap=memory.get('SwapTotal', 0)-memory.get('SwapFree', 0))
        except (OSError, ValueError, KeyError, IndexError):
            host['errors'].append('Memória do host indisponível em /proc/meminfo.')
        try:
            disk = shutil.disk_usage(self.root)
            host.update(disk=disk.used, disk_total=disk.total, disk_percent=disk.used/disk.total*100)
        except (OSError, ZeroDivisionError):
            host['errors'].append('Espaço do sistema de arquivos da instalação indisponível.')
        try:
            host['uptime'] = float((self.proc / 'uptime').read_text().split()[0])
            host['load'] = [float(value) for value in (self.proc / 'loadavg').read_text().split()[:3]]
        except (OSError, ValueError, IndexError):
            host['errors'].append('Uptime/carga do host indisponíveis.')
        if not self.network:
            self.previous_host = host
            return host
        try:
            counters = {}
            for line in (self.proc / 'net/dev').read_text().splitlines()[2:]:
                name, values = line.split(':', 1)
                fields = values.split()
                counters[name.strip()] = (int(fields[0]), int(fields[8]))
            if self.interface:
                if self.interface not in counters:
                    raise ValueError()
                names = [self.interface]
            else:
                # Prefer default-route interfaces to avoid counting bridge/veth traffic twice.
                try:
                    names = sorted({fields[0] for line in (self.proc / 'net/route').read_text().splitlines()[1:]
                                    if len(fields := line.split()) >= 4 and fields[1] == '00000000' and int(fields[3], 16) & 1
                                    and fields[0] in counters})
                except (OSError, ValueError):
                    names = []
                if not names:
                    names = [name for name in counters if name != 'lo' and not name.startswith(('veth', 'br-', 'docker', 'virbr'))]
            if not names:
                raise ValueError()
            host['network'] = {name: counters[name] for name in names}
            old = self.previous_host
            for index, key in enumerate(('rx', 'tx')):
                host[key] = sum(values[index] for values in host['network'].values()) if names else None
                rates = [rate(values[index], old.get('network', {}).get(name, (None, None))[index], host['at']-old['at'])
                         for name, values in host['network'].items()] if old else []
                host[key+'_rate'] = sum(value for value in rates if value is not None) if any(value is not None for value in rates) else None
        except (OSError, ValueError, IndexError):
            host['errors'].append('Interface não encontrada: ' + self.interface if self.interface else 'Rede do host indisponível em /proc/net/dev.')
        self.previous_host = host
        return host

    def containers(self):
        raw = self.compose(self.root, ['ps', '--status', 'running', '--format', 'json', *([self.service] if self.service else [])], 10)
        items = json.loads(raw) if raw.strip().startswith('[') else [json.loads(line) for line in raw.splitlines() if line.strip()]
        if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
            raise ValueError('Seleção Docker inválida.')
        services = {}
        for item in items:
            identity = item['ID']
            if not re.fullmatch(r'[a-f0-9]{6,64}', identity):
                raise ValueError('Identificador Docker inválido.')
            services[identity] = item['Service']
        # Never call docker stats with an empty selection (it would monitor every project).
        if not services:
            self.previous_containers = {}
            return []
        result = subprocess.run(['docker', 'stats', '--no-stream', '--format', '{{json .}}', *services],
                                cwd=self.root, capture_output=True, text=True, timeout=12)
        if result.returncode:
            raise ValueError('Métricas Docker indisponíveis. Confira permissões e o daemon Docker.')
        rows, at = parse_stats(result.stdout, services), time.monotonic()
        for row in rows:
            old = self.previous_containers.get(row['id'])
            for key in ('rx', 'tx'):
                row[key+'_rate'] = rate(row[key], old[key], at-old['at']) if old else None
            row['at'] = at
        self.previous_containers = {row['id']: row for row in rows}
        return rows

    def http_metrics(self):
        raw = self.compose(self.root, ['exec', '-T', 'panel', 'node', '--input-type=module', '-e', HTTP_PROBE], 7)
        current, at = json.loads(raw), time.monotonic()
        if not isinstance(current, dict) or any(number(current.get(key)) is None for key in ('total', 'durationSum', 'durationCount')):
            raise ValueError('Métricas HTTP inválidas.')
        old = self.previous_http
        reset = old and (current['total'] < old['total'] or current.get('processStartedAt') != old.get('processStartedAt'))
        current['requests_rate'], current['latency'] = None, None
        if old and not reset:
            current['requests_rate'] = rate(current['total'], old['total'], at-old['at'])
            count, duration = current['durationCount']-old['durationCount'], current['durationSum']-old['durationSum']
            current['latency'] = duration/count*1000 if count > 0 and duration >= 0 else None
        current['at'] = at
        self.previous_http = current
        return current

    def collect(self):
        snapshot = {'host': self.host(), 'containers': None, 'http': None, 'errors': [], 'time': datetime.now().strftime('%H:%M:%S')}
        if not self.host_only:
            try:
                snapshot['containers'] = self.containers()
            except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
                self.previous_containers = {}
                snapshot['errors'].append('Coleta Docker indisponível. Confira jubart status e as permissões do Docker.')
            if self.http:
                try:
                    snapshot['http'] = self.http_metrics()
                except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
                    self.previous_http = None
                    snapshot['errors'].append('HTTP indisponível: confira se panel e Traefik estão ativos e as métricas habilitadas.')
        self.history.append({'cpu': snapshot['host'].get('cpu'), 'memory': snapshot['host'].get('memory_percent'),
                             'rx': snapshot['host'].get('rx_rate'), 'tx': snapshot['host'].get('tx_rate'),
                             'http': snapshot['http'].get('requests_rate') if snapshot['http'] else None})
        return snapshot


def health_issues(host):
    issues = list(host['errors'])
    for key, label in [('cpu', 'CPU'), ('memory_percent', 'RAM'), ('disk_percent', 'Disco da instalação')]:
        if host.get(key, 0) >= 90:
            issues.append(f'{label} em {host[key]:.1f}% (limiar de atenção: 90%).')
    if host.get('swap_total') and host.get('swap', 0)/host['swap_total'] >= .8:
        issues.append('Swap em pelo menos 80% de uso.')
    if host.get('load') and host['load'][0] > host['cpus']:
        issues.append('Carga de 1 minuto acima do número de CPUs; confira processos e I/O.')
    return issues


def bar(value, width=18):
    if value is None:
        return '[' + ' ' * width + '] —'
    count = round(max(0, min(100, value))/100*width)
    return '[' + '█'*count + '░'*(width-count) + '] ' + percent(value)


def spark(values, width, ceiling=None):
    values = list(values)[-width:]
    maximum = ceiling or max((value for value in values if value is not None), default=1) or 1
    return ''.join(' ' if value is None else '▁▂▃▄▅▆▇█'[min(7, int(value/maximum*7))] for value in values).rjust(width)


def clean(text):
    return re.sub(r'[\x00-\x1f\x7f-\x9f]', '', str(text))


def fit(text, width):
    result, used = '', 0
    for character in clean(text):
        cells = 0 if unicodedata.combining(character) else 2 if unicodedata.east_asian_width(character) in 'WF' else 1
        if used + cells > width:
            break
        result, used = result + character, used + cells
    return result


def table(headers, rows, width=120, shrink=(0,)):
    return table_lines(headers, [[clean(value) for value in row] for row in rows], width, indent=0, boxed=False)


def render(snapshot, history, mode, host_only=False, service=None, width=120, compact=False):
    host, containers, http = snapshot['host'], snapshot['containers'], snapshot['http']
    titles = {'server': 'Saúde do servidor', 'memory': 'Memória do host e dos containers',
              'monitor': 'Monitor ao vivo', 'traffic': 'Tráfego ao vivo'}
    lines = [f'JUBART · {titles[mode]} · {snapshot["time"]}', '']
    bar_width = max(6, width-56)
    errors = (list(host['errors']) if mode != 'server' else []) + snapshot['errors']
    lines += ['! '+error for error in errors]
    if mode != 'traffic':
        lines += ['HOST (máquina onde a CLI está executando)']
        if mode != 'memory':
            lines.append('CPU   ' + bar(host.get('cpu'), bar_width) + f'  CPUs: {host["cpus"]}')
        lines += ['RAM   ' + bar(host.get('memory_percent'), bar_width) + '  ' + human_bytes(host.get('memory')) + ' / ' + human_bytes(host.get('memory_total')),
                  'Swap  ' + human_bytes(host.get('swap')) + ' / ' + human_bytes(host.get('swap_total')) +
                  '  | RAM disponível: ' + human_bytes(host.get('memory_available'))]
        if mode in ('server', 'monitor'):
            uptime = host.get('uptime')
            elapsed = f'{int(uptime)//86400}d {int(uptime)//3600%24:02d}h {int(uptime)//60%60:02d}m' if uptime is not None else '—'
            load = ' / '.join(f'{value:.2f}' for value in host['load']) if host.get('load') else '—'
            lines += ['Disco ' + bar(host.get('disk_percent'), bar_width) + '  ' + human_bytes(host.get('disk')) + ' / ' + human_bytes(host.get('disk_total')),
                      f'Uptime: {elapsed}  | Carga 1/5/15 min: {load}']
        if mode == 'server':
            issues = health_issues(host)
            lines += ['', 'ATENÇÃO' if issues else 'Recursos dentro dos limiares de atenção.', *['  ! '+issue for issue in issues],
                      'Disco: sistema de arquivos da instalação. Use health para verificar os serviços.']
    if mode in ('monitor', 'traffic'):
        names = ', '.join(host.get('network', {})) or 'indisponíveis'
        lines += ['', 'REDE DO HOST · interfaces: ' + names,
                  'Entrada (RX): ' + human_bytes(host.get('rx_rate')) + '/s  | Saída (TX): ' + human_bytes(host.get('tx_rate')) + '/s',
                  'Acumulado RX: ' + human_bytes(host.get('rx')) + '  | TX: ' + human_bytes(host.get('tx'))]
    if len(history) > 1 and (not compact or mode == 'traffic'):
        graph_width = max(8, width-12)
        keys = [('cpu', 'CPU host', 100), ('memory', 'RAM host', 100)] if mode != 'traffic' else []
        if mode in ('monitor', 'traffic'):
            keys += [('rx', 'RX host', None), ('tx', 'TX host', None)]
        if keys:
            lines += ['', 'HISTÓRICO · até 60 amostras (rede com escala automática)']
            lines += [label.ljust(12) + spark((item[key] for item in history), graph_width, ceiling) for key, label, ceiling in keys]
    if mode in ('monitor', 'traffic') and not host_only:
        lines += ['', 'HTTP/HTTPS · Traefik · todas as aplicações (não filtrado por serviço)']
        if http:
            requests = f'{http["requests_rate"]:.2f}' if http.get('requests_rate') is not None else '—'
            latency = f'{http["latency"]:.1f} ms' if http.get('latency') is not None else '—'
            lines += [f'Requisições/s: {requests}  | Latência média: {latency}  | Total: {http["total"]:g}',
                      'Respostas acumuladas: ' + '  '.join(f'{key}: {http.get("statuses", {}).get(key, 0):g}' for key in ('2xx', '3xx', '4xx', '5xx'))]
            if len(history) > 1 and not compact:
                lines.append('HTTP req/s  ' + spark((item['http'] for item in history), max(8, width-12)))
    if not host_only:
        lines += ['', 'CONTAINERS DESTA INSTALAÇÃO' + (' · serviço: ' + service if service else '')]
        if containers is None:
            lines.append('Métricas indisponíveis nesta amostra.')
        elif not containers:
            lines.append('Nenhum container em execução na seleção.')
        else:
            if mode == 'memory':
                headers = ('Serviço', 'Container', 'RAM usada / limite', 'RAM %', 'PIDs')
                rows = [(row['service'], row['name'], human_bytes(row['memory'])+' / '+human_bytes(row['limit']),
                         percent(row['memory_percent']), f'{row["pids"]:g}' if row['pids'] is not None else '—') for row in containers]
            elif mode == 'traffic':
                headers = ('Serviço / container', 'RX/s', 'TX/s', 'RX acumulado', 'TX acumulado')
                rows = [(row['service']+' / '+row['name'], human_bytes(row['rx_rate']), human_bytes(row['tx_rate']),
                         human_bytes(row['rx']), human_bytes(row['tx'])) for row in containers]
            else:
                headers = ('Serviço / container', 'CPU %', 'RAM usada / limite', 'RX/s', 'TX/s')
                rows = [(row['service']+' / '+row['name'], percent(row['cpu']),
                         human_bytes(row['memory'])+' / '+human_bytes(row['limit']), human_bytes(row['rx_rate']), human_bytes(row['tx_rate'])) for row in containers]
            lines += table(headers, rows, width, (0, 1) if mode == 'memory' else (0,))
            memories = [row['memory'] for row in containers]
            lines.append('RAM total da seleção: ' + (human_bytes(sum(memories)) if all(value is not None for value in memories) else 'indisponível'))
    if compact and mode in ('monitor', 'memory') and len(history) > 1:
        lines.insert(6, 'CPU ' + spark((item['cpu'] for item in history), 15, 100) + '  RAM ' + spark((item['memory'] for item in history), 15, 100))
    if mode in ('monitor', 'traffic'):
        lines += ['— = indisponível ou aguardando duas amostras. RX/TX inclui tráfego interno.',
                  'CPU Docker: 100% = um núcleo. RAM Docker usa a medição de docker stats.']
    if compact:
        lines = [line for line in lines if line and not line.startswith(('Acumulado RX:', 'Swap  ', 'Disco ', 'Uptime:', 'Respostas acumuladas:', 'CPU Docker:'))]
    return lines


def run(root, compose, args, style=lambda text, tone: text):
    mode = args.command
    if not math.isfinite(args.interval) or not 1 <= args.interval <= 60:
        raise ValueError('--interval deve estar entre 1 e 60 segundos.')
    service, interface = getattr(args, 'service', None), getattr(args, 'interface', None)
    if service and not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]*', service):
        raise ValueError('--service deve ser um nome de serviço Compose; consulte status.')
    if interface and not re.fullmatch(r'[a-zA-Z0-9_.:@-]{1,64}', interface):
        raise ValueError('--interface deve ser o nome de uma interface do host.')
    host_only = mode == 'server' or getattr(args, 'host_only', False)
    if host_only and service:
        raise ValueError('--service não pode ser usado junto com --host-only.')
    collector = Collector(root, compose, service, interface, host_only, mode in ('monitor', 'traffic'), network=mode in ('monitor', 'traffic'))
    live = getattr(args, 'watch', False) or (mode in ('monitor', 'traffic') and not args.once)
    interactive = sys.stdin.isatty() and sys.stdout.isatty() and os.environ.get('TERM') != 'dumb'
    # Redirected output is a finite snapshot, suitable for scripts and logs.
    live = live and interactive
    descriptor, previous, viewport = None, None, None
    snapshot = None
    try:
        if live:
            descriptor = sys.stdin.fileno()
            previous = termios.tcgetattr(descriptor)
            tty.setcbreak(descriptor, termios.TCSANOW)
            viewport = Viewport('JUBART · '+{'server': 'Saúde do servidor', 'memory': 'Memória', 'monitor': 'Monitor ao vivo', 'traffic': 'Tráfego ao vivo'}[mode],
                                footer='q ou Ctrl+C: voltar | PgUp/PgDn: rolar')
            viewport.enter()
        if not live and mode != 'memory':
            collector.collect()
            time.sleep(args.interval if mode in ('monitor', 'traffic') else .25)
        while True:
            started = time.monotonic()
            snapshot = collector.collect()
            history = tuple(collector.history)
            if viewport:
                viewport.blocks = [lambda columns, height: render(snapshot, history, mode, host_only, service, columns, compact=height < 32)[2:]]
                viewport.prompt = f'Atualização: {snapshot["time"]} | Intervalo mínimo: {args.interval:g}s'
                viewport.draw()
            elif callable(getattr(sys.stdout, 'render_metrics', None)):
                sys.stdout.render_metrics(snapshot, history, mode, host_only, service, render)
            else:
                lines = render(snapshot, history, mode, host_only, service, shutil.get_terminal_size((120, 40)).columns)
                for index, line in enumerate(lines):
                    tone = 'blue' if index == 0 else 'red' if line.startswith('!') else 'cyan' if line.isupper() else None
                    print(style(clean(line), tone) if tone else clean(line))
                sys.stdout.flush()
            if not live or viewport.wait(max(.05, args.interval-(time.monotonic()-started)), descriptor):
                break
    except KeyboardInterrupt:
        pass
    finally:
        if previous is not None:
            termios.tcsetattr(descriptor, termios.TCSADRAIN, previous)
        if viewport:
            viewport.leave()
    if live:
        print('Monitoramento encerrado.')
        return 0
    if snapshot is None:
        return 130
    return int(bool(health_issues(snapshot['host']) if mode == 'server' else snapshot['errors'] or snapshot['host']['errors']))
