import argparse
from contextlib import redirect_stdout
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

import jubart_metrics as metrics


class MetricsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='jubart-metrics-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.proc = self.root / 'proc'
        (self.proc / 'net').mkdir(parents=True)
        self.compose = Mock()
        self.write_host()

    def write_host(self, ticks='100 0 0 800 100 0 0 0 500 0', rx=1000, tx=2000, available=600):
        (self.proc / 'stat').write_text('cpu  '+ticks+'\ncpu0 1 2 3\n')
        (self.proc / 'meminfo').write_text(f'MemTotal: 1000 kB\nMemAvailable: {available} kB\nMemFree: 100 kB\nCached: 500 kB\nSwapTotal: 200 kB\nSwapFree: 150 kB\n')
        (self.proc / 'uptime').write_text('90061.22 10000\n')
        (self.proc / 'loadavg').write_text('0.50 0.25 0.10 1/100 1234\n')
        (self.proc / 'net/dev').write_text('header\nheader\n'+f' eth0: {rx} 0 0 0 0 0 0 0 {tx} 0 0 0 0 0 0 0\n'+
                                          ' docker0: 1000000 0 0 0 0 0 0 0 2000000 0 0 0 0 0 0 0\n')
        (self.proc / 'net/route').write_text('Iface Destination Gateway Flags\neth0 00000000 00000000 0003\n')

    def collector(self, **options):
        return metrics.Collector(self.root, self.compose, proc=self.proc, **options)

    def docker_row(self, **values):
        return json.dumps({'ID': 'abcdef123456', 'Name': 'demo-php-1', 'CPUPerc': '125.50%',
                           'MemUsage': '100MiB / 2GiB', 'MemPerc': '4.88%', 'NetIO': '1MB / 2MB', 'PIDs': '12', **values})

    def test_host_memory_excludes_available_cache_cpu_excludes_guest_and_network_avoids_bridge(self):
        collector = self.collector(host_only=True)
        with patch.object(metrics.time, 'monotonic', return_value=10):
            first = collector.collect()
        self.assertNotIn('cpu', first['host'])
        self.assertEqual(first['host']['memory'], 400*1024)
        self.assertEqual(first['host']['swap'], 50*1024)
        self.assertEqual(first['host']['network'], {'eth0': (1000, 2000)})
        self.write_host(ticks='150 0 0 840 110 0 0 0 900 0', rx=3000, tx=6000)
        with patch.object(metrics.time, 'monotonic', return_value=12):
            second = collector.collect()
        self.assertEqual(second['host']['cpu'], 50)
        self.assertEqual(second['host']['rx_rate'], 1000)
        self.assertEqual(second['host']['tx_rate'], 2000)
        self.compose.assert_not_called()

    def test_interface_filter_counter_reset_and_missing_data_never_become_zero(self):
        collector = self.collector(interface='docker0', host_only=True)
        with patch.object(metrics.time, 'monotonic', return_value=10):
            self.assertEqual(collector.collect()['host']['rx'], 1000000)
        collector.interface = 'eth0'
        with patch.object(metrics.time, 'monotonic', return_value=12):
            self.assertIsNone(collector.collect()['host']['rx_rate'])
        self.write_host(rx=1, tx=1)
        with patch.object(metrics.time, 'monotonic', return_value=14):
            self.assertIsNone(collector.collect()['host']['rx_rate'])
        (self.proc / 'meminfo').unlink()
        collector.interface = 'missing'
        result = collector.collect()
        self.assertNotIn('memory', result['host'])
        self.assertNotIn('network', result['host'])
        self.assertEqual(len(result['host']['errors']), 2)
        self.assertTrue(metrics.health_issues(result['host']))

    def test_memory_fallback_and_resource_pressure_thresholds(self):
        (self.proc / 'meminfo').write_text('MemTotal: 1000 kB\nMemFree: 100 kB\nCached: 200 kB\nBuffers: 50 kB\nSReclaimable: 25 kB\nShmem: 75 kB\n')
        host = self.collector().host()
        self.assertEqual(host['memory_available'], 300*1024)
        host.update(cpu=95, memory_percent=91, disk_percent=92, load=[0, 0, 0], swap_total=100, swap=90)
        self.assertEqual(len(metrics.health_issues(host)), 4)

    def test_docker_units_cpu_above_one_core_and_missing_values(self):
        row = metrics.parse_stats(self.docker_row(), {'abcdef1234567890': 'php'})[0]
        self.assertEqual(row['memory'], 100*1024**2)
        self.assertEqual(row['limit'], 2*1024**3)
        self.assertEqual(row['rx'], 1000000)
        self.assertEqual(row['cpu'], 125.5)
        row = metrics.parse_stats(self.docker_row(MemUsage='-- / --', CPUPerc='--', NetIO='-- / --'), {'abcdef123456': 'php'})[0]
        self.assertIsNone(row['memory'])
        self.assertIsNone(row['rx'])
        self.assertIsNone(row['cpu'])
        self.assertIsNone(metrics.number('NaN'))
        self.assertIsNone(metrics.number('Infinity'))
        with self.assertRaises(ValueError):
            metrics.parse_stats(self.docker_row(ID='123456abcdef'), {'abcdef123456': 'php'})

    def test_stats_are_scoped_to_project_ids_and_never_query_every_docker_container(self):
        self.compose.return_value = json.dumps([{'ID': 'abcdef123456', 'Service': 'php'}])
        collector = self.collector(service='php')
        with patch.object(metrics.subprocess, 'run', return_value=Mock(returncode=0, stdout=self.docker_row())) as execute, \
             patch.object(metrics.time, 'monotonic', return_value=10):
            self.assertEqual(collector.containers()[0]['service'], 'php')
        self.assertEqual(self.compose.call_args.args[1], ['ps', '--status', 'running', '--format', 'json', 'php'])
        self.assertEqual(execute.call_args.args[0], ['docker', 'stats', '--no-stream', '--format', '{{json .}}', 'abcdef123456'])
        self.compose.return_value = '[]'
        with patch.object(metrics.subprocess, 'run') as execute:
            self.assertEqual(collector.containers(), [])
        execute.assert_not_called()
        self.assertEqual(collector.previous_containers, {})

    def test_container_rates_restarts_and_failures_discard_stale_baselines(self):
        self.compose.return_value = json.dumps([{'ID': 'abcdef123456', 'Service': 'php'}])
        collector = self.collector()
        with patch.object(metrics.subprocess, 'run', return_value=Mock(returncode=0, stdout=self.docker_row())), \
             patch.object(metrics.time, 'monotonic', return_value=10):
            self.assertIsNone(collector.collect()['containers'][0]['rx_rate'])
        with patch.object(metrics.subprocess, 'run', return_value=Mock(returncode=0, stdout=self.docker_row(NetIO='3MB / 4MB'))), \
             patch.object(metrics.time, 'monotonic', return_value=12):
            self.assertEqual(collector.collect()['containers'][0]['rx_rate'], 1000000)
        with patch.object(metrics.subprocess, 'run', side_effect=subprocess.TimeoutExpired('docker', 12)):
            snapshot = collector.collect()
        self.assertIsNone(snapshot['containers'])
        self.assertTrue(snapshot['errors'])
        self.assertIn('memory', snapshot['host'])
        with patch.object(metrics.subprocess, 'run', return_value=Mock(returncode=0, stdout=self.docker_row())), \
             patch.object(metrics.time, 'monotonic', return_value=14):
            self.assertIsNone(collector.collect()['containers'][0]['rx_rate'])

    def test_http_rates_latency_resets_and_recovery_use_the_panel_parser(self):
        collector = self.collector(http=True)
        values = {'total': 100, 'durationSum': 10, 'durationCount': 100, 'processStartedAt': 1, 'statuses': {'5xx': 5}}
        self.compose.return_value = json.dumps(values)
        with patch.object(metrics.time, 'monotonic', return_value=10):
            self.assertIsNone(collector.http_metrics()['requests_rate'])
        self.assertIn('/opt/panel/metrics.mjs', self.compose.call_args.args[1][-1])
        self.assertEqual(self.compose.call_args.args[1][:5], ['exec', '-T', 'panel', 'node', '--input-type=module'])
        self.compose.return_value = json.dumps({**values, 'total': 110, 'durationSum': 12, 'durationCount': 110})
        with patch.object(metrics.time, 'monotonic', return_value=12):
            current = collector.http_metrics()
        self.assertEqual(current['requests_rate'], 5)
        self.assertEqual(current['latency'], 200)
        self.compose.return_value = json.dumps({**values, 'processStartedAt': 2})
        with patch.object(metrics.time, 'monotonic', return_value=14):
            self.assertIsNone(collector.http_metrics()['requests_rate'])
        self.compose.side_effect = ValueError('raw error must not leak')
        snapshot = collector.collect()
        self.assertIsNone(snapshot['http'])
        self.assertIsNone(collector.previous_http)
        self.assertNotIn('raw error', '\n'.join(snapshot['errors']))

    def test_history_is_bounded_and_graphs_preserve_missing_samples(self):
        collector = self.collector(host_only=True)
        for _ in range(65):
            snapshot = collector.collect()
        self.assertEqual(len(collector.history), 60)
        self.assertEqual(metrics.spark([0, None, 100], 3, 100), '▁ █')
        lines = metrics.render(snapshot, collector.history, 'monitor', host_only=True, width=80)
        self.assertIn('HISTÓRICO', '\n'.join(lines))
        self.assertNotIn('CONTAINERS', '\n'.join(lines))
        self.assertEqual(metrics.fit('AB界CD', 5), 'AB界C')
        self.assertEqual(metrics.fit('bad\x1b[2J', 20), 'bad[2J')

    def test_redirected_live_command_is_a_finite_snapshot_without_terminal_escapes(self):
        collector = self.collector(host_only=True)
        args = argparse.Namespace(command='monitor', interval=1, once=False, host_only=True, service=None, interface=None)
        output = io.StringIO()
        with patch.object(metrics, 'Collector', return_value=collector), redirect_stdout(output), \
             patch.object(metrics.time, 'sleep') as sleep:
            self.assertEqual(metrics.run(self.root, self.compose, args), 0)
        sleep.assert_called_once_with(1)
        self.assertEqual(len(collector.history), 2)
        self.assertNotIn('\x1b', output.getvalue())

    def test_live_terminal_is_restored_on_quit_and_keyboard_interrupt(self):
        for interrupted in (False, True):
            collector = self.collector(host_only=True)
            if interrupted:
                collector.collect = Mock(side_effect=KeyboardInterrupt())
            args = argparse.Namespace(command='monitor', interval=1, once=False, host_only=True, service=None, interface=None)
            output, source = io.StringIO(), Mock()
            output.isatty = lambda: True
            source.isatty.return_value = True
            source.fileno.return_value = 7
            with redirect_stdout(output), patch.object(metrics.sys, 'stdin', source), \
                 patch.dict(os.environ, {'TERM': 'xterm-256color'}), \
                 patch.object(metrics, 'Collector', return_value=collector), \
                 patch.object(metrics.termios, 'tcgetattr', return_value=[1, 2, 3]), \
                 patch.object(metrics.tty, 'setcbreak'), patch.object(metrics.termios, 'tcsetattr') as restore, \
                 patch.object(metrics.shutil, 'get_terminal_size', return_value=os.terminal_size((80, 8))), \
                 patch.object(metrics.Viewport, 'wait', return_value=True):
                self.assertEqual(metrics.run(self.root, self.compose, args), 0)
            restore.assert_called_once_with(7, metrics.termios.TCSADRAIN, [1, 2, 3])
            self.assertIn('\x1b[?25h\x1b[?1049l', output.getvalue())
            self.assertIn('Monitoramento encerrado.', output.getvalue())
            if not interrupted:
                frame = output.getvalue().split('\x1b[?25l\x1b[H')[1].split('\x1b[?25h')[0]
                self.assertNotIn('\n', frame)
                self.assertIn('PgUp/PgDn', frame)
                self.assertIn('q ou Ctrl+C', frame)

    def test_invalid_options_are_rejected_before_collecting(self):
        for values in ({'interval': 0}, {'interval': float('nan')}, {'interval': 61}, {'service': '--all'},
                       {'interface': 'eth0;id'}, {'host_only': True, 'service': 'php'}):
            args = argparse.Namespace(**{'command': 'monitor', 'interval': 1, 'once': True,
                                       'host_only': False, 'service': None, 'interface': None, **values})
            with patch.object(metrics, 'Collector') as collector, self.assertRaises(ValueError):
                metrics.run(self.root, self.compose, args)
            collector.assert_not_called()


if __name__ == '__main__':
    unittest.main()
