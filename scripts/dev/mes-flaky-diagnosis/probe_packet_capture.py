"""Linux kernel socket probe, without application traffic, services, DB, or sysctl changes."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import select
import socket
import subprocess
import sys
import tempfile
import time

from test_packet_capture import TOOL, packet


def filter_probe() -> list[dict]:
    """Run the actual cBPF in Linux against synthetic network headers on a datagram pair."""
    cases = [("target_destination", packet(), True),
             ("target_source", packet(8021, 50000), True),
             ("ip_options", packet(ihl=15), True),
             ("first_fragment", packet(fragment=0x2000), True),
             ("noninitial_fragment", packet(fragment=1), False),
             ("udp", packet(protocol=17), False),
             ("other_port", packet(50000, 8022), False),
             ("ipv6", b"\x65" + packet()[1:], False),
             ("short_header", b"\x45", False),
             ("header_clip", packet(payload=b"probe-only-do-not-record" * 20), True)]
    results = []
    sender, receiver = socket.socketpair(socket.AF_UNIX, socket.SOCK_DGRAM)
    with sender, receiver:
        TOOL.attach_filter(receiver, 8021)
        receiver.setblocking(False)
        for name, data, accepted in cases:
            sender.send(data)
            readable, _, _ = select.select([receiver], [], [], 0.03)
            assert bool(readable) == accepted, f"kernel filter disagrees on {name}"
            received_length = len(receiver.recv(120)) if readable else 0
            assert received_length == (min(len(data), 120) if accepted else 0)
            results.append({"case": name, "accepted": accepted,
                            "received_header_snapshot_bytes": received_length})
    return results


def collector_probe(output: Path, run: str) -> dict:
    """Exercise the real AF_PACKET attach, 100ms reads, phases and intentional goodbye."""
    collector_path = Path(__file__).parent / "io/capture-ipv4-tcp.py"
    metadata_path, stderr_path = output / "packet-metadata.jsonl", output / "packet-stderr.jsonl"
    transcript = []
    with tempfile.TemporaryDirectory(prefix="packet-observer-") as directory:
        observation_path = str(Path(directory) / "control.sock")
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as listener:
            listener.bind(observation_path)
            listener.listen(1)
            listener.settimeout(5)
            environment = {**os.environ, "IO_RUN_ID": run, "IO_OBSERVATION_SOCKET": observation_path}
            with stderr_path.open("w", encoding="utf-8") as errors:
                process = subprocess.Popen([sys.executable, str(collector_path), "--output", str(metadata_path)],
                                           env=environment, stderr=errors)
                try:
                    connection, _ = listener.accept()
                    with connection, connection.makefile("rb") as stream:
                        connection.settimeout(5)
                        incoming_seq, outgoing_seq = 0, 0

                        def receive_until(event: str) -> dict:
                            nonlocal incoming_seq
                            for _ in range(100):
                                raw = stream.readline(65537)
                                assert raw and len(raw) <= 65536, "missing/oversize producer frame"
                                row = json.loads(raw)
                                incoming_seq += 1
                                assert row["v"] == 1 and row["run"] == run and row["source"] == "packet"
                                assert row["seq"] == incoming_seq and isinstance(row["mono_ns"], str)
                                transcript.append(row)
                                assert row["event"] not in {"capture.error", "capture.loss"}, row
                                if row["event"] == event:
                                    return row
                            raise AssertionError("producer failed to reach requested event")

                        def send(event: str, **fields: str) -> None:
                            nonlocal outgoing_seq
                            outgoing_seq += 1
                            row = {"v": 1, "run": run, "source": "observer", "pid": os.getpid(),
                                   "seq": outgoing_seq, "mono_ns": str(time.monotonic_ns()),
                                   "event": event, **fields}
                            connection.sendall((json.dumps(row) + "\n").encode())

                        receive_until("observer.hello")
                        send("observer.ready")
                        ready = receive_until("capture.ready")
                        assert ready["seq"] == 2 and ready["snapshot_bytes"] == 120
                        receive_until("capture.statistics")
                        receive_until("capture.statistics")  # Actual periodic reset read, not a timer sleep.
                        for phase in ("ready", "observe", "segment", "start", "stop", "before_capture",
                                      "preserve", "after_capture", "cleanup"):
                            send("observer.phase", phase=phase, phase_id=f"probe-{phase}")
                            ack = receive_until("observer.phase.ack")
                            assert ack["phase"] == phase and ack["phase_id"] == f"probe-{phase}"
                            previous = transcript[-2]
                            assert previous["event"] == "capture.statistics" and previous["phase_id"] == ack["phase_id"]
                        send("observer.goodbye", reason="intentional_observer_close")
                        goodbye = receive_until("observer.goodbye.ack")
                        assert goodbye["complete"] is True
                    assert process.wait(timeout=5) == 0, "collector exited unsuccessfully"
                finally:
                    if process.poll() is None:
                        # Closed observer/handshake deadlines make the child fail closed on its own.
                        process.wait(timeout=5)
    rows = [json.loads(line) for line in metadata_path.read_text(encoding="utf-8").splitlines()]
    assert rows[-1]["event"] == "capture.exit" and rows[-1]["complete"] is True
    assert all(row["run"] == run for row in rows)
    assert not stderr_path.read_text(encoding="utf-8").strip()
    (output / "packet-control.jsonl").write_text("".join(json.dumps(row) + "\n" for row in transcript), encoding="utf-8")
    return {"ready": ready, "exit": rows[-1], "control_records": len(transcript),
            "statistics_reads": sum(row["event"] == "capture.statistics" for row in rows),
            "collector_sha256": hashlib.sha256(collector_path.read_bytes()).hexdigest()}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--run", required=True)
    args = parser.parse_args()
    if sys.platform != "linux":
        parser.error("Linux is required")
    args.output.mkdir(parents=True, exist_ok=True)
    results = filter_probe()
    report = {"run": args.run, "filter_cases": results,
              "collector": collector_probe(args.output, args.run),
              "traffic": "synthetic headers on AF_UNIX datagrams only; no workload replay or application request"}
    (args.output / "packet-probe.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
