"""Own one bpftrace process; preserve capability, raw records and observed loss."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import signal
import subprocess
import time
from typing import Any

HERE = Path(__file__).resolve().parent
EVENTS = ('tcp/tcp_send_reset', 'tcp/tcp_receive_reset', 'sock/inet_sock_set_state',
          'signal/signal_generate', 'signal/signal_deliver', 'oom/mark_victim', 'sched/sched_process_fork')

def decode_record(value: dict[str, Any]) -> dict[str, Any] | None:
    """Retain raw quantities; context PID is not the socket owner or a close reason."""
    if value.get('type') == 'attached_probes':
        return None
    if value.get('type') != 'printf' or not isinstance(value.get('data'), str):
        raise ValueError('unsupported or lost BPF record')
    text = value['data']
    header, _, stack = text.partition(' stack=')
    if not header.startswith('MESK '):
        raise ValueError('missing kernel event marker')
    result: dict[str, Any] = {'source': 'kernel'}
    for field in header.removeprefix('MESK ').strip().split():
        key, separator, raw = field.partition('=')
        if not separator or not re.fullmatch(r'[a-z_]+', key):
            raise ValueError('malformed kernel field')
        if key == 'event':
            if not re.fullmatch(r'[a-z_]+', raw):
                raise ValueError('malformed event name')
            result[key] = raw
        else:
            result[key] = int(raw)
    if 'mono_ns' not in result or 'event' not in result:
        raise ValueError('missing kernel event boundary')
    if stack:
        result['stack'] = [line.strip() for line in stack.splitlines() if line.strip()]
    return result

def capabilities() -> dict[str, Any]:
    """Read actual kernel formats without changing or consuming any tracefs instance."""
    tracing = Path('/sys/kernel/tracing')
    result = {'kernel': platform.release(), 'uid': os.getuid(), 'btf': Path('/sys/kernel/btf/vmlinux').exists(),
              'formats': {event: (tracing / 'events' / event / 'format').read_text() for event in EVENTS},
              'bpftrace': subprocess.check_output(['bpftrace', '--version'], text=True).strip(),
              'features': subprocess.check_output(['bpftrace', '--info'], text=True),
              'program_sha256': hashlib.sha256((HERE / 'socket-boundaries.bt').read_bytes()).hexdigest()}
    if result['uid'] != 0 or not result['btf']:
        raise ValueError('kernel collector requires root and actual BTF')
    return result

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--pid-file', type=Path, required=True)
    parser.add_argument('--parent-pid', type=int, required=True)
    parser.add_argument('--port', type=int, default=8021)
    args = parser.parse_args()
    if args.port not in (8021, 3154) or args.parent_pid < 2:
        raise ValueError('only diagnostic ports and a concrete owned parent are allowed')
    output = args.output.resolve()
    if output.exists() or args.pid_file.exists():
        raise ValueError('refusing to overwrite collector evidence')
    metadata = capabilities()
    metadata['parent_pid'] = args.parent_pid
    metadata['parent_start_ticks'] = (Path(f'/proc/{args.parent_pid}/stat').read_text().rsplit(')', 1)[1].split()[19])
    metadata['pid_namespace_inode'] = os.stat('/proc/self/ns/pid').st_ino
    if os.stat(f'/proc/{args.parent_pid}/ns/pid').st_ino != metadata['pid_namespace_inode']:
        raise ValueError('collector and owned parent must share one PID namespace')
    metadata['wall_ns'] = time.time_ns()
    metadata['mono_ns'] = time.monotonic_ns()
    output.with_name('kernel-capabilities.json').write_text(json.dumps(metadata, indent=2))
    fields = Path('/proc/self/stat').read_text().rsplit(')', 1)[1].split()
    args.pid_file.write_text(json.dumps({'pid': os.getpid(), 'start_ticks': fields[19]}))
    child = None
    stopped = False
    def stop(signum: int, frame: Any) -> None:
        nonlocal stopped
        stopped = True
        if child is not None and child.poll() is None:
            child.send_signal(signal.SIGINT)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    errors = 0
    missing_map_keys = 0
    compiler_lines = 0
    attached = False
    ready = False
    count = 0
    with output.open('x') as normalized, output.with_name('kernel-raw.jsonl').open('x') as raw, \
            output.with_name('kernel-bpf-stderr.log').open('x') as stderr:
        version_match = re.search(r'v?(\d+)\.(\d+)', metadata['bpftrace'])
        if not version_match:
            raise ValueError('unknown bpftrace warning compatibility')
        modern = tuple(map(int, version_match.groups())) >= (0, 25)
        warning_flag = '-k' if modern else '-kk'
        program = HERE / 'socket-boundaries.bt'
        if not modern:
            # Older delete() returns void; only its discarded return syntax differs.
            program = output.with_name('socket-boundaries-compatible.bt')
            program.write_text((HERE / 'socket-boundaries.bt').read_text().replace('$deleted = delete(', 'delete('))
        child = subprocess.Popen(['bpftrace', warning_flag, '-f', 'json', '-B', 'line', str(program),
                                  str(args.port), str(args.parent_pid), str(metadata['pid_namespace_inode'])], stdout=subprocess.PIPE, stderr=stderr,
                                 text=True, env={**os.environ, 'BPFTRACE_MAX_MAP_KEYS': '65536', 'BPFTRACE_PERF_RB_PAGES': '256'})
        try:
            for line in child.stdout:
                raw.write(line)
                try:
                    value = json.loads(line)
                    attached = attached or value.get('type') == 'attached_probes'
                    if value.get('type') == 'helper_error' and value.get('helper') == 'map_lookup_elem' and value.get('retcode') == 0 and value.get('msg') == 'Success':
                        # Missing PID/socket map keys are intentional filters, not lost events.
                        missing_map_keys += 1
                        continue
                    event = decode_record(value)
                except json.JSONDecodeError:
                    if not attached and 'ERROR' not in line:
                        compiler_lines += 1
                    else:
                        errors += 1
                    continue
                except (ValueError, TypeError, KeyError):
                    errors += 1
                    continue
                if event is not None:
                    ready = ready or event['event'] == 'ready'
                    count += 1
                    normalized.write(json.dumps(event) + '\n')
                    if event['event'] in ('ready', 'exit', 'signal_generate'):
                        normalized.flush()
            code = child.wait()
        finally:
            if child.poll() is None:
                child.send_signal(signal.SIGINT)
                child.wait(timeout=10)
    stderr_text = output.with_name('kernel-bpf-stderr.log').read_text()
    loss = bool(re.search(r'\blost\b|\bdropped\b|ERROR|failed|helper.*error', stderr_text, re.IGNORECASE))
    receipt = {'ready': ready, 'events': count, 'decode_errors': errors, 'loss_or_error_reported': loss,
               'intentional_missing_map_keys': missing_map_keys, 'compiler_output_lines': compiler_lines,
               'exit_code': code, 'stopped_by_owner': stopped, 'finished_mono_ns': time.monotonic_ns()}
    receipt['usable'] = ready and errors == 0 and not loss and code == 0 and stopped
    output.with_name('kernel-result.json').write_text(json.dumps(receipt, indent=2))
    if not receipt['usable']:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
