"""Kernel-record interpretation guards; no service access or kernel mutation."""
import importlib.util
from pathlib import Path
import unittest
import subprocess
import sys
import io
import json

PATH = Path(__file__).parent / 'io/kernel-capture.py'

class FakeChild:
    pid = 77

    def __init__(self):
        self.returncode = None
        self.signals = []

    def poll(self):
        return self.returncode

    def send_signal(self, signum):
        self.signals.append(signum)

    def wait(self, timeout=None):
        self.returncode = 0
        return 0

    def terminate(self):
        self.signals.append('terminate')

    def kill(self):
        self.signals.append('kill')


class FakeHealth:
    def __init__(self, commands=None):
        self.commands = list(commands or [])
        self.sent, self.order = [], []
        self.finished_send = False

    def poll(self):
        result = self.commands.pop(0) if self.commands else []
        if isinstance(result, Exception):
            raise result
        return result

    def send(self, event, **fields):
        self.order.append('notify:' + event)
        self.sent.append({'event': event, **fields})

    def finish_send(self):
        self.finished_send = True

    def wait(self, event):
        pass


class OrderedStream(io.StringIO):
    def __init__(self, order):
        super().__init__()
        self.order = order

    def write(self, text):
        self.order.append('disk:stderr')
        return super().write(text)


class KernelEvidenceTests(unittest.TestCase):
    def test_controlled_lifecycle_preserves_line_before_phase_and_error_is_not_loss(self):
        tool = self.tool()
        self.assertTrue(hasattr(tool, 'collect_child'), 'kernel lifecycle has no controlled test boundary')
        child = FakeChild()
        health = FakeHealth([[{'event':'observer.phase','phase':'stop','phase_id':'p1'}],
                             [{'event':'observer.goodbye'}]])
        normalized, raw, stderr = io.StringIO(), io.StringIO(), OrderedStream(health.order)
        stopped = [False]
        def stop():
            stopped[0] = True
        rows = [('stdout', json.dumps({'type':'printf','data':'MESK event=ready mono_ns=1 pid=77\n'}) + '\n'),
                ('stderr', 'ERROR: failed private-canary\n'), ('tick', ''),
                ('stdout', json.dumps({'type':'printf','data':'MESK event=exit mono_ns=2 pid=77\n'}))]
        receipt = tool.collect_child(child, normalized, raw, stderr, health, lambda: stopped[0], stop,
                                     line_reader=lambda *args, **kwargs: iter(rows))
        events = [row['event'] for row in health.sent]
        self.assertLess(events.index('kernel.error'), events.index('observer.phase.ack'))
        self.assertFalse(receipt['unknown_bpf_loss'])
        self.assertEqual(receipt['live_bpf_event_loss'], 0)
        self.assertFalse(receipt['complete'])
        self.assertFalse(receipt['usable'])
        self.assertLess(health.order.index('notify:kernel.error'), health.order.index('disk:stderr'))
        self.assertIn('private-canary', stderr.getvalue())
        self.assertTrue(health.finished_send)

    def test_control_failure_keeps_raw_partial_and_final_receipt(self):
        tool = self.tool()
        self.assertTrue(hasattr(tool, 'collect_child'), 'kernel lifecycle has no controlled test boundary')
        child, health = FakeChild(), FakeHealth([ConnectionError('observer gone')])
        raw = io.StringIO()
        rows = [('stdout', json.dumps({'type':'printf','data':'MESK event=ready mono_ns=1 pid=77\n'}) + '\n'),
                ('stdout', '{partial-tail')]
        receipt = tool.collect_child(child, io.StringIO(), raw, io.StringIO(), health,
                                     lambda: False, lambda: None, line_reader=lambda *args, **kwargs: iter(rows))
        self.assertIn('{partial-tail', raw.getvalue())
        self.assertFalse(receipt['complete'])
        self.assertFalse(receipt['usable'])
        self.assertGreater(receipt['collector_errors'], 0)
        self.assertTrue(child.signals)

    def test_normal_parent_goodbye_retains_existing_owner_exit_contract(self):
        tool = self.tool()
        self.assertTrue(hasattr(tool, 'collect_child'), 'kernel lifecycle has no controlled test boundary')
        child, health, owner = FakeChild(), FakeHealth([[{'event':'observer.goodbye'}]]), [False]
        def stop():
            owner[0] = True
        rows = [('stdout', json.dumps({'type':'printf','data':'MESK event=ready mono_ns=1 pid=77\n'}) + '\n'),
                ('stdout', json.dumps({'type':'printf','data':'MESK event=exit mono_ns=2 pid=77\n'}))]
        raw = io.StringIO()
        receipt = tool.collect_child(child, io.StringIO(), raw, io.StringIO(), health,
                                     lambda: owner[0], stop, line_reader=lambda *args, **kwargs: iter(rows))
        self.assertTrue(receipt['usable'])
        self.assertTrue(receipt['complete'])
        self.assertEqual(receipt['exit_code'], 0)
        self.assertTrue(receipt['stopped_by_owner'])
        self.assertEqual(health.sent[-1]['event'], 'observer.goodbye.ack')
        self.assertTrue(health.finished_send)
        self.assertTrue(raw.getvalue().endswith('}'))
        self.assertEqual(child.signals, [2])

    def test_stdout_loss_is_not_a_decode_error_and_is_notified_before_raw_write(self):
        tool, child, health = self.tool(), FakeChild(), FakeHealth()
        raw = OrderedStream(health.order)
        line = json.dumps({'type':'lost_events','data':{'events':4}})
        receipt = tool.collect_child(child, io.StringIO(), raw, io.StringIO(), health,
                                     lambda: True, lambda: None,
                                     line_reader=lambda *args, **kwargs: iter([('stdout', line)]))
        self.assertEqual(receipt['live_bpf_event_loss'], 4)
        self.assertEqual(receipt['decode_errors'], 0)
        self.assertFalse(receipt['unknown_bpf_loss'])
        self.assertLess(health.order.index('notify:kernel.loss'), health.order.index('disk:stderr'))

    def test_final_goodbye_flush_failure_keeps_receipt_unusable(self):
        tool, child, health = self.tool(), FakeChild(), FakeHealth([[{'event':'observer.goodbye'}]])
        owner = [False]
        def stop():
            owner[0] = True
        def fail():
            raise TimeoutError('observer blocked')
        health.finish_send = fail
        receipt = tool.collect_child(child, io.StringIO(), io.StringIO(), io.StringIO(), health,
                                     lambda: owner[0], stop,
                                     line_reader=lambda *args, **kwargs: iter([('tick', '')]))
        self.assertFalse(receipt['complete'])
        self.assertFalse(receipt['usable'])
        self.assertIn('kernel_health_shutdown_TimeoutError', receipt['failure_reasons'])

    def test_uninterruptible_owned_child_cannot_skip_failure_receipt(self):
        tool, health = self.tool(), FakeHealth()
        class Child(FakeChild):
            def wait(self, timeout=None):
                raise subprocess.TimeoutExpired('owned-fake', timeout)
        child = Child()
        receipt = tool.collect_child(child, io.StringIO(), io.StringIO(), io.StringIO(), health,
                                     lambda: True, lambda: None,
                                     line_reader=lambda *args, **kwargs: iter([]))
        self.assertFalse(receipt['complete'])
        self.assertFalse(receipt['usable'])
        self.assertTrue(receipt['child_still_running'])
        self.assertIn('kill', child.signals)

    def test_pipe_read_error_preserves_partial_and_is_unknown_loss(self):
        tool, child, health, raw = self.tool(), FakeChild(), FakeHealth(), io.StringIO()
        rows = [('stdout.error', ''), ('stdout.fragment', 'partial-before-read-error')]
        receipt = tool.collect_child(child, io.StringIO(), raw, io.StringIO(), health,
                                     lambda: True, lambda: None, line_reader=lambda *args, **kwargs: iter(rows))
        self.assertEqual(raw.getvalue(), 'partial-before-read-error')
        self.assertTrue(receipt['unknown_bpf_loss'])
        self.assertFalse(receipt['complete'])
        self.assertFalse(receipt['usable'])

    def test_disk_error_does_not_prevent_prior_loss_notification(self):
        tool, child, health = self.tool(), FakeChild(), FakeHealth()
        class BrokenStream(io.StringIO):
            def write(self, text):
                health.order.append('disk:failed')
                raise OSError('disk failed')
        receipt = tool.collect_child(child, io.StringIO(), io.StringIO(), BrokenStream(), health,
                                     lambda: True, lambda: None,
                                     line_reader=lambda *args, **kwargs: iter([('stderr','Lost 3 events\n')]))
        self.assertLess(health.order.index('notify:kernel.loss'), health.order.index('disk:failed'))
        self.assertEqual(receipt['live_bpf_event_loss'], 3)
        self.assertFalse(receipt['complete'])
        self.assertGreater(receipt['unconfirmed_output_bytes'], 0)

    def test_reader_overflow_and_drain_timeout_remain_fatal_after_owner_stop(self):
        tool = self.tool()
        self.assertTrue(hasattr(tool, 'collect_child'), 'kernel lifecycle has no controlled test boundary')
        child, health, raw = FakeChild(), FakeHealth(), io.StringIO()
        rows = [('stdout.overflow', 'oversized-raw-prefix'), ('stdout.fragment', '-raw-tail'), ('drain.timeout', '')]
        receipt = tool.collect_child(child, io.StringIO(), raw, io.StringIO(), health,
                                     lambda: True, lambda: None, line_reader=lambda *args, **kwargs: iter(rows))
        self.assertEqual(raw.getvalue(), 'oversized-raw-prefix-raw-tail')
        self.assertFalse(receipt['complete'])
        self.assertFalse(receipt['usable'])
        self.assertTrue(receipt['unknown_bpf_loss'])
        self.assertTrue(any(row['event'] == 'kernel.error' for row in health.sent))
        self.assertTrue(any(row['event'] == 'kernel.loss' for row in health.sent))

    def test_live_health_keeps_loss_separate_and_does_not_copy_raw_text(self):
        tool = self.tool()
        classify = getattr(tool, 'health_notice', None)
        self.assertIsNotNone(classify, 'BPF health is only inspected after process exit')
        event = classify('stderr', 'Lost 7 events; private-canary', None)
        self.assertEqual(event['event'], 'kernel.loss')
        self.assertEqual(event['bpf_event_loss'], 7)
        self.assertNotIn('private-canary', str(event))
        self.assertNotIn('kernel_packet_drops', event)
        self.assertEqual(classify('stdout', '', {'type':'lost_events','data':{'events':4}})['bpf_event_loss'], 4)
        self.assertIsNone(classify('stderr', 'Attaching probes...', None))
        self.assertEqual(classify('stderr', 'ERROR: failed probe', None)['event'], 'kernel.error')

    @unittest.skipUnless(sys.platform == 'linux', 'Linux pipe selectors are required')
    def test_live_stderr_and_partial_final_batch_are_read_before_exit(self):
        tool = self.tool()
        reader = getattr(tool, 'process_lines', None)
        self.assertIsNotNone(reader, 'stderr remains unavailable until collector termination')
        child = subprocess.Popen([sys.executable, '-u', '-c',
            'import sys;sys.stderr.write("Lost 2 events\\n");sys.stderr.flush();sys.stdin.read(1);sys.stdout.write("tail")'],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            rows = reader(child, maximum_line_bytes=1024)
            first = next(row for row in rows if row[0] != 'tick')
            self.assertEqual(first, ('stderr', 'Lost 2 events\n'))
            self.assertIsNone(child.poll())
            child.stdin.write(b'x'); child.stdin.flush()
            self.assertIn(('stdout', 'tail'), list(rows))
            self.assertEqual(child.wait(timeout=5), 0)
        finally:
            if child.poll() is None:
                child.kill(); child.wait(timeout=5)
            for pipe in (child.stdin, child.stdout, child.stderr):
                pipe.close()

    @unittest.skipUnless(sys.platform == 'linux', 'Linux pipe selectors are required')
    def test_pipe_overflow_preserves_all_bounded_fragments(self):
        tool = self.tool()
        payload = 'x' * 2500 + '\n' + 'partial-tail'
        child = subprocess.Popen([sys.executable, '-u', '-c', 'import sys;sys.stdout.write(' + repr(payload) + ')'],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            rows = list(tool.process_lines(child, maximum_line_bytes=1024))
            self.assertEqual(''.join(line for source, line in rows if source.startswith('stdout')), payload)
            self.assertTrue(any(source == 'stdout.overflow' for source, line in rows))
            self.assertLessEqual(max(len(line) for source, line in rows), 1024)
            self.assertEqual(child.wait(timeout=5), 0)
        finally:
            if child.poll() is None:
                child.kill(); child.wait(timeout=5)
            child.stdout.close(); child.stderr.close()

    def test_only_known_missing_filter_lookup_is_benign(self):
        tool = self.tool()
        for message in ('Success', "Can't lookup map element because it does not exist."):
            event = {'type': 'helper_error', 'helper': 'map_lookup_elem', 'retcode': 0, 'msg': message}
            self.assertTrue(tool.is_intentional_missing_key(event))
            self.assertFalse(tool.is_intentional_missing_key({**event, 'retcode': -14}))
            self.assertFalse(tool.is_intentional_missing_key({**event, 'helper': 'probe_read'}))
        self.assertFalse(tool.is_intentional_missing_key({**event, 'msg': 'unknown failure'}))

    def tool(self):
        self.assertTrue(PATH.exists(), 'kernel failure recorder is not implemented')
        spec = importlib.util.spec_from_file_location('kernel_capture', PATH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_context_pid_is_not_promoted_to_socket_owner(self):
        record = self.tool().decode_record({'type':'printf', 'data':
            'MESK event=reset mono_ns=51 pid=0 tid=0 sk=123 owner=27 sport=8021 dport=56000 stack=\n tcp_send_active_reset+2\n tcp_close+9\n'})
        self.assertEqual(record['pid'], 0)
        self.assertEqual(record['owner'], 27)
        self.assertEqual(record['sk'], 123)
        self.assertEqual(record['stack'], ['tcp_send_active_reset+2', 'tcp_close+9'])
        self.assertNotIn('reason', record)

    def test_signal_generation_does_not_resolve_sender_in_collector_namespace(self):
        program = PATH.with_name('socket-boundaries.bt').read_text(encoding='utf-8')
        probe = program.split('tracepoint:signal:signal_generate ', 1)[1].split('\n}', 1)[0]
        # The sender can live outside the collector's PID namespace; target filtering stays intact.
        self.assertNotRegex(probe, r'(?<!->)\b(?:pid|tid)\b')
        self.assertIn('@tracked[(uint32)args->pid]', probe)
        self.assertRegex(probe, r'init_pid=%d init_tid=%d target=%d')

    def test_init_namespace_signal_sender_preserves_target_identity(self):
        record = self.tool().decode_record({'type': 'printf', 'data':
            'MESK event=signal_generate mono_ns=369399803971 init_pid=91 init_tid=92 target=2716 signal=17 code=2 result=0\n'})
        self.assertEqual(record['init_pid'], 91)
        self.assertEqual(record['init_tid'], 92)
        self.assertEqual(record['target'], 2716)
        self.assertNotIn('pid', record)
        self.assertNotIn('tid', record)

    def test_namespace_and_other_helper_failures_remain_fatal(self):
        tool = self.tool()
        for helper, retcode in (('get_ns_current_pid_tgid', -2), ('probe_read_kernel', -14)):
            with self.subTest(helper=helper):
                event = {'type': 'helper_error', 'helper': helper, 'retcode': retcode, 'msg': 'helper failure'}
                self.assertFalse(tool.is_intentional_missing_key(event))
                with self.assertRaises(ValueError):
                    tool.decode_record(event)

    def test_unread_sequence_and_exit_code_remain_raw_evidence(self):
        record = self.tool().decode_record({'type':'printf', 'data':
            'MESK event=close mono_ns=9 pid=4 tid=4 sk=12 owner=4 rcv_nxt=99 copied_seq=98 queue_length=1\n'})
        self.assertEqual(record['rcv_nxt'], 99)
        self.assertNotIn('unread_body_bytes', record)
        exit_record = self.tool().decode_record({'type':'printf', 'data':
            'MESK event=exit mono_ns=10 pid=4 tid=4 wait_status=1792\n'})
        self.assertEqual(exit_record['wait_status'], 1792)

    def test_loss_or_malformed_output_is_never_silently_accepted(self):
        tool = self.tool()
        with self.assertRaises(ValueError):
            tool.decode_record({'type':'lost_events', 'data':{'events':4}})
        with self.assertRaises(ValueError):
            tool.decode_record({'type':'printf','data':'MESK event=reset pid=missing\n'})
        self.assertIsNone(tool.decode_record({'type':'attached_probes','data':{'probes':12}}))

    def test_reset_layouts_are_selected_from_observed_fields_not_kernel_version(self):
        tool = self.tool()
        old = 'field:const void * skaddr;\nfield:__u16 family;\nfield:__u16 sport;\nfield:__u16 dport;'
        new = 'field:const void * skaddr;\nfield:enum sk_rst_reason reason;\nfield:__u8 saddr[28];\nfield:__u8 daddr[28];\nprint fmt: %pISpc'
        text = tool.reset_probes({'tcp/tcp_send_reset': new, 'tcp/tcp_receive_reset': old})
        send, receive = text.split('tracepoint:tcp:tcp_receive_reset')
        self.assertIn('(uint16)args->saddr[2] << 8', send)
        self.assertIn('(uint16)args->daddr[2] << 8', send)
        self.assertNotIn('struct sockaddr_in', send)
        self.assertIn('args->reason', send)
        self.assertNotIn('args->family', send)
        self.assertIn('args->family', receive)
        self.assertNotIn('args->reason', receive)
        with self.assertRaises(ValueError):
            tool.reset_probes({'tcp/tcp_send_reset': 'field:int mystery;'})

if __name__ == '__main__':
    unittest.main()
