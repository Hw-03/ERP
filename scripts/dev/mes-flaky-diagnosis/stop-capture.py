"""Root-only stop for the collector PID whose recorded lifetime and arguments match."""

import argparse
import json
import os
from pathlib import Path
import signal


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pid-file", type=Path, required=True)
    parser.add_argument("--script", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.pid_file.exists():
        return
    recorded = json.loads(args.pid_file.read_text())
    pid = int(recorded["pid"])
    if pid < 2:
        raise ValueError("invalid collector PID")
    proc = Path("/proc") / str(pid)
    try:
        fields = (proc / "stat").read_text().rsplit(")", 1)[1].split()
        arguments = (proc / "cmdline").read_bytes().split(b"\0")
    except FileNotFoundError:
        return
    if fields[0] == "Z":
        return
    output_index = arguments.index(b"--output") if b"--output" in arguments else -1
    if fields[19] != recorded["start_ticks"] or str(args.script.resolve()).encode() not in arguments or output_index < 0 or arguments[output_index + 1] != str(args.output.resolve()).encode():
        raise ValueError("collector PID lifetime or arguments differ; refusing signal")
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass


if __name__ == "__main__":
    main()
