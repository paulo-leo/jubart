#!/usr/bin/env python3
"""Integração real e isolada do runtime da CLI; não usa a instalação local."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pty
import select
import shutil
import signal
import struct
import subprocess
import tempfile
import termios
import time
import uuid


SOURCE = Path(__file__).resolve().parents[1]


def run(args, root, env, timeout=90):
    result = subprocess.run(args, cwd=root, env=env, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        # Os testes não imprimem .env nem argumentos com credenciais.
        raise RuntimeError(result.stderr[-2500:] or result.stdout[-2500:] or 'Comando falhou.')
    return result.stdout


def console(root, env, project):
    pid, descriptor = pty.fork()
    if pid == 0:
        os.execve(str(root / 'jubart'), ['jubart'], env)
    saved = termios.tcgetattr(descriptor)
    buffer = b''

    def expect(needle, timeout=30):
        nonlocal buffer
        deadline = time.monotonic() + timeout
        wanted = needle.encode()
        while time.monotonic() < deadline:
            if wanted in buffer:
                buffer = buffer.split(wanted, 1)[1]
                return
            if select.select([descriptor], [], [], .2)[0]:
                try:
                    chunk = os.read(descriptor, 65536)
                except OSError:
                    break
                if not chunk:
                    break
                buffer += chunk
        raise AssertionError('Console não retornou: '+needle+'; saída: '+buffer[-1500:].decode(errors='replace'))

    def send(value):
        os.write(descriptor, value.encode())

    try:
        fcntl.ioctl(descriptor, termios.TIOCSWINSZ, struct.pack('HHHH', 30, 110, 0, 0))
        expect('jubart>')
        send('dir main\r')
        expect('Digite exit para voltar.')
        expect('$ ')
        send("printf 'host-shell-ok' > host-proof.txt\r")
        send('exit\r')
        expect('Shell encerrado.')
        assert (project / 'host-proof.txt').read_text() == 'host-shell-ok', 'Bash deve executar no host, fora do mount somente leitura.'
        expect('jubart>')
        send('exec main\r')
        expect('Digite exit para voltar.')
        expect('# ')
        send('echo "APP_SHELL=$JUBART_TEST_APP"\r')
        expect('APP_SHELL=isolated')
        send('exit\r')
        expect('Shell encerrado.')
        expect('jubart>')
        send('memory --host-only\r')
        expect('RAM')
        expect('jubart>')
        fcntl.ioctl(descriptor, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 65, 0, 0))
        send('\x0c')
        send('monitor --host-only\r')
        expect('Monitor ao vivo')
        expect('RAM')
        send('\x03')
        expect('Monitoramento encerrado.')
        expect('jubart>')
        send('exit\r')
        expect('Saindo do Jubart.')
        deadline = time.monotonic()+20
        while time.monotonic() < deadline:
            child, status = os.waitpid(pid, os.WNOHANG)
            if child:
                assert os.waitstatus_to_exitcode(status) == 0, 'Código do console: '+str(os.waitstatus_to_exitcode(status))
                current = termios.tcgetattr(descriptor)
                assert current[3] & (termios.ECHO|termios.ICANON) == saved[3] & (termios.ECHO|termios.ICANON)
                return
            if select.select([descriptor], [], [], .1)[0]:
                try: os.read(descriptor,65536)
                except OSError: pass
        raise AssertionError('Console não encerrou.')
    finally:
        try: os.kill(pid, signal.SIGTERM)
        except ProcessLookupError: pass
        os.close(descriptor)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image')
    args = parser.parse_args()
    docker = shutil.which('docker')
    assert docker, 'Docker é necessário para o teste.'
    identity = 'jubart-cli-test-'+uuid.uuid4().hex[:10]
    with tempfile.TemporaryDirectory(prefix='jubart-runtime-test-') as folder:
        base = Path(folder)
        root = base/'instalação com espaços'
        project = base/'projeto externo'
        root.mkdir(); project.mkdir()
        files = run(['git','ls-files','-z'],SOURCE,os.environ).split('\0')
        files += ['scripts/cli-runtime.sh','scripts/build-cli.sh','config/cli-image']
        for name in set(filter(None,files)):
            source = SOURCE/name
            if source.is_file():
                target = root/name
                target.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(source,target)
        fake = base/'host-bin'; fake.mkdir()
        marker = base/'host-dependency-called'
        for name in ['python3','node']:
            path=fake/name
            path.write_text('#!/bin/sh\ntouch "$JUBART_TEST_HOST_MARKER"\nexit 99\n')
            path.chmod(0o755)
        (fake/'docker').write_text('#!/bin/sh\nif [ "${1:-}" = compose ]; then touch "$JUBART_TEST_HOST_MARKER"; exit 99; fi\nexec '+str(docker)+' "$@"\n')
        (fake/'docker').chmod(0o755)
        env={**os.environ,'PATH':str(fake)+':'+os.environ['PATH'],'JUBART_CLI_IMAGE':args.image,
             'JUBART_TEST_HOST_MARKER':str(marker),'TERM':'xterm-256color','JUBART_NO_ANIMATION':'1',
             'COMPOSE_PROJECT_NAME':identity,'COMPOSE_FILE':'compose.yaml'}
        env.pop('COMPOSE_ENV_FILES',None); env.pop('DOCKER_CONTEXT',None)
        installed = base/'bin'; installed.mkdir()
        # Apenas bootstrap: nenhum serviço da instalação real é criado/recriado.
        install=['sh','install.sh','--no-start','--non-interactive','--bin-dir',str(installed)]
        output=run(install,root,env)
        before=(root/'.env').read_bytes()
        for line in before.decode().splitlines():
            if line.startswith('PANEL_PASSWORD='):
                assert line.split('=',1)[1].strip("'\"") not in output
        run(install,root,env)
        assert (root/'.env').read_bytes()==before,'Reinstalação não pode girar credenciais ou alterar configurações.'
        assert 'Jubart' in run([str(installed/'jubart'),'version'],base,env)
        run([str(root/'jubart'),'help'],root,env)
        run([str(root/'jubart'),'proxies'],root,env)
        run([str(root/'jubart'),'app','update','main','--name','Nome em teste','--dry-run'],root,env)
        assert 'version' in run([str(root/'jubart'),'compose','version'],root,env).lower()
        config={'applications':[{'id':'main','name':'Teste isolado','domain':'test.localhost','directory':str(project),'enabled':True,'type':'php'}]}
        (root/'config/apps.json').write_text(json.dumps(config))
        (root/'compose.yaml').write_text(json.dumps({'services':{'php':{
            'image':identity+':app','build':{'context':'.','dockerfile':'Dockerfile.test'},
            'command':['sleep','300'],'network_mode':'none',
            'environment':{'JUBART_TEST_APP':'isolated'},
            'volumes':[str(project)+':/var/www/html']}}}))
        (root/'Dockerfile.test').write_text('FROM '+args.image+'\nRUN python3 -c "import ssl, zoneinfo; zoneinfo.ZoneInfo(\'UTC\')"\n')
        (root/'.dockerignore').write_text('**\n!Dockerfile.test\n')
        execute=['sh','-c','. ./scripts/cli-runtime.sh; jubart_runtime "$@"','sh']
        env['JUBART_ROOT']=str(root)
        try:
            run([str(root/'jubart'),'compose','build','php'],root,env,timeout=180)
            run([*execute,'docker','compose','up','-d','php'],root,env)
            assert 'php' in run([str(root/'jubart'),'status'],root,env)
            assert 'Teste isolado' in run([str(root/'jubart'),'apps'],root,env)
            memory=run([str(root/'jubart'),'memory','--host-only'],root,env)
            assert 'RAM' in memory
            run([str(root/'jubart'),'time'],root,env)
            protected=hashlib.sha256((root/'.env').read_bytes()).hexdigest()
            console(root,env,project)
            assert hashlib.sha256((root/'.env').read_bytes()).hexdigest()==protected
            assert not marker.exists(),'Python, Node e Compose do host não podem ser usados.'
        finally:
            # O único serviço criado pelo teste pertence ao projeto aleatório.
            run([*execute,'docker','compose','down','--remove-orphans'],root,env)
            run([docker,'image','rm',identity+':app'],root,env)
        print('CLI em container validada: bootstrap/reinstalação, symlink global, painel parado, métricas, console, dir no host e exec no container; sem Python/Node/Compose no host.')


if __name__=='__main__':
    main()
