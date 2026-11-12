#!/usr/bin/env python3
"""Host CLI for Jubart. Standard library only; never source .env as shell code."""
import argparse
import getpass
import http.client
import socket
import ssl
import time
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent

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

def compose(root, args, timeout=30):
    try:
        result = subprocess.run(['docker', 'compose', *args], cwd=root, capture_output=True,
                                text=True, timeout=timeout)
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
            item = {k: safe(row.get(k, '')) for k in ['Service', 'State', 'Health']}
            item['ports'] = ', '.join(f"{safe(p.get('URL', ''))}:{int(p['PublishedPort'])}→{int(p['TargetPort'])}/{safe(p.get('Protocol', 'tcp'))}" for p in (row.get('Publishers') or []) if p.get('PublishedPort'))
            result.append(item)
        return result
    except (ValueError, TypeError, AttributeError):
        raise ValueError('Resposta de estado inválida do Docker Compose.')

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
    width = min(72, max(24, shutil.get_terminal_size((80, 24)).columns - 4))
    print('\n  ' + styled(symbol(emoji) + '  ' + title, 'bold'))
    print('  ' + styled('─' * width, 'muted'))


def detail(label, value, tone='cyan'):
    print('  ' + styled(label + ': ', 'muted') + styled(safe(value), tone))


def terminal_logo(colored):
    """Half-block pixels sampled from the official SVG; no imaging dependency at runtime."""
    logo = json.loads(Path(__file__).with_name('cli-logo.json').read_text())
    palette = logo['palette']
    rows = [[row[i:i+2] for i in range(0, len(row), 2)] for row in logo['rows']]
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
        for top, bottom in zip(rows[y], rows[y+1]):
            upper, lower = color(top), color(bottom)
            if colored:
                if upper is None and lower is None:
                    line += '\033[0m '
                elif upper is None:
                    line += escape(lower) + '\033[49m▄'
                else:
                    line += escape(upper) + escape(lower, True) + '▀'
            else:
                line += {(False, False): ' ', (True, False): '▀', (False, True): '▄', (True, True): '█'}[bool(visible(upper)), bool(visible(lower))]
        lines.append('  ' + line + ('\033[0m' if colored else ''))
    return '\n'.join(lines)


def print_brand(version):
    logo = terminal_logo(use_color()).splitlines()
    identity = [styled('JUBART · ' + safe(version), 'blue'),
                styled('O controle da sua infraestrutura.', 'bold'), '',
                styled('Desenvolvedor', 'muted'), 'Paulo Leonardo da .S. Cassimiro', '',
                symbol('🧭') + '  Seus ambientes, em um só lugar.',
                'Comece com ' + styled('jubart help', 'cyan')]
    print()
    if shutil.get_terminal_size((80, 24)).columns >= 104 and sys.stdout.isatty():
        for index, line in enumerate(logo):
            offset = index - 5
            print(line + '    ' + (identity[offset] if 0 <= offset < len(identity) else ''))
    else:
        print('\n'.join(logo))
        print('\n' + styled('  JUBART · ' + safe(version), 'blue'))
        print('  O controle da sua infraestrutura.')
        print('  Desenvolvedor: Paulo Leonardo da .S. Cassimiro')
        print('  ' + symbol('🧭') + ' Digite ' + styled('jubart help', 'cyan') + ' para conhecer os comandos.')


def service_label(value):
    return {'running': 'em execução', 'created': 'criado', 'restarting': 'reiniciando',
            'exited': 'encerrado', 'paused': 'pausado', 'dead': 'inativo',
            'removing': 'em remoção', 'healthy': 'saudável',
            'unhealthy': 'falhando', 'starting': 'iniciando'}.get(value, safe(value))


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

def confirm(message):
    if not sys.stdin.isatty():
        raise ValueError('Esta alteração exige um terminal interativo.')
    if input(styled(symbol('⚠️') + ' ' + message, 'yellow') + ' Digite SIM para continuar: ').strip() != 'SIM':
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


def change_access(root, text, env, args):
    if not args.mode:
        print_panel(panel_info(env, args.host, args.ssh_user, args.ssh_port))
        print('Para alterar: jubart access tunnel ou jubart access http [--port 9090].')
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
    confirm('Salvar este modo de acesso e recriar somente o painel?')
    # Keep the panel draft in sync so the next Apply does not restore the old mode.
    if updated is not None:
        replace_checked(file, updated, before)
    try:
        update_env_values(root, values, text)
    except Exception:
        if updated is not None:
            replace_checked(file, before, updated)
        raise
    print('Modo salvo. Recriando o painel…')
    try:
        compose(root, ['up', '-d', '--no-deps', '--no-build', '--force-recreate', 'panel'], 180)
    except ValueError:
        raise ValueError('Modo salvo, mas o painel não foi recriado. Execute jubart restart para efetivar a mudança; confira jubart status.')
    print_panel(info)
    print('Painel recriado. Atualize qualquer aba aberta antes de editar a configuração novamente.')


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
    cli = PortugueseArgumentParser(prog='jubart', description='Jubart — administração local da instalação. Sem comando: versão, acesso e serviços.')
    cli.add_argument('--root', type=Path, default=ROOT, help='raiz de outra instalação Jubart')
    cli.add_argument('--version', action='store_true', help='mostrar versão e sair')
    commands = cli.add_subparsers(dest='command', title='Comandos disponíveis')
    commands.add_parser('help', help='listar comandos e opções')
    commands.add_parser('version', help='mostrar versão instalada')
    panel = commands.add_parser('panel', help='mostrar HTTP/HTTPS, porta e comando de túnel SSH')
    panel.add_argument('--host', help='IP ou hostname SSH da VPS')
    panel.add_argument('--ssh-user', help='usuário SSH da VPS')
    panel.add_argument('--ssh-port', type=int, default=22, help='porta SSH (padrão 22)')
    access = commands.add_parser('access', help='consultar ou alternar o painel entre túnel SSH e HTTP por porta')
    access.add_argument('mode', nargs='?', choices=['tunnel', 'http'], help='modo de acesso desejado')
    access.add_argument('--port', type=int, help='porta do painel no host')
    access.add_argument('--host', help='IP ou hostname SSH para o exemplo do túnel')
    access.add_argument('--ssh-user', help='usuário SSH para o exemplo do túnel')
    access.add_argument('--ssh-port', type=int, default=22, help='porta SSH (padrão 22)')
    site = commands.add_parser('site', help='testar a resposta HTTP das aplicações na porta publicada; padrão: main')
    site.add_argument('app', nargs='?', default='main', help='identificador da aplicação (padrão main)')
    site.add_argument('--all', action='store_true', help='testar todas as aplicações habilitadas')
    commands.add_parser('status', help='listar estado e saúde dos containers')
    commands.add_parser('health', help='verificar serviços habilitados; retorna erro se houver pendências')
    commands.add_parser('apps', help='listar aplicações salvas, tipos e domínios')
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
            return 0
        if args.command is None and not args.version:
            print_brand(version)
        else:
            print('Jubart ' + safe(version))
        if args.version or args.command == 'version':
            return 0
        text, env = read_env(root)
        command = args.command
        if command in (None, 'panel'):
            if not 1 <= getattr(args, 'ssh_port', 22) <= 65535:
                raise ValueError('Porta SSH deve estar entre 1 e 65535.')
            print_panel(panel_info(env, getattr(args, 'host', None), getattr(args, 'ssh_user', None), getattr(args, 'ssh_port', 22)))
            if command:
                try:
                    row = next((r for r in running_services(root) if r['Service'] == 'panel'), None)
                    print('Container do painel: ' + (service_label(row['State']) + ' · portas publicadas: ' + (row['ports'] or 'nenhuma') if row else 'não criado'))
                except ValueError:
                    print('Não foi possível consultar o container agora. As informações acima são a configuração salva.')
                return 0
        if command in (None, 'status', 'health'):
            rows = running_services(root)
            section('Serviços em execução / containers criados:', '📦')
            for row in rows:
                problem = row['State'] != 'running' or row['Health'] in ('unhealthy', 'starting')
                tone = 'red' if row['Health'] == 'unhealthy' else 'yellow' if problem else 'green'
                marker = symbol('⚠️' if problem else '✅', '!' if problem else '+')
                print('  ' + styled(marker + ' ' + row['Service'], tone) + '  ' + styled(service_label(row['State']), tone))
                print('     ' + styled('Saúde: ', 'muted') + service_label(row['Health'] or 'sem verificação de saúde'))
                print('     ' + styled('Portas: ', 'muted') + (row['ports'] or 'nenhuma'))
            if not rows:
                print('  Nenhum container encontrado nesta instalação.')
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
                for app in json.loads(file.read_text())['applications']:
                    print(f"  {safe(app['name'])}: {safe(app.get('type', 'php'))} · {safe(app['domain'])} · {'habilitada' if app['enabled'] else 'desabilitada'}")
        elif command == 'site':
            return check_site(root, env, args)
        elif command == 'access':
            change_access(root, text, env, args)
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
