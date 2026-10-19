"""Packet collector contracts; no service access or raw-socket privileges needed."""

import importlib.util
from contextlib import redirect_stderr
import io
import json
from pathlib import Path
import socket
import struct
import unittest


PATH = Path(__file__).parent / "io/capture-ipv4-tcp.py"
SPEC = importlib.util.spec_from_file_location("packet_capture", PATH)
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


def packet(source=50000, destination=8021, ihl=5, protocol=6, fragment=0, payload=b""):
    data = bytearray(ihl * 4 + 20 + len(payload))
    data[0], data[9] = 0x40 | ihl, protocol
    struct.pack_into("!HHH", data, 2, len(data), 17, fragment)
    data[12:16] = socket.inet_aton("127.0.0.1")
    data[16:20] = socket.inet_aton("127.0.0.1")
    struct.pack_into("!HHII", data, ihl * 4, source, destination, 31, 32)
    data[ihl * 4 + 12], data[ihl * 4 + 13] = 0x50, 0x10
    data[ihl * 4 + 20:] = payload
    return bytes(data)


def evaluate_filter(program, data):
    """Execute only the cBPF instructions used by this collector, including OOB reject."""
    accumulator, index, pc = 0, 0, 0
    while pc < len(program):
        code, yes, no, value = program[pc]
        if code in (0x30, 0x28, 0x48):
            offset, size = value + (index if code == 0x48 else 0), 1 if code == 0x30 else 2
            if offset + size > len(data):
                return 0
            accumulator = int.from_bytes(data[offset:offset + size], "big")
        elif code == 0x54:
            accumulator &= value
        elif code == 0xB1:
            if value >= len(data):
                return 0
            index = (data[value] & 15) * 4
        elif code in (0x15, 0x35, 0x45):
            result = accumulator == value if code == 0x15 else (accumulator >= value if code == 0x35 else bool(accumulator & value))
            pc += yes if result else no
        elif code == 0x06:
            return value
        else:
            raise AssertionError(f"unsupported instruction {code}")
        pc += 1
    raise AssertionError("filter has no terminal instruction")


class PacketFilterTests(unittest.TestCase):
    def test_socket_filter_accepts_target_both_directions_and_ip_options(self):
        self.assertTrue(hasattr(TOOL, "target_filter"), "socket-stage target filter is missing")
        for data in (packet(), packet(8021, 50000), packet(ihl=15), packet(fragment=0x2000)):
            self.assertEqual(evaluate_filter(TOOL.target_filter(8021), data), 120)

    def test_socket_filter_rejects_udp_other_ports_noninitial_fragments_and_short_ip(self):
        self.assertTrue(hasattr(TOOL, "target_filter"), "socket-stage target filter is missing")
        for data in (packet(1, 2), packet(protocol=17), packet(fragment=1), b"", b"\x45", b"\x65" + packet()[1:]):
            self.assertEqual(evaluate_filter(TOOL.target_filter(8021), data), 0)

    def test_header_only_record_never_contains_payload(self):
        data = packet(payload=b"PRIVATE_APPLICATION_CONTENT" * 10)
        fields = TOOL.header_fields(data[:120], 8021)
        self.assertEqual(fields["data_len"], len(data) - 40)
        self.assertNotIn("PRIVATE", json.dumps(fields))

    def test_incomplete_declared_tcp_header_cannot_be_promoted_to_a_record(self):
        data = bytearray(packet())
        data[32] = 0xF0
        struct.pack_into("!H", data, 2, 80)
        self.assertIsNone(TOOL.header_fields(bytes(data), 8021))


class StatsSocket:
    def __init__(self, reads):
        self.reads = iter(reads)

    def getsockopt(self, level, kind, length):
        value = next(self.reads)
        if isinstance(value, Exception):
            raise value
        return struct.pack("=II", *value)


class PacketStatisticsTests(unittest.TestCase):
    def test_reset_reads_keep_own_cumulative_and_syscall_brackets(self):
        self.assertTrue(hasattr(TOOL, "PacketStatistics"), "reset-aware packet statistics are missing")
        ticks = iter((100, 104, 200, 207))
        counter = TOOL.PacketStatistics(StatsSocket([(5, 2), (7, 1)]), (10, 12), lambda: next(ticks))
        first = counter.read("ready")
        second = counter.read("stop", "phase-1")
        self.assertEqual(first["interval_packets"], 5)
        self.assertEqual(second["interval_packets"], 7)
        self.assertEqual(second["cumulative_packets"], 12)
        self.assertEqual(second["cumulative_kernel_packet_drops"], 3)
        self.assertEqual(second["interval_start_before_ns"], "100")
        self.assertEqual(second["interval_start_after_ns"], "104")
        self.assertEqual(second["read_before_ns"], "200")
        self.assertEqual(second["read_after_ns"], "207")
        self.assertEqual(second["phase_id"], "phase-1")
        self.assertFalse(second["exact_packet_location_known"])


class BatchSocket:
    def __init__(self, rows):
        self.rows = list(rows)
        self.calls = 0

    def recvmsg(self, size, ancillary_size):
        self.calls += 1
        if not self.rows:
            raise BlockingIOError()
        row = self.rows.pop(0)
        if isinstance(row, Exception):
            raise row
        return row, [], socket.MSG_TRUNC, ("lo", 0, 0)


class PacketDrainTests(unittest.TestCase):
    def test_drain_is_bounded_and_msg_trunc_is_header_clip_not_loss(self):
        self.assertTrue(hasattr(TOOL, "drain_batch"), "bounded drain is missing")
        capture = BatchSocket([packet(payload=b"x" * 200)] * 5)
        rows, exhausted, error = TOOL.drain_batch(capture, 8021, limit=2, clock=lambda: 0)
        self.assertEqual(len(rows), 2)
        self.assertFalse(exhausted)
        self.assertIsNone(error)
        self.assertEqual(capture.calls, 2)
        self.assertTrue(rows[0]["header_snapshot_clipped"])
        self.assertNotIn("dropped_packets", rows[0])

    def test_receive_error_preserves_preceding_records(self):
        self.assertTrue(hasattr(TOOL, "drain_batch"), "bounded drain is missing")
        capture = BatchSocket([packet(), OSError(5, "receive failed")])
        rows, exhausted, error = TOOL.drain_batch(capture, 8021, clock=lambda: 0)
        self.assertEqual(len(rows), 1)
        self.assertEqual(error.errno, 5)
        self.assertFalse(exhausted)


class ControlTests(unittest.TestCase):
    def channel(self):
        self.assertTrue(hasattr(TOOL, "ObserverChannel"), "live observer channel is missing")
        client, server = socket.socketpair()
        self.addCleanup(client.close)
        self.addCleanup(server.close)
        server.settimeout(1)
        return TOOL.ObserverChannel(client, "run-1"), server

    def envelope(self, event="observer.ready", seq=1, **fields):
        return {"v": 1, "run": "run-1", "source": "observer", "pid": 17,
                "seq": seq, "event": event, "mono_ns": "42", **fields}

    def test_channel_hello_and_loss_have_continuous_sequence(self):
        channel, server = self.channel()
        channel.send("observer.hello")
        channel.send("capture.loss", kernel_packet_drop=2)
        records = [json.loads(line) for line in server.recv(65536).splitlines()]
        self.assertEqual([row["seq"] for row in records], [1, 2])
        self.assertEqual(records[1]["kernel_packet_drop"], 2)
        self.assertTrue(all(isinstance(row["mono_ns"], str) for row in records))

    def test_control_handles_partial_frames_and_phase_identity(self):
        channel, server = self.channel()
        data = json.dumps(self.envelope()).encode() + b"\n"
        server.sendall(data[:10])
        self.assertEqual(channel.poll(), [])
        server.sendall(data[10:])
        self.assertEqual(channel.poll()[0]["event"], "observer.ready")
        server.sendall(json.dumps(self.envelope("observer.phase", 2, phase="observe", phase_id="p-1")).encode() + b"\n")
        self.assertEqual(channel.poll()[0]["phase_id"], "p-1")

    def test_bad_run_malformed_sequence_and_unexpected_disconnect_are_fatal(self):
        self.assertTrue(hasattr(TOOL, "ObserverChannel"), "live observer channel is missing")
        for payload in (b"not-json\n", json.dumps(self.envelope(run="other")).encode() + b"\n",
                        json.dumps(self.envelope(seq=3)).encode() + b"\n"):
            channel, server = self.channel()
            server.sendall(payload)
            with self.assertRaises(ValueError):
                channel.poll()
        channel, server = self.channel()
        server.close()
        with self.assertRaises(ConnectionError):
            channel.poll()

    def test_oversize_frame_has_no_queue_fallback(self):
        channel, server = self.channel()
        with self.assertRaises(ValueError):
            channel.send("capture.error", reason="x" * 65536)
        self.assertEqual(len(channel.pending), 0)

    def test_shared_channel_source_and_goodbye_allow_intentional_close(self):
        self.assertTrue(hasattr(TOOL, "ObserverChannel"), "live observer channel is missing")
        client, server = socket.socketpair()
        self.addCleanup(client.close)
        self.addCleanup(server.close)
        channel = TOOL.ObserverChannel(client, "run-1", source="kernel")
        channel.send("observer.hello")
        self.assertEqual(json.loads(server.recv(65536))["source"], "kernel")
        server.sendall(json.dumps(self.envelope("observer.goodbye.ack")).encode() + b"\n")
        self.assertEqual(channel.poll()[0]["event"], "observer.goodbye.ack")
        server.close()
        self.assertEqual(channel.poll(), [])

    def test_parent_goodbye_and_safe_future_phase_are_valid_commands(self):
        channel, server = self.channel()
        server.sendall(json.dumps(self.envelope("observer.phase", phase="after_capture", phase_id="p1")).encode() + b"\n")
        self.assertEqual(channel.poll()[0]["phase"], "after_capture")
        server.sendall(json.dumps(self.envelope("observer.goodbye", 2, reason="intentional_observer_close")).encode() + b"\n")
        self.assertEqual(channel.poll()[0]["event"], "observer.goodbye")

    def test_pending_transport_is_bounded_when_parent_stops_reading(self):
        class BlockedConnection:
            def setblocking(self, enabled):
                pass

            def send(self, data):
                raise BlockingIOError()

        channel = TOOL.ObserverChannel(BlockedConnection(), "run-1")
        with self.assertRaises(ValueError):
            for _ in range(30):
                channel.send("capture.statistics", detail="x" * 60000)
        self.assertLessEqual(len(channel.pending), TOOL.CONTROL_PENDING_BYTES)

    def test_message_fields_cannot_override_producer_identity(self):
        channel, server = self.channel()
        channel.send("observer.hello", **{"v": 2, "run": "other", "source": "wrong", "seq": 99})
        row = json.loads(server.recv(65536))
        self.assertEqual((row["v"], row["run"], row["source"], row["seq"]), (1, "run-1", "packet", 1))


class ReporterTests(unittest.TestCase):
    def test_loss_is_forwarded_before_file_write_and_packet_payload_never_forwarded(self):
        self.assertTrue(hasattr(TOOL, "EventWriter"), "live event reporter is missing")
        order = []

        class Control:
            def send(self, event, **fields):
                order.append(("control", event))

        class Stream(io.StringIO):
            def write(self, text):
                order.append(("file", text))
                return super().write(text)

        writer = TOOL.EventWriter(Stream(), "run-1", Control())
        writer.emit("capture.loss", loss_kind="kernel_packet_drop", kernel_packet_drop=2)
        writer.batch([{"event": "tcp.packet", **TOOL.header_fields(packet(payload=b"SECRET"), 8021)}])
        self.assertEqual(order[0], ("control", "capture.loss"))
        self.assertEqual(len([row for row in order if row[0] == "control"]), 1)
        self.assertNotIn("SECRET", str(order))

    def test_control_failure_still_records_local_error_without_recursing(self):
        self.assertTrue(hasattr(TOOL, "EventWriter"), "live event reporter is missing")

        class Control:
            def send(self, event, **fields):
                raise OSError("control failed")

        stream = io.StringIO()
        writer = TOOL.EventWriter(stream, "run-1", Control())
        with self.assertRaises(OSError):
            writer.emit("capture.loss", kernel_packet_drop=1)
        self.assertEqual(json.loads(stream.getvalue())["event"], "capture.loss")

    def test_file_failure_retains_unconfirmed_bounded_records(self):
        self.assertTrue(hasattr(TOOL, "EventWriter"), "live event reporter is missing")

        class Stream(io.StringIO):
            def write(self, text):
                raise OSError("disk failed")

        writer = TOOL.EventWriter(Stream(), "run-1", None)
        with self.assertRaises(OSError):
            writer.batch([{"event": "tcp.packet", "sequence": 1}])
        self.assertEqual(len(writer.pending_records), 1)


class CollectorTests(unittest.TestCase):
    def collector(self, rows, stats):
        self.assertTrue(hasattr(TOOL, "Collector"), "collector lifecycle is missing")
        stream = io.StringIO()
        writer = TOOL.EventWriter(stream, "run-1", None)
        capture = BatchSocket(rows)
        return TOOL.Collector(capture, 8021, TOOL.PacketStatistics(StatsSocket(stats), (1, 2)), writer), stream

    def test_phase_statistics_precede_ack_and_loss_is_separate(self):
        collector, stream = self.collector([], [(4, 2)])
        collector.phase("stop", "p-stop")
        rows = [json.loads(line) for line in stream.getvalue().splitlines()]
        self.assertEqual([row["event"] for row in rows], ["capture.statistics", "capture.loss", "observer.phase.ack"])
        self.assertEqual(rows[1]["loss_kind"], "kernel_packet_drop")
        self.assertEqual(rows[1]["kernel_packet_drop"], 2)
        self.assertNotIn("userspace_record_loss", rows[1])

    def test_final_drain_preserves_rows_and_statistics_after_receive_error(self):
        collector, stream = self.collector([packet(), OSError(5, "receive failed")], [(3, 0)])
        collector.finish()
        rows = [json.loads(line) for line in stream.getvalue().splitlines()]
        self.assertEqual([row["event"] for row in rows], ["tcp.packet", "capture.error", "capture.statistics", "capture.exit"])
        self.assertEqual(rows[-1]["observed_target_packets"], 1)
        self.assertFalse(rows[-1]["complete"])

    def test_final_statistics_are_attempted_even_when_disk_failed(self):
        self.assertTrue(hasattr(TOOL, "Collector"), "collector lifecycle is missing")

        class Stream(io.StringIO):
            def write(self, text):
                raise OSError("disk failed")

        statistics = TOOL.PacketStatistics(StatsSocket([(9, 1)]), (1, 2))
        collector = TOOL.Collector(BatchSocket([packet()]), 8021, statistics,
                                   TOOL.EventWriter(Stream(), "run-1", None))
        errors = io.StringIO()
        with redirect_stderr(errors):
            collector.finish()
        self.assertEqual(statistics.packets, 9)
        self.assertEqual(statistics.drops, 1)
        self.assertEqual(len(collector.writer.pending_records), 1)
        self.assertTrue(collector.failed)
        self.assertIn('"unconfirmed_records": 1', errors.getvalue())

    def test_final_drain_bound_is_explicit_unknown_userspace_loss(self):
        collector, stream = self.collector([packet()] * (TOOL.BATCH_RECORDS * TOOL.FINAL_DRAIN_BATCHES + 1), [(1, 0)])
        collector.finish()
        rows = [json.loads(line) for line in stream.getvalue().splitlines()]
        loss = next(row for row in rows if row["event"] == "capture.loss")
        self.assertEqual(loss["loss_kind"], "userspace_record_loss")
        self.assertIsNone(loss["userspace_record_loss"])
        self.assertFalse(rows[-1]["complete"])

    def test_drop_interval_is_preserved_when_immediate_control_delivery_fails(self):
        collector, stream = self.collector([], [(7, 2)])

        class Control:
            def send(self, event, **fields):
                raise OSError("observer gone")

        collector.writer.control = Control()
        with self.assertRaises(OSError):
            collector.sample("periodic")
        rows = [json.loads(line) for line in stream.getvalue().splitlines()]
        self.assertEqual([row["event"] for row in rows], ["capture.statistics", "capture.loss"])
        self.assertEqual(rows[0]["interval_kernel_packet_drops"], 2)
        self.assertTrue(collector.failed)

    def test_final_statistics_error_is_reported_and_exit_is_incomplete(self):
        collector, stream = self.collector([], [OSError(5, "statistics failed")])
        collector.finish()
        rows = [json.loads(line) for line in stream.getvalue().splitlines()]
        self.assertEqual(rows[0]["event"], "capture.error")
        self.assertEqual(rows[0]["reason"], "final_statistics_failed")
        self.assertFalse(rows[-1]["complete"])

    def test_failed_file_batch_prevents_receiving_unretainable_records(self):
        collector, _ = self.collector([packet()], [(0, 0)])
        collector.writer.pending_records.append({"event": "tcp.packet", "record_seq": 1})
        with self.assertRaises(OSError):
            collector.drain()
        self.assertEqual(collector.capture.calls, 0)
        self.assertEqual(len(collector.capture.rows), 1)


if __name__ == "__main__":
    unittest.main()
