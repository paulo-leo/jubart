from contextlib import redirect_stderr, redirect_stdout
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import jubart as cli
import jubart_automation as automation


class AutomationCLITest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='jubart-automation-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'docker/panel').mkdir(parents=True)
        (self.root / 'docker/panel/package.json').write_text('{"version":"1.0.0"}')
        self.worker = {'id': 'worker-aaaaaaaaaaaa', 'app': 'main', 'queue': 'emails', 'connection': 'redis', 'enabled': True,
                       'sleep': 3, 'tries': 3, 'timeout': 60, 'stopGrace': 90}
        self.job = {'id': 'job-bbbbbbbbbbbb', 'app': 'main', 'name': 'Enviar email', 'class': 'App\\Jobs\\EnviarEmail'}
        self.scheduler = {'id': 'scheduler-cccccccccccc', 'app': 'main', 'enabled': False}
        self.config = {'version': 1, 'workers': [self.worker], 'jobs': [self.job], 'schedulers': [self.scheduler]}
        self.apps = [{'id': 'main', 'name': 'API', 'type': 'php', 'enabled': True, 'directory': './project'},
                     {'id': 'app2', 'name': 'ERP', 'type': 'php', 'enabled': True},
                     {'id': 'app3', 'name': 'Site', 'type': 'static', 'enabled': True}]
        self.calls = []
        self.reply = {'queues': [{'id': self.worker['id'], 'counts': {'total': 4, 'pending': 3, 'reserved': 1, 'delayed': 0}}],
                      'failed': [{'id': '123', 'connection': 'redis', 'queue': 'emails', 'failedAt': '2026-11-24 10:00:00',
                                  'payload': 'PAYLOAD-MUST-NOT-PRINT', 'exception': 'EXCEPTION-MUST-NOT-PRINT'}], 'failedError': None}

    def save(self):
        (self.root / 'config').mkdir(exist_ok=True)
        (self.root / 'config/automation.json').write_text(json.dumps(self.config))
        (self.root / 'config/apps.json').write_text(json.dumps({'applications': self.apps}))

    def compose(self, root, arguments, timeout=30, input=None):
        self.calls.append((arguments, input))
        if 'ps' in arguments:
            return json.dumps([{'Service': self.worker['id'], 'Name': 'demo-worker', 'State': 'running'}])
        if '/opt/infra/automation.php' in arguments:
            return '__INFRA_JSON__'+json.dumps({'ok': True, 'data': self.reply})
        if 'schedule:list' in arguments:
            return '\x1b[31m* * * * *  reports:send --token=TOP-SECRET  Next Due: 1 minute\x1b[0m\n'
        self.fail('Comando não esperado: '+repr(arguments))

    def run_cli(self, arguments):
        output, errors = io.StringIO(), io.StringIO()
        with redirect_stdout(output), redirect_stderr(errors), patch.object(cli, 'compose', side_effect=self.compose):
            result = cli.main(['--root', str(self.root), *arguments])
        return result, output.getvalue(), errors.getvalue()

    def test_empty_registry_queries_do_not_create_files_or_require_docker_or_env(self):
        for command in ('queues', 'workers', 'jobs'):
            code, output, error = self.run_cli([command])
            self.assertEqual(code, 0, error)
            self.assertIn('cadastrad', output)
        self.assertEqual(self.calls, [])
        self.assertFalse((self.root / 'config').exists())

    def test_job_catalog_does_not_query_runtime_or_claim_execution(self):
        self.save()
        code, output, error = self.run_cli(['jobs', '--app', 'main'])
        self.assertEqual(code, 0, error)
        self.assertIn('App\\Jobs\\EnviarEmail', output)
        self.assertIn('não indica que o job foi executado', output)
        self.assertEqual(self.calls, [])

    def test_workers_show_configuration_actual_container_state_and_missing_containers(self):
        self.config['workers'].append({**self.worker, 'id': 'worker-dddddddddddd', 'app': 'app2', 'enabled': False})
        self.save()
        code, output, error = self.run_cli(['workers'])
        self.assertEqual(code, 0, error)
        self.assertIn('demo-worker', output)
        self.assertIn('em execução', output)
        self.assertIn('desabilitada', output)
        self.assertIn('não criado', output)
        self.assertEqual(self.calls[0][0], ['--profile', '*', 'ps', '--all', '--format', 'json'])

    def test_queues_use_read_only_bridge_with_stdin_and_counts_without_payloads(self):
        self.save()
        before = (self.root / 'config/automation.json').read_bytes()
        code, output, error = self.run_cli(['queues'])
        self.assertEqual(code, 0, error)
        for title in ('Pendentes', 'Reservados', 'Atrasados', 'Total'):
            self.assertIn(title, output)
        arguments, payload = self.calls[-1]
        self.assertEqual(arguments, ['exec', '-T', 'php', 'php', '/opt/infra/automation.php', 'status'])
        self.assertEqual(json.loads(payload), {'queues': [{'id': self.worker['id'], 'queue': 'emails', 'connection': 'redis'}]})
        self.assertNotIn('PAYLOAD-MUST-NOT-PRINT', output)
        self.assertNotIn('EXCEPTION-MUST-NOT-PRINT', output)
        self.assertEqual((self.root / 'config/automation.json').read_bytes(), before)
        self.assertNotIn('queue:work', str(self.calls))

    def test_app_filter_uses_correct_profile_and_missing_optional_counts_are_unknown(self):
        self.config['workers'] = [{**self.worker, 'app': 'app2'}]
        self.reply['queues'][0]['counts'] = {'total': 4}
        self.reply['failedError'] = 'provider unsupported'
        self.save()
        code, output, error = self.run_cli(['queues', '--app', 'app2'])
        self.assertEqual(code, 0, error)
        self.assertIn('—', output)
        self.assertIn('--profile', self.calls[-1][0])
        self.assertEqual(self.calls[-1][0][:6], ['--profile', 'app2', 'exec', '-T', 'php-app2', 'php'])
        self.assertNotIn('provider unsupported', output)

    def test_explicit_unregistered_queue_can_be_checked_without_creating_a_worker(self):
        self.save()
        self.reply['queues'] = [{'id': 'consulta', 'counts': {'total': 9}}]
        before = (self.root / 'config/automation.json').read_bytes()
        code, output, error = self.run_cli(['queues', '--app', 'main', '--queue', 'reports', '--connection', 'database'])
        self.assertEqual(code, 0, error)
        self.assertIn('reports', output)
        self.assertIn('não cadastrado', output)
        self.assertEqual(json.loads(self.calls[-1][1])['queues'][0]['connection'], 'database')
        self.assertEqual((self.root / 'config/automation.json').read_bytes(), before)

    def test_failed_jobs_are_read_only_limited_per_app_and_do_not_show_exceptions(self):
        self.save()
        self.reply['failed'] *= 35
        code, output, error = self.run_cli(['jobs', '--failed', '--app', 'main'])
        self.assertEqual(code, 0, error)
        self.assertEqual(output.count('2026-11-24 10:00:00'), 30)
        self.assertNotIn('PAYLOAD-MUST-NOT-PRINT', output)
        self.assertNotIn('EXCEPTION-MUST-NOT-PRINT', output)
        self.assertEqual(len(self.calls), 1)
        self.assertNotIn('queue:retry', str(self.calls))

    def test_unsupported_failure_provider_and_unavailable_queue_are_not_reported_as_empty(self):
        self.save()
        self.reply['failed'], self.reply['failedError'] = [], 'driver error with SECRET'
        code, output, error = self.run_cli(['jobs', '--failed', '--app', 'main'])
        self.assertEqual(code, 1)
        self.assertIn('falhas indisponíveis', output)
        self.assertNotIn('SECRET', output)
        self.reply['queues'] = [{'id': self.worker['id'], 'error': 'raw SQL PASSWORD'}]
        code, output, error = self.run_cli(['queues', '--app', 'main'])
        self.assertEqual(code, 1)
        self.assertIn('contagens indisponíveis', output)
        self.assertNotIn('raw SQL PASSWORD', output)

    def test_schedule_is_a_read_only_listing_and_protects_known_secrets_and_terminal_codes(self):
        self.save()
        (self.root / '.env').write_text('PANEL_PASSWORD=TOP-SECRET\n')
        (self.root / 'project').mkdir()
        (self.root / 'project/.env').write_text('APP_KEY=OTHER-SECRET\n')
        code, output, error = self.run_cli(['schedules', '--app', 'main'])
        self.assertEqual(code, 0, error)
        self.assertIn('Next Due', output)
        self.assertIn('[oculto]', output)
        self.assertNotIn('TOP-SECRET', output)
        self.assertNotIn('\x1b', output)
        self.assertEqual(self.calls[-1][0], ['exec', '-T', 'php', 'php', 'artisan', 'schedule:list', '--no-ansi'])
        self.assertNotIn('schedule:run', str(self.calls))

    def test_bridge_failure_does_not_echo_application_startup_output(self):
        self.save()
        self.reply = {'queues': [], 'failed': []}
        def broken(root, args, timeout=30, input=None):
            if 'ps' in args:
                return '[]'
            return 'Application startup PASSWORD=TOP-SECRET\n__INFRA_JSON__{"ok":false,"error":"RAW SQL TOP-SECRET"}'
        with patch.object(cli, 'compose', side_effect=broken), redirect_stdout(io.StringIO()) as output:
            self.assertEqual(cli.main(['--root', str(self.root), 'queues']), 1)
        self.assertIn('Consulta Laravel indisponível', output.getvalue())
        self.assertNotIn('TOP-SECRET', output.getvalue())

    def test_real_cli_passes_queue_selection_to_docker_stdin_and_renders_bridge_response(self):
        self.save()
        binary = self.root / 'bin'
        binary.mkdir()
        docker = binary / 'docker'
        docker.write_text('''#!/usr/bin/env python3
import json, sys
if 'ps' in sys.argv:
    print('[]')
elif '/opt/infra/automation.php' in sys.argv:
    request = json.load(sys.stdin)
    print('__INFRA_JSON__'+json.dumps({'ok': True, 'data': {
        'queues': [{'id': q['id'], 'counts': {'total': 12, 'pending': 10, 'reserved': 1, 'delayed': 1}} for q in request['queues']],
        'failed': [{'id': 'failure-123', 'connection': 'redis', 'queue': 'emails', 'failedAt': '2026-11-24 12:00:00'}]}}))
else:
    sys.exit(1)
''')
        docker.chmod(0o755)
        environment = {**os.environ, 'PATH': str(binary)+':'+os.environ['PATH']}
        for command, expected in ((['queues', '--app', 'main'], 'Pendentes'), (['jobs', '--failed', '--app', 'main'], 'failure-123')):
            result = subprocess.run([sys.executable, str(Path(cli.__file__)), '--root', str(self.root), *command],
                                    env=environment, capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(expected, result.stdout)
            self.assertIn('emails', result.stdout)
            self.assertNotIn('Traceback', result.stderr)
        self.assertFalse((self.root / 'config/automation.compose.json').exists())

    def test_invalid_options_and_non_php_apps_do_not_execute_docker(self):
        self.save()
        for args in (['queues', '--queue', 'emails'], ['queues', '--connection', 'redis'],
                     ['queues', '--app', 'app3'], ['queues', '--app', 'app101'],
                     ['workers', '--interval', '0'], ['workers', '--interval', 'nan'],
                     ['queues', '--app', 'main', '--queue', 'bad;name']):
            self.assertEqual(self.run_cli(args)[0], 1)
        self.assertEqual(self.calls, [])

    def test_malformed_registry_fails_before_querying_or_creating_files(self):
        self.save()
        self.config['workers'][0]['queue'] = 'bad queue'
        self.save()
        self.assertEqual(self.run_cli(['workers'])[0], 1)
        self.assertEqual(self.calls, [])
        self.assertFalse((self.root / 'config/automation.compose.json').exists())

    def test_watch_quit_or_interrupt_restores_terminal_and_redirected_watch_is_finite(self):
        self.save()
        code, output, error = self.run_cli(['queues', '--watch'])
        self.assertEqual(code, 0, error)
        self.assertEqual(len(self.calls), 2)
        for interrupted in (False, True):
            output, source = io.StringIO(), unittest.mock.Mock()
            output.isatty = lambda: True
            source.fileno.return_value, source.isatty.return_value = 7, True
            args = cli.parser().parse_args(['workers', '--watch'])
            with redirect_stdout(output), patch.object(automation.sys, 'stdin', source), \
                 patch.dict(os.environ, {'TERM': 'xterm-256color'}), \
                 patch.object(automation.termios, 'tcgetattr', return_value=[1, 2, 3]), \
                 patch.object(automation.tty, 'setcbreak'), patch.object(automation.termios, 'tcsetattr') as restore, \
                 patch.object(automation, 'snapshot', side_effect=KeyboardInterrupt() if interrupted else None,
                              return_value=([('Workers', ('ID',), [('worker-test',)], '')], [])), \
                 patch.object(automation.Viewport, 'wait', return_value=True):
                self.assertEqual(automation.run(self.root, self.compose, args, {}, cli.print_table, cli.section, cli.styled, cli.service_label), 0)
            restore.assert_called_once_with(7, automation.termios.TCSADRAIN, [1, 2, 3])
            self.assertIn('\x1b[?25h\x1b[?1049l', output.getvalue())


if __name__ == '__main__':
    unittest.main()
