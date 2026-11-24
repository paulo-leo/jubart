import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import shlex
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from unittest.mock import Mock, patch

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

    def run_cli(self, args, tty=False):
        out, err = io.StringIO(), io.StringIO()
        out.isatty = lambda: tty
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
        for command in ['version', 'panel', 'access', 'ssh', 'http', 'status', 'health', 'server', 'memory', 'monitor', 'traffic', 'queues', 'workers', 'jobs', 'schedules', 'apps', 'app', 'users', 'certificates', 'time', 'user', 'password', 'start', 'restart']:
            self.assertEqual(parser.parse_args([command]).command, command)
        args = parser.parse_args(['access', 'tunnel', '--port', '9090'])
        self.assertEqual(args.mode, 'tunnel')
        self.assertEqual(args.port, 9090)
        invalid_commands = [['painel'], ['access', 'tunel'], ['access', 'http', '--porta', '9090']]
        for flag, values in [('--nome', ['ERP']), ('--dominio', ['erp.localhost']), ('--pasta', ['./app2']),
                             ('--tipo', ['php']), ('--porta', ['8000']), ('--modo', ['traditional']),
                             ('--raiz-publica', ['/var/www/html/public']), ('--comando', ['npm start']),
                             ('--pasta-trabalho', ['/var/www/html']), ('--pasta-build', ['dist']),
                             ('--habilitar', []), ('--desabilitar', []), ('--somente-salvar', []), ('--simular', [])]:
            invalid_commands.append(['app', 'update', 'app2', flag, *values])
        for invalid in invalid_commands:
            errors = io.StringIO()
            with redirect_stderr(errors), self.assertRaises(SystemExit) as caught:
                parser.parse_args(invalid)
            self.assertEqual(caught.exception.code, 2)
            self.assertIn('Erro: comando ou opção inválida', errors.getvalue())
        self.assertEqual(cli.service_label('healthy'), 'saudável')

    def test_default_command_displays_whale_credit_and_quick_commands_without_env_or_docker(self):
        (self.root / '.env').unlink()
        with patch.object(cli, 'compose') as compose:
            code, output, error = self.run_cli([])
        compose.assert_not_called()
        self.assertEqual(code, 0, error)
        self.assertIn('JUBART · 1.0.0', output)
        self.assertIn('█', output)
        self.assertIn('Desenvolvedor: Paulo Leonardo da .S. Cassimiro', output)
        self.assertIn('Comandos rápidos', output)
        for command in ['status', 'panel', 'ssh', 'http', 'users', 'certificates', 'time', 'apps', 'health', 'site --all', 'help']:
            self.assertIn('jubart ' + command, output)
        self.assertNotIn('Painel — configuração salva', output)
        self.assertNotIn('Serviços em execução', output)
        self.assertNotIn('ssh -N', output)
        self.assertNotIn('Secret-do-not-show', output)
        self.assertNotIn('\x1b[', output)
        for args in [['version'], ['help']]:
            self.assertNotIn('Desenvolvedor:', self.run_cli(args)[1])

    def test_app_help_lists_all_flags_without_environment_or_docker(self):
        (self.root / '.env').unlink()
        with patch.object(cli, 'compose') as compose:
            code, output, error = self.run_cli(['app', 'help'])
        self.assertEqual(code, 0, error)
        compose.assert_not_called()
        for flag in ['--domain', '--directory', '--name', '--type', '--port', '--mode',
                     '--document-root', '--start-command', '--working-directory', '--build-directory',
                     '--enable', '--disable', '--spa', '--no-spa', '--save-only', '--dry-run']:
            self.assertIn(flag, output)
        for action in ['create', 'update', 'remove', 'apply', 'shell', 'host']:
            self.assertIn('jubart app ' + action, output)
        self.assertIn('jubart exec APP', output)
        self.assertIn('jubart dir APP', output)
        self.assertIn('pasta do projeto no host', output)
        self.assertNotIn('--dominio', output)
        self.assertNotIn('--pasta', output)

    def test_app_host_shell_uses_saved_directory_without_docker_and_preserves_parent(self):
        project = self.root / 'Meu projeto'
        project.mkdir()
        (self.root / 'config').mkdir()
        (self.root / 'config/apps.json').write_text(json.dumps({'applications': [
            {'id': 'app2', 'name': 'Minha API', 'directory': './Meu projeto', 'enabled': False}]}))
        (self.root / '.env').unlink()
        before = Path.cwd()
        with patch('sys.stdin.isatty', return_value=True), \
             patch('sys.stdin.fileno', return_value=7), patch.object(cli.termios, 'tcgetattr', return_value=['saved']), \
             patch.object(cli.termios, 'tcsetattr') as restore, patch.object(cli.shutil, 'which', return_value='/bin/bash'), \
             patch.object(cli, 'running_services') as docker, \
             patch.object(cli.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)) as launch:
            code, output, error = self.run_cli(['dir', 'minha api'], tty=True)
        self.assertEqual(code, 0, error)
        launch.assert_called_once_with(['/bin/bash', '-i'], cwd=project)
        docker.assert_not_called()
        restore.assert_called_once_with(7, cli.termios.TCSADRAIN, ['saved'])
        self.assertEqual(Path.cwd(), before)
        self.assertIn('Digite exit para voltar', output)

    def test_app_shell_selects_service_profile_and_node_workdir_without_capturing_terminal(self):
        (self.root / 'config').mkdir()
        (self.root / 'config/apps.json').write_text(json.dumps({'applications': [
            {'id': 'main', 'type': 'php'},
            {'id': 'app2', 'type': 'node', 'workingDirectory': '/var/www/html/My API'},
            {'id': 'app3', 'type': 'static'}]}))
        for identity, service, workdir in [('main', 'php', '/var/www/html'),
                                            ('app2', 'php-app2', '/var/www/html/My API'),
                                            ('app3', 'php-app3', '/var/www/html')]:
            with self.subTest(identity=identity), \
                 patch('sys.stdin.isatty', return_value=True), \
                 patch('sys.stdin.fileno', return_value=7), patch.object(cli.termios, 'tcgetattr', return_value=['saved']), \
                 patch.object(cli.termios, 'tcsetattr') as restore, \
                 patch.object(cli, 'running_services', return_value=[{'Service': service, 'Name': 'test-container', 'State': 'running'}]), \
                 patch.object(cli.subprocess, 'run', return_value=subprocess.CompletedProcess([], 7)) as launch:
                code, output, error = self.run_cli(['exec', identity], tty=True)
            self.assertEqual(code, 7, error)
            command = launch.call_args.args[0]
            prefix = [] if identity == 'main' else ['--profile', identity]
            self.assertEqual(command[:-1], ['docker', 'compose', *prefix, 'exec', '--workdir', workdir, service, 'sh', '-c'])
            self.assertIn('exec bash -i', command[-1])
            self.assertIn('exec sh -i', command[-1])
            self.assertEqual(launch.call_args.kwargs, {'cwd': self.root})
            restore.assert_called_once_with(7, cli.termios.TCSADRAIN, ['saved'])

    def test_app_shell_rejects_missing_apps_directories_and_unavailable_containers(self):
        (self.root / 'config').mkdir()
        (self.root / 'config/apps.json').write_text(json.dumps({'applications': [{'id': 'main', 'directory': './missing'}]}))
        with patch.object(cli.subprocess, 'run') as launch:
            code, output, error = self.run_cli(['app', 'host', 'main'])
            self.assertEqual(code, 1)
            self.assertIn('terminal interativo', error)
            with patch('sys.stdin.isatty', return_value=True):
                for command, expected in [(['app', 'host', 'app2'], 'não encontrada'),
                                          (['app', 'host', 'main'], 'Pasta da aplicação não encontrada'),
                                          (['app', 'shell', '../main'], 'Aplicação não encontrada')]:
                    code, output, error = self.run_cli(command, tty=True)
                    self.assertEqual(code, 1)
                    self.assertIn(expected, error)
                for containers, expected in [([], 'Container não criado'),
                                             ([{'Service': 'php', 'State': 'exited'}], 'fora de execução'),
                                             ([{'Service': 'php', 'State': 'running'}]*2, 'mais de um container')]:
                    with patch.object(cli, 'running_services', return_value=containers):
                        code, output, error = self.run_cli(['app', 'shell', 'main'], tty=True)
                    self.assertEqual(code, 1)
                    self.assertIn(expected, error)
            launch.assert_not_called()

    def test_shell_shortcuts_require_unique_name_and_prioritize_id(self):
        (self.root / 'config').mkdir()
        (self.root / 'config/apps.json').write_text(json.dumps({'applications': [
            {'id': 'main', 'name': 'app2'}, {'id': 'app2', 'name': 'API'}, {'id': 'app3', 'name': 'api'}]}))
        with patch('sys.stdin.isatty', return_value=True), \
             patch.object(cli, 'running_services', return_value=[]) as docker, \
             patch.object(cli.subprocess, 'run') as launch:
            code, output, error = self.run_cli(['exec', 'API'], tty=True)
            self.assertEqual(code, 1)
            self.assertIn('Mais de uma aplicação', error)
            docker.assert_not_called()
            docker.return_value = [{'Service': 'php-app2', 'State': 'exited'}]
            code, output, error = self.run_cli(['exec', 'APP2'], tty=True)
            self.assertEqual(code, 1)
            self.assertIn('fora de execução', error)
            docker.assert_called_once_with(self.root)
            launch.assert_not_called()
        args = cli.parser().parse_args(['dir', 'Minha API'])
        self.assertEqual((args.id, args.app_action), ('Minha API', 'host'))
        for command in ('exec', 'dir'):
            output = io.StringIO()
            with redirect_stdout(output), self.assertRaises(SystemExit) as result:
                cli.main([command, '--help'])
            self.assertEqual(result.exception.code, 0)
            self.assertIn('ID ou nome completo', output.getvalue())

    def test_metrics_commands_work_without_env_and_explain_english_flags_in_portuguese(self):
        (self.root / '.env').unlink()
        with patch.object(cli.jubart_metrics, 'run', return_value=0) as monitor, patch.object(cli, 'compose') as compose:
            for command in ('server', 'memory', 'monitor', 'traffic'):
                code, output, error = self.run_cli([command])
                self.assertEqual(code, 0, error)
                self.assertEqual(monitor.call_args.args[2].command, command)
            compose.assert_not_called()
        for command in ('memory', 'monitor', 'traffic'):
            output = io.StringIO()
            with redirect_stdout(output), self.assertRaises(SystemExit) as caught:
                cli.main([command, '--help'])
            self.assertEqual(caught.exception.code, 0)
            self.assertIn('--service', output.getvalue())
            self.assertIn('--host-only', output.getvalue())
            self.assertIn('--interval', output.getvalue())
            self.assertIn('Somente leitura', ' '.join(output.getvalue().split()))

    def test_metrics_with_fake_docker_render_real_cli_tables_http_and_rates(self):
        binary = self.root / 'bin'
        binary.mkdir()
        docker = binary / 'docker'
        docker.write_text('''#!/bin/sh
case "$1 $2" in
  "compose ps") echo '[{"ID":"abcdef123456","Service":"php"}]' ;;
  "stats --no-stream") echo '{"ID":"abcdef123456","Name":"console-php-1","CPUPerc":"125.5%","MemUsage":"100MiB / 2GiB","MemPerc":"4.88%","NetIO":"1MB / 2MB","PIDs":"12"}' ;;
  "compose exec") echo '{"total":10,"durationSum":1,"durationCount":10,"processStartedAt":1,"statuses":{"2xx":9,"3xx":0,"4xx":0,"5xx":1}}' ;;
  *) exit 1 ;;
esac
''')
        docker.chmod(0o755)
        environment = {**os.environ, 'PATH': str(binary)+':'+os.environ['PATH']}
        for command in (['memory'], ['monitor', '--once', '--interval', '1']):
            result = subprocess.run([cli.sys.executable, str(SOURCE / 'scripts/jubart.py'), '--root', str(self.root), *command],
                                    env=environment, capture_output=True, text=True, timeout=10)
            # This test environment may isolate host networking; Docker/HTTP collection must still work.
            self.assertIn('console-php-1', result.stdout, result.stderr)
            self.assertIn('100.0 MiB / 2.0 GiB', result.stdout)
            self.assertNotIn('Coleta Docker indisponível', result.stdout)
            self.assertNotIn('Secret-do-not-show', result.stdout + result.stderr)
            self.assertNotIn('\x1b', result.stdout)
            if command[0] == 'monitor':
                self.assertIn('125.5%', result.stdout)
                self.assertIn('Requisições/s: 0.00', result.stdout)
                self.assertIn('5xx: 1', result.stdout)

    @unittest.skipUnless(shutil.which('node'), 'Node.js necessário para testar a integração local')
    def test_app_create_update_with_real_validation_require_yes_and_preserve_unspecified_fields(self):
        (self.root / 'app/public').mkdir(parents=True)
        (self.root / 'project').mkdir()
        (self.root / 'config').mkdir()
        config_file = self.root / 'config/apps.json'
        config_file.write_text(json.dumps({'version': 1, 'proxy': {'bindAddress': '127.0.0.1', 'httpPort': 8080,
                                          'httpsPort': 8443, 'tls': False, 'email': ''},
                                         'applications': [{'id': 'main', 'name': 'Principal', 'domain': 'main.localhost',
                                                           'directory': './app', 'enabled': True, 'port': 8000}]}))
        original_env, original_config = (self.root / '.env').read_text(), config_file.read_text()
        args = ['app', 'create', '--name', 'Nova aplicação', '--type', 'node', '--domain', 'new.localhost',
                '--directory', './project', '--start-command', 'npm run server', '--save-only']
        with patch('builtins.input') as prompt:
            code, output, error = self.run_cli([*args, '--dry-run'])
        self.assertEqual(code, 0, error)
        prompt.assert_not_called()
        self.assertIn('Simulação concluída', output)
        self.assertEqual((self.root / '.env').read_text(), original_env)
        self.assertEqual(config_file.read_text(), original_config)
        for answer, expected in [('no', 1), ('yes', 0)]:
            with patch('sys.stdin.isatty', return_value=True), patch('builtins.input', return_value=answer) as prompt:
                code, output, error = self.run_cli(args)
            self.assertEqual(code, expected, error)
            self.assertIn('Digite yes', prompt.call_args.args[0])
            if answer == 'no':
                self.assertEqual((self.root / '.env').read_text(), original_env)
                self.assertEqual(config_file.read_text(), original_config)
        created = json.loads(config_file.read_text())['applications'][-1]
        self.assertEqual(created['id'], 'app2')
        self.assertEqual(created['type'], 'node')
        self.assertEqual(created['port'], 3000)
        self.assertIn('jubart app apply app2', output)
        with patch('sys.stdin.isatty', return_value=True), patch('builtins.input', return_value='yes'):
            code, output, error = self.run_cli(['app', 'update', 'app2', '--domain', 'updated.localhost', '--save-only'])
        self.assertEqual(code, 0, error)
        updated = json.loads(config_file.read_text())['applications'][-1]
        self.assertEqual(updated['domain'], 'updated.localhost')
        for field in ['name', 'type', 'directory', 'enabled', 'port', 'startCommand']:
            self.assertEqual(updated[field], created[field], field)
        self.assertEqual(cli.read_env(self.root)[1]['PANEL_PASSWORD'], 'Secret-do-not-show-123')
        self.assertNotIn('Secret-do-not-show-123', output + error)

    def test_app_management_uses_panel_node_when_host_node_is_unavailable(self):
        result = subprocess.CompletedProcess([], 0, '{"id":"app4"}', '')
        with patch.object(cli.shutil, 'which', return_value=None), patch.object(cli.subprocess, 'run', return_value=result) as run:
            response = cli.app_request(self.root, {'PANEL_WORKSPACE_DIRECTORY': '/srv/jubart'},
                                       {'action': 'create', 'changes': {}})
        self.assertEqual(response['id'], 'app4')
        self.assertEqual(run.call_args.args[0], ['docker', 'compose', 'exec', '-T', 'panel', 'node', '/srv/jubart/docker/panel/apps-cli.mjs'])
        self.assertEqual(json.loads(run.call_args.kwargs['input'])['root'], '/srv/jubart')

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
        self.assertEqual(logo['sha256'], hashlib.sha256((SOURCE / logo['source']).read_bytes()).hexdigest())
        self.assertEqual(len(logo['rows']), logo['height'])
        self.assertTrue(all(len(row) == logo['width'] * 2 for frame in logo['frames'] for row in frame))
        self.assertTrue(all(len(frame) == logo['height'] for frame in logo['frames']))
        self.assertIsNone(logo['palette'][0])
        self.assertNotEqual(logo['frames'][0], logo['frames'][2])
        self.assertIn('\x1b[38;2;', cli.terminal_logo(True))
        self.assertNotIn('\x1b[', cli.terminal_logo(False))

    def test_interactive_prompt_animates_and_restores_tty_before_dispatch(self):
        output = io.StringIO()
        output.isatty = lambda: True
        source = Mock()
        source.fileno.return_value = 7
        attributes = [1, 2, 3]
        with redirect_stdout(output), patch.object(cli.sys, 'stdin', source), \
             patch.dict(os.environ, {'TERM': 'xterm-256color'}, clear=True), \
             patch.object(cli.shutil, 'get_terminal_size', return_value=os.terminal_size((120, 50))), \
             patch.object(cli.termios, 'tcgetattr', return_value=attributes), patch.object(cli.tty, 'setcbreak'), \
             patch.object(cli.termios, 'tcsetattr') as restore, \
             patch.object(cli.select, 'select', side_effect=[*[([], [], [])] * 17, ([7], [], [])]), \
             patch.object(cli.os, 'read', return_value=b'apps\r'):
            welcome = cli.print_welcome('1.0.0', interactive=True)
            command = cli.read_console_line([], '1.0.0', welcome)
        self.assertEqual(command, 'apps')
        self.assertEqual(output.getvalue().count(f'\x1b[{len(welcome)}F'), 17)
        self.assertIn('jubart> ', output.getvalue())
        self.assertIn('Digite o comando sem o prefixo jubart', output.getvalue())
        self.assertIn('\x1b[?2004l\x1b[?25h', output.getvalue())
        restore.assert_called_once_with(7, cli.termios.TCSADRAIN, attributes)

    def test_prompt_preserves_input_and_disables_animation_after_resize(self):
        output = io.StringIO()
        output.isatty = lambda: True
        source = Mock()
        source.fileno.return_value = 7
        size = [os.terminal_size((120, 50))]
        count = [0]
        def ready(*args):
            count[0] += 1
            if count[0] == 2:
                size[0] = os.terminal_size((80, 24))
            return ([], [], []) if count[0] < 3 else ([7], [], [])
        with redirect_stdout(output), patch.dict(os.environ, {'TERM': 'xterm-256color'}, clear=True), \
             patch.object(cli.sys, 'stdin', source), \
             patch.object(cli.shutil, 'get_terminal_size', side_effect=lambda *args: size[0]), \
             patch.object(cli.termios, 'tcgetattr', return_value=[]), patch.object(cli.tty, 'setcbreak'), \
             patch.object(cli.termios, 'tcsetattr') as restore, patch.object(cli.select, 'select', side_effect=ready), \
             patch.object(cli.os, 'read', return_value=b'version\r'):
            welcome = cli.print_welcome('1.0.0', interactive=True)
            self.assertEqual(cli.read_console_line([], '1.0.0', welcome), 'version')
        self.assertEqual(output.getvalue().count(f'\x1b[{len(welcome)}F'), 1)
        restore.assert_called_once()

    def test_prompt_handles_history_editing_utf8_and_bracketed_paste(self):
        commands = [
            ([b'apz\x7fps\r'], [], 'apps'),
            ([b'\x1b[A\r'], ['status', 'apps'], 'apps'),
            ([b'\x1b[200~app update app2 --name "Nova\nAPI"\x1b[201~', b'\r'], [], 'app update app2 --name "Nova API"'),
        ]
        encoded = 'app update app2 --directory "/srv/Minha aplicação"'.encode()
        commands.append(([encoded[:48], encoded[48:] + b'\r'], [], encoded.decode()))
        for chunks, history, expected in commands:
            output = io.StringIO()
            source = Mock()
            source.fileno.return_value = 7
            with redirect_stdout(output), patch.object(cli.sys, 'stdin', source), \
                 patch.dict(os.environ, {'TERM': 'xterm-256color', 'JUBART_NO_ANIMATION': '1'}, clear=True), \
                 patch.object(cli.termios, 'tcgetattr', return_value=[]), patch.object(cli.tty, 'setcbreak'), \
                 patch.object(cli.termios, 'tcsetattr') as restore, \
                 patch.object(cli.select, 'select', return_value=([7], [], [])), \
                 patch.object(cli.os, 'read', side_effect=chunks):
                self.assertEqual(cli.read_console_line(history, '1.0.0'), expected)
            restore.assert_called_once()

    def test_console_dispatches_without_prefix_preserves_root_and_survives_parser_errors(self):
        output, errors = io.StringIO(), io.StringIO()
        commands = ['app update app2 --directory "/srv/Meu projeto"', 'bad-command', 'jubart version', 'exit']
        with redirect_stdout(output), redirect_stderr(errors), \
             patch.object(cli, 'read_console_line', side_effect=commands), \
             patch.object(cli, 'main', side_effect=[0, SystemExit(2), 0]) as dispatch:
            self.assertEqual(cli.run_console(self.root, '1.0.0'), 0)
        self.assertEqual(dispatch.call_args_list[0].args[0], ['--root', str(self.root), 'app', 'update', 'app2', '--directory', '/srv/Meu projeto'])
        self.assertEqual(dispatch.call_args_list[2].args[0], ['--root', str(self.root), 'version'])
        self.assertIn('Saindo do Jubart', output.getvalue())

    def test_console_recovers_from_unclosed_quotes_and_command_interruptions(self):
        output = io.StringIO()
        with redirect_stdout(output), \
             patch.object(cli, 'read_console_line', side_effect=['app update app2 --name "bad', 'status', 'clear', 'quit']), \
             patch.object(cli, 'main', side_effect=KeyboardInterrupt()) as dispatch:
            self.assertEqual(cli.run_console(self.root, '1.0.0'), 0)
        dispatch.assert_called_once_with(['--root', str(self.root), 'status'])
        self.assertIn('aspas não fechadas', output.getvalue())
        self.assertIn('Comando interrompido', output.getvalue())
        self.assertEqual(output.getvalue().count('Comandos rápidos'), 2)

    def test_console_with_real_pty_accepts_commands_while_animating_and_confirms_in_normal_tty(self):
        import fcntl
        import pty
        import select
        import struct
        import sys
        import termios
        import time
        (self.root / 'docker/panel/package.json').write_text('{"version":"7.8.9"}')
        (self.root / 'config').mkdir()
        config_file = self.root / 'config/apps.json'
        project = self.root / 'Meu projeto'
        project.mkdir()
        config_file.write_text(json.dumps({'proxy': {}, 'applications': [{'id': 'main', 'name': 'Console test API',
                               'type': 'php', 'domain': 'console.localhost', 'enabled': True, 'directory': './Meu projeto'}]}))
        original_env, original_config = (self.root / '.env').read_text(), config_file.read_text()
        binary = self.root / 'bin'
        binary.mkdir()
        docker = binary / 'docker'
        docker.write_text('''#!/bin/sh
printf "%s\\n" "$*" >> "$JUBART_TEST_DOCKER_LOG"
case "$*" in
  *" exec "*)
    while [ "$1" != exec ]; do shift; done
    shift
    if [ "$1" = --workdir ]; then shift 2; fi
    shift
    cd "$JUBART_TEST_APP_DIRECTORY" || exit 1
    exec "$@"
    ;;
  *) echo '[{"Service":"php","Name":"fixture-php","State":"running","Health":"healthy"}]' ;;
esac
''')
        docker.chmod(0o755)
        real_bash = shutil.which('bash')
        if not real_bash:
            self.skipTest('Bash necessário para testar os shells interativos')
        bash = binary / 'bash'
        bash.write_text('#!/bin/sh\nexec '+shlex.quote(real_bash)+' --noprofile --norc "$@"\n')
        bash.chmod(0o755)
        try:
            master, slave = pty.openpty()
        except OSError:
            self.skipTest('PTY indisponível')
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 55, 120, 0, 0))
        attributes = termios.tcgetattr(slave)
        environment = {**os.environ, 'PATH': str(binary) + ':' + os.environ['PATH'], 'TERM': 'xterm-256color'}
        environment['JUBART_TEST_DOCKER_LOG'] = str(self.root / 'docker-queries.log')
        environment['JUBART_TEST_APP_DIRECTORY'] = str(project)
        environment['PS1'] = 'JUBART_TEST_SHELL> '
        environment['COLUMNS'], environment['LINES'] = '80', '24'
        for key in ['CI', 'NO_COLOR', 'JUBART_NO_ANIMATION']:
            environment.pop(key, None)
        def controlling_terminal():
            os.setsid()
            fcntl.ioctl(0, termios.TIOCSCTTY, 0)
        process = subprocess.Popen([sys.executable, str(SOURCE / 'scripts/jubart.py'), '--root', str(self.root)],
                                   stdin=slave, stdout=slave, stderr=slave, env=environment, preexec_fn=controlling_terminal)
        captured = bytearray()
        def until(marker, start=0):
            deadline = time.monotonic() + 5
            while marker not in captured[start:]:
                if time.monotonic() > deadline:
                    self.fail('Resposta do console não encontrada: ' + repr(marker) + '\n' + captured[-1500:].decode(errors='replace'))
                ready, _, _ = select.select([master], [], [], .1)
                if ready:
                    captured.extend(os.read(master, 65536))
        def send(command, expected):
            start = len(captured)
            os.write(master, command)
            until(expected, start)
            return start
        def resize(rows, columns):
            start = len(captured)
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', rows, columns, 0, 0))
            until(f'\x1b[{rows-1};1H'.encode(), start)
        try:
            until(b'jubart> ')
            os.write(master, b'ap')
            start = len(captured)
            until(b'\x1b[?25l', start)
            send(b'ps\r', b'dir main')
            until(b'jubart> ', captured.index(b'dir main'))
            self.assertIn(b'exec main', captured)
            queries = (self.root / 'docker-queries.log').read_text()
            resize(40, 180)
            resize(24, 64)
            self.assertEqual((self.root / 'docker-queries.log').read_text(), queries)
            self.assertIn(('─'*61).encode(), captured)
            exits = captured.count(b'\x1b[?1049l')
            start = send(b'monitor --help\r', b'--interface')
            until(b'jubart> ', captured.index(b'--interface', start))
            self.assertEqual(captured.count(b'\x1b[?1049l'), exits)
            send(b'version\r', b'Jubart 7.8.9')
            send(b'does-not-exist\r', 'Erro: comando ou opção inválida'.encode())
            send(b'http\r', b'Digite yes para continuar:')
            resize(32, 140)
            send(b'no\r', 'Operação cancelada'.encode())
            self.assertEqual((self.root / '.env').read_text(), original_env)
            self.assertEqual(config_file.read_text(), original_config)
            send(b'jubart version\r', b'Jubart 7.8.9')
            send(b'\x1b[A\r', b'Jubart 7.8.9')
            start = send(b'monitor --host-only --interval 1\r', b'q ou Ctrl+C: voltar')
            os.write(master, b'q')
            until(b'Monitoramento encerrado.', start)
            until(b'jubart> ', captured.index(b'Monitoramento encerrado.', start))
            start = send(b'queues\r', b'Nenhuma fila cadastrada')
            until(b'jubart> ', captured.index(b'Nenhuma fila cadastrada', start))
            start = send(b'workers --watch\r', b'q ou Ctrl+C: voltar')
            os.write(master, b'q')
            until('Acompanhamento de automações encerrado.'.encode(), start)
            until(b'jubart> ', captured.index('Acompanhamento de automações encerrado.'.encode(), start))
            self.assertFalse((self.root / 'config/automation.json').exists())
            for command, close in [('dir main', b'exit\r'), ('exec "console TEST api"', b'\x04')]:
                start = send((command+'\r').encode(), b'JUBART_TEST_SHELL> ')
                self.assertIn(b'\x1b[?1049l', captured[start:])
                send(b'printf "__APP_CWD__%s\\n" "$PWD"\r', ('__APP_CWD__'+str(project)).encode())
                until(b'JUBART_TEST_SHELL> ', captured.index(('__APP_CWD__'+str(project)).encode(), start))
                start = send(close, b'Shell encerrado.')
                until(b'jubart> ', captured.index(b'Shell encerrado.', start))
            send(b'version\r', b'Jubart 7.8.9')
            send(b'exit\r', b'Saindo do Jubart.')
            self.assertEqual(process.wait(timeout=5), 0)
            self.assertEqual(termios.tcgetattr(slave), attributes)
            self.assertNotIn(b'Traceback', captured)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            os.close(master)
            os.close(slave)

    def test_terminal_styling_and_no_color_preserve_information(self):
        with patch('sys.stdout.isatty', return_value=True), patch.dict(os.environ, {'TERM': 'xterm-256color'}, clear=True):
            self.assertIn('\x1b[92m', cli.styled('Saudável', 'green'))
            self.assertEqual(cli.symbol('✅'), '✅')
            self.assertIn('\x1b[96m', cli.parser().format_help())
            with patch.dict(os.environ, {'NO_COLOR': '1'}):
                self.assertEqual(cli.styled('Saudável', 'green'), 'Saudável')
                self.assertNotIn('\x1b[', cli.parser().format_help())
        rows = [{'Service': 'panel', 'State': 'running', 'Health': 'healthy', 'ports': '127.0.0.1:9090', 'container_ports': '3000/tcp', 'host_ports': '127.0.0.1:9090'}]
        with patch.object(cli, 'running_services', return_value=rows):
            code, output, error = self.run_cli(['status'])
        self.assertEqual(code, 0, error)
        self.assertIn('em execução', output)
        self.assertIn('saudável', output)
        self.assertIn('127.0.0.1:9090', output)
        self.assertNotIn('\x1b[', output)
        ports = [('não publicada', '93'), ('nenhuma', '90'),
                 ('127.0.0.1:9090', '92'), ('[::1]:9090', '92'),
                 ('0.0.0.0:80', '1;94'), ('[::]:443', '1;94'),
                 ('127.0.0.1:8080, 0.0.0.0:80', '1;94')]
        for host_ports, color in ports:
            with self.subTest(host_ports=host_ports):
                output = io.StringIO()
                with redirect_stdout(output), patch.object(cli, 'use_color', return_value=True):
                    cli.print_services([{**rows[0], 'host_ports': host_ports}])
                self.assertIn(f'\x1b[{color}m{host_ports}', output.getvalue())

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

    def test_status_separates_container_and_host_ports_without_mount_paths(self):
        identities = ['a'*64, 'b'*64, 'c'*64]
        rows = [{'ID': identity, 'Service': name, 'State': 'running', 'Health': 'healthy'}
                for identity, name in zip(identities, ('panel', 'mariadb', 'cache'))]
        inspected = [
            {'id': identities[0], 'ports': {'3000/tcp': [{'HostIp':'127.0.0.1','HostPort':'9090'}]}, 'exposed': {'3000/tcp':{}}},
            {'id': identities[1], 'ports': {'3306/tcp': [{'HostIp':'0.0.0.0','HostPort':'3307'}, {'HostIp':'::','HostPort':'3307'}]}, 'exposed': {'3306/tcp':{}}},
            {'id': identities[2], 'ports': {'6379/tcp': None}, 'exposed': {'6379/tcp':{}, '6379/udp':{}}},
        ]
        result = subprocess.CompletedProcess([], 0, '\n'.join(map(json.dumps, inspected)), '')
        with patch.object(cli, 'compose', return_value=json.dumps(rows)), \
             patch.object(cli.subprocess, 'run', return_value=result) as inspect:
            code, output, error = self.run_cli(['status'])
        self.assertEqual(code, 0, error)
        for value in ('Porta no container', 'Porta no host', '3000/tcp', '127.0.0.1:9090',
                      '3306/tcp', '0.0.0.0:3307', '[::]:3307', '6379/tcp', '6379/udp', 'não publicada'):
            self.assertIn(value, output)
        self.assertNotIn('Pasta no host', output)
        self.assertNotIn('volume', output)
        arguments = inspect.call_args.args[0]
        self.assertEqual(arguments[:5], ['docker', 'inspect', '--type', 'container', '--format'])
        self.assertEqual(arguments[6:], identities)
        self.assertIn('index .NetworkSettings "Ports"', arguments[5])
        self.assertNotIn('.Mounts', arguments[5])
        self.assertNotIn('.Config.Env', arguments[5])
        self.assertNotIn('Secret-do-not-show', output)

    def test_port_lookup_preserves_partial_results_and_distinguishes_no_ports_from_failure(self):
        rows = [{'ID': 'abcdef123456'}, {'ID': '123456abcdef'}, {'ID': 'fedcba654321'}]
        data = [
            {'id': 'abcdef123456'+'a'*52, 'ports': {}, 'exposed': {}},
            {'id': '123456abcdef'+'b'*52, 'ports': {'3000/tcp':[{'HostIp':'127.0.0.1','HostPort':'9090'}]}, 'exposed': {'3000/tcp':{}, '80/tcp':{}}},
            {'id': 'fedcba654321'+'c'*52, 'ports': 'invalid', 'exposed': {}},
        ]
        result = subprocess.CompletedProcess([], 1, '\n'.join(map(json.dumps, data))+'\ninvalid JSON', 'daemon error with secret')
        with patch.object(cli.subprocess, 'run', return_value=result):
            self.assertTrue(cli.service_ports(self.root, rows))
        self.assertEqual(rows[0]['container_ports'], 'nenhuma')
        self.assertEqual(rows[1]['container_ports'], '3000/tcp, 80/tcp')
        self.assertEqual(rows[1]['host_ports'], '127.0.0.1:9090, não publicada')
        self.assertIsNone(rows[2].get('container_ports'))

    def test_port_lookup_is_scoped_and_preserves_compose_ports_when_inspection_times_out(self):
        for rows, incomplete in (([], False), ([{'ID': '--all'}], True), ([{'Service': 'php'}], True)):
            with patch.object(cli.subprocess, 'run') as inspect:
                self.assertEqual(cli.service_ports(self.root, rows), incomplete)
            inspect.assert_not_called()
        rows = [{'ID':'abcdef123456', 'Service':'panel', 'State':'running', 'Health':'healthy',
                 'Publishers':[{'URL':'127.0.0.1','PublishedPort':9090,'TargetPort':3000,'Protocol':'tcp'}]}]
        with patch.object(cli, 'compose', return_value=json.dumps(rows)), \
             patch.object(cli.subprocess, 'run', side_effect=subprocess.TimeoutExpired('docker', 15)):
            code, output, error = self.run_cli(['status'])
        self.assertEqual(code, 0, error)
        for value in ('em execução', '3000/tcp', '127.0.0.1:9090', 'portas internas não puderam ser consultadas'):
            self.assertIn(value, output)
        self.assertNotIn('Pasta no host', output)

    def test_port_lookup_ignores_containers_outside_the_project_selection(self):
        rows = [{'ID': 'abcdef123456'}]
        result = subprocess.CompletedProcess([], 0, json.dumps({'id': 'f'*64,
            'ports': {'80/tcp':[{'HostIp':'0.0.0.0','HostPort':'9999'}]}, 'exposed': {}}), '')
        with patch.object(cli.subprocess, 'run', return_value=result):
            self.assertTrue(cli.service_ports(self.root, rows))
        self.assertIsNone(rows[0].get('container_ports'))

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
        self.assertEqual(compose.call_args.args[1], ['up', '-d', '--no-deps', '--build', '--force-recreate', 'panel'])
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
        self.assertIn('jubart http', err)
        self.assertEqual(cli.read_env(self.root)[1]['PANEL_BIND_ADDRESS'], '0.0.0.0')

    def test_access_shortcuts_require_confirmation_and_preserve_ports(self):
        for command, bind in [('http', '0.0.0.0'), ('ssh', '127.0.0.1'), ('access', '127.0.0.1')]:
            args = [command, 'ssh'] if command == 'access' else [command]
            original = (self.root / '.env').read_text()
            with patch.object(cli, 'confirm', side_effect=ValueError('cancelada')), patch.object(cli, 'compose') as compose:
                self.assertEqual(self.run_cli(args)[0], 1)
                compose.assert_not_called()
            self.assertEqual((self.root / '.env').read_text(), original)
            with patch.object(cli, 'confirm') as confirm, patch.object(cli, 'compose', return_value='') as compose:
                code, output, error = self.run_cli(args)
            self.assertEqual(code, 0, error)
            confirm.assert_called_once_with('Confirmar a troca de acesso, recompilar e recriar somente o painel?', token='yes')
            self.assertEqual(cli.read_env(self.root)[1]['PANEL_BIND_ADDRESS'], bind)
            self.assertEqual(cli.read_env(self.root)[1]['PANEL_PORT'], '9090')
            self.assertEqual(compose.call_args.args[1], ['up', '-d', '--no-deps', '--build', '--force-recreate', 'panel'])

    def test_access_requires_typed_yes_before_writing_configuration_or_building(self):
        (self.root / 'config').mkdir()
        config_file = self.root / 'config/apps.json'
        config_file.write_text('{"proxy":{"panel":{}},"applications":[]}')
        commands = [['http'], ['ssh'], ['access', 'http'], ['access', 'tunnel'], ['access', 'ssh']]
        for args in commands:
            original_env = (self.root / '.env').read_text()
            original_config = config_file.read_text()
            for answer in ['', 'no', 'y', 'SIM', EOFError(), KeyboardInterrupt()]:
                with patch('sys.stdin.isatty', return_value=True), patch('builtins.input') as prompt, patch.object(cli, 'compose') as compose:
                    if isinstance(answer, BaseException):
                        prompt.side_effect = answer
                    else:
                        prompt.return_value = answer
                    code, output, error = self.run_cli(args)
                self.assertEqual(code, 1, args)
                self.assertIn('Digite yes para continuar:', prompt.call_args.args[0])
                self.assertIn('Operação cancelada', error)
                compose.assert_not_called()
                self.assertEqual((self.root / '.env').read_text(), original_env)
                self.assertEqual(config_file.read_text(), original_config)
            with patch('sys.stdin.isatty', return_value=False), patch('builtins.input') as prompt, patch.object(cli, 'compose') as compose:
                self.assertEqual(self.run_cli(args)[0], 1)
                prompt.assert_not_called()
                compose.assert_not_called()
            with patch('sys.stdin.isatty', return_value=True), patch('builtins.input', return_value='yes'), patch.object(cli, 'compose', return_value='') as compose:
                code, output, error = self.run_cli(args)
            self.assertEqual(code, 0, error)
            self.assertIn('Painel recompilado e recriado', output)
            compose.assert_called_once_with(self.root, ['up', '-d', '--no-deps', '--build', '--force-recreate', 'panel'], 600)

    def test_users_lists_bootstrap_enabled_and_disabled_accounts_without_credentials(self):
        directory = self.root / '.panel-state/panel-users'
        directory.mkdir(parents=True)
        file = directory / 'users.json'
        original = json.dumps([
            {'username': 'operator', 'name': 'Operação', 'admin': False, 'enabled': True,
             'passwordHash': 'HASH-NEVER-SHOW', 'passwordSalt': 'SALT-NEVER-SHOW'},
            {'username': 'oldadmin', 'name': 'Anterior', 'admin': True, 'enabled': False},
        ])
        file.write_text(original)
        with patch.object(cli, 'compose') as compose:
            code, output, error = self.run_cli(['users'])
        self.assertEqual(code, 0, error)
        compose.assert_not_called()
        for expected in ['admin', 'operator', 'oldadmin', 'Acesso por permissões', 'habilitado', 'desabilitado']:
            self.assertIn(expected, output)
        for secret in ['HASH-NEVER-SHOW', 'SALT-NEVER-SHOW', 'Secret-do-not-show-123', 'never-show-key']:
            self.assertNotIn(secret, output + error)
        self.assertEqual(file.read_text(), original)
        file.write_text('{"passwordHash":"HASH-NEVER-SHOW"}')
        code, output, error = self.run_cli(['users'])
        self.assertEqual(code, 1)
        self.assertIn('Cadastro de usuários do painel inválido', error)
        self.assertNotIn('HASH-NEVER-SHOW', output + error)

    def test_time_reports_host_ntp_and_configured_zones_without_requiring_docker(self):
        with (self.root / '.env').open('a') as stream:
            stream.write('TZ=America/Sao_Paulo\nBACKUP_TIMEZONE=UTC\nPG_BACKUP_TIMEZONE=Invalid/Zone\n')
        result = subprocess.CompletedProcess([], 0, 'Timezone=UTC\nNTPSynchronized=yes\nNTP=yes\nLocalRTC=no\n', '')
        with patch.object(cli.subprocess, 'run', return_value=result) as run:
            code, output, error = self.run_cli(['time'])
        self.assertEqual(code, 0, error)
        self.assertEqual(run.call_args.args[0][0], 'timedatectl')
        for expected in ['Horário do servidor', 'Horário UTC', 'Fuso do servidor: UTC',
                         'Relógio sincronizado por NTP: sim', 'America/Sao_Paulo', '-03:00', 'fuso indisponível']:
            self.assertIn(expected, output)
        (self.root / '.env').unlink()
        for failure in [FileNotFoundError(), subprocess.TimeoutExpired('timedatectl', 5)]:
            with patch.object(cli.subprocess, 'run', side_effect=failure):
                code, output, error = self.run_cli(['time'])
            self.assertEqual(code, 0, error)
            self.assertIn('Horário do servidor', output)
            self.assertIn('não foi possível consultar', output)

    def test_certificates_validates_configured_sni_and_expiry_and_handles_failures(self):
        with (self.root / '.env').open('a') as stream:
            stream.write('TRAEFIK_TLS_ENABLED=true\nHTTPS_PORT=8443\nAPP_DOMAIN=app.example.com\n'
                         'PANEL_PROXY_ENABLED=true\nPANEL_TLS_ENABLED=true\nPANEL_DOMAIN=panel.example.com\n')
        with patch.object(cli.ssl, 'create_default_context') as create_context, patch.object(cli.socket, 'create_connection') as connect:
            secured = create_context.return_value.wrap_socket.return_value.__enter__.return_value
            secured.getpeercert.return_value = {'notBefore': 'Jan  1 00:00:00 2023 GMT', 'notAfter': 'Feb 15 00:00:00 2024 GMT'}
            with patch.object(cli.time, 'time', return_value=1704067200):
                code, output, error = self.run_cli(['certificates'])
            self.assertEqual(code, 0, error)
            create_context.assert_called_once_with()
            self.assertEqual([call.kwargs['server_hostname'] for call in create_context.return_value.wrap_socket.call_args_list],
                             ['app.example.com', 'panel.example.com'])
            self.assertTrue(all(call.args[0] == ('127.0.0.1', 8443) for call in connect.call_args_list))
            self.assertIn('Dias restantes: 45', output)
            self.assertIn('domínio e cadeia de confiança verificados', output)
            with patch.object(cli.time, 'time', return_value=1705795200):
                code, output, error = self.run_cli(['certificates', 'external.example.com', '--port', '9443'])
            self.assertEqual(code, 0, error)
            connect.assert_called_with(('external.example.com', 9443), timeout=5)
            self.assertIn('próximo do vencimento', output)
            for number, expected in [(10, 'expirado'), (62, 'não corresponde ao domínio'), (18, 'autoassinado')]:
                failure = cli.ssl.SSLCertVerificationError('private-diagnostic-never-show')
                failure.verify_code = number
                create_context.return_value.wrap_socket.side_effect = failure
                code, output, error = self.run_cli(['certificates'])
                self.assertEqual(code, 1)
                self.assertIn(expected, output)
                self.assertNotIn('private-diagnostic-never-show', output + error)
            create_context.return_value.wrap_socket.side_effect = cli.ssl.SSLError()
            self.assertEqual(self.run_cli(['certificates'])[0], 1)
            connect.side_effect = ConnectionRefusedError()
            code, output, error = self.run_cli(['certificates'])
            self.assertEqual(code, 1)
            self.assertIn('sem conexão TLS', output)

    def test_certificates_does_not_probe_when_https_is_disabled_and_rejects_invalid_targets(self):
        with patch.object(cli.socket, 'create_connection') as connect:
            code, output, error = self.run_cli(['certificates'])
            self.assertEqual(code, 0, error)
            self.assertIn('Nenhum domínio com HTTPS habilitado', output)
            for args in [['certificates', 'https://example.com'], ['certificates', 'example.com', '--port', '0'],
                         ['certificates', '--port', '65536']]:
                self.assertEqual(self.run_cli(args)[0], 1)
            connect.assert_not_called()

    def test_installer_wires_command_and_start_using_fake_docker_without_touching_host(self):
        shutil.copy(SOURCE / 'install.sh', self.root)
        shutil.copy(SOURCE / 'jubart', self.root)
        (self.root / 'scripts').mkdir()
        shutil.copy(SOURCE / 'scripts/jubart.py', self.root / 'scripts')
        shutil.copy(SOURCE / 'scripts/jubart_metrics.py', self.root / 'scripts')
        shutil.copy(SOURCE / 'scripts/jubart_automation.py', self.root / 'scripts')
        shutil.copy(SOURCE / 'scripts/jubart_databases.py', self.root / 'scripts')
        shutil.copy(SOURCE / 'scripts/jubart_proxies.py', self.root / 'scripts')
        shutil.copy(SOURCE / 'scripts/jubart_terminal.py', self.root / 'scripts')
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
