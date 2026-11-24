from contextlib import redirect_stdout
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import jubart as cli
import jubart_terminal as terminal


class TerminalTest(unittest.TestCase):
    def test_tables_fill_available_width_and_wrap_without_losing_data(self):
        path = '/srv/projetos/aplicação/com/um/caminho/muito/longo'
        for columns in (25, 48, 80, 120, 200):
            lines = terminal.table_lines(('Serviço', 'Pasta'), [('php', path)], columns)
            self.assertTrue(all(terminal.width(line) <= columns for line in lines))
            if columns >= 25:
                self.assertEqual(terminal.width(lines[0]), columns)
            # Every character remains available after wrapping the path column.
            fragments = ''.join(line.split('│')[-2].strip() for line in lines if '│' in line)[len('Pasta'):]
            self.assertEqual(fragments, path)
        self.assertTrue(terminal.table_lines(('ID', 'Nome'), [], 80))

    def test_narrow_table_becomes_labeled_records_instead_of_dropping_columns(self):
        lines = terminal.table_lines(('Serviço', 'Estado', 'Saúde', 'Portas'), [('php', 'em execução', 'saudável', '9090')], 24)
        text = ' '.join(lines)
        self.assertIn('Serviço: php', text)
        self.assertIn('Estado: em execução', text)
        self.assertIn('Portas: 9090', text)
        self.assertTrue(all(terminal.width(line) <= 24 for line in lines))

    def test_ansi_unicode_and_combining_characters_use_terminal_cells(self):
        value = '\x1b[31mAB界CD\x1b[0m'
        parts = terminal.wrap(value, 4)
        self.assertEqual([terminal.width(part) for part in parts], [4, 2])
        self.assertEqual(''.join(terminal.ANSI.sub('', part) for part in parts), 'AB界CD')
        self.assertEqual(terminal.width('a\u0301'), 1)
        self.assertEqual(terminal.width(terminal.pad('界', 5)), 5)
        self.assertEqual(terminal.wrap('abcdef', 2), ['ab', 'cd', 'ef'])

    def test_size_prefers_real_tty_dimensions_over_stale_environment(self):
        with patch.dict(os.environ, {'COLUMNS': '80', 'LINES': '24'}), \
             patch.object(terminal.os, 'get_terminal_size', return_value=os.terminal_size((170, 42))):
            self.assertEqual(terminal.size(), os.terminal_size((170, 42)))

    def test_viewport_reflows_cached_content_and_keeps_prompt_on_bottom(self):
        dimensions = [os.terminal_size((120, 30))]
        output = io.StringIO()
        calls = []
        def content(columns, height):
            calls.append((columns, height))
            return terminal.table_lines(('ID', 'Valor'), [(str(index), 'dados') for index in range(30)], columns, indent=0)
        with patch.object(terminal, 'size', side_effect=lambda: dimensions[0]):
            viewport = terminal.Viewport('Jubart', output)
            viewport.prompt = 'jubart> app'
            viewport.add(content)
            viewport.draw()
            self.assertIn('\x1b[29;1H', output.getvalue())
            viewport.scroll(1)
            self.assertGreater(viewport.offset, 0)
            dimensions[0] = os.terminal_size((60, 16))
            viewport.draw()
        self.assertEqual(calls[-1], (59, 12))
        self.assertIn('\x1b[15;1H', output.getvalue())
        self.assertIn('jubart> app', output.getvalue())
        self.assertNotIn('\n', output.getvalue())

    def test_live_resize_repaints_without_waiting_for_refresh_or_recollecting(self):
        dimensions = [os.terminal_size((80, 24))]
        output, factory = io.StringIO(), Mock(return_value=['Dados já consultados'])
        def select(*arguments):
            dimensions[0] = os.terminal_size((140, 36))
            return ([], [], []) if factory.call_count == 1 else ([7], [], [])
        with patch.object(terminal, 'size', side_effect=lambda: dimensions[0]), \
             patch.object(terminal.select, 'select', side_effect=select), \
             patch.object(terminal.os, 'read', return_value=b'q'):
            viewport = terminal.Viewport('Monitor', output)
            viewport.add(factory)
            viewport.draw()
            self.assertTrue(viewport.wait(60, 7))
        self.assertEqual(factory.call_count, 2)
        self.assertEqual(factory.call_args.args, (139, 32))

    def test_console_editor_retains_typed_text_across_resize_and_paging(self):
        dimensions = [os.terminal_size((120, 30))]
        output, source = io.StringIO(), Mock()
        output.isatty = lambda: True
        source.fileno.return_value = 7
        selects = [0]
        def ready(*arguments):
            selects[0] += 1
            if selects[0] == 2:
                dimensions[0] = os.terminal_size((60, 18))
                return [], [], []
            return [7], [], []
        with redirect_stdout(output), patch.object(cli.sys, 'stdin', source), \
             patch.dict(os.environ, {'TERM': 'xterm-256color', 'JUBART_NO_ANIMATION': '1'}), \
             patch.object(terminal, 'size', side_effect=lambda: dimensions[0]), \
             patch.object(cli.termios, 'tcgetattr', return_value=[]), patch.object(cli.tty, 'setcbreak'), \
             patch.object(cli.termios, 'tcsetattr'), patch.object(cli.select, 'select', side_effect=ready), \
             patch.object(cli.os, 'read', side_effect=[b'ver', b'\x1b[6~sion\r']):
            viewport = terminal.Viewport('Jubart', output)
            viewport.add(lambda columns, height: [f'Linha {index}' for index in range(40)])
            with patch.object(cli, 'SCREEN', viewport):
                self.assertEqual(cli.read_console_line([], '1.0.0'), 'version')
        self.assertGreater(viewport.offset, 0)
        self.assertIn('\x1b[17;1H', output.getvalue())
        self.assertTrue(viewport.prompt.endswith('version'))

    def test_confirmation_uses_fixed_prompt_and_never_repeats_the_action(self):
        output = io.StringIO()
        output.isatty = lambda: True
        viewport = terminal.Viewport('Jubart', output)
        viewport.busy = True
        with patch.object(cli, 'SCREEN', viewport), patch.object(cli.sys.stdin, 'isatty', return_value=True), \
             patch.object(cli, 'read_console_line', return_value='yes') as read, \
             patch('builtins.input') as regular_input, terminal.captured(viewport):
            cli.confirm('Revisão antes de alterar.', 'yes')
        regular_input.assert_not_called()
        read.assert_called_once_with([], '', prompt_text='Digite yes para continuar: ')
        self.assertTrue(viewport.busy)

    def test_help_for_live_commands_stays_in_console_and_root_alone_cannot_nest_console(self):
        viewport = terminal.Viewport('Jubart', io.StringIO())
        with patch.object(cli, 'SCREEN', viewport), patch.object(cli, 'full_screen_command') as detached, \
             terminal.captured(viewport), self.assertRaises(SystemExit):
            cli.main(['monitor', '--help'])
        detached.assert_not_called()
        self.assertIn('--interval', '\n'.join(viewport.lines()))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'docker/panel').mkdir(parents=True)
            (root / 'docker/panel/package.json').write_text('{"version":"1"}')
            with patch.object(cli, 'SCREEN', viewport), patch.object(cli, 'run_console') as nested, terminal.captured(viewport):
                self.assertEqual(cli.main(['--root', str(root)]), 1)
            nested.assert_not_called()


if __name__ == '__main__':
    unittest.main()
