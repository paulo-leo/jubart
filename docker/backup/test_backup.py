import contextlib
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('backup', Path(__file__).with_name('backup.py'))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class DumpProcess:
    def __init__(self, code=0):
        self.stdout = io.BytesIO(b'CREATE TABLE sample(id integer);\n')
        self.code = code
    def wait(self): return self.code
    def poll(self): return self.code


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.patch_root = patch.object(backup, 'ROOT', self.root)
        self.patch_root.start()
        self.addCleanup(self.patch_root.stop)
        self.env = patch.dict(os.environ, {
            'BACKUP_DB_PASSWORD': 'secret-not-in-arguments',
            'BACKUP_DB_USERNAME': 'infra_admin', 'BACKUP_DB_DATABASE': 'appdb',
            'BACKUP_DATABASES': '*', 'BACKUP_RETENTION_DAYS': '14',
            'BACKUP_REMOTE_ENABLED': 'false',
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_each_engine_discovers_and_creates_valid_compressed_dump(self):
        for engine in ['mariadb', 'postgres']:
            with self.subTest(engine=engine), patch.object(backup, 'ENGINE', engine), \
                    patch.object(backup.subprocess, 'check_output', return_value='appdb\nsecond_db\n') as listing, \
                    patch.object(backup.subprocess, 'Popen', side_effect=lambda *a, **kw: DumpProcess()) as process:
                self.assertEqual(backup.databases(), ['appdb', 'second_db'])
                output = backup.dump_database('appdb')
                self.assertEqual(gzip.decompress(output.read_bytes()), b'CREATE TABLE sample(id integer);\n')
                self.assertEqual(output.with_name(output.name+'.sha256').read_text().split()[0], hashlib.sha256(output.read_bytes()).hexdigest())
                arguments = process.call_args.args[0]
                self.assertNotIn('secret-not-in-arguments', ' '.join(arguments))
                self.assertEqual(arguments[0], 'mariadb-dump' if engine == 'mariadb' else 'pg_dump')
                self.assertNotIn('--clean', arguments)
                self.assertNotIn('DROP', ' '.join(arguments))
                self.assertEqual(listing.call_args.kwargs['env']['PGPASSWORD'], 'secret-not-in-arguments')

    def test_failed_dump_never_publishes_partial_file_or_success(self):
        with patch.object(backup.subprocess, 'check_output', return_value='appdb\n'), \
                patch.object(backup.subprocess, 'Popen', return_value=DumpProcess(1)):
            with self.assertRaises(RuntimeError): backup.backup()
        self.assertFalse(list(self.root.glob('*.sql.gz*')))
        self.assertFalse((self.root / '.last-success').exists())
        self.assertTrue((self.root / '.last-error').exists())

    def test_retention_only_removes_old_backup_files_of_current_engine(self):
        old = self.root/'mariadb-old-20000101.sql.gz'
        other = self.root/'postgres-old-20000101.sql.gz'
        unrelated = self.root/'application-file.txt'
        for p in [old, other, unrelated]:
            p.write_text('preserve unless owned backup')
            os.utime(p, (time.time()-30*86400,)*2)
        with patch.object(backup, 'ENGINE', 'mariadb'), \
                patch.object(backup.subprocess, 'check_output', return_value='appdb\n'), \
                patch.object(backup.subprocess, 'Popen', return_value=DumpProcess()):
            backup.backup()
            captured = io.StringIO()
            with contextlib.redirect_stdout(captured): backup.status()
        self.assertFalse(old.exists())
        self.assertTrue(other.exists())
        self.assertTrue(unrelated.exists())
        state = json.loads(captured.getvalue())
        self.assertEqual(state['fileCount'], 1)
        self.assertIsNotNone(state['lastSuccess'])
        self.assertGreater(state['bytes'], 0)


if __name__ == '__main__': unittest.main()
