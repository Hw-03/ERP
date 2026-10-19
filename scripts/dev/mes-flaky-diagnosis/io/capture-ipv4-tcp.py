"""Linux AF_PACKET header metadata only. Requires CAP_NET_RAW; never saves payload."""

import argparse
import json
import os
import signal
import socket
import struct
import sys
import time
from pathlib import Path
from typing import Any


ETH_P_IP = 0x0800
# Linux x86_64 SO_TIMESTAMPNS_OLD carries two native longs. No system install needed.
SO_TIMESTAMPNS = getattr(socket, "SO_TIMESTAMPNS", 35)
SOL_PACKET = 263
PACKET_STATISTICS = 6


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
    if tcp_length < 20 or total_length < ip_length + tcp_length:
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--port", default=8021, type=int)
    parser.add_argument("--interface", default="lo")
    parser.add_argument("--pid-file", type=Path)
    args = parser.parse_args()
    if sys.platform != "linux" or struct.calcsize("@l") != 8:
        parser.error("This collector requires 64-bit Linux")
    stopping = False

    def stop(signum: int, frame: Any) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    run = os.environ.get("IO_RUN_ID", "unset")
    if args.pid_file is not None:
        fields = Path("/proc/self/stat").read_text().rsplit(")", 1)[1].split()
        args.pid_file.write_text(json.dumps({"pid": os.getpid(), "start_ticks": fields[19]}), encoding="utf-8")
    observed = 0
    with args.output.open("a", encoding="utf-8", buffering=65536) as stream:
        def emit(kind: str, **fields: Any) -> None:
            stream.write(json.dumps({"event": kind, "source": "packet", "run": run,
                                     "pid": os.getpid(), "wall_ns": time.time_ns(),
                                     "mono_ns": time.monotonic_ns(), **fields}) + "\n")

        # SOCK_DGRAM strips the link header; 120 bytes cover maximum IP+TCP headers.
        with socket.socket(socket.AF_PACKET, socket.SOCK_DGRAM, socket.htons(ETH_P_IP)) as capture:
            capture.bind((args.interface, 0))
            capture.settimeout(0.25)
            timestamp_enabled = True
            try:
                capture.setsockopt(socket.SOL_SOCKET, SO_TIMESTAMPNS, 1)
            except OSError:
                timestamp_enabled = False
            emit("capture.ready", interface=args.interface, port=args.port,
                 kernel_timestamp=timestamp_enabled, snapshot_bytes=120,
                 records="IPv4 TCP header metadata only; no application bytes/HTTP headers/payload")
            stream.flush()
            deadline = time.monotonic() + 0.25
            while not stopping:
                try:
                    data, ancillary, message_flags, address = capture.recvmsg(120, 256)
                except socket.timeout:
                    data = b""
                    ancillary, message_flags, address = [], 0, None
                fields = header_fields(data, args.port) if data else None
                if fields is not None:
                    observed += 1
                    emit("tcp.packet", **fields, kernel_wall_ns=kernel_time(ancillary),
                         packet_type=address[2] if address else None,
                         truncated=bool(message_flags & socket.MSG_TRUNC))
                if time.monotonic() >= deadline:
                    stream.flush()
                    deadline = time.monotonic() + 0.25
            # Reading PACKET_STATISTICS resets counters; read once at the end.
            try:
                packets, drops = struct.unpack("=II", capture.getsockopt(SOL_PACKET, PACKET_STATISTICS, 8))
                emit("capture.exit", observed_target_packets=observed,
                     all_ipv4_packets=packets, dropped_packets=drops)
            except OSError as exc:
                emit("capture.exit", observed_target_packets=observed, statistics_errno=exc.errno)


if __name__ == "__main__":
    main()
