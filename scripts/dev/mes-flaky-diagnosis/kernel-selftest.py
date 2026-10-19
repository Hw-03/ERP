"""Check collector on a disposable socket/children; never launch MES or open a DB."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    with socket.socket() as guard:
        guard.bind(('127.0.0.1', 3154))
    tool = Path(__file__).resolve().parent / 'io/kernel-capture.py'
    destination = args.output / 'kernel-events.jsonl'
    collector = subprocess.Popen([sys.executable, str(tool), '--output', str(destination), '--pid-file',
        str(args.output / 'kernel-pid.json'), '--parent-pid', str(os.getpid()), '--port', '3154'])
    server = victim = None
    result = {'scope': 'collector self-test only; no original failure claim'}
    try:
        deadline = time.monotonic() + 30
        while not destination.exists() or '"event": "ready"' not in destination.read_text():
            if collector.poll() is not None or time.monotonic() >= deadline:
                raise RuntimeError('kernel collector did not become ready')
            time.sleep(0.05)
        server = subprocess.Popen([sys.executable, '-u', '-c',
            'import socket,sys\ns=socket.socket();s.bind(("127.0.0.1",3154));s.listen(1);print("ready",flush=True)\n'
            'c,a=s.accept();assert c.recv(1)==b"x";c.sendall(b"ok");c.close();s.close();sys.exit(7)'], stdout=subprocess.PIPE, text=True)
        assert server.stdout.readline().strip() == 'ready'
        with socket.create_connection(('127.0.0.1', 3154)) as connection:
            connection.sendall(b'x')
            assert connection.recv(2) == b'ok'
        assert server.wait(timeout=10) == 7
        victim = subprocess.Popen([sys.executable, '-u', '-c', 'import signal;print("ready",flush=True);signal.pause()'], stdout=subprocess.PIPE, text=True)
        assert victim.stdout.readline().strip() == 'ready'
        victim.terminate()
        assert victim.wait(timeout=10) == -signal.SIGTERM
        deadline = time.monotonic() + 10
        while True:
            observed = [json.loads(line) for line in destination.read_text().splitlines()]
            exited = {row.get('pid') for row in observed if row['event'] == 'exit'}
            if server.pid in exited and victim.pid in exited:
                break
            if collector.poll() is not None or time.monotonic() >= deadline:
                raise RuntimeError('kernel child exits were not observed before cleanup')
            time.sleep(0.05)
        collector.terminate()
        assert collector.wait(timeout=15) == 0
        events = [json.loads(line) for line in destination.read_text().splitlines()]
        assert any(row['event'] == 'accept' and row.get('owner') == server.pid for row in events)
        assert any(row['event'] == 'connect' and row.get('owner') == os.getpid() for row in events)
        assert any(row['event'] == 'exit' and row.get('pid') == server.pid and row.get('wait_status') == 7 << 8 for row in events)
        assert any(row['event'] == 'exit' and row.get('pid') == victim.pid and row.get('wait_status') == signal.SIGTERM for row in events)
        victim_exit = next(row for row in events if row['event'] == 'exit' and row.get('pid') == victim.pid)
        assert any(row['event'] == 'signal_generate' and row.get('target') == victim_exit['init_pid'] for row in events)
        assert any(row['event'] == 'close_or_active_reset' and row.get('queue_length') == 0 for row in events)
        result.update(passed=True, server_pid=server.pid, terminated_pid=victim.pid, events=len(events))
    finally:
        for process in (server, victim, collector):
            if process is not None and process.poll() is None:
                process.terminate()
                process.wait(timeout=15)
        (args.output / 'selftest-result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))

if __name__ == '__main__':
    main()
