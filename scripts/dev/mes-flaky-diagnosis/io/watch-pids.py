"""Observe Linux PID lifetime/CPU and child processes without reading arguments."""

import argparse
import json
import os
import signal
import time
from pathlib import Path
from typing import Any


def read_process(path: Path) -> dict[str, Any] | None:
    """Field 22 starttime makes PID reuse distinguishable; no cmdline or environ."""
    try:
        value = (path / "stat").read_text()
        fields = value.rsplit(")", 1)[1].split()
        return {"pid": int(path.name), "ppid": int(fields[1]), "state": fields[0],
                "utime_ticks": int(fields[11]), "stime_ticks": int(fields[12]),
                "threads": int(fields[17]), "start_ticks": int(fields[19]),
                "rss_pages": int(fields[21]), "processor": int(fields[36])}
    except (FileNotFoundError, ProcessLookupError, PermissionError):
        return None


def sample(roots: set[int]) -> dict[tuple[int, int], dict[str, Any]]:
    """Discover descendants so a Next child PID cannot silently replace its parent."""
    processes: dict[int, dict[str, Any]] = {}
    for path in Path("/proc").iterdir():
        if path.name.isdigit():
            value = read_process(path)
            if value is not None:
                processes[value["pid"]] = value
    selected = set(roots)
    while True:
        children = {pid for pid, value in processes.items() if value["ppid"] in selected}
        expanded = selected | children
        if expanded == selected:
            break
        selected = expanded
    return {(pid, value["start_ticks"]): value for pid, value in processes.items() if pid in selected}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pid", type=int, action="append", default=[])
    parser.add_argument("--pidfile", type=Path, action="append", default=[])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--interval", type=float, default=0.25)
    args = parser.parse_args()
    stopping = False

    def stop(signum: int, frame: Any) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    run = os.environ.get("IO_RUN_ID", "unset")
    with args.output.open("a", encoding="utf-8", buffering=65536) as stream:
        def emit(kind: str, **fields: Any) -> None:
            stream.write(json.dumps({"event": kind, "source": "pidwatch", "run": run,
                                     "observer_pid": os.getpid(), "wall_ns": time.time_ns(),
                                     "mono_ns": time.monotonic_ns(), **fields}) + "\n")

        emit("watcher.ready", clock_ticks_per_second=os.sysconf("SC_CLK_TCK"),
             boot_id=Path("/proc/sys/kernel/random/boot_id").read_text().strip(), interval_s=args.interval)
        previous: dict[tuple[int, int], dict[str, Any]] = {}
        last_flush = time.monotonic()
        while not stopping:
            roots = set(args.pid)
            for path in args.pidfile:
                if path.exists():
                    for token in path.read_text().split():
                        if token.isdigit():
                            roots.add(int(token))
            # Keep a previously observed orphan in scope until its real /proc entry goes away.
            current = sample(roots | {identity[0] for identity in previous})
            for identity, fields in current.items():
                emit("proc.start" if identity not in previous else "proc.alive", **fields)
            for identity, fields in previous.items():
                if identity not in current:
                    emit("proc.gone", **fields, exit_reason="unknown_without_parent_wait_status")
            previous = current
            if time.monotonic() - last_flush >= 1.0:
                stream.flush()
                last_flush = time.monotonic()
            time.sleep(args.interval)
        emit("watcher.exit")


if __name__ == "__main__":
    main()
