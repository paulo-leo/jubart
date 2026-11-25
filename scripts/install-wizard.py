"""Assistente local de instalação; não envia nem imprime credenciais."""
import getpass
import os
from pathlib import Path
import re
import sys
import tempfile
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def valid_password(value):
    return (16 <= len(value) <= 128 and value == value.strip()
            and not any(c in value for c in "'\r\n\x00")
            and sum(bool(re.search(p, value)) for p in (r'[a-z]', r'[A-Z]', r'[0-9]', r'[^A-Za-z0-9]')) >= 3)


def encode(value):
    if any(c in value for c in "'\r\n\x00"):
        raise ValueError('Não use aspas simples ou quebras de linha nos valores.')
    return "'" + value + "'"


def ask(label, default, validate):
    while True:
        value = input(f'{label} [{default}]: ').strip() or default
        if validate(value):
            return value
        print('Valor inválido. Tente novamente.')


def timezone_valid(value):
    try:
        ZoneInfo(value)
        return True
    except (ZoneInfoNotFoundError, ValueError):
        return False


def configure(root):
    file = root / '.env'
    text = file.read_text() if file.exists() else (root / '.env.example').read_text()
    values = dict(re.findall(r'^([A-Z][A-Z0-9_]*)=(.*)$', text, re.M))
    password = values.get('PANEL_PASSWORD', '').strip("'\"")
    if password and not password.startswith('troque-'):
        print('Instalação existente: credenciais e configurações preservadas. Altere-as pelo painel ou CLI.')
        return
    if not sys.stdin.isatty():
        raise ValueError('Abra um terminal interativo ou use --non-interactive para gerar credenciais automaticamente.')
    print('\n🐋 Configuração inicial do Jubart\nA senha será digitada sem aparecer na tela.')
    username = ask('Usuário administrador (3 a 48 caracteres)', 'admin',
                   lambda v: bool(re.fullmatch(r'[A-Za-z][A-Za-z0-9_.-]{2,47}', v)))
    while True:
        password = getpass.getpass('Senha (16 a 128 caracteres; três grupos entre letras maiúsculas/minúsculas, números e símbolos; sem aspas simples): ')
        if not valid_password(password):
            print('A senha não atende aos requisitos.')
            continue
        if password == getpass.getpass('Repita a senha: '):
            break
        print('As senhas não coincidem.')
    existing_projects = values.get('PANEL_PROJECTS_DIRECTORY', '').strip("'\"")
    default_projects = existing_projects if existing_projects and not existing_projects.startswith('/caminho/') else str(root / 'projects')
    print('A pasta dos projetos pode ficar fora do Jubart, por exemplo /var/www. Ela será compartilhada com o painel.')
    projects = ask('Pasta que contém os projetos (deve existir)', default_projects,
                   lambda v: Path(v).is_absolute() and (Path(v).is_dir() or v == str(root / 'projects')) and not any(c in v for c in "'\"$`\r\n:"))
    port = ask('Porta HTTP do painel', values.get('PANEL_PORT', '9090'),
               lambda v: v.isascii() and v.isdigit() and 1024 <= int(v) <= 65535)
    print('local: acesso neste host ou por túnel SSH. public: HTTP pelo IP; exige liberar a porta no firewall e não cifra o tráfego.')
    access = ask('Modo de acesso: local ou public', 'local', lambda v: v in ('local', 'public'))
    timezone = ask('Fuso horário IANA', values.get('TZ', 'America/Sao_Paulo'), timezone_valid)
    maria = ask('Habilitar MariaDB? true/false', values.get('MARIADB_ENABLED', 'true'), lambda v: v in ('true', 'false'))
    postgres = ask('Habilitar PostgreSQL? true/false', values.get('POSTGRES_ENABLED', 'true'), lambda v: v in ('true', 'false'))
    print(f'\nProjetos: {projects}\nPainel: {access}, porta {port}\nFuso: {timezone}\nMariaDB: {maria}; PostgreSQL: {postgres}')
    if ask('Salvar e continuar? yes/no', 'yes', lambda v: v in ('yes', 'no')) != 'yes':
        raise ValueError('Instalação cancelada; nenhuma configuração foi salva.')
    changes = {'PANEL_USERNAME': username, 'PANEL_PASSWORD': password,
               'PANEL_WORKSPACE_DIRECTORY': str(root), 'PANEL_PROJECTS_DIRECTORY': projects,
               'PANEL_PORT': port, 'PANEL_BIND_ADDRESS': '127.0.0.1' if access == 'local' else '0.0.0.0',
               'TZ': timezone, 'MARIADB_ENABLED': maria, 'POSTGRES_ENABLED': postgres}
    # Literal single quotes prevent Compose from interpolating $ in passwords.
    for key, value in changes.items():
        line = key + '=' + encode(value)
        pattern = re.compile(r'^' + re.escape(key) + r'=.*$', re.M)
        text = pattern.sub(lambda _: line, text) if pattern.search(text) else text.rstrip() + '\n' + line + '\n'
    Path(projects).mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.env-install-', dir=root)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(text)
        os.chmod(temp, 0o600)
        os.replace(temp, file)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    print('Configuração salva no .env com permissão 600. A senha não será exibida.')


if __name__ == '__main__':
    try:
        configure(Path(os.environ.get('JUBART_ROOT', Path(__file__).resolve().parents[1])))
    except (ValueError, OSError, EOFError, KeyboardInterrupt) as error:
        print(f'Instalação interrompida: {error}', file=sys.stderr)
        sys.exit(1)
