import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('jubart_cli', SOURCE / 'scripts/jubart.py')
cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cli)

class JubartTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='jubart-cli-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'docker/panel').mkdir(parents=True)
        (self.root / 'docker/panel/package.json').write_text('{"version":"1.0.0"}')
        (self.root / '.env').write_text('PANEL_USERNAME=admin\nPANEL_PASSWORD=Secret-do-not-show-123\nPANEL_BIND_ADDRESS=127.0.0.1\nPANEL_PORT=9090\nPANEL_VAULT_KEY=never-show-key\n')

    def run_cli(self, args):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = cli.main(['--root', str(self.root), *args])
        return code, out.getvalue(), err.getvalue()

    def test_help_version_and_saved_access_never_disclose_secrets(self):
        for args in [['help'], ['version'], ['--version'], ['user'], ['panel', '--host', '203.0.113.10', '--ssh-user', 'ubuntu', '--ssh-port', '2222']]:
            with patch.object(cli, 'compose', side_effect=ValueError('unavailable')):
                code, out, err = self.run_cli(args)
            self.assertEqual(code, 0, err)
            self.assertNotIn('Secret-do-not-show', out + err)
            self.assertNotIn('never-show-key', out + err)
        self.assertIn('ssh -N -L 9090:127.0.0.1:9090 -p 2222 ubuntu@203.0.113.10', out)
        self.assertIn('NO SEU COMPUTADOR', out)

    def test_commands_and_options_are_english_with_portuguese_help(self):
        parser = cli.parser()
        code, output, error = self.run_cli(['help'])
        self.assertEqual(code, 0)
        self.assertIn('Comandos disponíveis:', output)
        self.assertIn('mostrar esta ajuda e sair', output)
        self.assertNotIn('show this help message', output)
        for command in ['version', 'panel', 'access', 'status', 'health', 'apps', 'user', 'password', 'start', 'restart']:
            self.assertEqual(parser.parse_args([command]).command, command)
        args = parser.parse_args(['access', 'tunnel', '--port', '9090'])
        self.assertEqual(args.mode, 'tunnel')
        self.assertEqual(args.port, 9090)
        for invalid in [['painel'], ['access', 'tunel'], ['access', 'http', '--porta', '9090']]:
            errors = io.StringIO()
            with redirect_stderr(errors), self.assertRaises(SystemExit) as caught:
                parser.parse_args(invalid)
            self.assertEqual(caught.exception.code, 2)
            self.assertIn('Erro: comando ou opção inválida', errors.getvalue())
        self.assertEqual(cli.service_label('healthy'), 'saudável')

    def test_default_command_displays_whale_credit_and_operational_information(self):
        with patch.object(cli, 'compose', return_value='[]'):
            code, output, error = self.run_cli([])
        self.assertEqual(code, 0, error)
        self.assertIn('JUBART · 1.0.0', output)
        self.assertIn('█', output)
        self.assertIn('Desenvolvedor: Paulo Leonardo da .S. Cassimiro', output)
        self.assertIn('Painel — configuração salva', output)
        self.assertIn('Serviços em execução', output)
        self.assertNotIn('Secret-do-not-show', output)
        self.assertNotIn('\x1b[', output)
        for args in [['version'], ['help']]:
            self.assertNotIn('Desenvolvedor:', self.run_cli(args)[1])

    def test_site_main_checks_local_published_port_and_host_without_exposing_response(self):
        with (self.root / '.env').open('a') as stream:
            stream.write('HTTP_PORT=8088\nAPP_DOMAIN=app.example.com\n')
        with patch.object(cli.http.client, 'HTTPConnection') as connection:
            connection.return_value.getresponse.return_value.status = 200
            code, out, err = self.run_cli(['site'])
            self.assertEqual(code, 0, err)
            connection.assert_called_once_with('app.example.com', 8088, timeout=10)
            self.assertEqual(connection.return_value.request.call_args.kwargs['headers']['Host'], 'app.example.com:8088')
            with patch.object(cli.socket, 'create_connection') as connect:
                connection.return_value._create_connection(('app.example.com', 8088))
                self.assertEqual(connect.call_args.args[0], ('127.0.0.1', 8088))
            self.assertIn('HTTP 200', out)
            self.assertNotIn('Secret-do-not-show', out)
            connection.return_value.close.assert_called_once()

    def test_site_reports_errors_redirects_and_unreachable_ports(self):
        for status, expected in [(302, 0), (404, 1), (500, 1), (502, 1)]:
            with patch.object(cli.http.client, 'HTTPConnection') as connection:
                connection.return_value.getresponse.return_value.status = status
                self.assertEqual(self.run_cli(['site'])[0], expected)
        with patch.object(cli.http.client, 'HTTPConnection') as connection:
            connection.return_value.request.side_effect = ConnectionRefusedError()
            code, out, err = self.run_cli(['site'])
            self.assertEqual(code, 1)
            self.assertIn('sem resposta HTTP válida', out)
        self.assertEqual(self.run_cli(['site', 'missing'])[0], 1)

    def test_terminal_logo_comes_from_official_svg_and_respects_plain_output(self):
        import hashlib
        logo = json.loads((SOURCE / 'scripts/cli-logo.json').read_text())
        self.assertEqual(logo['sha256'], hashlib.sha256((SOURCE / 'icon.svg').read_bytes()).hexdigest())
        self.assertEqual(len(logo['rows']), 40)
        self.assertTrue(all(len(row) == 80 for row in logo['rows']))
        self.assertIn('\x1b[38;2;', cli.terminal_logo(True))
        self.assertNotIn('\x1b[', cli.terminal_logo(False))

    def test_terminal_styling_and_no_color_preserve_information(self):
        with patch('sys.stdout.isatty', return_value=True), patch.dict(os.environ, {'TERM': 'xterm-256color'}, clear=True):
            self.assertIn('\x1b[92m', cli.styled('Saudável', 'green'))
            self.assertEqual(cli.symbol('✅'), '✅')
            self.assertIn('\x1b[96m', cli.parser().format_help())
            with patch.dict(os.environ, {'NO_COLOR': '1'}):
                self.assertEqual(cli.styled('Saudável', 'green'), 'Saudável')
                self.assertNotIn('\x1b[', cli.parser().format_help())
        rows = [{'Service': 'panel', 'State': 'running', 'Health': 'healthy', 'ports': '127.0.0.1:9090'}]
        with patch.object(cli, 'running_services', return_value=rows):
            code, output, error = self.run_cli(['status'])
        self.assertEqual(code, 0, error)
        self.assertIn('em execução', output)
        self.assertIn('saudável', output)
        self.assertIn('127.0.0.1:9090', output)
        self.assertNotIn('\x1b[', output)

    def test_docker_permission_error_has_actionable_diagnostic_without_raw_stderr(self):
        result = subprocess.CompletedProcess([], 1, '', 'permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock; secret-never-print')
        with patch.object(cli.subprocess, 'run', return_value=result):
            with self.assertRaisesRegex(ValueError, 'Sem permissão para acessar o Docker') as caught:
                cli.compose(self.root, ['ps'])
        self.assertNotIn('secret-never-print', str(caught.exception))
        result.stderr = 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock'
        with patch.object(cli.subprocess, 'run', return_value=result):
            with self.assertRaisesRegex(ValueError, 'daemon Docker não está disponível'):
                cli.compose(self.root, ['ps'])

    def test_public_proxy_and_ssh_validation(self):
        info = cli.panel_info({'PANEL_BIND_ADDRESS':'0.0.0.0','PANEL_PROXY_ENABLED':'true','PANEL_TLS_ENABLED':'true','PANEL_DOMAIN':'panel.example.com'})
        self.assertEqual(info['dominio'], 'https://panel.example.com')
        self.assertNotIn('tunnel', info)
        with self.assertRaises(ValueError):
            cli.panel_info({}, '-oProxyCommand=bad', 'user')
        self.assertEqual(self.run_cli(['panel', '--ssh-port', '0'])[0], 1)

    def test_status_parses_both_compose_formats_and_health_detects_missing(self):
        rows = [{'Service':'panel','State':'running','Health':'healthy','Publishers':[{'URL':'127.0.0.1','PublishedPort':9090,'TargetPort':3000,'Protocol':'tcp'}]}]
        for raw in [json.dumps(rows), '\n'.join(map(json.dumps, rows))]:
            with patch.object(cli, 'compose', return_value=raw):
                self.assertIn('9090', cli.running_services(self.root)[0]['ports'])
        with patch.object(cli, 'compose', side_effect=[json.dumps(rows), 'panel\nmariadb\n']):
            code, out, err = self.run_cli(['health'])
        self.assertEqual(code, 1)
        self.assertIn('Pendências: mariadb', out)
        with patch.object(cli, 'compose', side_effect=[json.dumps(rows), 'panel\n']):
            self.assertEqual(self.run_cli(['health'])[0], 0)

    def test_username_change_is_confirmed_updates_only_login_and_recreates_only_panel(self):
        original = (self.root / '.env').read_text()
        with patch.object(cli, 'confirm', side_effect=ValueError('cancelada')):
            self.assertEqual(self.run_cli(['user','paulo'])[0], 1)
        self.assertEqual((self.root / '.env').read_text(), original)
        with patch.object(cli, 'confirm'), patch.object(cli, 'compose', return_value='') as compose:
            self.assertEqual(self.run_cli(['user','paulo'])[0], 0)
            self.assertEqual(compose.call_args.args[1], ['up','-d','--no-deps','--no-build','--force-recreate','panel'])
        updated = (self.root / '.env').read_text()
        self.assertIn('PANEL_USERNAME=paulo', updated)
        self.assertIn('PANEL_PASSWORD=Secret-do-not-show-123', updated)
        self.assertEqual((self.root / '.env').stat().st_mode & 0o777, 0o600)
        users = self.root / '.panel-state/panel-users'
        users.mkdir(parents=True)
        (users / 'users.json').write_text('[{"username":"reserved"}]')
        self.assertEqual(self.run_cli(['user','reserved'])[0], 1)

    def test_password_is_prompted_and_preserves_dollar_signs_without_output(self):
        password='New$Password1234567'
        with patch('sys.stdin.isatty', return_value=True), patch.object(cli.getpass, 'getpass', side_effect=['Secret-do-not-show-123',password,password]), patch.object(cli, 'confirm'), patch.object(cli, 'compose', return_value=''):
            code, out, err = self.run_cli(['password'])
        self.assertEqual(code, 0, err)
        self.assertNotIn(password, out + err)
        self.assertEqual(cli.read_env(self.root)[1]['PANEL_PASSWORD'], password)
        self.assertIn("PANEL_PASSWORD='New$Password1234567'", (self.root / '.env').read_text())

    def test_access_switch_updates_env_and_panel_config_and_provides_tunnel(self):
        (self.root / 'config').mkdir()
        config = {'proxy': {'httpPort': 80, 'tls': True, 'panel': {'domain': 'old.example.com', 'tls': True}}, 'applications': [{'id': 'main'}]}
        config_file = self.root / 'config/apps.json'
        config_file.write_text(json.dumps(config))
        with patch.object(cli, 'confirm'), patch.object(cli, 'compose', return_value='') as compose:
            code, out, err = self.run_cli(['access', 'http', '--port', '9095'])
        self.assertEqual(code, 0, err)
        env = cli.read_env(self.root)[1]
        self.assertEqual(env['PANEL_BIND_ADDRESS'], '0.0.0.0')
        self.assertEqual(env['PANEL_PORT'], '9095')
        self.assertEqual(env['PANEL_COOKIE_SECURE'], 'false')
        self.assertEqual(env['PANEL_PROXY_ENABLED'], 'false')
        saved = json.loads(config_file.read_text())
        self.assertFalse(saved['proxy']['panel']['tls'])
        self.assertTrue(saved['proxy']['tls'])
        self.assertEqual(saved['applications'], config['applications'])
        self.assertEqual(compose.call_args.args[1], ['up', '-d', '--no-deps', '--no-build', '--force-recreate', 'panel'])
        with patch.object(cli, 'confirm'), patch.object(cli, 'compose', return_value=''):
            code, out, err = self.run_cli(['access', 'tunnel', '--host', '203.0.113.10', '--ssh-user', 'ubuntu'])
        self.assertEqual(code, 0, err)
        self.assertEqual(cli.read_env(self.root)[1]['PANEL_BIND_ADDRESS'], '127.0.0.1')
        self.assertEqual(json.loads(config_file.read_text())['proxy']['panel']['bindAddress'], '127.0.0.1')
        self.assertIn('ssh -N -L 9095:127.0.0.1:9095 -p 22 ubuntu@203.0.113.10', out)
        self.assertNotIn('Secret-do-not-show', out + err)

    def test_access_cancel_invalid_port_and_failed_recreation(self):
        before = (self.root / '.env').read_text()
        with patch.object(cli, 'confirm', side_effect=ValueError('cancelada')), patch.object(cli, 'compose') as compose:
            self.assertEqual(self.run_cli(['access', 'http'])[0], 1)
            compose.assert_not_called()
        self.assertEqual((self.root / '.env').read_text(), before)
        self.assertEqual(self.run_cli(['access', 'http', '--port', '0'])[0], 1)
        (self.root / '.env').write_text(before + 'HTTP_PORT=80\n')
        self.assertEqual(self.run_cli(['access', 'http', '--port', '80'])[0], 1)
        with patch.object(cli, 'confirm'), patch.object(cli, 'compose', side_effect=ValueError('unavailable')):
            code, out, err = self.run_cli(['access', 'http'])
        self.assertEqual(code, 1)
        self.assertIn('Modo salvo', err)
        self.assertIn('jubart restart', err)
        self.assertEqual(cli.read_env(self.root)[1]['PANEL_BIND_ADDRESS'], '0.0.0.0')

    def test_installer_wires_command_and_start_using_fake_docker_without_touching_host(self):
        shutil.copy(SOURCE / 'install.sh', self.root)
        shutil.copy(SOURCE / 'jubart', self.root)
        (self.root / 'scripts').mkdir()
        shutil.copy(SOURCE / 'scripts/jubart.py', self.root / 'scripts')
        (self.root / '.env.example').write_text('NODE_VERSION=24-bookworm-slim\n')
        fake_bin = self.root / 'fake-bin'
        fake_bin.mkdir()
        binary = fake_bin / 'docker'
        binary.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$JUBART_TEST_LOG"\ncase "$*" in *"ps --all"*) echo "[]";; esac\n')
        binary.chmod(0o755)
        socket = self.root / 'docker.sock'
        socket.touch()
        fake_ip = fake_bin / 'ip'
        fake_ip.write_text('#!/bin/sh\necho \"[]\"\n')
        fake_ip.chmod(0o755)
        installed = self.root / 'installed-bin'
        installed.mkdir()
        log = self.root / 'calls.log'
        env = {**os.environ, 'PATH':str(fake_bin)+':'+os.environ['PATH'], 'JUBART_TEST_LOG':str(log), 'DOCKER_HOST':'unix://'+str(socket)}
        env.pop('DOCKER_CONTEXT', None)
        result = subprocess.run(['sh', str(self.root / 'install.sh'), '--bin-dir', str(installed), '--non-interactive'], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((installed / 'jubart').resolve(), self.root / 'jubart')
        calls = log.read_text()
        self.assertIn('node scripts/initialize-local.mjs', calls)
        self.assertIn('--network none', calls)
        self.assertIn('JUBART_PROXY_AUTOINIT=true', calls)
        self.assertIn(str(socket)+':/var/run/docker.sock', calls)
        self.assertIn('compose up -d --build --no-deps panel', calls)
        self.assertIn('buildx version', calls)
        self.assertIn('test -s /etc/ssl/certs/ca-certificates.crt', calls)
        result = subprocess.run([str(installed / 'jubart'), 'version'], cwd='/tmp', env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Jubart 1.0.0', result.stdout)
        (installed / 'jubart').unlink()
        (installed / 'jubart').write_text('another command')
        result = subprocess.run(['sh',str(self.root / 'install.sh'),'--bin-dir',str(installed)],env=env,capture_output=True,text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((installed / 'jubart').read_text(),'another command')

if __name__ == '__main__':
    unittest.main()
