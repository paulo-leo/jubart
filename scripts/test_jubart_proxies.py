from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import jubart as cli
import jubart_proxies as proxies


class ProxiesCLITest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='jubart-proxy-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'docker/panel').mkdir(parents=True)
        (self.root / 'docker/panel/package.json').write_text('{"version":"1.0.0"}')
        (self.root / '.env').write_text('PANEL_PASSWORD=PRIVATE-PASSWORD\n')
        self.route = {'id': 'main', 'name': 'Minha API', 'kind': 'Aplicação', 'domains': ['api.example.com'],
                      'enabled': True, 'destination': 'http://php:8000', 'methods': ['GET', 'POST'],
                      'tls': True, 'forceHttps': True, 'passHostHeader': True, 'allowedIPs': ['10.0.0.0/8'],
                      'rule': 'Host(`api.example.com`)', 'settings': [], 'registered': True,
                      'configured': {'domains': ['old.example.com'], 'destination': 'http://php:8000',
                                     'enabled': True, 'tls': False}}
        self.data = {'routes': [self.route], 'settings': [['Porta HTTP', 8080, 80]],
                     'environment': [['IP reservado do Traefik', '172.30.0.2']],
                     'source': 'config/apps.json', 'hostFileMatches': True, 'warnings': []}

    def run_cli(self, args):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = cli.main(['--root', str(self.root), *args])
        return code, out.getvalue(), err.getvalue()

    def test_help_is_available_without_env_and_never_contacts_docker(self):
        (self.root / '.env').unlink()
        with patch.object(proxies, 'request') as request:
            code, output, error = self.run_cli(['proxy', 'help'])
        self.assertEqual(code, 0, error)
        for text in ['jubart proxy list', 'jubart proxy show', 'PROXY', 'Somente consulta', 'ID, nome completo']:
            self.assertIn(text, output)
        request.assert_not_called()

    def test_list_and_details_render_tables_without_exposing_environment(self):
        with patch.object(proxies, 'request', return_value=self.data):
            for command in [['proxies'], ['proxy'], ['proxy', 'list']]:
                code, output, error = self.run_cli(command)
                self.assertEqual(code, 0, error)
                self.assertIn('Métodos HTTP', output)
                self.assertIn('http://php:8000', output)
                self.assertNotIn('PRIVATE-PASSWORD', output+error)
            for selector in ['main', 'MINHA api', 'API.example.com']:
                code, output, error = self.run_cli(['proxy', 'show', selector])
                self.assertEqual(code, 0, error)
                self.assertIn('Forçar HTTPS', output)
                self.assertIn('10.0.0.0/8', output)
                self.assertIn('old.example.com', output)
            code, output, error = self.run_cli(['proxy', 'show'])
            self.assertEqual(code, 0, error)
            self.assertIn('Cadastro salvo', output)
            self.assertIn('172.30.0.2', output)

    def test_unknown_and_ambiguous_targets_do_not_choose_another_proxy(self):
        with patch.object(proxies, 'request', return_value=self.data):
            code, output, error = self.run_cli(['proxy', 'show', 'missing'])
            self.assertEqual(code, 1)
            self.assertIn('Proxy não encontrado', error)
            self.data['routes'].append({**self.route, 'id': 'app2'})
            code, output, error = self.run_cli(['proxy', 'show', 'Minha API'])
            self.assertEqual(code, 1)
            self.assertIn('Mais de um proxy', error)
            self.assertEqual(self.run_cli(['proxy', 'show', 'main'])[0], 0)

    def test_warnings_preserve_available_configuration(self):
        self.data.update(hostFileMatches=False, warnings=['Políticas indisponíveis por permissão.'])
        with patch.object(proxies, 'request', return_value=self.data):
            code, output, error = self.run_cli(['proxies'])
        self.assertEqual(code, 0, error)
        self.assertIn('arquivo de rotas', output)
        self.assertIn('Políticas indisponíveis', output)
        self.assertIn('Minha API', output)

    def test_private_files_use_container_fallback_and_partial_data_survives_docker_error(self):
        partial = {**self.data, 'warnings': ['Políticas indisponíveis.']}
        complete = subprocess.CompletedProcess([], 0, json.dumps(self.data), '')
        result = subprocess.CompletedProcess([], 0, json.dumps(partial), '')
        with patch.object(proxies.shutil, 'which', return_value='/usr/bin/node'), \
             patch.object(proxies.subprocess, 'run', side_effect=[result, complete]) as run:
            self.assertEqual(proxies.request(self.root, {}), self.data)
        self.assertEqual(run.call_args_list[1].args[0][:6], ['docker', 'compose', 'exec', '-T', 'panel', 'node'])
        with patch.object(proxies.shutil, 'which', return_value='/usr/bin/node'), \
             patch.object(proxies.subprocess, 'run', side_effect=[result, OSError('PRIVATE-ERROR')]):
            self.assertEqual(proxies.request(self.root, {}), partial)

    def test_invalid_helper_output_does_not_echo_stderr_or_raw_secrets(self):
        result = subprocess.CompletedProcess([], 1, 'PRIVATE-RESPONSE', 'PRIVATE-STDERR')
        with patch.object(proxies.shutil, 'which', return_value='/usr/bin/node'), \
             patch.object(proxies.subprocess, 'run', return_value=result):
            with self.assertRaises(ValueError) as caught:
                proxies.request(self.root, {})
        self.assertNotIn('PRIVATE', str(caught.exception))
