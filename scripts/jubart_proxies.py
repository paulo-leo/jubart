"""Read-only proxy configuration views; no raw environment or credentials."""
import json
from pathlib import Path
import shutil
import subprocess


def request(root, env):
    helper = 'docker/panel/proxy-cli.mjs'
    node = shutil.which('node')
    workspace = env.get('PANEL_WORKSPACE_DIRECTORY', str(root))
    commands = []
    if node:
        commands.append(([node, str(Path(__file__).resolve().parent.parent / helper)], str(root)))
    commands.append((['docker', 'compose', 'exec', '-T', 'panel', 'node', str(Path(workspace) / helper)], workspace))
    partial = None
    for command, execution_root in commands:
        try:
            result = subprocess.run(command, input=json.dumps({'root': execution_root}), cwd=root,
                                    text=True, capture_output=True, timeout=30)
            response = json.loads(result.stdout)
            if result.returncode or response.get('error') or not isinstance(response.get('routes'), list):
                if response.get('permissionDenied'):
                    continue
                raise ValueError()
            if response.get('warnings'):
                partial = response
                continue
            return response
        except (OSError, subprocess.TimeoutExpired, ValueError, AttributeError):
            break
    if partial:
        return partial
    raise ValueError('Não foi possível consultar os proxies. Confira os cadastros, Node.js no host ou o painel em execução e as permissões do Docker.')


def value(item):
    if isinstance(item, bool):
        return 'Sim' if item else 'Não'
    if isinstance(item, list) and all(isinstance(v, str) for v in item):
        return ', '.join(item) or 'nenhuma'
    if isinstance(item, (dict, list)):
        return json.dumps(item, ensure_ascii=False)
    return str(item) if item is not None else 'não configurado'


def run(root, env, args, table, section, styled):
    data = request(root, env)
    routes = data['routes']
    selector = getattr(args, 'target', None)
    if selector:
        selector = selector.strip().casefold()
        exact = [row for row in routes if row['id'].casefold() == selector]
        routes = exact or [row for row in routes if row['name'].casefold() == selector
                           or selector in [d.casefold() for d in row['domains']]]
        if not routes:
            raise ValueError('Proxy não encontrado. Consulte proxies e use o ID, nome completo ou domínio.')
        if len(routes) > 1:
            raise ValueError('Mais de um proxy corresponde à seleção. Use o ID mostrado em proxies.')
    action = 'list' if args.command == 'proxies' else args.proxy_action or 'list'
    section('Proxies e encaminhamentos — configuração salva', '🌐')
    print('  Fonte das aplicações e acessos: '+data['source']+'. Hosts adicionais: config/proxy-hosts.json.')
    if action == 'list':
        rows, tones = [], []
        for route in routes:
            rows.append((route['id'], route['name'], route['kind'], ', '.join(route['domains']) or 'não configurado',
                         route['destination'], ', '.join(route['methods']) or 'Todos',
                         'Sim' if route['tls'] else 'Não', 'habilitado' if route['enabled'] else 'desabilitado'))
            tones.append(['cyan']*6+['green' if route['tls'] else 'muted', 'green' if route['enabled'] else 'muted'])
        table(('ID', 'Nome', 'Tipo', 'Domínios', 'Destino', 'Métodos HTTP', 'HTTPS', 'Estado'), rows, tones)
        print('  Detalhes: proxy show ID. Todas as configurações: proxy show. Comandos e opções: proxy help.')
    else:
        if not selector:
            section('Acessos globais — cadastro salvo e .env', '⚙')
            table(('Configuração', 'Cadastro salvo', '.env'), data['settings'])
            table(('Traefik · configuração no .env', 'Valor'), data['environment'])
        for route in routes:
            section(route['name']+' · '+route['id'], '🌐')
            allowed = ', '.join(route['allowedIPs']) or 'Todas as origens (sem filtro nesta rota)'
            if any(key == 'Política de acesso' and policy.get('enabled') for key, policy in route['settings']):
                allowed = 'Consulte Política de acesso e Grupos de IP abaixo'
            if data.get('warnings') and route['kind'] in ('Aplicação', 'WebSocket'):
                allowed = 'Políticas de acesso não consultadas; veja aviso de leitura'
            fields = [('ID', route['id']), ('Tipo', route['kind']), ('Domínios', route['domains']),
                      ('Destino', route['destination']), ('Habilitado', route['enabled']),
                      ('Métodos HTTP', ', '.join(route['methods']) or 'Todos'), ('HTTPS', route['tls']),
                      ('Forçar HTTPS', route['forceHttps']), ('Preservar cabeçalho Host', route['passHostHeader']),
                      ('IPs/redes permitidos', allowed),
                      ('Regra Traefik', route['rule']),
                      ('Entradas', 'web e websecure' if route['tls'] else 'web'),
                      ('Resolvedor TLS', 'letsencrypt' if route['tls'] else 'não utilizado'),
                      *route['settings']]
            if route.get('configured'):
                other = route['configured']
                fields.extend([('Domínios no .env', other['domains']), ('Destino no .env', other['destination']),
                               ('Habilitado no .env', other['enabled']), ('HTTPS no .env', other['tls'])])
            if not route.get('registered', True):
                fields.append(('Origem', 'Somente no .env; ausente do cadastro salvo'))
            table(('Configuração', 'Valor'), [(key, value(val)) for key, val in fields])
    if not data['hostFileMatches']:
        print(styled('  Atenção: o arquivo de rotas dos hosts de proxy difere do cadastro. Confira Hosts de proxy no painel.', 'yellow'))
    for warning in data.get('warnings', []):
        print(styled('  '+warning, 'yellow'))
    print('  Consulta dos arquivos salvos; não comprova recarga do Traefik, DNS, firewall ou emissão de certificados. Use status e certificates para diagnóstico.')
    return 0
