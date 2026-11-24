"""Read-only views of the panel registry and Laravel automation bridge."""
from datetime import datetime
import json
import math
import os
from pathlib import Path
import re
import sys
import termios
import time
import tty

from jubart_terminal import Viewport, table_lines, wrap


def app_id(value):
    return isinstance(value, str) and (value == 'main' or bool(re.fullmatch(r'app(?:[2-9]|[1-9][0-9]|100)', value)))


def load(root, env):
    file = root / 'config/automation.json'
    try:
        config = json.loads(file.read_text()) if file.exists() else {'version': 1, 'workers': [], 'jobs': [], 'schedulers': []}
        if config.get('version') != 1 or any(not isinstance(config.get(key), list) or len(config[key]) > 50 for key in ('workers', 'jobs', 'schedulers')):
            raise ValueError()
        identities = set()
        for kind in ('workers', 'jobs', 'schedulers'):
            for item in config[kind]:
                identity = item['id']
                if not re.fullmatch(kind[:-1] + r'-[a-f0-9]{12}', identity) or identity in identities or not app_id(item['app']):
                    raise ValueError()
                identities.add(identity)
                if kind != 'jobs' and not isinstance(item.get('enabled'), bool):
                    raise ValueError()
                if kind == 'workers' and (item.get('connection') not in ('redis', 'database') or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}', item.get('queue', ''))):
                    raise ValueError()
                if kind == 'jobs' and (not isinstance(item.get('name'), str) or not isinstance(item.get('class'), str)):
                    raise ValueError()
        apps_file = root / 'config/apps.json'
        if apps_file.exists():
            applications = json.loads(apps_file.read_text())['applications']
            if not isinstance(applications, list) or any(not app_id(app.get('id')) for app in applications):
                raise ValueError()
        else:
            profiles = env.get('COMPOSE_PROFILES', '').split(',')
            ids = ['main', *[f'app{n}' for n in range(2, 101) if f'APP_{n}_DIRECTORY' in env]]
            applications = [{'id': identity, 'type': env.get(('APP' if identity == 'main' else 'APP_'+identity[3:])+'_TYPE', 'php'),
                             'enabled': identity == 'main' or identity in profiles} for identity in ids]
        return config, {app['id']: app for app in applications}
    except (ValueError, KeyError, TypeError, AttributeError):
        raise ValueError('Cadastro de aplicações/automações inválido. Confira config/apps.json e config/automation.json.')


def states(root, compose):
    raw = compose(root, ['--profile', '*', 'ps', '--all', '--format', 'json'], 15)
    try:
        rows = json.loads(raw) if raw.strip().startswith('[') else [json.loads(line) for line in raw.splitlines() if line.strip()]
        return {row['Service']: row for row in rows}
    except (ValueError, KeyError, TypeError):
        raise ValueError('Não foi possível interpretar o estado das automações no Docker.')


def active(applications, identity):
    app = applications.get(identity)
    if not app or app.get('type', 'php') != 'php':
        raise ValueError('Automações Laravel exigem uma aplicação PHP cadastrada.')
    if not app.get('enabled'):
        raise ValueError('Aplicação desabilitada; habilite e aplique antes de consultar Laravel.')


def runtime_prefix(identity):
    return [] if identity == 'main' else ['--profile', identity]


def service(identity):
    return 'php' if identity == 'main' else 'php-'+identity


def statistics(root, compose, applications, identity, queues):
    active(applications, identity)
    raw = compose(root, [*runtime_prefix(identity), 'exec', '-T', service(identity), 'php', '/opt/infra/automation.php', 'status'],
                  25, input=json.dumps({'queues': [{'id': row['id'], 'queue': row['queue'], 'connection': row['connection']} for row in queues]}))
    try:
        marker = '__INFRA_JSON__'
        if marker not in raw:
            raise ValueError()
        response = json.loads(raw.rsplit(marker, 1)[1])
        result = response.get('data')
        if response.get('ok') is not True or not isinstance(result, dict) or not isinstance(result.get('queues'), list) or not isinstance(result.get('failed'), list):
            raise ValueError()
        if any(not isinstance(item, dict) or not isinstance(item.get('counts', {}), dict) for item in result['queues']) or any(not isinstance(item, dict) for item in result['failed']):
            raise ValueError()
        return result
    except (ValueError, TypeError, AttributeError):
        # Never echo application startup output, exceptions or job payloads.
        raise ValueError('Consulta Laravel indisponível. Confira dependências, conexões e a ponte /opt/infra/automation.php na imagem PHP.')


def protected_schedule(root, compose, applications, identity, env):
    active(applications, identity)
    prefix = 'APP' if identity == 'main' else 'APP_'+identity[3:]
    directory = env.get(prefix+'_DIRECTORY') or applications[identity].get('directory')
    secrets = dict(env)
    if directory:
        app_env = Path(root / directory) / '.env'
        try:
            if app_env.exists():
                for line in app_env.read_text().splitlines():
                    match = re.match(r'^([A-Z][A-Z0-9_]*)=(.*)$', line)
                    if match:
                        secrets['APP_ENV_'+match[1]] = match[2].strip().strip('\"\'')
        except OSError:
            raise ValueError('Agenda indisponível: não foi possível ler o ambiente da aplicação para proteger a saída.')
    raw = compose(root, [*runtime_prefix(identity), 'exec', '-T', service(identity), 'php', 'artisan', 'schedule:list', '--no-ansi'], 25)
    for key, value in secrets.items():
        if re.search(r'PASSWORD|SECRET|TOKEN|ACCESS_KEY|VAULT_KEY|APP_KEY', key) and len(value) > 3:
            raw = raw.replace(value, '[oculto]')
    # Strip terminal control sequences but preserve newlines/table formatting.
    raw = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', raw)
    return '\n'.join(re.sub(r'[\x00-\x08\x0b-\x1f\x7f-\x9f]', '', line) for line in raw.splitlines())[:60000]


def count(value):
    return str(value) if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else '—'


def snapshot(root, compose, args, env):
    config, applications = load(root, env)
    if args.app and (not app_id(args.app) or args.app not in applications):
        raise ValueError('--app deve indicar uma aplicação cadastrada; consulte apps.')
    if args.app and applications[args.app].get('type', 'php') != 'php':
        raise ValueError('Automações Laravel exigem uma aplicação PHP.')
    workers = [item for item in config['workers'] if not args.app or item['app'] == args.app]
    jobs = [item for item in config['jobs'] if not args.app or item['app'] == args.app]
    schedulers = [item for item in config['schedulers'] if not args.app or item['app'] == args.app]
    sections, errors, containers = [], [], None
    if (args.command in ('queues', 'workers') and workers) or (args.command == 'schedules' and schedulers):
        try:
            containers = states(root, compose)
        except ValueError:
            errors.append('Estado Docker indisponível. Confira status e as permissões de acesso ao Docker.')

    def state(item):
        if containers is None:
            return 'indisponível', '—'
        row = containers.get(item['id'])
        return (row.get('State', 'indisponível'), row.get('Name') or '—') if row else ('não criado', 'não criado')

    if args.command == 'workers':
        rows = [(item['id'], item['app'], item['queue'], item['connection'], 'habilitada' if item['enabled'] else 'desabilitada', *state(item)) for item in workers]
        sections.append(('Workers cadastrados', ('ID', 'Aplicação', 'Fila', 'Conexão', 'Configuração', 'Estado', 'Container'), rows,
                         'Nenhum worker cadastrado nesta seleção.'))
        sections.append(('Sobre esta consulta', None, [], 'Somente workers cadastrados no Jubart. Em execução indica o estado do container; não comprova que jobs estão sendo processados.'))
    elif args.command == 'jobs' and not args.failed:
        sections.append(('Jobs cadastrados', ('ID', 'Aplicação', 'Nome', 'Classe'),
                         [(item['id'], item['app'], item['name'], item['class']) for item in jobs], 'Nenhum job cadastrado nesta seleção.'))
        sections.append(('Sobre esta consulta', None, [], 'O cadastro é um catálogo; não indica que o job foi executado. Use queues para contagens e jobs --failed para falhas.'))
    elif args.command in ('queues', 'jobs'):
        if args.command == 'queues' and args.queue:
            workers = [item for item in workers if item['queue'] == args.queue and item['connection'] == (args.connection or 'redis')]
            if not workers:
                workers = [{'id': 'consulta', 'app': args.app, 'queue': args.queue, 'connection': args.connection or 'redis', 'unregistered': True}]
        identities = sorted({item['app'] for item in workers}) if args.command == 'queues' else [args.app] if args.app else sorted(identity for identity, app in applications.items() if app.get('enabled') and app.get('type', 'php') == 'php')
        rows = []
        if not identities and args.command == 'jobs':
            errors.append('Nenhuma aplicação PHP habilitada para consultar falhas.')
        for identity in identities:
            selected = [item for item in workers if item['app'] == identity]
            result = None
            try:
                result = statistics(root, compose, applications, identity, selected)
            except ValueError as error:
                errors.append(identity+': '+str(error))
            if args.command == 'queues':
                for item in selected:
                    entry = next((entry for entry in result['queues'] if entry.get('id') == item['id']), {}) if result else {}
                    counts = entry.get('counts') or {}
                    if result and count(counts.get('total')) == '—':
                        errors.append(identity+' / '+item['queue']+': contagens indisponíveis; confira conexão e logs.')
                    worker_state = 'não cadastrado' if item.get('unregistered') else state(item)[0]
                    rows.append((identity, item['queue'], item['connection'], *[count(counts.get(key)) for key in ('pending', 'reserved', 'delayed', 'total')], worker_state))
            elif result:
                if result.get('failedError'):
                    errors.append(identity+': falhas indisponíveis; confira o provedor database/database-uuids, tabela e conexão.')
                rows += [(item.get('id', '—'), identity, item.get('connection', '—'), item.get('queue', '—'), item.get('failedAt', '—')) for item in result['failed'][:30]]
        if args.command == 'queues':
            sections.append(('Filas — contagens consultadas no Laravel', ('Aplicação', 'Fila', 'Conexão', 'Pendentes', 'Reservados', 'Atrasados', 'Total', 'Worker'), rows,
                             'Nenhuma fila cadastrada nesta seleção. Para consultar outra fila: queues --app main --queue default --connection redis.'))
        else:
            sections.append(('Jobs com falha — até 30 registros recentes por aplicação', ('ID', 'Aplicação', 'Conexão', 'Fila', 'Data'), rows,
                             'Nenhuma falha retornada pelas consultas disponíveis.' if errors else 'Nenhuma falha registrada nas aplicações consultadas.'))
        sections.append(('Sobre esta consulta', None, [], '— = contagem não fornecida pela versão Laravel ou consulta indisponível. Payloads e exceções dos jobs não são exibidos.'))
    else:
        sections.append(('Agendadores cadastrados', ('ID', 'Aplicação', 'Configuração', 'Estado', 'Container'),
                         [(item['id'], item['app'], 'habilitada' if item['enabled'] else 'desabilitada', *state(item)) for item in schedulers],
                         'Nenhum agendador cadastrado nesta seleção. A agenda pode existir na aplicação sem agendador cadastrado no Jubart.'))
        identities = [args.app] if args.app else sorted(identity for identity, app in applications.items() if app.get('enabled') and app.get('type', 'php') == 'php')
        if not identities:
            errors.append('Nenhuma aplicação PHP habilitada para consultar a agenda.')
        for identity in identities:
            try:
                output = protected_schedule(root, compose, applications, identity, env)
                sections.append(('Agenda Laravel · '+identity, None, [], output or 'Laravel não retornou tarefas agendadas.'))
            except ValueError as error:
                errors.append(identity+': '+str(error))
    return sections, errors


def run(root, compose, args, env, print_table, section, styled, label):
    if not math.isfinite(args.interval) or not 3 <= args.interval <= 60:
        raise ValueError('--interval deve estar entre 3 e 60 segundos.')
    if args.command == 'queues':
        if args.queue and (not args.app or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}', args.queue)):
            raise ValueError('--queue exige --app e um nome de fila com letras, números, ponto, hífen ou sublinhado.')
        if args.connection and not args.queue:
            raise ValueError('--connection exige --queue e --app.')

    def values(headers, rows):
        rows = [tuple(label(value) if header in ('Estado', 'Worker') else value for header, value in zip(headers, row)) for row in rows]
        tones = [['red' if value in ('não criado', 'indisponível', 'falhando', 'inativo') else 'green' if value == 'em execução' else 'cyan' for value in row] for row in rows]
        return rows, tones

    def display(sections, errors):
        print('Consultas de automação · '+datetime.now().strftime('%H:%M:%S'))
        for error in errors:
            print(styled('! '+error, 'red'))
        for title, headers, rows, empty in sections:
            section(title)
            if rows:
                print_table(headers, *values(headers, rows))
            else:
                print(empty)
        return int(bool(errors))

    live = args.watch and sys.stdin.isatty() and sys.stdout.isatty() and os.environ.get('TERM') != 'dumb'
    if not live:
        return display(*snapshot(root, compose, args, env))
    descriptor, previous, viewport = sys.stdin.fileno(), None, None
    try:
        previous = termios.tcgetattr(descriptor)
        tty.setcbreak(descriptor, termios.TCSANOW)
        viewport = Viewport('JUBART · '+{'queues': 'Filas', 'workers': 'Workers', 'jobs': 'Jobs', 'schedules': 'Agendadores'}[args.command],
                            footer='q ou Ctrl+C: voltar | PgUp/PgDn: rolar')
        viewport.enter()
        while True:
            started = time.monotonic()
            sections, errors = snapshot(root, compose, args, env)
            def layout(columns, height):
                lines = [styled('! '+error, 'red') for error in errors]
                for title, headers, rows, empty in sections:
                    lines += ['', styled(title, 'bold'), styled('─'*columns, 'muted')]
                    if rows:
                        formatted, tones = values(headers, rows)
                        lines += table_lines(headers, formatted, columns, tones, styled, indent=0)
                    else:
                        lines += wrap(empty, columns)
                return lines
            viewport.blocks = [layout]
            viewport.prompt = f'Atualização: {datetime.now().strftime("%H:%M:%S")} | Intervalo mínimo: {args.interval:g}s'
            viewport.draw()
            if viewport.wait(max(.05, args.interval-(time.monotonic()-started)), descriptor):
                break
    except KeyboardInterrupt:
        pass
    finally:
        if previous is not None:
            termios.tcsetattr(descriptor, termios.TCSADRAIN, previous)
        if viewport:
            viewport.leave()
    print('Acompanhamento de automações encerrado.')
    return 0
