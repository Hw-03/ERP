from pathlib import Path
import os
import subprocess
import threading
import time

import pytest


WATCH_SERVICE_PATH = Path(__file__).resolve().parents[1] / "watch-service.ps1"
WATCH_SERVICE = WATCH_SERVICE_PATH.read_text(encoding="utf-8")


def test_frontend_monitor_includes_dev_server_log():
    assert '"dev-server.log"' in WATCH_SERVICE
    assert "$FrontendDevServerLog" in WATCH_SERVICE
    assert "$FrontendDevServerLog" in WATCH_SERVICE.split('Watch-LogFiles "Frontend logs"', 1)[1]


def test_next_signal_received_is_prominent_frontend_error():
    error_patterns = WATCH_SERVICE.split("$FrontendErrorPatterns = @(", 1)[1].split(")", 1)[0]
    assert "NEXT_SIGNAL_RECEIVED" in error_patterns


@pytest.mark.skipif(os.name != "nt", reason="requires Windows PowerShell jobs")
def test_frontend_monitor_attaches_dev_server_log_created_after_start(tmp_path):
    runtime_root = tmp_path / "runtime"
    frontend_log_dir = runtime_root / "logs" / "frontend"
    frontend_log_dir.mkdir(parents=True)
    for name in (
        "frontend-dev.out.log",
        "frontend-dev.err.log",
        "frontend-runtime-events.jsonl",
    ):
        (frontend_log_dir / name).touch()

    powershell = os.environ.get("COMSPEC", "powershell.exe")
    if powershell.lower().endswith("cmd.exe"):
        powershell = "powershell.exe"
    process = subprocess.Popen(
        [
            powershell,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(WATCH_SERVICE_PATH),
            "-Service",
            "frontend",
        ],
        cwd=WATCH_SERVICE_PATH.parents[2],
        env={**os.environ, "MES_RUNTIME_ROOT": str(runtime_root)},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
    )
    lines = []
    banner_seen = threading.Event()

    def collect_output():
        assert process.stdout is not None
        for line in process.stdout:
            lines.append(line)
            if "===== Frontend logs =====" in line:
                banner_seen.set()

    reader = threading.Thread(target=collect_output, daemon=True)
    reader.start()
    try:
        assert banner_seen.wait(timeout=10), "frontend watcher did not start"
        dev_server_log = frontend_log_dir / "dev-server.log"
        dev_server_log.write_text(
            "NEXT_SIGNAL_RECEIVED signal=SIGTERM\n", encoding="utf-8"
        )

        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and not any(
            "[FRONTEND ERROR]" in line and "NEXT_SIGNAL_RECEIVED" in line
            for line in lines
        ):
            time.sleep(0.1)
    finally:
        if process.poll() is None:
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        process.communicate(timeout=10)

    output = "".join(lines)
    assert str(dev_server_log) in output
    assert "[FRONTEND ERROR] NEXT_SIGNAL_RECEIVED" in output
