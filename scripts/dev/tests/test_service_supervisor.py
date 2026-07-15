from __future__ import annotations

import importlib.util
import json
import os
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "service_supervisor.py"
SPEC = importlib.util.spec_from_file_location("service_supervisor", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
service_supervisor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(service_supervisor)


def test_explicit_stop_is_classified_as_planned() -> None:
    result = service_supervisor.classify_exit(
        exit_code=1,
        stop_requested=True,
        force_used=False,
    )

    assert result == "planned_stop"


def test_process_start_timestamp_matches_windows_kernel_time() -> None:
    recorded = datetime.fromisoformat(service_supervisor._process_started_at(os.getpid()))
    powershell_value = subprocess.check_output(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            f"(Get-Process -Id {os.getpid()}).StartTime.ToString('o')",
        ],
        text=True,
    ).strip()
    actual = datetime.fromisoformat(powershell_value).astimezone()

    assert abs((recorded - actual).total_seconds()) < 0.01


def test_unrequested_nonzero_exit_is_unexpected() -> None:
    result = service_supervisor.classify_exit(
        exit_code=1,
        stop_requested=False,
        force_used=False,
    )

    assert result == "unexpected_exit"


def test_third_failure_inside_five_minutes_enters_crash_loop() -> None:
    now = datetime(2026, 7, 15, 0, 0, tzinfo=timezone.utc)
    failures = [now - timedelta(seconds=40), now - timedelta(seconds=20), now]

    decision = service_supervisor.decide_restart(failures, now=now)

    assert decision.should_restart is False
    assert decision.delay_seconds is None
    assert decision.active_failure_count == 3


def test_old_failures_expire_from_restart_window() -> None:
    now = datetime(2026, 7, 15, 0, 0, tzinfo=timezone.utc)
    failures = [now - timedelta(seconds=301), now]

    decision = service_supervisor.decide_restart(failures, now=now)

    assert decision.should_restart is True
    assert decision.delay_seconds == 1
    assert decision.active_failure_count == 1


def test_runtime_store_writes_atomic_state_and_jsonl_event(tmp_path: Path) -> None:
    state_path = tmp_path / "runtime.json"
    event_path = tmp_path / "runtime-events.jsonl"
    store = service_supervisor.RuntimeStore(state_path, event_path)

    store.write_state({"status": "running", "childPid": 123})
    store.append_event({"event": "service_started", "childPid": 123})

    assert json.loads(state_path.read_text(encoding="utf-8")) == {
        "childPid": 123,
        "status": "running",
    }
    assert json.loads(event_path.read_text(encoding="utf-8").strip()) == {
        "childPid": 123,
        "event": "service_started",
    }


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _wait_for_state(path: Path, predicate, timeout: float = 12.0) -> dict:
    deadline = time.monotonic() + timeout
    last_state: dict = {}
    while time.monotonic() < deadline:
        if path.exists():
            try:
                last_state = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                time.sleep(0.05)
                continue
            if predicate(last_state):
                return last_state
        time.sleep(0.05)
    raise AssertionError(f"runtime state did not match before timeout: {last_state}")


def test_supervisor_restarts_killed_child_and_respects_planned_stop(tmp_path: Path) -> None:
    port = _free_port()
    child_script = tmp_path / "fake_service.py"
    child_script.write_text(
        """
import os
import socket
import sys

port = int(sys.argv[1])
server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("127.0.0.1", port))
server.listen()
print(f"child-start pid={os.getpid()}", flush=True)
while True:
    connection, _ = server.accept()
    connection.close()
""".strip()
        + "\n",
        encoding="utf-8",
    )
    state_path = tmp_path / "runtime.json"
    event_path = tmp_path / "runtime-events.jsonl"
    control_path = tmp_path / "runtime-control.json"
    stdout_path = tmp_path / "service.out.log"
    stderr_path = tmp_path / "service.err.log"
    command = [
        sys.executable,
        str(MODULE_PATH),
        "--profile",
        "test",
        "--service",
        "frontend",
        "--port",
        str(port),
        "--cwd",
        str(tmp_path),
        "--state-path",
        str(state_path),
        "--event-path",
        str(event_path),
        "--control-path",
        str(control_path),
        "--stdout-log",
        str(stdout_path),
        "--stderr-log",
        str(stderr_path),
        "--poll-seconds",
        "0.05",
        "--",
        sys.executable,
        str(child_script),
        str(port),
    ]
    supervisor = subprocess.Popen(command, cwd=tmp_path)
    try:
        first = _wait_for_state(
            state_path,
            lambda state: state.get("status") == "running" and state.get("childPid"),
        )
        first_child_pid = int(first["childPid"])
        subprocess.run(
            ["taskkill.exe", "/T", "/F", "/PID", str(first_child_pid)],
            check=True,
            capture_output=True,
        )

        restarted = _wait_for_state(
            state_path,
            lambda state: state.get("status") == "running"
            and state.get("childPid")
            and int(state["childPid"]) != first_child_pid,
        )
        assert restarted["restartFailures"] == 1

        restarted_child_pid = int(restarted["childPid"])
        control_path.write_text(
            json.dumps({"action": "restart-reset", "source": "duplicate-start-test"}),
            encoding="utf-8",
        )
        deadline = time.monotonic() + 3
        ignored_reset = False
        while time.monotonic() < deadline:
            events = [
                json.loads(line)
                for line in event_path.read_text(encoding="utf-8").splitlines()
            ]
            if any(event["event"] == "control_ignored" for event in events):
                ignored_reset = True
                break
            time.sleep(0.05)
        assert ignored_reset is True
        assert supervisor.poll() is None
        still_running = json.loads(state_path.read_text(encoding="utf-8"))
        assert int(still_running["childPid"]) == restarted_child_pid

        control_path.write_text(
            json.dumps(
                {
                    "action": "stop",
                    "requestedAt": "2026-07-15T00:00:00+00:00",
                    "requestedBy": "pytest",
                    "requesterPid": os.getpid(),
                    "source": "integration-test",
                }
            ),
            encoding="utf-8",
        )
        supervisor.wait(timeout=10)

        events = [json.loads(line) for line in event_path.read_text(encoding="utf-8").splitlines()]
        event_names = [event["event"] for event in events]
        assert "unexpected_exit" in event_names
        assert "restart_scheduled" in event_names
        assert event_names[-1] == "forced_stop_after_timeout"
        assert stdout_path.read_text(encoding="utf-8").count("child-start") == 2
    finally:
        if supervisor.poll() is None:
            subprocess.run(
                ["taskkill.exe", "/T", "/F", "/PID", str(supervisor.pid)],
                check=False,
                capture_output=True,
            )


def test_child_launch_failures_use_bounded_restart_policy(tmp_path: Path, monkeypatch) -> None:
    state_path = tmp_path / "runtime.json"
    event_path = tmp_path / "runtime-events.jsonl"
    control_path = tmp_path / "runtime-control.json"
    supervisor = service_supervisor.ServiceSupervisor(
        profile="test",
        service="backend",
        port=_free_port(),
        cwd=tmp_path,
        command=["missing-command"],
        state_path=state_path,
        event_path=event_path,
        control_path=control_path,
        stdout_log=tmp_path / "service.out.log",
        stderr_log=tmp_path / "service.err.log",
        poll_seconds=0.01,
        port_check_seconds=0.01,
        port_failure_threshold=1,
    )

    def fail_to_launch(*_args, **_kwargs):
        raise FileNotFoundError("missing-command")

    monkeypatch.setattr(service_supervisor.subprocess, "Popen", fail_to_launch)
    monkeypatch.setattr(service_supervisor, "RESTART_DELAYS_SECONDS", (0, 0))
    result: dict[str, object] = {}

    def run_supervisor() -> None:
        try:
            result["exit_code"] = supervisor.run()
        except Exception as exc:  # captured so the test can assert the supervisor boundary
            result["error"] = exc

    thread = threading.Thread(target=run_supervisor)
    thread.start()
    state = _wait_for_state(
        state_path,
        lambda current: current.get("status") == "crash_loop",
        timeout=3,
    )
    assert state["restartFailures"] == 3
    control_path.write_text(
        json.dumps({"action": "stop", "source": "integration-test"}),
        encoding="utf-8",
    )
    thread.join(timeout=3)

    assert thread.is_alive() is False
    assert "error" not in result
    assert result["exit_code"] == 0
    events = [json.loads(line) for line in event_path.read_text(encoding="utf-8").splitlines()]
    assert [event["event"] for event in events].count("service_start_failed") == 3
    assert "crash_loop" in [event["event"] for event in events]


def test_supervisor_restarts_child_when_ready_port_disappears(tmp_path: Path) -> None:
    port = _free_port()
    drop_once = tmp_path / "drop-port-once"
    drop_once.write_text("1", encoding="utf-8")
    child_script = tmp_path / "drop_port_service.py"
    child_script.write_text(
        """
import os
import socket
import sys
import time
from pathlib import Path

port = int(sys.argv[1])
marker = Path(sys.argv[2])
server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("127.0.0.1", port))
server.listen()
print(f"child-start pid={os.getpid()}", flush=True)
if marker.exists():
    server.settimeout(0.1)
    deadline = time.monotonic() + 1
    while time.monotonic() < deadline:
        try:
            connection, _ = server.accept()
            connection.close()
        except TimeoutError:
            pass
    marker.unlink()
    server.close()
    while True:
        time.sleep(1)
while True:
    connection, _ = server.accept()
    connection.close()
""".strip()
        + "\n",
        encoding="utf-8",
    )
    state_path = tmp_path / "runtime.json"
    event_path = tmp_path / "runtime-events.jsonl"
    command = [
        sys.executable,
        str(MODULE_PATH),
        "--profile",
        "test",
        "--service",
        "backend",
        "--port",
        str(port),
        "--cwd",
        str(tmp_path),
        "--state-path",
        str(state_path),
        "--event-path",
        str(event_path),
        "--control-path",
        str(tmp_path / "control.json"),
        "--stdout-log",
        str(tmp_path / "service.out.log"),
        "--stderr-log",
        str(tmp_path / "service.err.log"),
        "--poll-seconds",
        "0.05",
        "--port-check-seconds",
        "0.05",
        "--port-failure-threshold",
        "3",
        "--",
        sys.executable,
        str(child_script),
        str(port),
        str(drop_once),
    ]
    supervisor = subprocess.Popen(command, cwd=tmp_path)
    try:
        first = _wait_for_state(
            state_path,
            lambda state: state.get("status") == "running" and state.get("childPid"),
        )
        first_child_pid = int(first["childPid"])
        restarted = _wait_for_state(
            state_path,
            lambda state: state.get("status") == "running"
            and state.get("childPid")
            and int(state["childPid"]) != first_child_pid,
        )

        assert restarted["restartFailures"] == 1
        events = [json.loads(line) for line in event_path.read_text(encoding="utf-8").splitlines()]
        assert "port_unavailable" in [event["event"] for event in events]
    finally:
        if supervisor.poll() is None:
            subprocess.run(
                ["taskkill.exe", "/T", "/F", "/PID", str(supervisor.pid)],
                check=False,
                capture_output=True,
            )


def test_supervisor_stops_restarting_after_three_failures(tmp_path: Path) -> None:
    port = _free_port()
    child_script = tmp_path / "always_fail.py"
    child_script.write_text("raise SystemExit(7)\n", encoding="utf-8")
    state_path = tmp_path / "runtime.json"
    event_path = tmp_path / "runtime-events.jsonl"
    control_path = tmp_path / "runtime-control.json"
    command = [
        sys.executable,
        str(MODULE_PATH),
        "--profile",
        "test",
        "--service",
        "frontend",
        "--port",
        str(port),
        "--cwd",
        str(tmp_path),
        "--state-path",
        str(state_path),
        "--event-path",
        str(event_path),
        "--control-path",
        str(control_path),
        "--stdout-log",
        str(tmp_path / "service.out.log"),
        "--stderr-log",
        str(tmp_path / "service.err.log"),
        "--poll-seconds",
        "0.05",
        "--",
        sys.executable,
        str(child_script),
    ]
    supervisor = subprocess.Popen(command, cwd=tmp_path)
    try:
        state = _wait_for_state(
            state_path,
            lambda current: current.get("status") == "crash_loop",
        )
        assert state["restartFailures"] == 3
        events = [json.loads(line) for line in event_path.read_text(encoding="utf-8").splitlines()]
        assert [event["event"] for event in events].count("unexpected_exit") == 3
        assert events[-1]["event"] == "crash_loop"

        control_path.write_text(
            json.dumps({"action": "stop", "source": "integration-test"}),
            encoding="utf-8",
        )
        supervisor.wait(timeout=5)
    finally:
        if supervisor.poll() is None:
            subprocess.run(
                ["taskkill.exe", "/T", "/F", "/PID", str(supervisor.pid)],
                check=False,
                capture_output=True,
            )
