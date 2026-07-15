"""Supervise one DEXCOWIN MES development service and persist runtime evidence."""

from __future__ import annotations

import argparse
import collections
import ctypes
import json
import os
import socket
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, IO, NamedTuple, Sequence


RESTART_WINDOW = timedelta(minutes=5)
RESTART_DELAYS_SECONDS = (1, 5)
MAX_FAILURES_IN_WINDOW = 3
HEARTBEAT_SECONDS = 5.0


class RestartDecision(NamedTuple):
    """Describe whether another child start is allowed in the active window."""

    should_restart: bool
    delay_seconds: int | None
    active_failure_count: int


def classify_exit(*, exit_code: int | None, stop_requested: bool, force_used: bool) -> str:
    """Classify a child exit without guessing about an unobserved external actor."""

    if stop_requested:
        return "forced_stop_after_timeout" if force_used else "planned_stop"
    if exit_code in (None, 0):
        return "unexpected_exit_zero"
    return "unexpected_exit"


def decide_restart(failures: Sequence[datetime], *, now: datetime) -> RestartDecision:
    """Apply the bounded restart policy to failure timestamps."""

    active = [failure for failure in failures if now - failure <= RESTART_WINDOW]
    count = len(active)
    if count >= MAX_FAILURES_IN_WINDOW:
        return RestartDecision(False, None, count)
    delay_index = max(0, count - 1)
    return RestartDecision(True, RESTART_DELAYS_SECONDS[delay_index], count)


class RuntimeStore:
    """Persist current state atomically and append immutable runtime events."""

    def __init__(self, state_path: Path, event_path: Path) -> None:
        self.state_path = state_path
        self.event_path = event_path

    def write_state(self, state: dict[str, Any]) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self.state_path.with_suffix(f"{self.state_path.suffix}.{os.getpid()}.tmp")
        temp_path.write_text(
            json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        for attempt in range(10):
            try:
                os.replace(temp_path, self.state_path)
                return
            except PermissionError:
                if attempt == 9:
                    raise
                time.sleep(0.01)

    def append_event(self, event: dict[str, Any]) -> None:
        self.event_path.parent.mkdir(parents=True, exist_ok=True)
        with self.event_path.open("a", encoding="utf-8", newline="\n") as stream:
            stream.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")

    def read_control(self, control_path: Path) -> dict[str, Any] | None:
        try:
            return json.loads(control_path.read_text(encoding="utf-8-sig"))
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return None


def _utc_now() -> datetime:
    return datetime.now().astimezone()


def _iso_now() -> str:
    return _utc_now().isoformat()


def _process_started_at(process_id: int) -> str:
    """Return the OS process creation time, falling back only when unavailable."""

    if os.name != "nt":
        return _iso_now()
    from ctypes import wintypes

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.GetProcessTimes.argtypes = [
        wintypes.HANDLE,
        ctypes.POINTER(wintypes.FILETIME),
        ctypes.POINTER(wintypes.FILETIME),
        ctypes.POINTER(wintypes.FILETIME),
        ctypes.POINTER(wintypes.FILETIME),
    ]
    kernel32.GetProcessTimes.restype = wintypes.BOOL
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL

    handle = kernel32.OpenProcess(0x1000, False, process_id)
    if not handle:
        return _iso_now()
    try:
        creation = wintypes.FILETIME()
        exit_time = wintypes.FILETIME()
        kernel_time = wintypes.FILETIME()
        user_time = wintypes.FILETIME()
        if not kernel32.GetProcessTimes(
            handle,
            ctypes.byref(creation),
            ctypes.byref(exit_time),
            ctypes.byref(kernel_time),
            ctypes.byref(user_time),
        ):
            return _iso_now()
        windows_ticks = (creation.dwHighDateTime << 32) | creation.dwLowDateTime
        unix_seconds = (windows_ticks - 116_444_736_000_000_000) / 10_000_000
        return datetime.fromtimestamp(unix_seconds, tz=timezone.utc).astimezone().isoformat()
    finally:
        kernel32.CloseHandle(handle)


class ServiceSupervisor:
    """Own one service process, record its exits, and bound automatic restarts."""

    def __init__(
        self,
        *,
        profile: str,
        service: str,
        port: int,
        cwd: Path,
        command: list[str],
        state_path: Path,
        event_path: Path,
        control_path: Path,
        stdout_log: Path,
        stderr_log: Path,
        poll_seconds: float,
        port_check_seconds: float,
        port_failure_threshold: int,
    ) -> None:
        self.profile = profile
        self.service = service
        self.port = port
        self.cwd = cwd
        self.command = command
        self.control_path = control_path
        self.stdout_log = stdout_log
        self.stderr_log = stderr_log
        self.poll_seconds = poll_seconds
        self.port_check_seconds = port_check_seconds
        self.port_failure_threshold = port_failure_threshold
        self.store = RuntimeStore(state_path, event_path)
        self.supervisor_started_at = _process_started_at(os.getpid())
        self.run_id = uuid.uuid4().hex
        self.child: subprocess.Popen[str] | None = None
        self.child_started_at: str | None = None
        self.status = "starting"
        self.failures: list[datetime] = []
        self.last_exit: dict[str, Any] | None = None
        self.stdout_tail: collections.deque[str] = collections.deque(maxlen=20)
        self.stderr_tail: collections.deque[str] = collections.deque(maxlen=20)
        self._stream_threads: list[threading.Thread] = []
        self._next_heartbeat_at = 0.0

    def _base_state(self) -> dict[str, Any]:
        now = _iso_now()
        active_failures = [
            failure for failure in self.failures if _utc_now() - failure <= RESTART_WINDOW
        ]
        return {
            "schemaVersion": 1,
            "profile": self.profile,
            "service": self.service,
            "status": self.status,
            "supervisorPid": os.getpid(),
            "childPid": self.child.pid if self.child and self.child.poll() is None else None,
            "port": self.port,
            "cwd": str(self.cwd),
            "command": self.command,
            "startedAt": self.supervisor_started_at,
            "childStartedAt": self.child_started_at,
            "heartbeatAt": now,
            "restartFailures": len(active_failures),
            "lastExit": self.last_exit,
            "stdoutLog": str(self.stdout_log),
            "stderrLog": str(self.stderr_log),
            "eventLog": str(self.store.event_path),
            "controlPath": str(self.control_path),
        }

    def _write_state(self) -> None:
        self.store.write_state(self._base_state())

    def _write_heartbeat_if_due(self) -> None:
        now = time.monotonic()
        if now < self._next_heartbeat_at:
            return
        self._write_state()
        self._next_heartbeat_at = now + HEARTBEAT_SECONDS

    def _append_event(self, event: str, **details: Any) -> None:
        payload: dict[str, Any] = {
            "timestamp": _iso_now(),
            "profile": self.profile,
            "service": self.service,
            "event": event,
            "runId": self.run_id,
            "supervisorPid": os.getpid(),
            "childPid": self.child.pid if self.child else None,
        }
        if details:
            payload["details"] = details
        self.store.append_event(payload)

    @staticmethod
    def _pump_stream(
        source: IO[str],
        destination: Path,
        tail: collections.deque[str],
    ) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("a", encoding="utf-8", newline="") as output:
            for line in iter(source.readline, ""):
                output.write(line)
                output.flush()
                tail.append(line.rstrip("\r\n"))
        source.close()

    def _start_child(self) -> None:
        creation_flags = 0
        if os.name == "nt":
            creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
        self.stdout_tail.clear()
        self.stderr_tail.clear()
        self.child = None
        self.child_started_at = None
        self.child = subprocess.Popen(
            self.command,
            cwd=self.cwd,
            env=os.environ.copy(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            creationflags=creation_flags,
        )
        assert self.child.stdout is not None
        assert self.child.stderr is not None
        self.child_started_at = _process_started_at(self.child.pid)
        self.status = "running"
        self._stream_threads = [
            threading.Thread(
                target=self._pump_stream,
                args=(self.child.stdout, self.stdout_log, self.stdout_tail),
                daemon=True,
            ),
            threading.Thread(
                target=self._pump_stream,
                args=(self.child.stderr, self.stderr_log, self.stderr_tail),
                daemon=True,
            ),
        ]
        for thread in self._stream_threads:
            thread.start()
        self._append_event("service_started", command=self.command)
        self._write_state()
        self._next_heartbeat_at = time.monotonic() + HEARTBEAT_SECONDS

    def _join_streams(self) -> None:
        for thread in self._stream_threads:
            thread.join(timeout=2)

    def _terminate_child(self, *, timeout_seconds: float = 5.0) -> bool:
        if self.child is None or self.child.poll() is not None:
            return False
        force_used = False
        if os.name == "nt":
            subprocess.run(
                ["taskkill.exe", "/T", "/PID", str(self.child.pid)],
                check=False,
                capture_output=True,
            )
        else:
            self.child.terminate()
        try:
            self.child.wait(timeout=timeout_seconds)
        except subprocess.TimeoutExpired:
            force_used = True
            if os.name == "nt":
                subprocess.run(
                    ["taskkill.exe", "/T", "/F", "/PID", str(self.child.pid)],
                    check=False,
                    capture_output=True,
                )
            else:
                self.child.kill()
            self.child.wait(timeout=timeout_seconds)
        self._join_streams()
        return force_used

    def _consume_control(self) -> dict[str, Any] | None:
        control = self.store.read_control(self.control_path)
        if control is not None:
            self.control_path.unlink(missing_ok=True)
        return control

    def _control_requests_stop(self, control: dict[str, Any]) -> bool:
        if control.get("action") == "stop":
            return True
        self._append_event(
            "control_ignored",
            action=control.get("action"),
            status=self.status,
            request=control,
        )
        return False

    def _planned_stop(self, control: dict[str, Any]) -> int:
        self._append_event("stop_requested", request=control)
        force_used = self._terminate_child()
        exit_code = self.child.returncode if self.child else None
        event = classify_exit(
            exit_code=exit_code,
            stop_requested=True,
            force_used=force_used,
        )
        self.last_exit = {
            "timestamp": _iso_now(),
            "reason": event,
            "exitCode": exit_code,
            "request": control,
        }
        self.status = "stopped"
        self._append_event(event, exitCode=exit_code, request=control)
        self._write_state()
        return 0

    def _record_unexpected_exit(
        self,
        exit_code: int | None,
        *,
        reason: str | None = None,
        error: Exception | None = None,
    ) -> RestartDecision:
        event = reason or classify_exit(
            exit_code=exit_code, stop_requested=False, force_used=False
        )
        occurred_at = _utc_now()
        self.failures.append(occurred_at)
        self.last_exit = {
            "timestamp": occurred_at.isoformat(),
            "reason": event,
            "exitCode": exit_code,
        }
        details: dict[str, Any] = {
            "exitCode": exit_code,
            "stdoutTail": list(self.stdout_tail),
            "stderrTail": list(self.stderr_tail),
        }
        if error is not None:
            details.update(errorType=type(error).__name__, message=str(error))
            self.last_exit.update(errorType=type(error).__name__, message=str(error))
        self._append_event(event, **details)
        return decide_restart(self.failures, now=occurred_at)

    def _is_port_ready(self) -> bool:
        try:
            with socket.create_connection(("127.0.0.1", self.port), timeout=0.5):
                return True
        except OSError:
            return False

    def _wait_for_restart(self, delay_seconds: int) -> dict[str, Any] | None:
        deadline = time.monotonic() + delay_seconds
        while time.monotonic() < deadline:
            control = self._consume_control()
            if control is not None and self._control_requests_stop(control):
                return control
            self._write_heartbeat_if_due()
            time.sleep(self.poll_seconds)
        return None

    def _wait_in_crash_loop(self) -> bool:
        self.status = "crash_loop"
        self._append_event(
            "crash_loop",
            failureCount=MAX_FAILURES_IN_WINDOW,
            windowSeconds=int(RESTART_WINDOW.total_seconds()),
        )
        self._write_state()
        self._next_heartbeat_at = time.monotonic() + HEARTBEAT_SECONDS
        while True:
            self._write_heartbeat_if_due()
            control = self._consume_control()
            if control is not None:
                if control.get("action") == "restart-reset":
                    self.failures.clear()
                    self.last_exit = None
                    self.status = "restarting"
                    self._append_event("manual_restart_reset", request=control)
                    return True
                if self._control_requests_stop(control):
                    self._planned_stop(control)
                    return False
            time.sleep(max(self.poll_seconds, 0.2))

    def run(self) -> int:
        self.control_path.unlink(missing_ok=True)
        while True:
            try:
                self._start_child()
            except OSError as exc:
                decision = self._record_unexpected_exit(
                    None,
                    reason="service_start_failed",
                    error=exc,
                )
            else:
                port_was_ready = False
                port_failure_count = 0
                next_port_check = time.monotonic()
                exit_reason: str | None = None
                while self.child is not None and self.child.poll() is None:
                    control = self._consume_control()
                    if control is not None and self._control_requests_stop(control):
                        return self._planned_stop(control)
                    if time.monotonic() >= next_port_check:
                        if self._is_port_ready():
                            port_was_ready = True
                            port_failure_count = 0
                        elif port_was_ready:
                            port_failure_count += 1
                            if port_failure_count >= self.port_failure_threshold:
                                exit_reason = "port_unavailable"
                                self._terminate_child()
                                break
                        next_port_check = time.monotonic() + self.port_check_seconds
                    self._write_heartbeat_if_due()
                    time.sleep(self.poll_seconds)

                assert self.child is not None
                exit_code = self.child.returncode
                self._join_streams()
                decision = self._record_unexpected_exit(exit_code, reason=exit_reason)
            if not decision.should_restart:
                if self._wait_in_crash_loop():
                    continue
                return 0

            self.status = "restarting"
            self._append_event(
                "restart_scheduled",
                delaySeconds=decision.delay_seconds,
                failureCount=decision.active_failure_count,
            )
            self._write_state()
            control = self._wait_for_restart(decision.delay_seconds or 0)
            if control is not None:
                return self._planned_stop(control)


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--service", choices=("frontend", "backend"), required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--cwd", type=Path, required=True)
    parser.add_argument("--state-path", type=Path, required=True)
    parser.add_argument("--event-path", type=Path, required=True)
    parser.add_argument("--control-path", type=Path, required=True)
    parser.add_argument("--stdout-log", type=Path, required=True)
    parser.add_argument("--stderr-log", type=Path, required=True)
    parser.add_argument("--poll-seconds", type=float, default=0.5)
    parser.add_argument("--port-check-seconds", type=float, default=10.0)
    parser.add_argument("--port-failure-threshold", type=int, default=3)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    if args.command and args.command[0] == "--":
        args.command = args.command[1:]
    if not args.command:
        parser.error("a child command is required after --")
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    supervisor = ServiceSupervisor(
        profile=args.profile,
        service=args.service,
        port=args.port,
        cwd=args.cwd,
        command=args.command,
        state_path=args.state_path,
        event_path=args.event_path,
        control_path=args.control_path,
        stdout_log=args.stdout_log,
        stderr_log=args.stderr_log,
        poll_seconds=args.poll_seconds,
        port_check_seconds=args.port_check_seconds,
        port_failure_threshold=args.port_failure_threshold,
    )
    try:
        return supervisor.run()
    except Exception as exc:  # noqa: BLE001 - one durable supervisor boundary
        supervisor.status = "supervisor_error"
        supervisor.last_exit = {
            "timestamp": _iso_now(),
            "reason": "supervisor_error",
            "message": str(exc),
        }
        supervisor._append_event(
            "supervisor_error",
            errorType=type(exc).__name__,
            message=str(exc),
        )
        supervisor._write_state()
        return 1


if __name__ == "__main__":
    sys.exit(main())
