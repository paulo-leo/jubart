from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import jubart as cli
import jubart_databases as db


class DatabaseCLITest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='jubart-db-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'docker/panel').mkdir(parents=True)
        (self.root / 'docker/panel/package.json').write_text('{"version":"1.0.0"}')
        (self.root / '.env').write_text('POSTGRES_PASSWORD=ADMIN-SECRET\n')
        self.server = {'engine': 'postgres', 'enabled': True, 'status': 'available',
                       'connection': {'host': 'postgres', 'port': 5432, 'bindAddress': '127.0.0.1',
                                      'hostPort': 5544, 'defaultDatabase': 'infra'},
                       'databases': [{'name': 'infra', 'bytes': 1024, 'owner': 'infra_admin', 'connections': 2}],
                       'users': [{'name': 'app', 'host': 'network', 'admin': False, 'locked': False},
                                 {'name': 'infra_admin', 'host': 'network', 'admin': True, 'locked': False}],
                       'grants': [{'user': 'app', 'database': 'infra', 'privileges': 'CONNECT (efetivo)'}]}

    def run_cli(self, args):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = cli.main(['--root', str(self.root), *args])
        return code, out.getvalue(), err.getvalue()

    def test_help_lists_english_commands_and_flags_without_env_or_docker(self):
        (self.root / '.env').unlink()
        with patch.object(db, 'request') as request:
            code, output, error = self.run_cli(['database', 'help'])
        self.assertEqual(code, 0, error)
        for text in ('list', 'users', 'access', '--engine', '--database', 'Somente consulta'):
            self.assertIn(text, output)
        request.assert_not_called()

    def test_list_users_and_access_use_tables_and_do_not_disclose_secrets(self):
        with patch.object(db, 'request', return_value=[self.server]):
            for args, expected in [(['databases', '--engine', 'postgres'], 'Proprietário'),
                                   (['database', 'users', '--database', 'infra'], 'CONNECT'),
                                   (['database', 'access', '--engine', 'postgres'], '127.0.0.1:5544')]:
                code, output, error = self.run_cli(args)
                self.assertEqual(code, 0, error)
                self.assertIn(expected, output)
                self.assertNotIn('ADMIN-SECRET', output + error)
            code, output, _ = self.run_cli(['database', 'list', '--database', 'missing'])
            self.assertEqual(code, 1)
            self.assertIn('não encontrado', output)

    def test_partial_inventory_and_disabled_engines_keep_successful_rows(self):
        failed = {**self.server, 'engine': 'mariadb', 'status': 'unavailable', 'error': 'Consulta indisponível'}
        with patch.object(db, 'request', return_value=[failed, self.server]):
            code, output, _ = self.run_cli(['databases'])
        self.assertEqual(code, 1)
        self.assertIn('infra', output)
        self.assertIn('Consulta indisponível', output)
        with patch.object(db, 'request', return_value=[{**self.server, 'enabled': False}]):
            code, output, _ = self.run_cli(['databases'])
        self.assertEqual(code, 0)
        self.assertIn('desativado', output)

    def test_bridge_uses_json_stdin_and_container_fallback_with_generic_errors(self):
        result = subprocess.CompletedProcess([], 0, json.dumps({'servers': [self.server]}), '')
        with patch.object(db.shutil, 'which', return_value=None), patch.object(db.subprocess, 'run', return_value=result) as run:
            servers = db.request(self.root, {'PANEL_WORKSPACE_DIRECTORY': '/workspace', 'POSTGRES_PASSWORD': 'ADMIN-SECRET'}, 'postgres')
        self.assertEqual(servers, [self.server])
        args, kwargs = run.call_args
        self.assertEqual(args[0][:6], ['docker', 'compose', 'exec', '-T', 'panel', 'node'])
        self.assertEqual(json.loads(kwargs['input']), {'root': '/workspace', 'engine': 'postgres'})
        self.assertNotIn('ADMIN-SECRET', repr(run.call_args))
        for raw in ('invalid', '[]', '{"error":"DRIVER-SECRET"}'):
            with patch.object(db.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, raw, 'ADMIN-SECRET')):
                with self.assertRaisesRegex(ValueError, '^Não foi possível consultar'):
                    db.request(self.root, {}, 'all')


if __name__ == '__main__':
    unittest.main()
