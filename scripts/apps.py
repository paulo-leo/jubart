#!/usr/bin/env python3
"""Gerencia os três slots de aplicação; execute com sudo se Docker exigir."""
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
SLOTS = {'main': ('php', 'node'), 'app2': ('php-app2', 'node-app2'), 'app3': ('php-app3', 'node-app3')}

SLOTS.update({f'app{n}':(f'php-app{n}',f'node-app{n}') for n in range(4,101)})

def main():
    if len(sys.argv) < 3 or sys.argv[1] not in SLOTS:
        sys.exit('Uso: python3 scripts/apps.py main|app2|app3 status|up|stop|logs|shell|db-init|artisan [args]|composer [args]|npm [args]')
    slot, action = sys.argv[1:3]
    extra = sys.argv[3:]
    php, node = SLOTS[slot]
    saved = json.loads((ROOT / 'config/apps.json').read_text())
    app = next((a for a in saved['applications'] if a['id'] == slot),None)
    if not app:
        sys.exit('Aplicação não cadastrada. Use Nova aplicação no painel.')
    kind = app.get('type', 'php')
    if kind != 'php' and action in ('artisan', 'composer', 'db-init'):
        sys.exit('Esta ação exige aplicação PHP. Use o painel Bancos para provisionar acesso aos outros tipos.')
    base = ['docker', 'compose']
    if slot != 'main':
        base += ['--profile', slot]
    if action == 'db-init':
        # config é capturado em memória; nunca imprimir valores com credenciais.
        config = json.loads(subprocess.check_output(base + ['config', '--format', 'json'], cwd=ROOT))
        env = config['services'][php]['environment']
        database, user, password = (str(env[k]) for k in ('DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD'))
        if not password:
            sys.exit('Defina uma senha de banco para a aplicação antes de executar db-init.')
        # NO_BACKSLASH_ESCAPES garante que aspas duplicadas sejam suficientes.
        literal = lambda value: "'" + value.replace("'", "''") + "'"
        identifier = '`' + database.replace('`', '``') + '`'
        sql = "SET SESSION sql_mode='NO_BACKSLASH_ESCAPES';\n"
        sql += f'CREATE DATABASE IF NOT EXISTS {identifier} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n'
        sql += f"CREATE USER IF NOT EXISTS {literal(user)}@'%' IDENTIFIED BY {literal(password)};\n"
        sql += f"GRANT ALL PRIVILEGES ON {identifier}.* TO {literal(user)}@'%';\n"
        subprocess.run(base + ['exec', '-T', 'mariadb', 'sh', '-c',
                       'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb --user=root'],
                       input=sql, text=True, cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
        print('Banco e permissões preparados. Senhas de usuários existentes não foram alteradas.')
        return
    commands = {
        'status': ['ps', '-a', php],
        'up': ['up', '-d', '--build', '--force-recreate', php, 'traefik'],
        'stop': ['stop', php],
        'logs': ['logs', '-f', '--tail=100', php],
        'shell': ['exec', php, 'bash' if kind == 'php' else 'sh'],
        'artisan': ['exec', php, 'php', 'artisan', *extra],
        'composer': ['run', '--rm', '--no-deps', php, 'composer', *extra],
        'npm': ['run', '--rm', '--no-deps', node, *extra],
    }
    if action not in commands:
        sys.exit('Ação desconhecida. Execute sem argumentos para consultar o uso.')
    subprocess.run(base + commands[action], cwd=ROOT, check=True)


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as exc:
        sys.exit(exc.returncode)
