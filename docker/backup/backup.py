import datetime as dt
import fcntl
import gzip
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from zoneinfo import ZoneInfo

ROOT = Path('/backups')
ENGINE = os.environ.get('BACKUP_ENGINE', 'mariadb')


def log(message):
    print(f'{dt.datetime.now(dt.timezone.utc).isoformat()} {message}', flush=True)


def enabled(name):
    value = os.environ.get(name, 'false').lower()
    if value not in ('true', 'false'):
        raise ValueError(f'{name}: use true ou false')
    return value == 'true'


def settings():
    retention = int(os.environ['BACKUP_RETENTION_DAYS'])
    if retention < 0:
        raise ValueError('BACKUP_RETENTION_DAYS deve ser >= 0')
    if enabled('BACKUP_REMOTE_ENABLED'):
        if not os.environ.get('BACKUP_S3_BUCKET'):
            raise ValueError('Defina BACKUP_S3_BUCKET para envio remoto')
    return retention


def remote_upload():
    env = os.environ.copy()
    env.update({
        'RCLONE_CONFIG_DEST_TYPE': 's3',
        'RCLONE_CONFIG_DEST_PROVIDER': env['BACKUP_S3_PROVIDER'],
        'RCLONE_CONFIG_DEST_ACCESS_KEY_ID': env['BACKUP_S3_ACCESS_KEY_ID'],
        'RCLONE_CONFIG_DEST_SECRET_ACCESS_KEY': env['BACKUP_S3_SECRET_ACCESS_KEY'],
        'RCLONE_CONFIG_DEST_REGION': env['BACKUP_S3_REGION'],
        'RCLONE_CONFIG_DEST_ENDPOINT': env['BACKUP_S3_ENDPOINT'],
        'RCLONE_CONFIG_DEST_ENV_AUTH': env['BACKUP_S3_ENV_AUTH'],
    })
    prefix = env['BACKUP_REMOTE_PREFIX'].strip('/')
    destination = 'dest:' + env['BACKUP_S3_BUCKET'].strip('/')
    if prefix:
        destination += '/' + prefix
    # Também tenta novamente arquivos cujo envio anterior falhou.
    for path in sorted(ROOT.glob(f'{ENGINE}-*.sql.gz')):
        marker = path.with_name(path.name + '.uploaded')
        if marker.exists():
            continue
        for source in (path, path.with_name(path.name + '.sha256')):
            subprocess.run(['rclone', 'copyto', str(source), destination + '/' + source.name,
                            '--retries', '3', '--low-level-retries', '5',
                            '--contimeout', '30s', '--timeout', '5m'], env=env, check=True)
        marker.touch(mode=0o600)
        log(f'Upload concluído: {path.name}')


def client_env():
    env = os.environ.copy()
    env['MYSQL_PWD'] = env['BACKUP_DB_PASSWORD']
    env['PGPASSWORD'] = env['BACKUP_DB_PASSWORD']
    return env


def databases():
    selected = os.environ.get('BACKUP_DATABASES', os.environ['BACKUP_DB_DATABASE'])
    if selected == '*':
        if ENGINE == 'mariadb':
            args = ['mariadb', '--host=' + os.environ.get('BACKUP_DB_HOST', 'mariadb'), '--user=' + os.environ.get('BACKUP_DB_USERNAME', 'root'), '--batch', '--skip-column-names', '--execute', "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME NOT IN ('mysql','information_schema','performance_schema','sys')"]
        else:
            args = ['psql', '--host=' + os.environ.get('BACKUP_DB_HOST', 'postgres'), '--username=' + os.environ['BACKUP_DB_USERNAME'], '--dbname=postgres', '--no-psqlrc', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', '--command', 'SELECT datname FROM pg_database WHERE NOT datistemplate']
        names = subprocess.check_output(args, env=client_env(), text=True).strip().splitlines()
    else:
        names = selected.split(',')
    names = list(dict.fromkeys(name.strip() for name in names if name.strip()))
    if not names:
        raise ValueError('Nenhum banco selecionado para backup')
    for name in names:
        if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}', name):
            raise ValueError('Nome de banco incompatível com a rotina de backup')
    return names


def dump_database(database):
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    name = f'{ENGINE}-{database}-{stamp}.sql.gz'
    target = ROOT / name
    tmp = ROOT / (name + '.tmp')
    if ENGINE == 'mariadb':
        args = ['mariadb-dump', '--host=' + os.environ.get('BACKUP_DB_HOST', 'mariadb'), '--port=3306', '--user=' + os.environ.get('BACKUP_DB_USERNAME', 'root'), '--single-transaction', '--quick', '--routines', '--events', '--triggers', '--hex-blob', '--databases', database]
    else:
        args = ['pg_dump', '--host=' + os.environ.get('BACKUP_DB_HOST', 'postgres'), '--port=5432', '--username=' + os.environ['BACKUP_DB_USERNAME'], '--dbname=' + database, '--format=plain', '--create']
    log(f'Iniciando dump: {ENGINE}/{database}')
    try:
        proc = subprocess.Popen(args, stdout=subprocess.PIPE, env=client_env())
        try:
            with gzip.open(tmp, 'wb') as output:
                shutil.copyfileobj(proc.stdout, output)
            if proc.wait() != 0:
                raise RuntimeError('Dump falhou; arquivo incompleto descartado')
        finally:
            proc.stdout.close()
            if proc.poll() is None:
                proc.terminate()
                proc.wait()
        with gzip.open(tmp, 'rb') as source:
            while source.read(1024 * 1024):
                pass
        tmp.replace(target)
        digest = hashlib.sha256()
        with target.open('rb') as source:
            for block in iter(lambda: source.read(1024 * 1024), b''):
                digest.update(block)
        target.with_name(name + '.sha256').write_text(f'{digest.hexdigest()}  {name}\n')
        log(f'Backup local validado: {name}')
        return target
    finally:
        tmp.unlink(missing_ok=True)


def backup():
    retention = settings()
    track_status = os.environ.get('BACKUP_TRACK_GLOBAL_STATUS', 'true')
    if track_status not in ('true', 'false'):
        raise ValueError('BACKUP_TRACK_GLOBAL_STATUS: use true ou false')
    ROOT.mkdir(parents=True, exist_ok=True)
    with (ROOT / '.backup.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Outro backup está em execução nesse diretório')
        try:
            created = {dump_database(database) for database in databases()}
            if enabled('BACKUP_REMOTE_ENABLED'):
                remote_upload()
            if retention:
                cutoff = time.time() - retention * 86400
                for item in ROOT.glob(f'{ENGINE}-*.sql.gz'):
                    if item not in created and item.stat().st_mtime < cutoff:
                        if enabled('BACKUP_REMOTE_ENABLED') and not item.with_name(item.name + '.uploaded').exists():
                            continue
                        item.unlink()
                        for suffix in ('.sha256', '.uploaded'):
                            item.with_name(item.name + suffix).unlink(missing_ok=True)
            if track_status == 'true':
                (ROOT / '.last-success').write_text(str(time.time()))
                (ROOT / '.last-error').unlink(missing_ok=True)
            log('Ciclo concluído com sucesso')
        except Exception:
            if track_status == 'true':
                (ROOT / '.last-error').write_text(str(time.time()))
            raise


def status():
    import json
    files = sorted(ROOT.glob(f'{ENGINE}-*.sql.gz'), key=lambda p: p.stat().st_mtime, reverse=True)
    def stamp(name):
        item = ROOT / name
        return float(item.read_text()) if item.exists() else None
    print(json.dumps({'engine': ENGINE, 'lastSuccess': stamp('.last-success'), 'lastError': stamp('.last-error'), 'fileCount': len(files), 'bytes': sum(p.stat().st_size for p in files), 'files': [{'name': p.name, 'bytes': p.stat().st_size, 'createdAt': p.stat().st_mtime, 'uploaded': p.with_name(p.name + '.uploaded').exists()} for p in files[:30]]}))


def delete_backup(name):
    if not re.fullmatch(rf'{ENGINE}-[A-Za-z0-9_.-]+\.sql\.gz', name) or '..' in name:
        raise ValueError('Nome de backup inválido')
    with (ROOT / '.backup.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Backup em execução; tente excluir após sua conclusão')
        target = ROOT / name
        if target.is_symlink() or not target.is_file():
            raise ValueError('Backup local inexistente ou inválido')
        target.unlink()
        for suffix in ('.sha256', '.uploaded'):
            target.with_name(name + suffix).unlink(missing_ok=True)
        log(f'Backup local excluído: {name}; cópia remota preservada')


def main():
    os.umask(0o077)
    mode = sys.argv[1] if len(sys.argv) > 1 else 'schedule'
    if ENGINE not in ('mariadb', 'postgres'):
        raise ValueError('BACKUP_ENGINE deve ser mariadb ou postgres')
    if mode == 'delete':
        if len(sys.argv) != 3:
            raise ValueError('Informe um único arquivo de backup')
        delete_backup(sys.argv[2])
        return
    if mode == 'status':
        status()
        return
    if mode == 'health':
        if not enabled('BACKUP_ENABLED'):
            return
        if (ROOT / '.last-error').exists():
            raise RuntimeError('Último ciclo de backup falhou; consulte logs')
        stamp = float((ROOT / '.last-success').read_text())
        if time.time() - stamp > int(os.environ['BACKUP_MAX_AGE_HOURS']) * 3600:
            raise RuntimeError('Último backup excedeu idade máxima')
        return
    if mode == 'delegated-once':
        if os.environ.get('BACKUP_DATABASES') == '*' or len(databases()) != 1:
            raise ValueError('Backup delegado exige um único banco explícito')
        os.environ['BACKUP_RETENTION_DAYS'] = '0'
        os.environ['BACKUP_REMOTE_ENABLED'] = 'false'
        os.environ['BACKUP_TRACK_GLOBAL_STATUS'] = 'false'
        backup()
        return
    settings()
    if mode == 'once':
        backup()
        return
    if mode != 'schedule':
        raise ValueError('Use schedule, once ou health')
    if not enabled('BACKUP_ENABLED'):
        log('Backup agendado desativado; backup manual continua disponível')
        while True:
            time.sleep(30)
    from croniter import croniter
    schedule = os.environ['BACKUP_SCHEDULE']
    if len(schedule.split()) != 5 or not croniter.is_valid(schedule):
        raise ValueError('BACKUP_SCHEDULE exige expressão cron com cinco campos')
    timezone = ZoneInfo(os.environ['BACKUP_TIMEZONE'])
    if enabled('BACKUP_RUN_ON_START'):
        try:
            backup()
        except Exception as exc:
            log(f'ERRO: {exc}')
    while True:
        next_run = croniter(schedule, dt.datetime.now(timezone)).get_next(dt.datetime)
        log(f'Próximo backup: {next_run.isoformat()}')
        while time.time() < next_run.timestamp():
            time.sleep(min(30, max(0, next_run.timestamp() - time.time())))
        try:
            backup()
        except Exception as exc:
            log(f'ERRO: {exc}')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        log(f'ERRO: {exc}')
        sys.exit(1)
