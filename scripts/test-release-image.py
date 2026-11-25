#!/usr/bin/env python3
"""Valida a imagem do painel sem rede, socket Docker ou dados da instalação."""

import argparse
import base64
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import uuid


def run(arguments):
    # Não imprimir argumentos: docker run recebe credenciais descartáveis.
    result = subprocess.run(arguments, capture_output=True, text=True, timeout=90)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or 'Comando falhou.')
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image', help='Imagem local que será testada e publicada')
    args = parser.parse_args()
    version = json.loads((Path(__file__).resolve().parents[1] / 'docker/panel/package.json').read_text())['version']
    metadata = json.loads(run(['docker', 'image', 'inspect', args.image]))[0]
    if (metadata['Os'], metadata['Architecture']) != ('linux', 'amd64'):
        raise RuntimeError('A release deve usar a plataforma linux/amd64.')
    name = 'jubart-release-check-' + uuid.uuid4().hex[:12]
    with tempfile.TemporaryDirectory(prefix='jubart-release-check-') as folder:
        root = Path(folder)
        (root / 'app').mkdir()
        password = secrets.token_urlsafe(24)
        key = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip('=')
        (root / '.env').write_text(
            'APP_DOMAIN=smoke.localhost\nAPP_DIRECTORY=/workspace/app\n'
            'PANEL_USERNAME=smokeadmin\nPANEL_PASSWORD=' + password + '\n'
            'PANEL_VAULT_KEY=' + key + '\n'
        )
        try:
            run(['docker', 'run', '-d', '--name', name, '--network', 'none',
                 '--user', f'{os.getuid()}:{os.getgid()}', '--read-only', '--tmpfs', '/tmp',
                 '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
                 '--pids-limit', '128', '--memory', '512m',
                 '--mount', f'type=bind,source={folder},target=/workspace',
                 '-e', 'PANEL_WORKSPACE_DIRECTORY=/workspace',
                 '-e', 'PANEL_USERNAME=smokeadmin', '-e', 'PANEL_PASSWORD=' + password,
                 '-e', 'PANEL_VAULT_KEY=' + key, args.image])
            checks = r"""
              const fs = require('node:fs');
              const assert = require('node:assert/strict');
              const {execFileSync} = require('node:child_process');
              const version = process.argv[1];
              const base = 'http://127.0.0.1:3000';
              (async () => {
                let home;
                for (let attempt = 0; attempt < 100; attempt++) {
                  try { home = await fetch(base, {signal: AbortSignal.timeout(1000)}); break; }
                  catch { await new Promise(resolve => setTimeout(resolve, 100)); }
                }
                assert.equal(home?.status, 200, 'Inicialização do painel');
                assert.equal(require('/opt/panel/package.json').version, version);
                for (const path of ['.env', '.panel-state', 'test', 'frontend']) {
                  assert.equal(fs.existsSync('/opt/panel/' + path), false, path + ' fora da imagem');
                }
                const asset = await fetch(base + '/react-app.js');
                assert.equal(asset.status, 200, 'Frontend compilado');
                assert.ok((await asset.text()).includes(JSON.stringify(version)), 'Versão no frontend');
                assert.equal((await fetch(base + '/api/config')).status, 401, 'API protegida');
                const login = await fetch(base + '/api/login', {
                  method: 'POST', headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({username: process.env.PANEL_USERNAME, password: process.env.PANEL_PASSWORD})
                });
                assert.equal(login.status, 200, 'Autenticação');
                const headers = {Cookie: login.headers.get('set-cookie').split(';')[0]};
                const config = await fetch(base + '/api/config', {headers});
                assert.equal(config.status, 200, 'Configuração autenticada');
                assert.ok((await config.json()).config.applications.some(app => app.id === 'main'));
                const proxy = await fetch(base + '/api/proxy-hosts', {headers});
                assert.equal(proxy.status, 200, 'API de proxies');
                assert.deepEqual((await proxy.json()).hosts, []);
                assert.match(execFileSync('docker', ['compose', 'version'], {encoding: 'utf8'}), /version/i);
                assert.match(execFileSync('docker', ['buildx', 'version'], {encoding: 'utf8'}), /buildx/i);
                console.log('Imagem validada: inicialização, frontend, login, configuração, proxies e Docker CLI.');
              })().catch(error => { console.error(error.message); process.exitCode = 1; });
            """
            print(run(['docker', 'exec', name, 'node', '-e', checks, version]).strip())
        finally:
            subprocess.run(['docker', 'rm', '-f', name], capture_output=True, text=True, timeout=30)


if __name__ == '__main__':
    main()
