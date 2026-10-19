"""Own one bpftrace process; preserve capability, raw records and observed loss."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import re
import selectors
import signal
import socket
import subprocess
import sys
import time
from typing import Any, Callable, Iterator, TextIO

HERE = Path(__file__).resolve().parent
EVENTS = ('tcp/tcp_send_reset', 'tcp/tcp_receive_reset', 'sock/inet_sock_set_state',
          'signal/signal_generate', 'signal/signal_deliver', 'oom/mark_victim', 'sched/sched_process_fork')
FINAL_DRAIN_SECONDS = 10.0


def health_notice(channel: str, line: str, value: dict[str, Any] | None) -> dict[str, Any] | None:
    """Separate kernel event loss from decode errors without copying raw diagnostic text."""
    if value and value.get('type') in ('lost_events', 'lost'):
        data = value.get('data')
        count = data.get('events') if isinstance(data, dict) else data
        return {'event': 'kernel.loss', 'bpf_event_loss': count if isinstance(count, int) and count >= 0 else None,
                'loss_source': 'bpf_stdout'}
    if channel == 'stderr' and re.search(r'\blost\b|\bdropped\b', line, re.IGNORECASE):
        match = re.search(r'(?:lost|dropped)\s+(\d+)', line, re.IGNORECASE)
        return {'event': 'kernel.loss', 'bpf_event_loss': int(match.group(1)) if match else None,
                'loss_source': 'bpf_stderr'}
    if channel == 'stderr' and re.search(r'ERROR|failed|helper.*error', line, re.IGNORECASE):
        return {'event': 'kernel.error', 'reason': 'bpf_stderr_error'}
    return None


def process_lines(child: subprocess.Popen, maximum_line_bytes: int = 262144,
                  stop_deadline: Callable[[], float | None] = lambda: None
                  ) -> Iterator[tuple[str, str]]:
    """Drain both pipes while the child lives; bounded lines and final fragments stay visible."""
    buffers: dict[int, bytearray] = {}
    names: dict[int, str] = {}
    fragmented: set[int] = set()
    with selectors.DefaultSelector() as selector:
        for name, pipe in (('stdout', child.stdout), ('stderr', child.stderr)):
            descriptor = pipe.fileno()
            os.set_blocking(descriptor, False)
            selector.register(descriptor, selectors.EVENT_READ, name)
            buffers[descriptor] = bytearray()
            names[descriptor] = name
        while selector.get_map():
            deadline = stop_deadline()
            if deadline is not None and time.monotonic() >= deadline:
                yield 'drain.timeout', ''
                for descriptor, pending in buffers.items():
                    if pending:
                        yield names[descriptor] + '.fragment', pending.decode('utf-8', errors='replace')
                        pending.clear()
                return
            ready = selector.select(0.1)
            if not ready:
                yield ('tick.pending' if any(buffers.values()) else 'tick'), ''
            for key, _ in ready:
                pending = buffers[key.fd]
                try:
                    data = os.read(key.fd, 65536)
                except OSError:
                    yield key.data + '.error', ''
                    if pending:
                        yield key.data + '.fragment', pending.decode('utf-8', errors='replace')
                        pending.clear()
                    selector.unregister(key.fd)
                    continue
                if not data:
                    selector.unregister(key.fd)
                    if pending:
                        suffix = '.fragment' if key.fd in fragmented else ''
                        yield key.data + suffix, pending.decode('utf-8', errors='replace')
                        pending.clear()
                    continue
                pending.extend(data)
                while b'\n' in pending:
                    index = pending.index(b'\n') + 1
                    if index > maximum_line_bytes:
                        yield key.data + '.overflow', bytes(pending[:maximum_line_bytes]).decode('utf-8', errors='replace')
                        del pending[:maximum_line_bytes]
                        fragmented.add(key.fd)
                        continue
                    suffix = '.fragment' if key.fd in fragmented else ''
                    yield key.data + suffix, bytes(pending[:index]).decode('utf-8', errors='replace')
                    del pending[:index]
                    fragmented.discard(key.fd)
                if len(pending) > maximum_line_bytes:
                    suffix = '.fragment' if key.fd in fragmented else '.overflow'
                    yield key.data + suffix, bytes(pending[:maximum_line_bytes]).decode('utf-8', errors='replace')
                    del pending[:maximum_line_bytes]
                    fragmented.add(key.fd)


def open_health_channel() -> Any:
    """Opt-in channel uses the same bounded protocol as the packet collector."""
    target = os.environ.get('IO_OBSERVATION_SOCKET')
    if not target:
        return None
    run = os.environ.get('IO_RUN_ID')
    if not run or run == 'unset':
        raise ValueError('kernel_observation_run_required')
    spec = importlib.util.spec_from_file_location('mes_packet_observation', HERE / 'capture-ipv4-tcp.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        connection.settimeout(3)
        connection.connect(target)
        channel = module.ObserverChannel(connection, run, source='kernel')
        channel.send('observer.hello')
        channel.wait('observer.ready')
        return channel
    except BaseException:
        connection.close()
        raise


def collect_child(child: subprocess.Popen, normalized: TextIO, raw: TextIO, stderr: TextIO,
                  health: Any, stopped_by_owner: Callable[[], bool], stop_owner: Callable[[], None],
                  line_reader: Callable[..., Iterator[tuple[str, str]]] | None = None
                  ) -> dict[str, Any]:
    """Drain only this owned child, preserving raw tails and a receipt after health failures."""
    errors = missing_map_keys = compiler_lines = separator_lines = count = live_loss = 0
    collector_errors = 0
    ready = attached = unknown_loss = loss_reported = failed = parent_closing = False
    health_alive = health is not None
    deadline: float | None = None
    pending_phases: list[dict[str, Any]] = []
    failure_reasons: list[str] = []
    failed_outputs: set[str] = set()
    unconfirmed_output_bytes = 0
    forced_termination = False

    def begin_drain() -> None:
        """Bound shutdown without changing the external owner-stop decision."""
        nonlocal deadline
        if deadline is None:
            deadline = time.monotonic() + FINAL_DRAIN_SECONDS
            if child.poll() is None:
                child.send_signal(signal.SIGINT)

    def fatal(reason: str, announce: bool = True) -> None:
        """Keep failure metadata bounded even if the control channel or disk is broken."""
        nonlocal collector_errors, failed
        collector_errors += 1
        failed = True
        if len(failure_reasons) < 16:
            failure_reasons.append(reason)
        begin_drain()
        if announce:
            notify('kernel.error', reason=reason, collector_errors=collector_errors)

    def notify(event: str, **fields: Any) -> None:
        """Health notices precede file writes; failed delivery cannot stop raw draining."""
        nonlocal health_alive
        if health_alive:
            try:
                health.send(event, **fields)
            except (OSError, ValueError) as exc:
                health_alive = False
                fatal('kernel_health_delivery_' + type(exc).__name__, announce=False)

    def write(stream: TextIO, name: str, text: str) -> None:
        """A failed sink stops collection; report bytes that could not be confirmed."""
        nonlocal unconfirmed_output_bytes
        if name in failed_outputs:
            unconfirmed_output_bytes += len(text.encode('utf-8'))
            return
        try:
            stream.write(text)
            stream.flush()
        except OSError:
            failed_outputs.add(name)
            unconfirmed_output_bytes += len(text.encode('utf-8'))
            fatal('kernel_' + name + '_write_failed')

    def record_loss(amount: int | None, source: str) -> None:
        """BPF loss and collector/decode errors remain independent quantities."""
        nonlocal live_loss, unknown_loss, loss_reported, failed
        live_loss += amount or 0
        unknown_loss = unknown_loss or amount is None
        loss_reported = failed = True
        notify('kernel.loss', bpf_event_loss=amount, loss_source=source)
        begin_drain()

    def statistics(phase: str, phase_id: str | None = None) -> None:
        """Describe consumed pipe records, without claiming an exact kernel event boundary."""
        notify('kernel.statistics', phase=phase, phase_id=phase_id, bpf_event_loss=live_loss,
               unknown_bpf_loss=unknown_loss, decode_errors=errors, collector_errors=collector_errors,
               complete=not failed, scope='consumed stdout/stderr records; no exact event cut')

    def commands(idle: bool) -> None:
        """Defer phase ACK until current/queued pipe records have reached an idle boundary."""
        nonlocal health_alive, parent_closing
        if health_alive:
            try:
                incoming = health.poll()
            except (OSError, ValueError) as exc:
                health_alive = False
                fatal('kernel_health_poll_' + type(exc).__name__, announce=False)
                incoming = []
            for command in incoming:
                if command['event'] == 'observer.phase':
                    if len(pending_phases) >= 32:
                        fatal('kernel_phase_queue_overflow')
                    else:
                        pending_phases.append(command)
                elif command['event'] == 'observer.goodbye':
                    parent_closing = True
                    stop_owner()
                    begin_drain()
                else:
                    fatal('unexpected_kernel_observer_command')
        if idle:
            for command in pending_phases:
                statistics(command['phase'], command['phase_id'])
                notify('observer.phase.ack', phase=command['phase'], phase_id=command['phase_id'])
            pending_phases.clear()

    reader = line_reader or process_lines
    try:
        for stream_name, line in reader(child, stop_deadline=lambda: deadline):
            if stopped_by_owner():
                begin_drain()
            if stream_name == 'drain.timeout':
                record_loss(None, 'final_pipe_drain_incomplete')
                fatal('kernel_final_drain_timeout')
            elif stream_name.endswith('.error'):
                record_loss(None, 'kernel_pipe_read_incomplete')
                fatal('kernel_pipe_read_failed')
            elif stream_name.startswith('tick'):
                commands(stream_name == 'tick')
                continue
            elif stream_name.endswith(('.overflow', '.fragment')):
                if stream_name.endswith('.overflow'):
                    fatal('kernel_output_line_overflow')
                sink, name = (stderr, 'stderr') if stream_name.startswith('stderr') else (raw, 'raw')
                write(sink, name, line)
            elif stream_name == 'stderr':
                notice = health_notice('stderr', line, None)
                if notice and notice['event'] == 'kernel.loss':
                    record_loss(notice['bpf_event_loss'], notice['loss_source'])
                elif notice:
                    fatal(notice['reason'])
                write(stderr, 'stderr', line)
            elif stream_name == 'stdout':
                event = None
                try:
                    if not line.strip():
                        separator_lines += 1
                    else:
                        value = json.loads(line)
                        if not isinstance(value, dict):
                            raise ValueError('kernel JSON record is not an object')
                        notice = health_notice('stdout', '', value)
                        if notice:
                            record_loss(notice['bpf_event_loss'], notice['loss_source'])
                        else:
                            attached = attached or value.get('type') == 'attached_probes'
                            if is_intentional_missing_key(value):
                                missing_map_keys += 1
                            else:
                                event = decode_record(value)
                except json.JSONDecodeError:
                    if not attached and 'ERROR' not in line:
                        compiler_lines += 1
                    else:
                        errors += 1
                        notify('kernel.error', reason='kernel_json_decode_error', decode_errors=errors)
                        failed = True
                        begin_drain()
                except (ValueError, TypeError, KeyError, RecursionError):
                    errors += 1
                    notify('kernel.error', reason='kernel_record_decode_error', decode_errors=errors)
                    failed = True
                    begin_drain()
                write(raw, 'raw', line)
                if event is not None:
                    if event['event'] == 'ready' and event.get('pid') != child.pid:
                        errors += 1
                        event['event'] = 'pid_namespace_unsupported'
                        fatal('pid_namespace_unsupported')
                    ready = ready or event['event'] == 'ready'
                    if event['event'] == 'ready':
                        notify('kernel.ready', child_pid=child.pid)
                    count += 1
                    write(normalized, 'normalized', json.dumps(event) + '\n')
            commands(False)
    except (OSError, ValueError, TypeError, KeyError) as exc:
        fatal('kernel_reader_' + type(exc).__name__)
        record_loss(None, 'kernel_reader_incomplete')
    finally:
        if child.poll() is None:
            begin_drain()
        try:
            code = child.wait(timeout=max(0.01, (deadline or time.monotonic() + FINAL_DRAIN_SECONDS) - time.monotonic()))
        except subprocess.TimeoutExpired:
            record_loss(None, 'owned_child_shutdown_incomplete')
            fatal('owned_kernel_child_shutdown_timeout')
            forced_termination = True
            child.terminate()
            try:
                code = child.wait(timeout=1)
            except subprocess.TimeoutExpired:
                child.kill()
                try:
                    code = child.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    code = child.poll()
        commands(True)
        statistics('cleanup')
        if not stopped_by_owner() or code != 0:
            fatal('unexpected_kernel_collector_exit')
        if health_alive:
            try:
                if parent_closing:
                    health.send('observer.goodbye.ack', complete=not failed)
                    health.finish_send()
                else:
                    health.send('observer.goodbye', complete=not failed)
                    health.wait('observer.goodbye.ack')
            except (OSError, ValueError) as exc:
                health_alive = False
                fatal('kernel_health_shutdown_' + type(exc).__name__, announce=False)
    return {'ready': ready, 'events': count, 'decode_errors': errors,
            'loss_or_error_reported': loss_reported or failed,
            'intentional_missing_map_keys': missing_map_keys, 'compiler_output_lines': compiler_lines,
            'empty_separator_lines': separator_lines, 'exit_code': code,
            'stopped_by_owner': stopped_by_owner(), 'finished_mono_ns': time.monotonic_ns(),
            'live_bpf_event_loss': live_loss, 'unknown_bpf_loss': unknown_loss,
            'collector_errors': collector_errors, 'failure_reasons': failure_reasons,
            'unconfirmed_output_bytes': unconfirmed_output_bytes, 'forced_termination': forced_termination,
            'child_still_running': child.poll() is None, 'owned_child_pid': child.pid,
            'complete': not failed,
            'usable': ready and errors == 0 and not failed and code == 0 and stopped_by_owner()}

def is_intentional_missing_key(value: dict[str, Any]) -> bool:
    """Only these observed missing-filter lookups are benign; other helper failures remain errors."""
    return (value.get('type') == 'helper_error' and value.get('helper') == 'map_lookup_elem'
        and value.get('retcode') == 0 and value.get('msg') in (
            'Success', "Can't lookup map element because it does not exist."))

def reset_probes(formats: dict[str, str]) -> str:
    """Bind observed fields; new kernels store sockaddr bytes and an explicit reset reason."""
    blocks = []
    for name, kind in (('tcp_send_reset', 3), ('tcp_receive_reset', 4)):
        layout = formats['tcp/' + name]
        field = lambda key: bool(re.search(r'field:[^;\n]*\b' + key + r';', layout))
        if not field('skaddr'):
            raise ValueError('reset event has no socket identity field')
        if all(field(key) for key in ('family', 'sport', 'dport')):
            variables = '$family = args->family; $sport = args->sport; $dport = args->dport;'
        elif field(r'saddr\[28\]') and field(r'daddr\[28\]') and '%pISpc' in layout:
            # bpftrace 0.20 cannot cast a tracepoint byte array to a pointer.
            # sockaddr's family is native-endian; its port bytes are network-endian.
            low, high = (0, 1) if sys.byteorder == 'little' else (1, 0)
            variables = (f'$family = args->saddr[{low}] | ((uint16)args->saddr[{high}] << 8); '
                '$sport = ((uint16)args->saddr[2] << 8) | args->saddr[3]; '
                '$dport = ((uint16)args->daddr[2] << 8) | args->daddr[3];')
        else:
            raise ValueError('unrecognized reset address layout')
        reason = 'args->reason' if field('reason') else '-1'
        blocks.append(f'''tracepoint:tcp:{name} {{
  {variables}
  if ($family == 2 && ($sport == $1 || $dport == $1)) {{
    printf("MESK event=reset mono_ns=%llu pid=%d tid=%d init_pid=%d boundary_kind={kind} sk=%llu owner=%d sport=%d dport=%d reset_reason=%d stack=%s\\n",
      nsecs(monotonic), pid, tid, curtask->tgid, (uint64)args->skaddr, @owner[(uint64)args->skaddr], $sport, $dport, {reason}, kstack(16));
  }}
}}''')
    return '\n'.join(blocks)

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
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    health = open_health_channel()
    with output.open('x') as normalized, output.with_name('kernel-raw.jsonl').open('x') as raw, \
            output.with_name('kernel-bpf-stderr.log').open('x') as stderr:
        version_match = re.search(r'v?(\d+)\.(\d+)', metadata['bpftrace'])
        if not version_match:
            raise ValueError('unknown bpftrace warning compatibility')
        modern = tuple(map(int, version_match.groups())) >= (0, 25)
        warning_flag = '-k' if modern else '-kk'
        program = output.with_name('socket-boundaries-effective.bt')
        template = (HERE / 'socket-boundaries.bt').read_text()
        placeholder = '// RESET_PROBES: generated from this kernel\'s tracepoint format, never guessed by version.'
        if template.count(placeholder) != 1:
            raise ValueError('reset probe template marker changed')
        effective = template.replace(placeholder, reset_probes(metadata['formats']))
        if not modern:
            # Older delete() returns void; only its discarded return syntax differs.
            effective = effective.replace('$deleted = delete(', 'delete(')
        program.write_text(effective)
        child = subprocess.Popen(['bpftrace', warning_flag, '-f', 'json', '-B', 'line', str(program),
                                  str(args.port), str(args.parent_pid), str(metadata['pid_namespace_inode'])], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 env={**os.environ, 'BPFTRACE_MAX_MAP_KEYS': '65536', 'BPFTRACE_PERF_RB_PAGES': '256'})
        try:
            receipt = collect_child(child, normalized, raw, stderr, health, lambda: stopped,
                                    lambda: stop(signal.SIGINT, None))
        finally:
            child.stdout.close()
            child.stderr.close()
            if health:
                health.connection.close()
    receipt['effective_program_sha256'] = hashlib.sha256(program.read_bytes()).hexdigest()
    output.with_name('kernel-result.json').write_text(json.dumps(receipt, indent=2))
    if not receipt['usable']:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
