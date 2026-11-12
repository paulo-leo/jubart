import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('wizard', Path(__file__).with_name('install-wizard.py'))
wizard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wizard)


class InstallWizardTests(unittest.TestCase):
    def test_password_rules(self):
        self.assertTrue(wizard.valid_password('Safe$Password123456'))
        for value in ('short', 'a' * 20, "Safe'Password123456", ' SafePassword123456!', 'SafePassword123456!\n'):
            self.assertFalse(wizard.valid_password(value))

    def test_configuration_literal_password_and_preservation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.env.example').write_text('PANEL_PASSWORD=troque-esta-senha\nPANEL_PORT=9090\nOTHER=preservado\n')
            password = 'Safe$Password123456'
            answers = ['admin', '', '9191', 'public', 'UTC', 'true', 'false', 'yes']
            with patch('sys.stdin.isatty', return_value=True), patch('builtins.input', side_effect=answers), patch.object(wizard.getpass, 'getpass', return_value=password), contextlib.redirect_stdout(io.StringIO()) as output:
                wizard.configure(root)
            text = (root / '.env').read_text()
            self.assertIn("PANEL_PASSWORD='Safe$Password123456'", text)
            self.assertIn("PANEL_BIND_ADDRESS='0.0.0.0'", text)
            self.assertIn("POSTGRES_ENABLED='false'", text)
            self.assertIn('OTHER=preservado', text)
            self.assertEqual((root / '.env').stat().st_mode & 0o777, 0o600)
            self.assertNotIn(password, output.getvalue())
            with patch('builtins.input', side_effect=AssertionError('must preserve')), contextlib.redirect_stdout(io.StringIO()):
                wizard.configure(root)
            self.assertEqual((root / '.env').read_text(), text)

    def test_cancellation_does_not_write(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.env.example').write_text('PANEL_PASSWORD=troque-esta-senha\n')
            with patch('sys.stdin.isatty', return_value=True), patch('builtins.input', side_effect=['admin', '', '', '', 'UTC', '', '', 'no']), patch.object(wizard.getpass, 'getpass', return_value='Safe$Password123456'), contextlib.redirect_stdout(io.StringIO()), self.assertRaises(ValueError):
                wizard.configure(root)
            self.assertFalse((root / '.env').exists())
            self.assertFalse((root / 'projects').exists())


if __name__ == '__main__':
    unittest.main()
