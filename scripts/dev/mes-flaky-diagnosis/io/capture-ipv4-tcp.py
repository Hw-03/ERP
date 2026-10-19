"""Linux AF_PACKET header metadata only. Requires CAP_NET_RAW; never saves payload."""

import argparse
import ctypes
import json
import os
import re
import select
import signal
import socket
import struct
import sys
import time
from pathlib import Path
from typing import Any, Callable, TextIO


ETH_P_IP = 0x0800
# Linux x86_64 SO_TIMESTAMPNS_OLD carries two native longs. No system install needed.
SO_TIMESTAMPNS = getattr(socket, "SO_TIMESTAMPNS", 35)
SOL_PACKET = 263
PACKET_STATISTICS = 6
SO_ATTACH_FILTER = 26
SNAPSHOT_BYTES = 120
BATCH_RECORDS = 128
BATCH_BUDGET_NS = 5_000_000
STATISTICS_INTERVAL_NS = 100_000_000
CONTROL_FRAME_BYTES = 65_536
CONTROL_PENDING_BYTES = 1_048_576
CONTROL_TIMEOUT_SECONDS = 3
FINAL_DRAIN_BATCHES = 32
RCVBUF_REQUEST_BYTES = 4 * 1024 * 1024
SAFE_IDENTIFIER = r"[A-Za-z0-9_.:-]{1,128}"


def target_filter(port: int) -> list[tuple[int, int, int, int]]:
    """Filter a SOCK_DGRAM IPv4 network header before the packet socket queue."""
    if not 1 <= port <= 65535:
        raise ValueError("port must be between 1 and 65535")
    return [
        (0x30, 0, 0, 0),       # ldb [0]
        (0x54, 0, 0, 0xF0),    # and #0xf0
        (0x15, 0, 13, 0x40),   # IPv4, else reject
        (0x30, 0, 0, 0),
        (0x54, 0, 0, 0x0F),
        (0x35, 0, 10, 5),      # IHL >= 5
        (0x30, 0, 0, 9),
        (0x15, 0, 8, 6),       # TCP
        (0x28, 0, 0, 6),
        (0x45, 6, 0, 0x1FFF),  # reject noninitial fragments
        (0xB1, 0, 0, 0),       # ldx 4*([0]&0xf)
        (0x48, 0, 0, 0),       # ldh [x+0] source port
        (0x15, 2, 0, port),
        (0x48, 0, 0, 2),       # ldh [x+2] destination port
        (0x15, 0, 1, port),
        (0x06, 0, 0, SNAPSHOT_BYTES),
        (0x06, 0, 0, 0),
    ]


def attach_filter(capture: socket.socket, port: int) -> None:
    """Keep ctypes storage alive through SO_ATTACH_FILTER's synchronous copy."""
    class SockFilter(ctypes.Structure):
        _fields_ = [("code", ctypes.c_ushort), ("jt", ctypes.c_ubyte),
                    ("jf", ctypes.c_ubyte), ("k", ctypes.c_uint32)]

    class SockFprog(ctypes.Structure):
        _fields_ = [("len", ctypes.c_ushort), ("filter", ctypes.POINTER(SockFilter))]

    instructions = target_filter(port)
    storage = (SockFilter * len(instructions))(*(SockFilter(*row) for row in instructions))
    program = SockFprog(len(instructions), storage)
    capture.setsockopt(socket.SOL_SOCKET, SO_ATTACH_FILTER, bytes(program))


class PacketStatistics:
    """PACKET_STATISTICS resets on read; retain interval bounds and our own totals."""

    def __init__(self, capture: socket.socket, activation: tuple[int, int],
                 clock: Callable[[], int] = time.monotonic_ns) -> None:
        self.capture, self.previous, self.clock = capture, activation, clock
        self.packets, self.drops = 0, 0

    def read(self, phase: str, phase_id: str | None = None) -> dict[str, Any]:
        """A drop belongs to this uncertain read interval, never an exact packet."""
        before = self.clock()
        raw = self.capture.getsockopt(SOL_PACKET, PACKET_STATISTICS, 8)
        after = self.clock()
        packets, drops = struct.unpack("=II", raw)
        self.packets += packets
        self.drops += drops
        fields = {"phase": phase, "phase_id": phase_id,
                  "interval_start_before_ns": str(self.previous[0]),
                  "interval_start_after_ns": str(self.previous[1]),
                  "read_before_ns": str(before), "read_after_ns": str(after),
                  "interval_packets": packets, "interval_kernel_packet_drops": drops,
                  "cumulative_packets": self.packets, "cumulative_kernel_packet_drops": self.drops,
                  "counter_read_resets": True, "exact_packet_location_known": False,
                  "scope": "filtered packet socket; since prior reset within syscall brackets"}
        self.previous = (before, after)
        return fields


def drain_batch(capture: socket.socket, port: int, limit: int = BATCH_RECORDS,
                clock: Callable[[], int] = time.monotonic_ns
                ) -> tuple[list[dict[str, Any]], bool, OSError | None]:
    """Drain a bounded socket batch before file writes; return records even on error."""
    rows: list[dict[str, Any]] = []
    deadline = clock() + BATCH_BUDGET_NS
    for _ in range(limit):
        try:
            data, ancillary, flags, address = capture.recvmsg(SNAPSHOT_BYTES, 256)
        except BlockingIOError:
            return rows, True, None
        except OSError as exc:
            return rows, False, exc
        fields = header_fields(data, port)
        if fields is None:
            # The kernel accepted this target header but it cannot form a usable record.
            rows.append({"event": "capture.loss", "loss_kind": "userspace_record_loss",
                         "userspace_record_loss": 1, "reason": "invalid_target_header",
                         "mono_ns": str(clock())})
        else:
            rows.append({"event": "tcp.packet", **fields, "mono_ns": str(clock()),
                         "kernel_wall_ns": kernel_time(ancillary),
                         "packet_type": address[2] if address else None,
                         "header_snapshot_clipped": bool(flags & socket.MSG_TRUNC)})
        if clock() >= deadline:
            break
    return rows, False, None


def header_fields(data: bytes, port: int) -> dict[str, Any] | None:
    """Parse declared IPv4/TCP lengths and flags; do not decode bytes after headers."""
    if len(data) < 20 or data[0] >> 4 != 4 or data[9] != socket.IPPROTO_TCP:
        return None
    ip_length = (data[0] & 15) * 4
    total_length = struct.unpack_from("!H", data, 2)[0]
    fragment = struct.unpack_from("!H", data, 6)[0]
    if ip_length < 20 or fragment & 0x1FFF or len(data) < ip_length + 20:
        return None
    source, destination, sequence, acknowledgment = struct.unpack_from("!HHII", data, ip_length)
    if port not in (source, destination):
        return None
    tcp_length = (data[ip_length + 12] >> 4) * 4
    if tcp_length < 20 or total_length < ip_length + tcp_length or len(data) < ip_length + tcp_length:
        return None
    flags = data[ip_length + 13]
    return {"local": [socket.inet_ntoa(data[12:16]), source],
            "remote": [socket.inet_ntoa(data[16:20]), destination],
            "sequence": sequence, "acknowledgment": acknowledgment,
            "flags": flags, "flag_names": [name for bit, name in
                [(1, "FIN"), (2, "SYN"), (4, "RST"), (8, "PSH"), (16, "ACK"), (32, "URG"), (64, "ECE"), (128, "CWR")]
                if flags & bit], "ip_header_bytes": ip_length, "tcp_header_bytes": tcp_length,
            "data_len": total_length - ip_length - tcp_length,
            "ip_id": struct.unpack_from("!H", data, 4)[0],
            "more_fragments": bool(fragment & 0x2000)}


def kernel_time(ancillary: list[tuple[int, int, bytes]]) -> int | None:
    """Return the kernel packet wall timestamp when supplied by Linux."""
    for level, kind, value in ancillary:
        if level == socket.SOL_SOCKET and kind == SO_TIMESTAMPNS and len(value) >= struct.calcsize("@ll"):
            seconds, nanos = struct.unpack_from("@ll", value)
            return seconds * 1_000_000_000 + nanos
    return None


class ObserverChannel:
    """Bounded nonblocking NDJSON control; a broken observer is never optional."""

    def __init__(self, connection: socket.socket, run: str, source: str = "packet") -> None:
        if source not in {"packet", "kernel", "next_receipt"}:
            raise ValueError("invalid observer producer source")
        self.connection, self.run, self.source = connection, run, source
        self.connection.setblocking(False)
        self.pending = bytearray()
        self.received = bytearray()
        self.sent_seq, self.received_seq = 0, 0
        self.goodbye_ack = False

    def send(self, event: str, **fields: Any) -> None:
        """Attempt immediate delivery, retaining only a bounded unsent suffix."""
        row = {**fields, "v": 1, "run": self.run, "source": self.source, "pid": os.getpid(),
               "seq": self.sent_seq + 1, "mono_ns": str(fields.get("mono_ns", time.monotonic_ns())),
               "event": event}
        raw = (json.dumps(row, separators=(",", ":")) + "\n").encode("utf-8")
        if len(raw) > CONTROL_FRAME_BYTES or len(self.pending) + len(raw) > CONTROL_PENDING_BYTES:
            raise ValueError("observer output exceeds bounded transport capacity")
        self.sent_seq += 1
        self.pending.extend(raw)
        self.flush()

    def flush(self) -> None:
        """Do not block packet draining on a slow parent control consumer."""
        if not self.pending:
            return
        try:
            sent = self.connection.send(self.pending)
        except BlockingIOError:
            return
        if sent == 0:
            raise ConnectionError("observer send closed")
        del self.pending[:sent]

    def poll(self) -> list[dict[str, Any]]:
        """Reject malformed identity/sequence/frames instead of accepting stale commands."""
        self.flush()
        if self.goodbye_ack:
            return []
        try:
            data = self.connection.recv(CONTROL_FRAME_BYTES)
        except BlockingIOError:
            return []
        if not data:
            raise ConnectionError("observer disconnected without goodbye acknowledgement")
        self.received.extend(data)
        messages = []
        while b"\n" in self.received:
            line, _, remainder = self.received.partition(b"\n")
            if len(line) + 1 > CONTROL_FRAME_BYTES:
                raise ValueError("observer frame exceeds limit")
            self.received = bytearray(remainder)
            try:
                row = json.loads(line)
            except (ValueError, UnicodeDecodeError) as exc:
                raise ValueError("malformed observer JSON frame") from exc
            if (not isinstance(row, dict) or type(row.get("v")) is not int or row["v"] != 1
                    or row.get("run") != self.run or row.get("source") != "observer"
                    or type(row.get("pid")) is not int or row["pid"] <= 0
                    or type(row.get("seq")) is not int or row["seq"] != self.received_seq + 1
                    or not isinstance(row.get("mono_ns"), str) or not row["mono_ns"].isascii()
                    or not row["mono_ns"].isdigit()):
                raise ValueError("invalid observer identity or sequence")
            event = row.get("event")
            if event not in {"observer.ready", "observer.phase", "observer.goodbye", "observer.goodbye.ack"}:
                raise ValueError("unexpected observer command")
            if event == "observer.phase" and (not isinstance(row.get("phase"), str)
                    or not re.fullmatch(SAFE_IDENTIFIER, row["phase"])
                    or not isinstance(row.get("phase_id"), str)
                    or not re.fullmatch(SAFE_IDENTIFIER, row["phase_id"])):
                raise ValueError("invalid observer phase identity")
            self.received_seq += 1
            if event == "observer.goodbye.ack":
                self.goodbye_ack = True
            messages.append(row)
        if len(self.received) >= CONTROL_FRAME_BYTES:
            raise ValueError("observer unterminated frame exceeds limit")
        return messages

    def wait(self, expected: str) -> None:
        """Only startup/shutdown handshakes may wait, with an explicit deadline."""
        deadline = time.monotonic() + CONTROL_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            for row in self.poll():
                if row["event"] != expected:
                    raise ValueError("unexpected command during observer handshake")
                return
            select.select([self.connection], [self.connection] if self.pending else [], [],
                          max(0, min(0.05, deadline - time.monotonic())))
        raise TimeoutError("observer handshake deadline exceeded")

    def finish_send(self) -> None:
        """Bound the final intentional-close acknowledgement flush."""
        deadline = time.monotonic() + CONTROL_TIMEOUT_SECONDS
        while self.pending and time.monotonic() < deadline:
            self.flush()
            if self.pending:
                select.select([], [self.connection], [], max(0, min(0.05, deadline - time.monotonic())))
        if self.pending:
            raise TimeoutError("observer final send deadline exceeded")


class EventWriter:
    """Persist header records in bounded batches; forward control events before disk I/O."""

    def __init__(self, stream: TextIO, run: str, control: ObserverChannel | None) -> None:
        self.stream, self.run, self.control = stream, run, control
        self.record_seq = 0
        self.pending_records: list[dict[str, Any]] = []

    def emit(self, event: str, **fields: Any) -> None:
        """Persist an event even when its live notification fails, then fail closed."""
        self.batch([{"event": event, **fields}])

    def batch(self, rows: list[dict[str, Any]]) -> None:
        """Retain failed-write records without creating a second unbounded queue."""
        if self.pending_records:
            raise OSError("unconfirmed previous record batch; collection must stop")
        if len(rows) > BATCH_RECORDS:
            raise ValueError("record batch exceeds bounded capacity")
        delivery_error: Exception | None = None
        for fields in rows:
            self.record_seq += 1
            row = {"v": 1, "run": self.run, "source": "packet", "pid": os.getpid(),
                   "record_seq": self.record_seq, "wall_ns": time.time_ns(),
                   "mono_ns": str(time.monotonic_ns()), **fields}
            self.pending_records.append(row)
            if self.control is not None and row["event"] != "tcp.packet" and delivery_error is None:
                try:
                    forwarded = {key: value for key, value in row.items()
                                 if key not in {"v", "run", "source", "pid", "record_seq", "event"}}
                    self.control.send(row["event"], **forwarded)
                except (OSError, ValueError) as exc:
                    delivery_error = exc
        self.stream.write("".join(json.dumps(row, separators=(",", ":")) + "\n"
                                  for row in self.pending_records))
        self.stream.flush()
        self.pending_records.clear()
        if delivery_error is not None:
            raise delivery_error


class Collector:
    """Bounded packet draining plus independently reset-aware phase statistics."""

    def __init__(self, capture: socket.socket, port: int, statistics: PacketStatistics,
                 writer: EventWriter) -> None:
        self.capture, self.port, self.statistics, self.writer = capture, port, statistics, writer
        self.observed, self.failed = 0, False
        self.next_statistics = time.monotonic_ns() + STATISTICS_INTERVAL_NS

    def error(self, reason: str, exc: Exception | None = None) -> None:
        """Separate collector errors from loss; never save untrusted message contents."""
        self.failed = True
        fields = {"reason": reason, "error_type": type(exc).__name__ if exc else None,
                  "error_errno": getattr(exc, "errno", None),
                  "unconfirmed_records": len(self.writer.pending_records)}
        try:
            self.writer.emit("capture.error", **fields)
        except (OSError, ValueError):
            # Disk/control failures cannot become a quiet fallback queue or suppress final stats.
            if self.writer.control is not None:
                try:
                    self.writer.control.send("capture.error", **fields)
                except (OSError, ValueError):
                    fields["observer_delivery_failed"] = True
            print(json.dumps({"event": "capture.error", "run": self.writer.run,
                              "source": "packet", **fields}), file=sys.stderr, flush=True)

    def sample(self, phase: str, phase_id: str | None = None) -> None:
        """A positive kernel drop interval immediately notifies the parent stop control."""
        fields = self.statistics.read(phase, phase_id)
        # Notify loss first in the live control stream, before any potentially slow disk write.
        drops = fields["interval_kernel_packet_drops"]
        fields["kernel_packet_drops"] = drops
        if drops:
            self.failed = True
            control, self.writer.control = self.writer.control, None
            delivery_error = None
            loss = {"event": "capture.loss", "loss_kind": "kernel_packet_drop",
                    "kernel_packet_drop": drops, **fields}
            try:
                if control is not None:
                    try:
                        control.send("capture.loss", **{key: value for key, value in loss.items() if key != "event"})
                        control.send("capture.statistics", **fields)
                    except (OSError, ValueError) as exc:
                        delivery_error = exc
                self.writer.batch([{"event": "capture.statistics", **fields}, loss])
            finally:
                self.writer.control = control
            if delivery_error is not None:
                raise delivery_error
        else:
            self.writer.emit("capture.statistics", **fields)
        self.next_statistics = time.monotonic_ns() + STATISTICS_INTERVAL_NS

    def phase(self, phase: str, phase_id: str) -> None:
        """Acknowledgement means the reset read completed, not that a packet was located."""
        self.sample(phase, phase_id)
        self.writer.emit("observer.phase.ack", phase=phase, phase_id=phase_id)

    def drain(self) -> tuple[bool, bool]:
        """Write received records before exposing a later receive error."""
        if self.writer.pending_records:
            raise OSError("unconfirmed file batch prevents retaining another receive batch")
        rows, exhausted, error = drain_batch(self.capture, self.port)
        self.observed += sum(row["event"] == "tcp.packet" for row in rows)
        if any(row["event"] == "capture.loss" for row in rows):
            self.failed = True
        if rows:
            self.writer.batch(rows)
        if error is not None:
            self.error("packet_receive_failed", error)
        return exhausted, error is not None

    def finish(self) -> None:
        """Always attempt final drain and reset read, including after receive errors."""
        exhausted = False
        try:
            for _ in range(FINAL_DRAIN_BATCHES):
                exhausted, error = self.drain()
                if exhausted or error:
                    break
            else:
                self.failed = True
                self.writer.emit("capture.loss", loss_kind="userspace_record_loss",
                                 userspace_record_loss=None, reason="final_drain_bound_reached",
                                 exact_packet_location_known=False)
        except (OSError, ValueError) as exc:
            self.error("final_drain_failed", exc)
        try:
            self.sample("final")
        except (OSError, ValueError) as exc:
            self.error("final_statistics_failed", exc)
        try:
            self.writer.emit("capture.exit", observed_target_packets=self.observed,
                             filtered_packets=self.statistics.packets,
                             dropped_packets=self.statistics.drops, drain_exhausted=exhausted,
                             complete=not self.failed)
        except (OSError, ValueError) as exc:
            self.error("exit_record_failed", exc)


def main() -> int:
    """Require run-scoped live control before advertising a usable capture."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--port", default=8021, type=int)
    parser.add_argument("--interface", default="lo")
    parser.add_argument("--rcvbuf-bytes", type=int, default=RCVBUF_REQUEST_BYTES)
    parser.add_argument("--pid-file", type=Path)
    args = parser.parse_args()
    if sys.platform != "linux" or struct.calcsize("@l") != 8:
        parser.error("This collector requires 64-bit Linux")
    run = os.environ.get("IO_RUN_ID", "")
    observation_socket = os.environ.get("IO_OBSERVATION_SOCKET", "")
    if not re.fullmatch(SAFE_IDENTIFIER, run):
        parser.error("IO_RUN_ID must be a nonempty safe run identifier")
    if not observation_socket:
        parser.error("IO_OBSERVATION_SOCKET is required; offline fallback is forbidden")
    if not 1 <= args.port <= 65535 or not 65_536 <= args.rcvbuf_bytes <= 16_777_216:
        parser.error("port or bounded SO_RCVBUF request is out of range")
    stopping = False

    def stop(signum: int, frame: Any) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    if args.pid_file is not None:
        fields = Path("/proc/self/stat").read_text().rsplit(")", 1)[1].split()
        args.pid_file.write_text(json.dumps({"pid": os.getpid(), "start_ticks": fields[19], "run": run}), encoding="utf-8")
    failed = False
    with args.output.open("a", encoding="utf-8", buffering=65536) as stream:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            writer = EventWriter(stream, run, None)
            collector = None
            control = None
            parent_closing = False
            try:
                connection.settimeout(CONTROL_TIMEOUT_SECONDS)
                connection.connect(observation_socket)
                control = ObserverChannel(connection, run)
                writer.control = control
                control.send("observer.hello")
                control.wait("observer.ready")
                # Protocol zero prevents queue activation before SO_ATTACH_FILTER succeeds.
                with socket.socket(socket.AF_PACKET, socket.SOCK_DGRAM, 0) as capture:
                    attach_filter(capture, args.port)
                    capture.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, args.rcvbuf_bytes)
                    effective_rcvbuf = capture.getsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF)
                    timestamp_enabled, timestamp_errno = True, None
                    try:
                        capture.setsockopt(socket.SOL_SOCKET, SO_TIMESTAMPNS, 1)
                    except OSError as exc:
                        timestamp_enabled, timestamp_errno = False, exc.errno
                    before = time.monotonic_ns()
                    capture.bind((args.interface, ETH_P_IP))
                    after = time.monotonic_ns()
                    capture.setblocking(False)
                    collector = Collector(capture, args.port, PacketStatistics(capture, (before, after)), writer)
                    try:
                        writer.emit("capture.ready", interface=args.interface, port=args.port,
                                    kernel_timestamp=timestamp_enabled, timestamp_errno=timestamp_errno,
                                    snapshot_bytes=SNAPSHOT_BYTES, socket_filter="IPv4 TCP target port, both directions",
                                    rcvbuf_requested_bytes=args.rcvbuf_bytes, rcvbuf_effective_bytes=effective_rcvbuf,
                                    statistics_interval_ns=STATISTICS_INTERVAL_NS, batch_limit=BATCH_RECORDS,
                                    records="IPv4 TCP header metadata only; no application bytes/HTTP headers/payload")
                        collector.sample("ready")
                        while not stopping:
                            for command in control.poll():
                                if command["event"] == "observer.goodbye":
                                    parent_closing, stopping = True, True
                                    continue
                                if command["event"] != "observer.phase":
                                    raise ValueError("unexpected observer lifecycle command")
                                collector.phase(command["phase"], command["phase_id"])
                            readable, _, _ = select.select([capture, connection],
                                                          [connection] if control.pending else [], [], 0.025)
                            if capture in readable:
                                _, receive_error = collector.drain()
                                if receive_error:
                                    break
                            if time.monotonic_ns() >= collector.next_statistics:
                                collector.sample("periodic")
                    except (OSError, ValueError) as exc:
                        collector.error("collection_failed", exc)
                    finally:
                        collector.finish()
                    failed = collector.failed
                if parent_closing:
                    control.send("observer.goodbye.ack", complete=not failed)
                    control.finish_send()
                else:
                    control.send("observer.goodbye", complete=not failed)
                    control.wait("observer.goodbye.ack")
            except (OSError, ValueError) as exc:
                failed = True
                if collector is not None:
                    collector.error("collector_lifecycle_failed", exc)
                else:
                    # A failed handshake cannot advertise capture.ready or permit a replay.
                    try:
                        writer.emit("capture.error", reason="collector_startup_failed",
                                    error_type=type(exc).__name__, error_errno=getattr(exc, "errno", None))
                    except (OSError, ValueError):
                        print(json.dumps({"event": "capture.error", "run": run, "source": "packet",
                                          "reason": "startup_error_reporting_failed",
                                          "unconfirmed_records": len(writer.pending_records)}),
                              file=sys.stderr, flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
