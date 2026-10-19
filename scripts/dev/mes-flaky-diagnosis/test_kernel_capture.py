"""Kernel-record interpretation guards; no service access or kernel mutation."""
import importlib.util
from pathlib import Path
import unittest

PATH = Path(__file__).parent / 'io/kernel-capture.py'

class KernelEvidenceTests(unittest.TestCase):
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
