#!/usr/bin/env python3
"""Host CLI for Jubart. Standard library only; never source .env as shell code."""
import argparse
import codecs
from datetime import datetime, timezone
import getpass
import http.client
import ipaddress
import socket
import ssl
import time
import json
import os
from pathlib import Path
import re
import select
import shlex
import shutil
import subprocess
import sys
import tempfile
import termios
import tty
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import jubart_metrics
import jubart_automation
import jubart_databases
import jubart_proxies
import jubart_terminal as terminal

ROOT = Path(__file__).resolve().parent.parent
SCREEN = None

def read_env(root):
    try:
        text = (root / '.env').read_text()
    except FileNotFoundError:
        raise ValueError('Instalação não preparada. Execute ./install.sh na raiz do Jubart.')
    values = {}
    for line in text.splitlines():
        match = re.match(r'^([A-Z][A-Z0-9_]*)=(.*)$', line)
        if match:
            value = match[2].strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[match[1]] = value
    return text, values

def safe(value):
    return re.sub(r'[\x00-\x1f\x7f-\x9f]', '', str(value))

def compose(root, args, timeout=30, input=None):
    try:
        result = subprocess.run(['docker', 'compose', *args], cwd=root, capture_output=True,
                                text=True, timeout=timeout, input=input)
    except (OSError, subprocess.TimeoutExpired):
        raise ValueError('Docker Compose indisponível ou demorou para responder. Verifique Docker e as permissões do usuário.')
    if result.returncode:
        diagnostic = result.stderr.lower()
        if 'permission denied' in diagnostic and ('docker.sock' in diagnostic or 'docker daemon socket' in diagnostic):
            raise ValueError('Sem permissão para acessar o Docker. Seu usuário precisa de acesso ao grupo docker; após a liberação, encerre a sessão e entre novamente. Para conferir agora, execute sudo docker compose ps na pasta do projeto.')
        if 'cannot connect to the docker daemon' in diagnostic or 'is the docker daemon running' in diagnostic:
            raise ValueError('O daemon Docker não está disponível. Inicie o serviço Docker e tente novamente.')
        raise ValueError('Docker Compose não concluiu a operação. Verifique a configuração com docker compose config --quiet na pasta do projeto.')
    return result.stdout

def running_services(root):
    raw = compose(root, ['ps', '--all', '--format', 'json'])
    try:
        rows = json.loads(raw) if raw.strip().startswith('[') else [json.loads(line) for line in raw.splitlines() if line.strip()]
        if not isinstance(rows, list):
            raise ValueError()
        result = []
        for row in rows:
            item = {k: safe(row.get(k, '')) for k in ['Service', 'Name', 'State', 'Health']}
            item['ID'] = safe(row.get('ID', ''))
            item['ports'] = ', '.join(f"{safe(p.get('URL', ''))}:{int(p['PublishedPort'])}→{int(p['TargetPort'])}/{safe(p.get('Protocol', 'tcp'))}" for p in (row.get('Publishers') or []) if p.get('PublishedPort'))
            bindings = {}
            for published in row.get('Publishers') or []:
                key = str(int(published['TargetPort']))+'/'+published.get('Protocol', 'tcp')
                bindings.setdefault(key, [])
                if published.get('PublishedPort'):
                    bindings[key].append({'HostIp': published.get('URL', ''), 'HostPort': str(int(published['PublishedPort']))})
            item['container_ports'], item['host_ports'] = format_service_ports(bindings)
            if not bindings:
                item['container_ports'] = None
            result.append(item)
        return result
    except (ValueError, TypeError, AttributeError, KeyError):
        raise ValueError('Resposta de estado inválida do Docker Compose.')


def format_service_ports(bindings, exposed=None):
    """Keep the same mapping order in the container and host columns."""
    if not isinstance(bindings, dict) or not isinstance(exposed or {}, dict):
        raise ValueError('Resposta de portas inválida do Docker.')
    pairs = []
    for port in sorted(set(bindings) | set(exposed or {})):
        match = re.fullmatch(r'([0-9]{1,5})/(tcp|udp|sctp)', port)
        if not match or not 1 <= int(match[1]) <= 65535:
            raise ValueError('Resposta de portas inválida do Docker.')
        targets = bindings.get(port) or []
        if not isinstance(targets, list):
            raise ValueError('Resposta de portas inválida do Docker.')
        if not targets:
            pairs.append((port, 'não publicada'))
        for target in targets:
            host_port = int(target['HostPort'])
            if not 1 <= host_port <= 65535:
                raise ValueError('Resposta de portas inválida do Docker.')
            host_ip = safe(target.get('HostIp', ''))
            if ':' in host_ip:
                host_ip = '['+host_ip+']'
            pairs.append((port, (host_ip+':' if host_ip else '')+str(host_port)))
    pairs = list(dict.fromkeys(pairs))
    return (', '.join(port for port, _ in pairs) or 'nenhuma',
            ('não publicada' if pairs and all(host == 'não publicada' for _, host in pairs) else ', '.join(host for _, host in pairs) or 'nenhuma'))


def service_ports(root, rows):
    """Read only port metadata of the containers selected by Compose."""
    identities = list(dict.fromkeys(row['ID'] for row in rows if re.fullmatch(r'[a-f0-9]{6,64}', row.get('ID', ''))))
    if not identities:
        return bool(rows)
    queried = set()
    template = '{"id":{{json .Id}},"ports":{{json (index .NetworkSettings "Ports")}},"exposed":{{json (index .Config "ExposedPorts")}}}'
    try:
        result = subprocess.run(['docker', 'inspect', '--type', 'container', '--format', template, *identities],
                                cwd=root, capture_output=True, text=True, timeout=15)
        for line in result.stdout.splitlines():
            try:
                item = json.loads(line)
                if not isinstance(item, dict) or not isinstance(item.get('id'), str) or 'ports' not in item or 'exposed' not in item:
                    continue
                ports, exposed = item.get('ports'), item.get('exposed')
                if ports is not None and not isinstance(ports, dict) or exposed is not None and not isinstance(exposed, dict):
                    continue
                container, host = format_service_ports(ports or {}, exposed or {})
                for row in rows:
                    if row.get('ID') in identities and item['id'].startswith(row['ID']):
                        row['container_ports'], row['host_ports'] = container, host
                        queried.add(row['ID'])
            except (ValueError, TypeError, KeyError):
                continue
    except (OSError, subprocess.TimeoutExpired):
        pass
    return any(row.get('ID') not in queried for row in rows)


def panel_info(env, host=None, ssh_user=None, ssh_port=22):
    port = int(env.get('PANEL_PORT', '9090'))
    bind = env.get('PANEL_BIND_ADDRESS', '127.0.0.1')
    local = bind == '127.0.0.1'
    proxy = env.get('PANEL_PROXY_ENABLED') == 'true'
    tls = env.get('PANEL_TLS_ENABLED') == 'true'
    direct = f'http://127.0.0.1:{port}' if local else f'http://IP_DO_SERVIDOR:{port}'
    info = {'publicacao': f'{bind}:{port}', 'direto': direct,
            'modo': 'HTTP local / túnel SSH para acesso remoto' if local else 'HTTP pela porta / rede',
            'cookie_seguro': env.get('PANEL_COOKIE_SECURE') == 'true'}
    if proxy:
        info['dominio'] = ('https' if tls else 'http') + '://' + env.get('PANEL_DOMAIN', '')
        info['modo'] = ('HTTPS' if tls else 'HTTP') + ' por domínio; ' + info['modo']
    if local:
        server = host or 'IP_DA_VPS'
        user = ssh_user or 'USUARIO_SSH'
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:-]*', server) or not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]*', user):
            raise ValueError('IP/host ou usuário SSH inválido.')
        info['tunnel'] = shlex.join(['ssh', '-N', '-L', f'{port}:127.0.0.1:{port}', '-p', str(ssh_port), f'{user}@{server}'])
    return info

def use_color(stream=None):
    stream = stream or sys.stdout
    return stream.isatty() and 'NO_COLOR' not in os.environ and os.environ.get('TERM') != 'dumb'


def styled(text, tone='blue', stream=None):
    tones = {'blue': '1;94', 'cyan': '96', 'green': '92', 'yellow': '93', 'red': '1;91', 'muted': '90', 'bold': '1'}
    return f"\033[{tones[tone]}m{text}\033[0m" if use_color(stream) else str(text)


def symbol(emoji, fallback='•'):
    return emoji if sys.stdout.isatty() and os.environ.get('TERM') != 'dumb' else fallback


def section(title, emoji='◆'):
    def lines(columns, height=0):
        return ['', *['  '+styled(part, 'bold') for part in terminal.wrap(symbol(emoji)+'  '+title, max(1, columns-2))],
                '  '+styled('─'*max(1, columns-2), 'muted')]
    if SCREEN:
        SCREEN.add(lines)
    else:
        print('\n'.join(lines(max(3, terminal.size().columns-1))))


def detail(label, value, tone='cyan'):
    print('  ' + styled(label + ': ', 'muted') + styled(safe(value), tone))


def terminal_logo(colored, frame=0, logo=None, compact=False):
    """Transparent whale rendered as half blocks; no imaging dependency at runtime."""
    logo = logo or json.loads(Path(__file__).with_name('cli-logo.json').read_text())
    palette = logo['palette']
    frames = logo.get('frames', [logo['rows']])
    rows = [[row[i:i+2] for i in range(0, len(row), 2)] for row in frames[frame % len(frames)]]
    if compact:
        rows = [row[::2] for row in rows[::2]]
    if len(rows) % 2:
        rows.append(['00'] * len(rows[0]))
    def color(token):
        value = palette[int(token, 16)]
        return tuple(int(value[i:i+2], 16) for i in (1, 3, 5)) if value else None
    def escape(rgb, background=False):
        return ('\033[' + ('48' if background else '38') + ';2;' + ';'.join(map(str, rgb)) + 'm') if rgb else ('\033[49m' if background else '\033[39m')
    def visible(rgb):
        return rgb and sum(c*w for c, w in zip(rgb, (.2126, .7152, .0722))) > 125
    lines = []
    for y in range(0, len(rows), 2):
        line = ''
        foreground = background = None
        for top, bottom in zip(rows[y], rows[y+1]):
            upper, lower = color(top), color(bottom)
            if colored:
                if upper is None and lower is None:
                    ink, paper, glyph = foreground, None, ' '
                else:
                    ink, paper, glyph = (lower, None, '▄') if upper is None else (upper, lower, '▀')
                if ink != foreground:
                    line += escape(ink)
                    foreground = ink
                if paper != background:
                    line += escape(paper, True)
                    background = paper
                line += glyph
            else:
                line += {(False, False): ' ', (True, False): '▀', (False, True): '▄', (True, True): '█'}[bool(visible(upper)), bool(visible(lower))]
        lines.append('  ' + line + ('\033[0m' if colored else ''))
    return '\n'.join(lines)


def brand_lines(version, frame=0, logo=None, size=None, compact=False, interactive=False):
    logo = logo or json.loads(Path(__file__).with_name('cli-logo.json').read_text())
    size = size or terminal.size()
    colored = use_color()
    compact = compact or size.columns < logo['width'] + 4
    identity = [styled('JUBART · ' + safe(version), 'blue'),
                styled('O controle da sua infraestrutura.', 'bold'), '',
                styled('Desenvolvedor', 'muted'), 'Paulo Leonardo da .S. Cassimiro', '',
                symbol('🧭') + '  Seus ambientes, em um só lugar.',
                'Comece com ' + styled('help' if interactive else 'jubart help', 'cyan')]
    lines = terminal_logo(colored, frame, logo, compact).splitlines()
    if size.columns >= 104 and sys.stdout.isatty():
        start = max(0, (len(lines) - len(identity)) // 2)
        return [line + '    ' + (identity[i-start] if start <= i < start+len(identity) else '')
                for i, line in enumerate(lines)]
    return [*lines, '', styled('  JUBART · ' + safe(version), 'blue'),
            '  O controle da sua infraestrutura.',
            '  Desenvolvedor: Paulo Leonardo da .S. Cassimiro',
            '  ' + symbol('🧭') + ' Digite ' + styled('help' if interactive else 'jubart help', 'cyan') + ' para conhecer os comandos.']


def print_brand(version):
    print('\n' + '\n'.join(brand_lines(version)))


def quick_command_lines(interactive=False):
    commands = [
        ('jubart status', 'Exibir a tabela de serviços, estado, saúde e portas'),
        ('jubart panel', 'Consultar endereços do painel e túnel SSH'),
        ('jubart http', 'Mudar o acesso do painel para HTTP por porta'),
        ('jubart ssh', 'Mudar o acesso do painel para túnel SSH'),
        ('jubart users', 'Listar usuários do painel, perfis e estado do acesso'),
        ('jubart certificates', 'Verificar validade e confiança dos certificados TLS'),
        ('jubart time', 'Consultar hora, fuso e sincronização do servidor'),
        ('jubart apps', 'Listar aplicações e domínios'),
        ('jubart proxies', 'Listar proxies, domínios, destinos e HTTPS'),
        ('jubart proxy show', 'Consultar todas as configurações de proxy e acesso'),
        ('jubart databases', 'Listar bancos MariaDB e PostgreSQL'),
        ('jubart database help', 'Consultar usuários, permissões e como acessar os bancos'),
        ('jubart app help', 'Ver comandos e flags para criar, atualizar e remover apps'),
        ('jubart exec APP', 'Abrir o shell no container pelo ID ou nome do app'),
        ('jubart dir APP', 'Abrir Bash na pasta do app no host pelo ID ou nome'),
        ('jubart health', 'Verificar a saúde dos serviços e pendências'),
        ('jubart server', 'Verificar a saúde e os recursos do servidor'),
        ('jubart memory', 'Ver a memória do host e dos containers'),
        ('jubart monitor', 'Acompanhar recursos e gráficos em tempo real'),
        ('jubart traffic', 'Acompanhar tráfego de rede e requisições HTTP'),
        ('jubart queues', 'Consultar filas, pendências e jobs reservados'),
        ('jubart workers', 'Consultar workers cadastrados e seus containers'),
        ('jubart jobs', 'Listar jobs cadastrados; --failed mostra falhas'),
        ('jubart schedules', 'Consultar agendadores e a agenda Laravel'),
        ('jubart site --all', 'Testar o acesso HTTP das aplicações habilitadas'),
        ('jubart help', 'Ver todos os comandos e opções'),
    ]
    if interactive:
        commands = [(command.removeprefix('jubart '), description) for command, description in commands]
        commands += [('clear', 'Limpar a tela e voltar às boas-vindas'), ('exit', 'Sair do console Jubart')]
    width = max(len(command) for command, _ in commands)
    rule_width = max(1, terminal.size().columns - 3)
    return ['', '  ' + styled(symbol('🧭') + '  Comandos rápidos', 'bold'),
            '  ' + styled('─' * rule_width, 'muted'),
            *['  ' + styled(command.ljust(width), 'cyan') + '  ' + description for command, description in commands], '']


def print_quick_commands():
    print('\n'.join(quick_command_lines()))


def display_width(text):
    return terminal.width(text)


def screen_welcome(version, frame=0):
    def layout(columns, height):
        if columns >= 110:
            left_width = 54
            brand = brand_lines(version, frame, size=os.terminal_size((left_width, height)), compact=height < 27, interactive=True)
            commands = quick_command_lines(interactive=True)
            right_width = max(1, columns-left_width-4)
            menu = []
            for line in commands:
                if terminal.ANSI.sub('', line).strip().startswith('─'):
                    menu.append(styled('─'*right_width, 'muted'))
                else:
                    menu += terminal.wrap(line.lstrip(), right_width)
            return [terminal.pad(brand[index] if index < len(brand) else '', left_width)+'    '+(menu[index] if index < len(menu) else '')
                    for index in range(max(len(brand), len(menu)))]
        brand = brand_lines(version, frame, size=os.terminal_size((columns, height)), compact=True, interactive=True)
        if height < 30:
            brand = [styled('  JUBART · '+safe(version), 'blue'), '  O controle da sua infraestrutura.']
        commands = quick_command_lines(interactive=True)
        return [part for line in [*brand, *commands] for part in terminal.wrap(line, columns)]
    return layout


def welcome_lines(version, frame=0, logo=None, interactive=False):
    size = terminal.size()
    commands = quick_command_lines(interactive)
    lines = ['', *brand_lines(version, frame, logo, size, interactive=interactive), *commands]
    if interactive:
        if len(lines) + 3 >= size.lines:
            lines = ['', *brand_lines(version, frame, logo, size, compact=True, interactive=True), *commands]
        lines.append(styled('  Digite o comando sem o prefixo jubart. exit, Ctrl+D ou Ctrl+C para sair.', 'muted'))
    return lines


def print_welcome(version, interactive=False):
    if SCREEN and interactive:
        SCREEN.title = 'JUBART · '+safe(version)
        SCREEN.reset(screen_welcome(version), home=True)
        SCREEN.draw()
        return []
    lines = welcome_lines(version, interactive=interactive)
    print('\n'.join(lines), flush=True)
    return lines


def read_console_line(history, version, welcome=None, prompt_text=None):
    """Edit a command while animating the visible welcome; restore TTY before dispatch."""
    prompt = prompt_text or 'jubart> '
    controls = SCREEN.stream if SCREEN else sys.stdout
    if os.environ.get('TERM') == 'dumb':
        return input(prompt)
    try:
        descriptor = sys.stdin.fileno()
        previous = termios.tcgetattr(descriptor)
    except (AttributeError, OSError, ValueError, termios.error):
        return input(prompt)
    size = terminal.size()
    animate = bool(((SCREEN and SCREEN.home) or welcome) and use_color() and not os.environ.get('CI')
                   and os.environ.get('JUBART_NO_ANIMATION') != '1'
                   and (SCREEN or len(welcome) + 2 < size.lines and max(map(display_width, welcome)) < size.columns))
    logo = json.loads(Path(__file__).with_name('cli-logo.json').read_text()) if animate else None
    text, cursor, offset, pending, draft = '', 0, 0, '', ''
    history_index, frame, pasted = len(history), 0, False
    decoder = codecs.getincrementaldecoder('utf-8')('replace')
    sequences = {'\033[A': 'up', '\033[B': 'down', '\033[C': 'right', '\033[D': 'left',
                 '\033[H': 'home', '\033[F': 'end', '\033[1~': 'home', '\033[4~': 'end',
                 '\033[5~': 'page-up', '\033[6~': 'page-down',
                 '\033[3~': 'delete', '\033[200~': 'paste-start', '\033[201~': 'paste-end'}

    def redraw():
        nonlocal offset
        columns = terminal.size().columns
        prefix = terminal.clip(prompt, max(1, columns-3))
        available = max(1, columns-display_width(prefix)-2)
        offset = min(offset, cursor)
        while display_width(text[offset:cursor]) >= available:
            offset += 1
        end = offset
        while end < len(text) and display_width(text[offset:end+1]) <= available:
            end += 1
        suffix = display_width(text[cursor:end])
        if SCREEN:
            SCREEN.input(styled(prefix, 'cyan')+text[offset:end], suffix)
        else:
            sys.stdout.write('\r\033[2K' + styled(prefix, 'cyan') + text[offset:end] + (f'\033[{suffix}D' if suffix else ''))
            sys.stdout.flush()

    try:
        # Preserve characters typed as the previous command finishes.
        tty.setcbreak(descriptor, termios.TCSANOW)
        controls.write('\033[?2004h')
        redraw()
        while True:
            if SCREEN and terminal.size() != SCREEN.size:
                SCREEN.draw()
                redraw()
            ready, _, _ = select.select([descriptor], [], [], .12 if animate or SCREEN else None)
            if not ready:
                if SCREEN:
                    resized = terminal.size() != SCREEN.size
                    if animate:
                        frame = (frame+1) % len(logo['frames'])
                        SCREEN.blocks = [screen_welcome(version, frame)]
                    if resized or animate:
                        SCREEN.draw()
                        redraw()
                    continue
                if terminal.size() != size:
                    animate = False
                    redraw()
                    continue
                frame = (frame + 1) % len(logo['frames'])
                lines = welcome_lines(version, frame, logo, interactive=True)
                sys.stdout.write('\033[?25l' + f'\033[{len(welcome)}F' + '\n'.join('\033[2K' + line for line in lines) + '\n')
                redraw()
                sys.stdout.write('\033[?25h')
                sys.stdout.flush()
                continue
            data = os.read(descriptor, 4096)
            if not data:
                raise EOFError()
            pending += decoder.decode(data)
            while pending:
                key = pending[0]
                if key == '\033':
                    sequence = next((value for value in sequences if pending.startswith(value)), None)
                    if sequence:
                        key, pending = sequences[sequence], pending[len(sequence):]
                    elif any(value.startswith(pending) for value in sequences):
                        break
                    else:
                        pending = pending[1:]
                        continue
                else:
                    pending = pending[1:]
                if key == 'paste-start':
                    pasted = True
                elif key == 'paste-end':
                    pasted = False
                elif key in ('\r', '\n'):
                    if pasted:
                        text, cursor = text[:cursor] + ' ' + text[cursor:], cursor + 1
                    else:
                        redraw()
                        if not SCREEN:
                            print()
                        return text
                elif key == '\x04' and not text:
                    raise EOFError()
                elif key == '\x03':
                    raise KeyboardInterrupt()
                elif key in ('left', '\x02'):
                    cursor = max(0, cursor - 1)
                elif key in ('right', '\x06'):
                    cursor = min(len(text), cursor + 1)
                elif key in ('home', '\x01'):
                    cursor = 0
                elif key in ('end', '\x05'):
                    cursor = len(text)
                elif key in ('page-up', 'page-down') and SCREEN:
                    SCREEN.scroll(-1 if key == 'page-up' else 1)
                elif key == '\x0c' and SCREEN:
                    SCREEN.draw()
                elif key in ('\x7f', '\b') and cursor:
                    text, cursor = text[:cursor-1] + text[cursor:], cursor - 1
                elif key in ('delete', '\x04'):
                    text = text[:cursor] + text[cursor+1:]
                elif key == '\x15':
                    text, cursor = text[cursor:], 0
                elif key == '\x0b':
                    text = text[:cursor]
                elif key in ('up', 'down'):
                    if history_index == len(history):
                        draft = text
                    history_index = max(0, min(len(history), history_index + (-1 if key == 'up' else 1)))
                    text = history[history_index] if history_index < len(history) else draft
                    cursor = len(text)
                elif len(key) == 1 and key.isprintable():
                    text, cursor = text[:cursor] + key + text[cursor:], cursor + 1
            redraw()
    finally:
        termios.tcsetattr(descriptor, termios.TCSADRAIN, previous)
        controls.write('\033[?2004l\033[?25h')
        controls.flush()


def run_console(root, version):
    global SCREEN
    full_screen = sys.stdin.isatty() and sys.stdout.isatty() and os.environ.get('TERM') != 'dumb'
    previous = SCREEN
    if full_screen:
        SCREEN = terminal.Viewport('JUBART · '+safe(version), footer='Digite sem jubart | PgUp/PgDn: rolar | help | clear | exit')
        SCREEN.enter()
    try:
        return console_loop(root, version)
    finally:
        if full_screen:
            SCREEN.leave()
        SCREEN = previous


def console_loop(root, version):
    global SCREEN
    def notice(message):
        if SCREEN:
            SCREEN.reset(message+'\n')
            SCREEN.draw()
        else:
            print(message)
    history = []
    welcome = print_welcome(version, interactive=True)
    while True:
        try:
            line = read_console_line(history, version, welcome)
        except (EOFError, KeyboardInterrupt):
            print('\nSaindo do Jubart.')
            return 0
        welcome = None
        if not line.strip():
            continue
        history.append(line)
        try:
            arguments = shlex.split(line)
        except ValueError:
            notice('Erro: aspas não fechadas. Use aspas ao informar nomes ou pastas com espaços.')
            continue
        if arguments and arguments[0] == 'jubart':
            arguments = arguments[1:]
        if not arguments:
            arguments = ['clear']
        if arguments[0] in ('exit', 'quit'):
            if len(arguments) > 1:
                notice('Uso: exit ou quit, sem argumentos.')
                continue
            print('Saindo do Jubart.')
            return 0
        if arguments == ['clear']:
            if not SCREEN and os.environ.get('TERM') != 'dumb':
                print('\033[2J\033[H', end='')
            welcome = print_welcome(version, interactive=True)
            continue
        try:
            if SCREEN:
                SCREEN.reset()
                SCREEN.busy, SCREEN.follow = True, True
                SCREEN.title = 'JUBART · '+safe(version)+' | '+safe(arguments[0])
                SCREEN.prompt = styled('Executando '+safe(arguments[0])+'…', 'muted')
                try:
                    with terminal.captured(SCREEN):
                        main(['--root', str(root), *arguments])
                finally:
                    SCREEN.busy, SCREEN.follow, SCREEN.offset = False, False, 0
                    SCREEN.draw()
            else:
                main(['--root', str(root), *arguments])
        except SystemExit:
            # Help and parser errors end the command, not the interactive session.
            pass
        except KeyboardInterrupt:
            notice('Comando interrompido. Confira o estado antes de repetir a operação.')


def full_screen_command(callback, return_message='Acompanhamento encerrado. Digite outro comando ou clear para voltar às boas-vindas.'):
    """Give a live view the terminal, then restore the surrounding console."""
    global SCREEN
    viewport, previous_out, previous_err = SCREEN, sys.stdout, sys.stderr
    viewport.leave()
    SCREEN = None
    sys.stdout = getattr(previous_out, 'original', previous_out)
    sys.stderr = getattr(previous_err, 'original', previous_err)
    try:
        return callback()
    finally:
        sys.stdout, sys.stderr, SCREEN = previous_out, previous_err, viewport
        viewport.enter()
        viewport.reset(return_message+'\n')


def service_label(value):
    return {'running': 'em execução', 'created': 'criado', 'restarting': 'reiniciando',
            'exited': 'encerrado', 'paused': 'pausado', 'dead': 'inativo',
            'removing': 'em remoção', 'healthy': 'saudável',
            'unhealthy': 'falhando', 'starting': 'iniciando'}.get(value, safe(value))


def print_table(headers, values, tones=None):
    values = [tuple(safe(cell) for cell in row) for row in values]
    def lines(columns, height=0):
        return terminal.table_lines(headers, values, columns, tones, styled)
    if SCREEN:
        SCREEN.add(lines)
    else:
        natural = 3*len(headers)+3+sum(max([5, terminal.width(header), *[terminal.width(row[index]) for row in values]]) for index, header in enumerate(headers))
        columns = max(1, terminal.size().columns-1) if sys.stdout.isatty() else natural
        print('\n'.join(lines(columns)))


def host_port_tone(value):
    if not value or value == 'nenhuma':
        return 'muted'
    published = [port.strip() for port in value.split(',')
                 if port.strip() not in ('não publicada', 'indisponível')]
    if not published:
        return 'yellow'
    for port in published:
        address = port.rpartition(':')[0].strip('[]')
        try:
            if not ipaddress.ip_address(address).is_loopback:
                return 'blue'
        except ValueError:
            return 'blue'
    return 'green'


def print_services(rows):
    section('Serviços em execução / containers criados:', '📦')
    if not rows:
        print('  Nenhum container encontrado nesta instalação.')
        return
    values, tones = [], []
    for row in rows:
        values.append((row['Service'], service_label(row['State']),
                       service_label(row['Health'] or 'sem verificação de saúde'),
                       row.get('container_ports') or 'indisponível', row.get('host_ports') or 'nenhuma'))
        problem = row['State'] != 'running' or row['Health'] in ('unhealthy', 'starting')
        tone = 'red' if row['Health'] == 'unhealthy' else 'yellow' if problem else 'green'
        health_tone = {'healthy': 'green', 'unhealthy': 'red', 'starting': 'yellow'}.get(row['Health'], 'muted')
        container_tone = 'muted' if row.get('container_ports') == 'nenhuma' else 'cyan' if row.get('container_ports') else 'yellow'
        tones.append([tone, tone, health_tone, container_tone, host_port_tone(row.get('host_ports'))])
    print_table(('Serviço', 'Estado', 'Saúde', 'Porta no container', 'Porta no host'), values, tones)


def print_users(root, env):
    file = root / '.panel-state/panel-users/users.json'
    try:
        users = json.loads(file.read_text()) if file.exists() else []
        if not isinstance(users, list) or any(
            not isinstance(user, dict) or not isinstance(user.get('username'), str)
            or not isinstance(user.get('enabled'), bool) or not isinstance(user.get('admin'), bool)
            for user in users
        ):
            raise ValueError()
    except ValueError:
        raise ValueError('Cadastro de usuários do painel inválido; consulte o gerenciamento de contas no painel.')
    section('Usuários do painel — configuração salva', '👤')
    values = [(env.get('PANEL_USERNAME', ''), 'Administrador principal', 'habilitado', 'Administrador do .env')]
    for user in users:
        values.append((user['username'], 'Administrador' if user['admin'] else 'Acesso por permissões',
                       'habilitado' if user['enabled'] else 'desabilitado', user.get('name', '')))
    print_table(('Login', 'Perfil', 'Acesso', 'Nome'), values)
    print('  Contas desabilitadas não podem entrar. Gerencie contas e permissões no painel.')
    print('  Esta listagem corresponde às contas do painel, não às contas SSH do servidor.')


def print_server_time(env):
    section('Data e hora do servidor', '🕒')
    properties = {}
    try:
        result = subprocess.run(['timedatectl', 'show', '--property=Timezone', '--property=NTPSynchronized',
                                 '--property=NTP', '--property=LocalRTC'], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            properties = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    except (OSError, subprocess.TimeoutExpired):
        pass
    now = datetime.now(timezone.utc)
    local = now.astimezone()
    zone = properties.get('Timezone', '')
    if zone:
        try:
            local = now.astimezone(ZoneInfo(zone))
        except (ValueError, ZoneInfoNotFoundError):
            zone = ''
    detail('Horário do servidor', local.isoformat(timespec='seconds'))
    detail('Fuso do servidor', zone or local.tzname() or 'não identificado')
    detail('Horário UTC', now.isoformat(timespec='seconds'))
    labels = {'yes': 'sim', 'no': 'não'}
    for key, label in [('NTP', 'NTP habilitado'), ('NTPSynchronized', 'Relógio sincronizado por NTP'),
                       ('LocalRTC', 'Relógio de hardware usa hora local')]:
        detail(label, labels.get(properties.get(key), 'não foi possível consultar'))
    for key, label in [('TZ', 'Serviços'), ('BACKUP_TIMEZONE', 'Backup MariaDB'), ('PG_BACKUP_TIMEZONE', 'Backup PostgreSQL')]:
        if env.get(key):
            try:
                configured = now.astimezone(ZoneInfo(env[key]))
                detail(label, env[key] + ' · ' + configured.isoformat(timespec='seconds'))
            except (ValueError, ZoneInfoNotFoundError):
                detail(label, env[key] + ' · fuso indisponível neste host', 'yellow')
    print('  Fusos dos serviços e backups correspondem à configuração salva no .env.')


def check_certificates(root, env, args):
    targets = []
    if args.domain:
        targets.append((args.domain, args.port if args.port is not None else 443, args.domain))
    else:
        file = root / 'config/apps.json'
        apps = json.loads(file.read_text()).get('applications', []) if file.exists() else []
        if env.get('TRAEFIK_TLS_ENABLED') == 'true':
            if not any(app.get('id') == 'main' for app in apps):
                apps.insert(0, {'id': 'main', 'domain': env.get('APP_DOMAIN', 'localhost'), 'enabled': True})
            for app in apps:
                if app.get('enabled'):
                    prefix = 'APP' if app['id'] == 'main' else 'APP_' + app['id'].removeprefix('app')
                    targets.append((env.get(prefix + '_DOMAIN') or app.get('domain', ''),
                                    int(env.get('HTTPS_PORT', '8443')), '127.0.0.1'))
        if env.get('PANEL_PROXY_ENABLED') == 'true' and env.get('PANEL_TLS_ENABLED') == 'true':
            targets.append((env.get('PANEL_DOMAIN', ''), int(env.get('HTTPS_PORT', '8443')), '127.0.0.1'))
        if args.port is not None:
            targets = [(domain, args.port, host) for domain, _, host in targets]
    targets = list(dict.fromkeys(targets))
    if any(not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]{0,252}', domain) or not 1 <= port <= 65535
           for domain, port, _ in targets) or (args.port is not None and not 1 <= args.port <= 65535):
        raise ValueError('Domínio ou porta inválidos. Use jubart certificates DOMINIO [--port 443].')
    section('Verificação de certificados TLS', '🔒')
    if not targets:
        print('  Nenhum domínio com HTTPS habilitado na configuração salva.')
        print('  Para consultar um domínio: jubart certificates exemplo.com [--port 443].')
        return 0
    context = ssl.create_default_context()
    failed = False
    for domain, port, host in targets:
        detail('Destino', f'{domain}:{port} · conexão em {host}:{port}')
        try:
            with socket.create_connection((host, port), timeout=5) as connection:
                with context.wrap_socket(connection, server_hostname=domain) as secured:
                    certificate = secured.getpeercert()
            expires = ssl.cert_time_to_seconds(certificate['notAfter'])
            remaining_days = int((expires - time.time()) // 86400)
            detail('Resultado', 'válido · domínio e cadeia de confiança verificados', 'green')
            detail('Válido desde (UTC)', datetime.fromtimestamp(ssl.cert_time_to_seconds(certificate['notBefore']), timezone.utc).isoformat())
            detail('Vencimento (UTC)', datetime.fromtimestamp(expires, timezone.utc).isoformat())
            detail('Dias restantes', remaining_days, 'yellow' if remaining_days <= 30 else 'green')
            if remaining_days <= 30:
                print('  ' + styled('Atenção: certificado próximo do vencimento; confira a renovação automática no painel.', 'yellow'))
        except ssl.SSLCertVerificationError as error:
            reasons = {9: 'ainda não está válido', 10: 'certificado expirado',
                       18: 'certificado autoassinado', 19: 'cadeia autoassinada',
                       20: 'emissor não confiável ou cadeia incompleta', 21: 'cadeia incompleta',
                       62: 'certificado não corresponde ao domínio', 64: 'certificado não corresponde ao IP'}
            detail('Resultado', 'inválido · ' + reasons.get(error.verify_code, 'falha na verificação da cadeia ou do domínio'), 'red')
            failed = True
        except ssl.SSLError:
            detail('Resultado', 'falha na negociação TLS; certificado não validado', 'red')
            failed = True
        except OSError:
            detail('Resultado', 'sem conexão TLS; confira DNS, porta e proxy', 'red')
            failed = True
        print()
    print('  Sem domínio informado, a consulta usa o proxy local e o domínio configurado no TLS.')
    print('  A consulta não emite nem renova certificados. Retorna código 1 se alguma verificação falhar.')
    return 1 if failed else 0


def print_panel(info):
    section('Painel — configuração salva', '🌐')
    detail('Modo', info['modo'])
    detail('Publicação', info['publicacao'])
    detail('Endereço direto', info['direto'], 'blue')
    if info.get('dominio'):
        detail('Endereço por domínio', info['dominio'], 'blue')
    if info.get('tunnel'):
        section('Túnel SSH · acesso remoto', '🔐')
        print('  Para acessar remotamente, execute NO SEU COMPUTADOR:')
        print('\n    ' + styled(info['tunnel'], 'green') + '\n')
        print('  Depois abra ' + styled(info['direto'], 'blue') + ' e mantenha o SSH aberto.')
        print('  ' + styled('Substitua USUARIO_SSH e IP_DA_VPS, se aparecerem no exemplo.', 'muted'))
    if info.get('tunnel'):
        print('  ' + styled('A publicação local permite acesso direto neste host; não comprova que exista um túnel ativo.', 'muted'))
    else:
        print('  ' + styled('O acesso externo depende da liberação da porta no firewall do servidor e do provedor.', 'muted'))
    if info['cookie_seguro']:
        print('  ' + styled(symbol('🔒') + ' Cookie seguro habilitado: utilize o endereço HTTPS para autenticar.', 'yellow'))
    print('  ' + styled('Endereços são a configuração salva; use jubart status para conferir o container em execução.', 'muted'))

def confirm(message, token='SIM'):
    if not sys.stdin.isatty():
        raise ValueError('Esta alteração exige um terminal interativo.')
    try:
        if SCREEN:
            print(styled(symbol('⚠️')+' '+message, 'yellow'))
            sys.stdout.flush()
            SCREEN.busy = False
            try:
                answer = read_console_line([], '', prompt_text=f'Digite {token} para continuar: ').strip()
            finally:
                SCREEN.busy, SCREEN.follow = True, True
                SCREEN.prompt = styled('Conferindo confirmação…', 'muted')
        else:
            answer = input(styled(symbol('⚠️') + ' ' + message, 'yellow') + f' Digite {token} para continuar: ').strip()
    except (EOFError, KeyboardInterrupt):
        raise ValueError('Operação cancelada; nenhuma alteração realizada.')
    if answer != token:
        raise ValueError('Operação cancelada; nenhuma alteração realizada.')

def replace_checked(file, content, before):
    if file.is_symlink():
        raise ValueError('O arquivo de configuração não pode ser um link simbólico nesta operação.')
    if file.read_text() != before:
        raise ValueError('Configuração alterada durante a operação. Tente novamente.')
    fd, temporary = tempfile.mkstemp(prefix='.jubart-cli-', dir=file.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        if file.read_text() != before:
            raise ValueError('Configuração alterada durante a operação. Tente novamente.')
        os.replace(temporary, file)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def update_env_values(root, values, before):
    remaining = dict(values)
    lines = []
    for line in before.splitlines():
        key = line.split('=', 1)[0]
        if key in values:
            lines.append(key + '=' + str(values[key]))
            remaining.pop(key, None)
        else:
            lines.append(line)
    lines.extend(key + '=' + str(value) for key, value in remaining.items())
    replace_checked(root / '.env', '\n'.join(lines) + '\n', before)


def update_env(root, key, value, before):
    update_env_values(root, {key: value}, before)


def app_request(root, env, request, mode='plan', revision=None):
    node = shutil.which('node')
    if node:
        command = [node, str(Path(__file__).resolve().parent.parent / 'docker/panel/apps-cli.mjs')]
        execution_root = str(root)
    else:
        workspace = env.get('PANEL_WORKSPACE_DIRECTORY', str(root))
        command = ['docker', 'compose', 'exec', '-T', 'panel', 'node', str(Path(workspace) / 'docker/panel/apps-cli.mjs')]
        execution_root = workspace
    payload = {'root': execution_root, 'request': request, 'mode': mode, 'revision': revision}
    try:
        result = subprocess.run(command, input=json.dumps(payload), cwd=root, text=True, capture_output=True,
                                timeout=1800 if mode == 'apply' else 30)
    except (OSError, subprocess.TimeoutExpired):
        raise ValueError('Não foi possível executar a gestão de aplicações. Use Node.js no host ou mantenha o painel em execução; confira o estado antes de tentar novamente.')
    try:
        response = json.loads(result.stdout)
        if not isinstance(response, dict):
            raise ValueError()
    except ValueError:
        raise ValueError('Não foi possível executar a gestão de aplicações. Verifique Node.js no host ou o container do painel e as permissões do Docker.')
    if response.get('error'):
        raise ValueError(safe(response['error']))
    if result.returncode:
        raise ValueError('A gestão de aplicações não concluiu a operação. Consulte jubart apps antes de tentar novamente.')
    return response


def open_app_shell(root, args):
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        raise ValueError('Use um terminal interativo para abrir o shell da aplicação.')
    selector = args.id.strip().casefold()
    if not selector or safe(selector) != selector:
        raise ValueError('Informe o ID ou nome da aplicação. Consulte jubart apps.')
    file = root / 'config/apps.json'
    if not file.exists():
        raise ValueError('Cadastros ainda não preparados. Abra o assistente de configuração no painel.')
    try:
        apps = json.loads(file.read_text())['applications']
        if not isinstance(apps, list) or any(not isinstance(app, dict) for app in apps):
            raise ValueError()
        matches = [app for app in apps if str(app.get('id', '')).casefold() == selector]
        if not matches:
            matches = [app for app in apps if str(app.get('name', '')).strip().casefold() == selector]
    except (ValueError, KeyError, TypeError):
        raise ValueError('Cadastro de aplicações inválido. Confira config/apps.json.')
    if not matches:
        raise ValueError('Aplicação não encontrada. Consulte jubart apps e informe o ID ou o nome completo entre aspas.')
    if len(matches) != 1:
        raise ValueError('Mais de uma aplicação corresponde a esse nome ou ID. Use um ID único mostrado em jubart apps.')
    app = matches[0]
    identity = app.get('id')
    if not jubart_automation.app_id(identity):
        raise ValueError('ID de aplicação inválido no cadastro. Confira config/apps.json.')
    if args.app_action == 'host':
        directory = app.get('directory')
        if not isinstance(directory, str) or not directory.strip() or safe(directory) != directory:
            raise ValueError('Pasta no host não configurada ou inválida. Confira jubart apps.')
        directory = (root / directory).resolve()
        if not directory.is_dir():
            raise ValueError('Pasta da aplicação não encontrada no host. Confira jubart apps e o caminho cadastrado.')
        bash = shutil.which('bash')
        if not bash:
            raise ValueError('Bash não está instalado no host.')
        command, cwd = [bash, '-i'], directory
        location = 'host · '+str(directory)
    else:
        service = jubart_automation.service(identity)
        containers = [row for row in running_services(root) if row['Service'] == service]
        if not containers:
            raise ValueError('Container não criado. Habilite e aplique a aplicação antes de abrir o shell.')
        if len(containers) != 1:
            raise ValueError('Há mais de um container para esta aplicação. Selecione o container diretamente pelo Docker.')
        if containers[0]['State'] != 'running':
            raise ValueError('Container fora de execução. Confira jubart status antes de abrir o shell.')
        workdir = app.get('workingDirectory', '/var/www/html') if app.get('type') == 'node' else '/var/www/html'
        if not isinstance(workdir, str) or not workdir.startswith('/') or safe(workdir) != workdir:
            raise ValueError('Pasta de trabalho no container inválida. Confira o cadastro da aplicação.')
        shell = 'if command -v bash >/dev/null 2>&1; then exec bash -i; else printf "%s\\n" "Bash indisponível nesta imagem; abrindo sh."; exec sh -i; fi'
        command = ['docker', 'compose', *jubart_automation.runtime_prefix(identity),
                   'exec', '--workdir', workdir, service, 'sh', '-c', shell]
        cwd, location = root, 'container · '+(containers[0]['Name'] or service)+' · '+workdir

    def launch():
        print('Abrindo '+safe(identity)+' no '+safe(location)+'. Digite exit para voltar.', flush=True)
        sys.stderr.flush()
        descriptor = sys.stdin.fileno()
        attributes = termios.tcgetattr(descriptor)
        try:
            return subprocess.run(command, cwd=cwd).returncode
        except OSError:
            raise ValueError('Não foi possível iniciar o shell. Confira o executável, a pasta e as permissões de acesso.')
        finally:
            termios.tcsetattr(descriptor, termios.TCSADRAIN, attributes)

    if SCREEN:
        return full_screen_command(launch, 'Shell encerrado. Digite outro comando ou clear para voltar às boas-vindas.')
    return launch()


def change_app(root, env, args):
    fields = {'name': 'name', 'domain': 'domain', 'directory': 'directory', 'type': 'type', 'port': 'port',
              'enabled': 'enabled', 'document_root': 'documentRoot', 'mode': 'mode', 'start_command': 'startCommand',
              'working_directory': 'workingDirectory', 'build_directory': 'buildDirectory', 'spa': 'spa'}
    changes = {field: getattr(args, flag) for flag, field in fields.items() if getattr(args, flag, None) is not None}
    request = {'action': args.app_action, 'id': args.id, 'changes': changes, 'saveOnly': getattr(args, 'save_only', False)}
    plan = app_request(root, env, request)
    request['id'] = plan['id']
    section('Revisão da aplicação · ' + plan['id'], '📋')
    detail('Operação', {'create': 'criar', 'update': 'atualizar', 'remove': 'remover', 'apply': 'aplicar'}[args.app_action])
    detail('Serviço/container', plan['service'])
    if plan['changes']:
        def value(item):
            return 'sim' if item is True else 'não' if item is False else safe(item)
        print_table(('Campo', 'Antes', 'Depois'), [(row['field'], value(row['before']), value(row['after'])) for row in plan['changes']])
    if plan['saveOnly']:
        print('  Salvar o cadastro e os arquivos gerados. Containers em execução serão mantidos até aplicar.')
    elif plan['runtimeChange']:
        print('  Validar o Compose, salvar e aplicar a aplicação e o proxy Traefik. O acesso pode ser interrompido.')
    else:
        print('  Salvar os dados do cadastro; a alteração de nome não recria containers.')
    if args.app_action == 'remove':
        print('  A remoção exclui o cadastro e, ao aplicar, o container. Pastas do projeto, bancos e volumes são preservados.')
    if getattr(args, 'dry_run', False):
        print('  Simulação concluída. Nenhuma alteração realizada.')
        return
    confirm('Confirmar esta operação na aplicação?', token='yes')
    print('Salvando e aplicando…' if not plan['saveOnly'] else 'Salvando cadastro…', flush=True)
    result = app_request(root, env, request, 'apply', plan['revision'])
    print('Aplicação ' + result['id'] + ': operação concluída.')
    detail('Backup anterior', result['backup'])
    if not result['applied'] and args.app_action != 'remove':
        print('  Para aplicar: jubart app apply ' + result['id'])
    elif not result['applied']:
        print('  Cadastro removido. O container existente permanece até sua remoção explícita no Docker.')
    print('  Confira jubart apps e atualize abas abertas do painel antes de editar novamente.')


def change_access(root, text, env, args):
    if args.mode == 'ssh':
        args.mode = 'tunnel'
    if not 1 <= args.ssh_port <= 65535:
        raise ValueError('Porta SSH deve estar entre 1 e 65535.')
    if not args.mode:
        print_panel(panel_info(env, args.host, args.ssh_user, args.ssh_port))
        print('Para alterar: jubart ssh ou jubart http [--port 9090].')
        return
    port = args.port if args.port is not None else int(env.get('PANEL_PORT', '9090'))
    if not 1 <= port <= 65535 or not 1 <= args.ssh_port <= 65535:
        raise ValueError('As portas devem estar entre 1 e 65535.')
    reserved = ['HTTP_PORT', 'HTTPS_PORT', 'MARIADB_PORT', 'POSTGRES_PORT', 'PHPMYADMIN_PORT']
    if any(env.get(key) and int(env[key]) == port for key in reserved):
        raise ValueError('A porta do painel conflita com outro serviço configurado. Escolha outra --port.')
    panel = {'bindAddress': '127.0.0.1' if args.mode == 'tunnel' else '0.0.0.0',
             'port': port, 'proxyEnabled': False, 'tls': False, 'secureCookie': False, 'domain': ''}
    values = {'PANEL_BIND_ADDRESS': panel['bindAddress'], 'PANEL_PORT': str(port),
              'PANEL_PROXY_ENABLED': 'false', 'PANEL_TLS_ENABLED': 'false',
              'PANEL_COOKIE_SECURE': 'false', 'PANEL_DOMAIN': ''}
    info = panel_info({**env, **values}, args.host, args.ssh_user, args.ssh_port)
    file = root / 'config/apps.json'
    before = file.read_text() if file.exists() else None
    updated = None
    if before is not None:
        config = json.loads(before)
        config['proxy']['panel'] = panel
        updated = json.dumps(config, ensure_ascii=False, indent=2) + '\n'
    print('Novo modo: ' + ('local / túnel SSH' if args.mode == 'tunnel' else 'HTTP pela porta do servidor'))
    print('Publicação: ' + info['publicacao'])
    print('O acesso do painel por domínio/HTTPS será desativado. A sessão será encerrada.')
    if args.mode == 'http':
        print('HTTP não cifra as credenciais. Restrinja a porta no firewall ao seu IP; o CLI não abre o firewall.')
    else:
        print('A porta ficará acessível apenas neste servidor. Para acesso remoto, abra um túnel a partir do seu computador.')
    confirm('Confirmar a troca de acesso, recompilar e recriar somente o painel?', token='yes')
    # Keep the panel draft in sync so the next Apply does not restore the old mode.
    if updated is not None:
        replace_checked(file, updated, before)
    try:
        update_env_values(root, values, text)
    except Exception:
        if updated is not None:
            replace_checked(file, before, updated)
        raise
    print('Modo salvo. Recompilando e recriando o painel…')
    try:
        compose(root, ['up', '-d', '--no-deps', '--build', '--force-recreate', 'panel'], 600)
    except ValueError:
        retry = 'jubart ssh' if args.mode == 'tunnel' else 'jubart http'
        raise ValueError(f'Modo salvo, mas não foi possível recompilar ou recriar o painel. Reexecute {retry} para concluir; confira jubart status.')
    print_panel(info)
    print('Painel recompilado e recriado. Atualize qualquer aba aberta antes de editar a configuração novamente.')


def check_site(root, env, args):
    file = root / 'config/apps.json'
    apps = json.loads(file.read_text()).get('applications', []) if file.exists() else []
    if not any(app.get('id') == 'main' for app in apps):
        apps.insert(0, {'id': 'main', 'name': 'Aplicação principal', 'domain': env.get('APP_DOMAIN', 'localhost'), 'enabled': True})
    selected = [a for a in apps if a.get('enabled')] if args.all else [a for a in apps if a.get('id') == args.app]
    if not selected:
        raise ValueError('Aplicação não encontrada ou nenhuma aplicação habilitada para testar.')
    tls = env.get('TRAEFIK_TLS_ENABLED') == 'true'
    port = int(env.get('HTTPS_PORT' if tls else 'HTTP_PORT', '8443' if tls else '80'))
    if not 1 <= port <= 65535:
        raise ValueError('Porta de acesso das aplicações inválida.')
    failed = False
    for app in selected:
        app_id = app['id']
        prefix = 'APP' if app_id == 'main' else 'APP_' + app_id.removeprefix('app')
        domain = env.get(prefix + '_DOMAIN') or app.get('domain') or 'localhost'
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]*', domain):
            raise ValueError('Domínio/IP de aplicação inválido para o teste HTTP.')
        authority = domain + (':' + str(port) if port != (443 if tls else 80) else '')
        print(f"\nSite {safe(app_id)} · {safe(app.get('name', app_id))}")
        print(f"  Endereço configurado: {'https' if tls else 'http'}://{authority}/")
        print(f'  Teste neste servidor: 127.0.0.1:{port}, com o domínio correto no cabeçalho Host.')
        if not app.get('enabled'):
            print('  Resultado: aplicação desabilitada no cadastro; teste não executado.')
            failed = True
            continue
        connection = http.client.HTTPSConnection(domain, port, timeout=10) if tls else http.client.HTTPConnection(domain, port, timeout=10)
        # Force the local proxy port, preserving Host and TLS SNI/certificate verification.
        connection._create_connection = lambda address, timeout=10, source_address=None: socket.create_connection(('127.0.0.1', port), timeout, source_address)
        started = time.monotonic()
        try:
            connection.request('GET', '/', headers={'Host': authority, 'User-Agent': 'Jubart-CLI/site', 'Connection': 'close'})
            response = connection.getresponse()
            elapsed = round((time.monotonic() - started) * 1000)
            if 200 <= response.status < 300:
                result = 'respondendo'
            elif 300 <= response.status < 400:
                result = 'respondendo com redirecionamento; destino não verificado'
            else:
                result = 'respondeu com erro; verifique a rota e a aplicação'
                failed = True
            print(styled(f"  {symbol('✅' if response.status < 300 else '⚠️')} Resultado: HTTP {response.status} · {result} · {elapsed} ms", 'green' if response.status < 300 else 'yellow' if response.status < 400 else 'red'))
        except ssl.SSLError:
            print(styled('  ' + symbol('⚠️', '!') + ' Resultado: falha TLS. Verifique o certificado e o domínio configurado.', 'red'))
            failed = True
        except (OSError, http.client.HTTPException):
            print(styled('  ' + symbol('❌', '!') + ' Resultado: sem resposta HTTP válida. Verifique o serviço e a publicação da porta.', 'red'))
            failed = True
        finally:
            connection.close()
    print('\nO teste verifica a resposta da rota / no acesso local. Não comprova acesso externo, firewall ou todas as funções da aplicação.')
    return 1 if failed else 0


def change_account(root, text, env, command, username):
    if command == 'user':
        if not username:
            print('Administrador principal: ' + safe(env.get('PANEL_USERNAME', '')))
            print('Para alterar: jubart user NOVO_LOGIN. Outras contas são gerenciadas no painel.')
            return
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_.-]{2,47}', username):
            raise ValueError('Login deve ter 3 a 48 caracteres: letras, números, ponto, hífen ou sublinhado; inicie com letra.')
        users_file = root / '.panel-state/panel-users/users.json'
        users = json.loads(users_file.read_text()) if users_file.exists() else []
        if any(u['username'].lower() == username.lower() for u in users):
            raise ValueError('Este login já pertence a outra conta do painel.')
        key, value = 'PANEL_USERNAME', username
    else:
        if not sys.stdin.isatty():
            raise ValueError('Use um terminal interativo para digitar a senha sem exibi-la.')
        current = getpass.getpass('Senha atual do administrador principal: ')
        import hmac
        if not hmac.compare_digest(current.encode(), env.get('PANEL_PASSWORD', '').encode()):
            raise ValueError('Senha atual incorreta.')
        value = getpass.getpass('Nova senha (16 a 128 caracteres): ')
        if not 16 <= len(value) <= 128 or sum([bool(re.search(p, value)) for p in [r'[a-z]', r'[A-Z]', r'[0-9]', r'[^A-Za-z0-9]']]) < 3:
            raise ValueError('Use 16 a 128 caracteres e pelo menos três grupos: maiúsculas, minúsculas, números e símbolos.')
        if any(c in value for c in '\r\n\x00') or value != value.strip():
            raise ValueError('A senha não pode conter quebras de linha nem espaços nas extremidades.')
        if value != getpass.getpass('Repita a nova senha: '):
            raise ValueError('As senhas não coincidem.')
        # Literal dotenv quoting prevents Compose interpolation of dollar signs.
        if "'" in value:
            raise ValueError('Nesta operação, escolha uma senha sem aspas simples.')
        key, value = 'PANEL_PASSWORD', "'" + value + "'"
    confirm('A alteração será salva no .env e o painel será recriado. Sessões serão encerradas.')
    update_env(root, key, value, text)
    print('Alteração salva. Recriando o painel…')
    try:
        compose(root, ['up', '-d', '--no-deps', '--no-build', '--force-recreate', 'panel'], 180)
    except ValueError:
        raise ValueError('Alteração salva no .env, mas não foi possível recriar o painel. Execute jubart restart para concluir.')
    print('Painel recriado. Entre novamente com as novas credenciais.')

class PortugueseHelpFormatter(argparse.HelpFormatter):
    def _format_usage(self, usage, actions, groups, prefix):
        return super()._format_usage(usage, actions, groups, 'Uso: ' if prefix is None else prefix)


class PortugueseArgumentParser(argparse.ArgumentParser):
    def __init__(self, *args, **kwargs):
        kwargs['add_help'] = False
        kwargs['formatter_class'] = PortugueseHelpFormatter
        super().__init__(*args, **kwargs)
        self._positionals.title = 'Argumentos'
        self._optionals.title = 'Opções'
        self.add_argument('-h', '--help', action='help', help='mostrar esta ajuda e sair')

    def format_help(self):
        text = super().format_help()
        for heading in ['Uso:', 'Comandos disponíveis:', 'Argumentos:', 'Opções:']:
            text = text.replace(heading, styled(heading, 'cyan'))
        return text

    def error(self, message):
        self.print_usage(sys.stderr)
        self.exit(2, 'Erro: comando ou opção inválida, ou argumento obrigatório ausente. Consulte --help para ver os comandos e valores aceitos.\n')


def parser():
    cli = PortugueseArgumentParser(prog='jubart', description='Jubart — administração local da instalação. Sem comando: console interativo; digite comandos sem o prefixo jubart.')
    cli.add_argument('--root', type=Path, default=ROOT, help='raiz de outra instalação Jubart')
    cli.add_argument('--version', action='store_true', help='mostrar versão e sair')
    commands = cli.add_subparsers(dest='command', title='Comandos disponíveis')
    commands.add_parser('help', help='listar comandos e opções')
    commands.add_parser('version', help='mostrar versão instalada')
    panel = commands.add_parser('panel', help='mostrar HTTP/HTTPS, porta e comando de túnel SSH')
    panel.add_argument('--host', help='IP ou hostname SSH da VPS')
    panel.add_argument('--ssh-user', help='usuário SSH da VPS')
    panel.add_argument('--ssh-port', type=int, default=22, help='porta SSH (padrão 22)')
    for name, description, mode in [
        ('access', 'consultar ou alternar o painel entre túnel SSH e HTTP por porta', None),
        ('ssh', 'mudar o acesso do painel para túnel SSH, com confirmação', 'tunnel'),
        ('http', 'mudar o acesso do painel para HTTP por porta, com confirmação', 'http'),
    ]:
        access = commands.add_parser(name, help=description)
        if mode is None:
            access.add_argument('mode', nargs='?', choices=['tunnel', 'ssh', 'http'], help='modo de acesso desejado')
        else:
            access.set_defaults(mode=mode)
        access.add_argument('--port', type=int, help='porta do painel no host')
        access.add_argument('--host', help='IP ou hostname SSH para o exemplo do túnel')
        access.add_argument('--ssh-user', help='usuário SSH para o exemplo do túnel')
        access.add_argument('--ssh-port', type=int, default=22, help='porta SSH (padrão 22)')
    site = commands.add_parser('site', help='testar a resposta HTTP das aplicações na porta publicada; padrão: main')
    site.add_argument('app', nargs='?', default='main', help='identificador da aplicação (padrão main)')
    site.add_argument('--all', action='store_true', help='testar todas as aplicações habilitadas')
    commands.add_parser('status', help='listar estado e saúde dos containers')
    commands.add_parser('health', help='verificar serviços habilitados; retorna erro se houver pendências')
    for name, description in [
        ('queues', 'consultar contagens das filas Laravel e estado dos workers'),
        ('workers', 'listar workers cadastrados e seus containers'),
        ('jobs', 'listar jobs cadastrados ou consultar falhas com --failed'),
        ('schedules', 'consultar agendadores cadastrados e a agenda Laravel'),
    ]:
        automation = commands.add_parser(name, help=description, description=description + '. Somente consulta: não executa, reenfileira ou interrompe jobs.')
        automation.add_argument('--app', help='filtrar por aplicação (main, app2 etc.); padrão: todas as cadastradas elegíveis')
        automation.add_argument('--watch', action='store_true', help='acompanhar continuamente; q ou Ctrl+C retorna ao console')
        automation.add_argument('--interval', type=float, default=5, help='intervalo mínimo de atualização, de 3 a 60 segundos (padrão 5)')
        if name == 'jobs':
            automation.add_argument('--failed', action='store_true', help='consultar até 30 falhas recentes por aplicação, sem payloads ou exceções')
        if name == 'queues':
            automation.add_argument('--queue', help='consultar uma fila específica, mesmo sem cadastro; exige --app')
            automation.add_argument('--connection', choices=['redis', 'database'], help='conexão da fila específica; exige --queue e --app (padrão redis)')
    for name, description in [
        ('server', 'verificar CPU, memória, swap, disco, carga e uptime do servidor'),
        ('memory', 'consultar memória do host e dos containers desta instalação'),
        ('monitor', 'acompanhar recursos, gráficos e tráfego em tempo real'),
        ('traffic', 'acompanhar rede do host/containers e requisições HTTP em tempo real'),
    ]:
        metrics = commands.add_parser(name, help=description, description=description + '. Somente leitura. No modo ao vivo, q ou Ctrl+C retorna ao console.')
        metrics.add_argument('--interval', type=float, default=2, help='intervalo mínimo de atualização, de 1 a 60 segundos (padrão 2)')
        if name in ('server', 'memory'):
            metrics.add_argument('--watch', action='store_true', help='acompanhar continuamente em um terminal')
        else:
            metrics.add_argument('--once', action='store_true', help='coletar duas amostras, exibir uma consulta e sair')
            metrics.add_argument('--interface', help='interface de rede do host; padrão: interfaces da rota padrão')
        if name != 'server':
            metrics.add_argument('--service', help='filtrar containers pelo serviço Compose, por exemplo php ou mariadb')
            metrics.add_argument('--host-only', action='store_true', help='consultar somente o host, sem depender de Docker ou do painel')
    databases = commands.add_parser('databases', help='listar bancos MariaDB e PostgreSQL em tabela')
    databases.add_argument('--engine', choices=('all', 'mariadb', 'postgres'), default='all', help='filtrar servidor; padrão: ambos')
    database = commands.add_parser('database', help='consultar bancos, usuários, permissões e endereços de acesso')
    db_actions = database.add_subparsers(dest='database_action')
    db_actions.add_parser('help', help='mostrar todos os comandos e flags de bancos')
    db_parsers = []
    for action, description in [('list', 'listar bancos, tamanho, proprietário e conexões'),
                                ('users', 'listar usuários, estado do login e permissões por banco'),
                                ('access', 'consultar endereços e instruções para configurar acesso')]:
        operation = db_actions.add_parser(action, help=description, description=description + '. Somente consulta; nenhuma senha é exibida.')
        operation.add_argument('--engine', choices=('all', 'mariadb', 'postgres'), default='all', help='filtrar servidor; padrão: ambos')
        operation.add_argument('--database', help='filtrar pelo nome exato do banco')
        db_parsers.append(operation)
    database.set_defaults(database_help_parser=database, database_help_parsers=db_parsers)
    commands.add_parser('proxies', help='listar todos os proxies, incluindo aplicações, painel e WebSockets')
    proxy = commands.add_parser('proxy', help='consultar proxies e todas as configurações de acesso')
    proxy_actions = proxy.add_subparsers(dest='proxy_action', title='Comandos disponíveis')
    proxy_actions.add_parser('help', help='mostrar os comandos e opções de consulta dos proxies')
    proxy_parsers = []
    for action, description in [('list', 'listar proxies em tabela, incluindo os desabilitados'),
                                ('show', 'mostrar todas as configurações; informe um proxy para filtrar')]:
        operation = proxy_actions.add_parser(action, help=description, description=description+'. Somente consulta; não modifica arquivos nem containers.')
        if action == 'show':
            operation.add_argument('target', nargs='?', metavar='PROXY', help='ID, nome completo entre aspas ou domínio; omita para consultar todos e os acessos globais')
        proxy_parsers.append(operation)
    proxy.set_defaults(proxy_help_parser=proxy, proxy_help_parsers=proxy_parsers)
    commands.add_parser('apps', help='listar aplicações salvas, tipos e domínios')
    for name, action, description in [('exec', 'shell', 'abrir o shell no container da aplicação'),
                                      ('dir', 'host', 'abrir Bash na pasta da aplicação no host')]:
        shortcut = commands.add_parser(name, help=description, description=description+'. Digite exit para voltar ao Jubart.')
        shortcut.add_argument('id', metavar='APP', help='ID ou nome completo da aplicação; use aspas nos nomes com espaços; consulte jubart apps')
        shortcut.set_defaults(app_action=action)
    app = commands.add_parser('app', help='gerenciar aplicações e abrir shells; consulte jubart app help')
    actions = app.add_subparsers(dest='app_action', title='Comandos disponíveis')
    actions.add_parser('help', help='mostrar todas as ações e flags de aplicações')
    app_parsers = []
    for action, description in [('create', 'criar uma aplicação'), ('update', 'atualizar campos de uma aplicação'),
                                ('remove', 'remover o cadastro e o container, preservando arquivos e volumes'),
                                ('apply', 'aplicar um cadastro salvo ao Docker')]:
        operation = actions.add_parser(action, help=description, description=description + '. Revise e digite yes para confirmar.')
        operation.add_argument('id', nargs='?' if action == 'create' else None,
                               help='identificador main ou app2 até app100' + ('; omita para escolher o próximo disponível' if action == 'create' else '; consulte jubart apps'))
        if action in ('create', 'update'):
            for flag, help_text in [
                ('name', 'nome exibido no painel'),
                ('domain', 'hostname/IP, sem protocolo ou porta'),
                ('directory', 'pasta do projeto no host; relativa à instalação ou absoluta'),
                ('document-root', 'pasta pública PHP no container; padrão /var/www/html/public'),
                ('start-command', 'comando de início Node.js; padrão npm start'),
                ('working-directory', 'pasta de trabalho no container; padrão /var/www/html'),
                ('build-directory', 'pasta do build estático dentro do projeto; padrão dist'),
            ]:
                operation.add_argument('--' + flag, dest=flag.replace('-', '_'), help=help_text)
            operation.add_argument('--type', choices=['php', 'node', 'static'], help='tipo de aplicação; padrão php na criação')
            operation.add_argument('--port', type=int, help='porta interna do runtime, 1024 a 65535; exceto 2019')
            operation.add_argument('--mode', choices=['traditional', 'octane'], help='modo PHP; padrão traditional')
            enabled = operation.add_mutually_exclusive_group()
            enabled.add_argument('--enable', dest='enabled', action='store_true', default=None, help='habilitar a aplicação')
            enabled.add_argument('--disable', dest='enabled', action='store_false', help='desabilitar a aplicação; main deve permanecer habilitada')
            spa = operation.add_mutually_exclusive_group()
            spa.add_argument('--spa', dest='spa', action='store_true', default=None, help='ativar fallback SPA em sites estáticos')
            spa.add_argument('--no-spa', dest='spa', action='store_false', help='desativar fallback SPA')
        if action in ('create', 'update'):
            operation.add_argument('--save-only', action='store_true', help='somente salvar; não executar Docker')
        operation.add_argument('--dry-run', action='store_true', help='validar e mostrar alterações sem gravar ou executar Docker')
        app_parsers.append(operation)
    for action, description in [('shell', 'abrir Bash no container da aplicação; usa sh se Bash estiver indisponível'),
                                ('host', 'abrir Bash na pasta da aplicação no host')]:
        operation = actions.add_parser(action, help=description, description=description+'. Digite exit para voltar ao Jubart.')
        operation.add_argument('id', help='ID da aplicação, como main ou app2; consulte jubart apps')
        app_parsers.append(operation)
    app.set_defaults(app_help_parsers=app_parsers, app_help_parser=app)
    commands.add_parser('users', help='listar logins, perfis e estado das contas do painel, sem senhas')
    commands.add_parser('time', help='consultar hora, fusos dos serviços e sincronização NTP do servidor')
    certificates = commands.add_parser('certificates', help='verificar domínio, confiança e vencimento dos certificados TLS')
    certificates.add_argument('domain', nargs='?', help='domínio a consultar pela rede; sem domínio: proxy HTTPS local configurado')
    certificates.add_argument('--port', type=int, help='porta TLS; padrão 443 para domínio informado ou HTTPS_PORT para o proxy local')
    user = commands.add_parser('user', help='consultar ou alterar o login do administrador principal')
    user.add_argument('login', nargs='?', help='novo login; recria somente o painel após confirmação')
    commands.add_parser('password', help='alterar senha principal com digitação protegida e confirmação')
    commands.add_parser('start', help='iniciar somente o painel já construído')
    commands.add_parser('restart', help='recriar somente o painel após confirmação')
    return cli

def main(argv=None):
    cli = parser()
    args = cli.parse_args(argv)
    root = args.root.expanduser().resolve()
    try:
        version = json.loads((root / 'docker/panel/package.json').read_text())['version']
        if args.command == 'help':
            cli.print_help()
            print('\nExemplo: jubart panel --host 203.0.113.10 --ssh-user ubuntu\nOpções por comando: jubart panel --help')
            print('No console jubart>: digite status, apps ou app help sem o prefixo. Use clear para voltar às boas-vindas e exit ou quit para sair.')
            return 0
        if args.command == 'database' and args.database_action in (None, 'help'):
            args.database_help_parser.print_help()
            if args.database_action == 'help':
                for operation in args.database_help_parsers:
                    print()
                    operation.print_help()
            return 0
        if args.command == 'proxy' and args.proxy_action == 'help':
            args.proxy_help_parser.print_help()
            for operation in args.proxy_help_parsers:
                print()
                operation.print_help()
            return 0
        if args.command == 'app' and args.app_action in (None, 'help'):
            args.app_help_parser.print_help()
            if args.app_action == 'help':
                for operation in args.app_help_parsers:
                    print()
                    operation.print_help()
            print('\nAtalhos: jubart exec APP (container) e jubart dir APP (pasta no host). APP pode ser o ID ou o nome completo entre aspas.')
            return 0
        if args.command is None and not args.version:
            if SCREEN:
                print('Informe um comando. Exemplo: --root /caminho/da/instalacao status')
                return 1
            if sys.stdin.isatty() and sys.stdout.isatty():
                return run_console(root, version)
            print_welcome(version)
            return 0
        print('Jubart ' + safe(version))
        if args.version or args.command == 'version':
            return 0
        if args.command in ('server', 'memory', 'monitor', 'traffic'):
            if SCREEN and (getattr(args, 'watch', False) or (args.command in ('monitor', 'traffic') and not args.once)):
                return full_screen_command(lambda: jubart_metrics.run(root, compose, args, styled))
            return jubart_metrics.run(root, compose, args, styled)
        if args.command in ('queues', 'workers', 'jobs', 'schedules'):
            env = read_env(root)[1] if (root / '.env').exists() else {}
            if SCREEN and args.watch:
                return full_screen_command(lambda: jubart_automation.run(root, compose, args, env, print_table, section, styled, service_label))
            return jubart_automation.run(root, compose, args, env, print_table, section, styled, service_label)
        if args.command == 'time':
            print_server_time(read_env(root)[1] if (root / '.env').exists() else {})
            return 0
        if args.command in ('exec', 'dir') or (args.command == 'app' and args.app_action in ('shell', 'host')):
            return open_app_shell(root, args)
        if args.command in ('proxies', 'proxy'):
            env = read_env(root)[1] if (root / '.env').exists() else {}
            return jubart_proxies.run(root, env, args, print_table, section, styled)
        text, env = read_env(root)
        command = args.command
        if command in ('databases', 'database'):
            return jubart_databases.run(root, env, args, print_table, section, styled)
        if command == 'panel':
            if not 1 <= getattr(args, 'ssh_port', 22) <= 65535:
                raise ValueError('Porta SSH deve estar entre 1 e 65535.')
            print_panel(panel_info(env, getattr(args, 'host', None), getattr(args, 'ssh_user', None), getattr(args, 'ssh_port', 22)))
            try:
                row = next((r for r in running_services(root) if r['Service'] == 'panel'), None)
                print('Container do painel: ' + (service_label(row['State']) + ' · portas publicadas: ' + (row['ports'] or 'nenhuma') if row else 'não criado'))
            except ValueError:
                print('Não foi possível consultar o container agora. As informações acima são a configuração salva.')
            print('Para alterar: jubart ssh ou jubart http [--port 9090].')
            return 0
        if command in ('status', 'health'):
            rows = running_services(root)
            incomplete_ports = service_ports(root, rows)
            print_services(rows)
            if incomplete_ports:
                print(styled('  Algumas portas internas não puderam ser consultadas. O estado e a saúde disponíveis foram preservados.', 'yellow'))
            if command == 'health':
                expected = set(compose(root, ['config', '--services']).splitlines())
                states = {r['Service']: r for r in rows}
                pending = [s for s in sorted(expected) if s not in states or states[s]['State'] != 'running' or states[s]['Health'] in ('unhealthy', 'starting')]
                print('Pendências: ' + ', '.join(map(safe, pending)) if pending else 'Todos os serviços habilitados estão em execução. Serviços sem healthcheck não têm saúde comprovada.')
                return 1 if pending else 0
        elif command == 'apps':
            file = root / 'config/apps.json'
            if not file.exists():
                print('Cadastros ainda não preparados. Abra o assistente de configuração no painel.')
            else:
                apps = json.loads(file.read_text())['applications']
                section('Aplicações cadastradas — configuração salva', '📋')
                if not apps:
                    print('  Nenhuma aplicação cadastrada nesta instalação.')
                else:
                    diagnostic = None
                    try:
                        containers = {row['Service']: row['Name'] or 'nome indisponível' for row in running_services(root)}
                    except ValueError as error:
                        containers = None
                        diagnostic = str(error)
                    values, tones = [], []
                    prefix = '' if SCREEN else 'jubart '
                    for app in apps:
                        service = 'php' if app.get('id') == 'main' else 'php-' + app['id'] if app.get('id') else None
                        container = 'indisponível' if containers is None else containers.get(service, 'não criado') if service else 'não identificado'
                        directory = os.path.abspath(root / app['directory']) if app.get('directory') else 'não configurada'
                        target = shlex.quote(app['id']) if app.get('id') else None
                        values.append((app.get('id', '—'), app['name'], app.get('type', 'php'), container, app['domain'],
                                       'habilitada' if app['enabled'] else 'desabilitada', directory,
                                       prefix+'dir '+target if target else '—', prefix+'exec '+target if target else '—'))
                        tones.append(['cyan', 'cyan', 'cyan', 'red' if container == 'não criado' else 'cyan', 'cyan',
                                      'green' if app['enabled'] else 'muted', 'cyan', 'cyan', 'cyan'])
                    print_table(('ID', 'Aplicação', 'Tipo', 'Container', 'Domínio', 'Estado', 'Pasta no host',
                                 'Diretório (host)', 'Shell (container)'), values, tones)
                    print('  Atalhos: '+styled(prefix+'exec APP', 'cyan')+' (container) · '+styled(prefix+'dir APP', 'cyan')+' (pasta no host). APP: ID ou nome completo entre aspas. Digite exit no shell para voltar.')
                    if diagnostic:
                        print('  ' + styled('Não foi possível consultar os containers. ' + diagnostic, 'yellow'))
        elif command == 'site':
            return check_site(root, env, args)
        elif command in ('access', 'ssh', 'http'):
            change_access(root, text, env, args)
        elif command == 'app':
            change_app(root, env, args)
        elif command == 'users':
            print_users(root, env)
        elif command == 'certificates':
            return check_certificates(root, env, args)
        elif command in ('user', 'password'):
            change_account(root, text, env, command, getattr(args, 'login', None))
        elif command in ('start', 'restart'):
            if command == 'restart':
                confirm('O painel será recriado e as sessões serão encerradas.')
            compose(root, ['up', '-d', '--no-deps', '--no-build', *(['--force-recreate'] if command == 'restart' else []), 'panel'], 180)
            print('Operação concluída para o painel. Consulte jubart status.')
        return 0
    except (ValueError, OSError, KeyError) as error:
        # OSError paths/errors can contain local details; never print Docker stderr or full .env.
        print('\n  ' + styled(symbol('❌', '!') + ' Erro: ', 'red', sys.stderr) + (str(error) if isinstance(error, ValueError) else 'Não foi possível ler ou salvar os arquivos da instalação.'), file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
