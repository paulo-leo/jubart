"""Read-only database inventory and connection guidance for Jubart."""
import json
from pathlib import Path
import shutil
import subprocess


def request(root, env, engine):
    helper = 'docker/panel/database-cli.mjs'
    node = shutil.which('node')
    workspace = str(root) if node else env.get('PANEL_WORKSPACE_DIRECTORY', str(root))
    command = [node, str(Path(__file__).resolve().parent.parent / helper)] if node else [
        'docker', 'compose', 'exec', '-T', 'panel', 'node', str(Path(workspace) / helper)]
    try:
        result = subprocess.run(command, input=json.dumps({'root': workspace, 'engine': engine}),
                                cwd=root, text=True, capture_output=True, timeout=60)
        response = json.loads(result.stdout)
        if result.returncode or response.get('error') or not isinstance(response.get('servers'), list):
            raise ValueError()
        return response['servers']
    except (OSError, subprocess.TimeoutExpired, ValueError, AttributeError):
        raise ValueError('Não foi possível consultar os bancos. Confira Node.js no host ou o painel em execução e as permissões do Docker.')


def run(root, env, args, table, section, styled):
    servers = request(root, env, args.engine)
    action = 'list' if args.command == 'databases' else (args.database_action or 'list')
    failed = False
    for server in servers:
        engine = server['engine']
        section(('PostgreSQL' if engine == 'postgres' else 'MariaDB') + ' — ' + {
            'list': 'Bancos de dados', 'users': 'Usuários e permissões', 'access': 'Acesso ao banco'}[action], '🗄')
        if not server['enabled']:
            print('  Banco desativado na configuração da infraestrutura.')
            continue
        if server['status'] != 'available':
            print(styled('  ' + server['error'], 'red'))
            failed = True
            # Saved addresses are still useful to diagnose external access.
            if action != 'access':
                continue
        database = getattr(args, 'database', None)
        dbs = [db for db in server['databases'] if not database or db['name'] == database]
        if database and server['status'] == 'available' and not dbs:
            print(styled('  Banco não encontrado neste servidor: ' + database, 'red'))
            failed = True
            continue
        if action == 'list':
            rows = [(d['name'], size(d.get('bytes')), d.get('owner', '—'),
                     str(d.get('connections', '—')), 'padrão' if d['name'] == server['connection']['defaultDatabase'] else '') for d in dbs]
            table(('Banco', 'Tamanho', 'Proprietário', 'Conexões', 'Configuração'), rows)
        elif action == 'users':
            rows = []
            for user in server['users']:
                account = "'" + user['name'] + "'@'" + user['host'] + "'"
                grants = [g for g in server['grants'] if (g.get('user') == user['name'] or g.get('grantee') == account)
                          and (not database or g['database'] == database)]
                if database and not grants and not user['admin']:
                    continue
                permissions = '; '.join(g['database'] + ': ' + g['privileges'] for g in grants)
                rows.append((user['name'], user['host'], 'bloqueado' if user['locked'] else 'habilitado',
                             'administrativa / protegida' if user['admin'] else 'aplicação', permissions or '—'))
            table(('Usuário', 'Host', 'Login', 'Perfil', 'Permissões por banco'), rows)
            print('  PostgreSQL: CONNECT não comprova acesso a schemas/tabelas. Contas administrativas ficam protegidas no painel.')
        else:
            connection = server['connection']
            bind = connection['bindAddress']
            host = bind if bind in ('127.0.0.1', '::1', 'localhost') else 'IP_DO_SERVIDOR'
            table(('Origem', 'Endereço', 'Banco'), [
                ('Rede Docker', f"{engine}:{connection['port']}", database or connection['defaultDatabase']),
                ('Cliente no servidor (configuração salva)', f"{host}:{connection['hostPort']}", database or connection['defaultDatabase']),
            ])
            if bind in ('127.0.0.1', '::1', 'localhost'):
                print('  A porta está configurada para acesso local. No DBeaver/pgAdmin remoto, habilite túnel SSH para o servidor.')
            else:
                print('  Confira publicação real e firewall em jubart status e no painel em Proxy & acessos.')
            print('  No painel: Dados → Bancos de dados → selecione o servidor → Configurar acesso.')
            print('  O assistente cria usuário, concede permissões, testa o login e salva a conexão após confirmação.')
            print('  Dados → Conexões → Redefinir senha altera a senha da conta e sincroniza conexões salvas.')
            print('  O login do painel é separado do login do banco. A conta administrativa não pode ser usada no console SQL.')
    return 1 if failed else 0


def size(value):
    value = float(value or 0)
    for unit in ('B', 'KiB', 'MiB', 'GiB', 'TiB'):
        if value < 1024 or unit == 'TiB':
            return f'{value:.1f} {unit}'
        value /= 1024
