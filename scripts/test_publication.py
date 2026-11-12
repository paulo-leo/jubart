import pathlib
import shutil
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='jubart-publication-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        for name in ['scripts/check-publication.mjs', 'docker/panel/core.mjs', 'docker/panel/websocket-config.mjs']:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
        self.git('init', '-q')
        self.git('config', 'user.email', 'test@example.invalid')
        self.git('config', 'user.name', 'Publication test')
        (self.root / '.gitignore').write_text('.env\nconfig/apps.json\n')
        (self.root / 'README.md').write_text('Public example\n')
        self.git('add', '.')
        self.git('commit', '-qm', 'initial')

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, stderr=subprocess.STDOUT)

    def check(self, *args):
        return subprocess.run(['node', 'scripts/check-publication.mjs', *args], cwd=self.root, capture_output=True, text=True)

    def test_clean_and_historical_local_files(self):
        self.assertEqual(self.check('--history').returncode, 0)
        config = self.root / 'config/apps.json'
        config.parent.mkdir()
        config.write_text('{"applications":[]}')
        self.git('add', '-f', 'config/apps.json')
        self.git('commit', '-qm', 'local configuration')
        self.assertEqual(self.check().returncode, 1)
        self.git('rm', '--cached', 'config/apps.json')
        self.assertEqual(self.check().returncode, 0)
        result = self.check('--history')
        self.assertEqual(result.returncode, 1)
        self.assertIn('config/apps.json', result.stderr)

    def test_secrets_in_index_and_untracked_files_are_redacted(self):
        secret = 'test-secret-' + 'a' * 25
        (self.root / '.env').write_text('PANEL_PASSWORD=' + secret)
        (self.root / 'README.md').write_text(secret)
        self.git('add', 'README.md')
        (self.root / 'README.md').write_text('Clean working copy')
        result = self.check()
        self.assertEqual(result.returncode, 1)
        self.assertIn('índice', result.stderr)
        self.assertNotIn(secret, result.stderr + result.stdout)
        self.git('add', 'README.md')
        (self.root / 'untracked.txt').write_text(secret)
        result = self.check()
        self.assertEqual(result.returncode, 1)
        self.assertIn('untracked.txt', result.stderr)
        self.assertNotIn(secret, result.stderr + result.stdout)

    def test_private_keys_and_unknown_options(self):
        (self.root / 'key.txt').write_text('-----BEGIN ' + 'PRIVATE KEY-----\nfixture')
        self.assertEqual(self.check().returncode, 1)
        self.assertEqual(self.check('--unknown').returncode, 2)


if __name__ == '__main__':
    unittest.main()
