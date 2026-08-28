from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
CONTRACT_TEST = ROOT / "scripts" / "dev" / "tests" / "runtime-task-control.ps1"


def test_runtime_task_contracts_without_registering_tasks() -> None:
    powershell = shutil.which("powershell.exe")
    if powershell is None:
        pytest.skip("Windows PowerShell is required")

    result = subprocess.run(
        [
            powershell,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(CONTRACT_TEST),
        ],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "runtime task control contracts passed" in result.stdout


def test_runtime_entrypoints_delegate_without_direct_fallback() -> None:
    backend = (ROOT / "scripts" / "dev" / "start-backend.ps1").read_text(encoding="utf-8-sig")
    frontend = (ROOT / "scripts" / "dev" / "start-frontend.ps1").read_text(encoding="utf-8-sig")
    stop_backend = (ROOT / "scripts" / "dev" / "stop-backend.ps1").read_text(encoding="utf-8-sig")
    stop_frontend = (ROOT / "scripts" / "dev" / "stop-frontend.ps1").read_text(encoding="utf-8-sig")
    status = (ROOT / "scripts" / "dev" / "status-servers.ps1").read_text(encoding="utf-8-sig")

    for start_script in (backend, frontend):
        assert "RuntimeTaskHost" in start_script
        assert "Request-RuntimeTaskStart" in start_script
        assert "Assert-RuntimeTaskConfigured" in start_script
        assert "direct fallback" not in start_script.lower()

    assert "Write-RuntimeTaskLaunchRequest" in backend
    assert "NoReload" in backend
    assert "Stop-RuntimeScheduledTask" in stop_backend
    assert "Stop-RuntimeScheduledTask" in stop_frontend
    assert "Get-RuntimeTaskRegistration" in status


def test_runtime_task_registration_script_is_triggerless() -> None:
    registration = (ROOT / "scripts" / "dev" / "register-runtime-tasks.ps1").read_text(
        encoding="utf-8-sig"
    )

    assert "PreflightOnly" in registration
    assert "New-ScheduledTaskPrincipal" in registration
    assert "-LogonType Interactive" in registration
    assert "-RunLevel Limited" in registration
    assert "-MultipleInstances IgnoreNew" in registration
    assert "-RestartCount 3" in registration
    assert "New-TimeSpan -Minutes 1" in registration
    assert "[TimeSpan]::Zero" in registration
    assert '$registeredXml.Task.version = "1.2"' in registration
    assert "RemoveChild($unifiedNode)" in registration
    assert "New-ScheduledTaskTrigger" not in registration


def test_runtime_task_uses_a_hidden_console_independent_launcher() -> None:
    launcher = (ROOT / "scripts" / "dev" / "runtime-task-host.vbs").read_text(
        encoding="utf-8-sig"
    )
    control = (ROOT / "scripts" / "dev" / "runtime-task-control.ps1").read_text(
        encoding="utf-8-sig"
    )

    assert "wscript.exe" in control
    assert "runtime-task-host.vbs" in control
    assert 'shell.Run(command, 0, True)' in launcher
    assert "-WindowStyle Hidden" in launcher
    assert "-RuntimeTaskHost" in launcher


def test_runtime_task_host_retries_supervisor_loss_three_times_at_one_minute() -> None:
    control = (ROOT / "scripts" / "dev" / "runtime-task-control.ps1").read_text(
        encoding="utf-8-sig"
    )

    assert "runtime_task_host_retry_scheduled" in control
    assert "runtime_task_host_recovered" in control
    assert "for ($retryAttempt = 1; $retryAttempt -le 3; $retryAttempt++)" in control
    assert "Start-Sleep -Seconds 60" in control
    assert "[string]::IsNullOrWhiteSpace($commandLine)" in control
