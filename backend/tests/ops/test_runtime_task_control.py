from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
CONTRACT_TEST = ROOT / "scripts" / "dev" / "tests" / "runtime-task-control.ps1"
REGISTER_TASKS = ROOT / "scripts" / "dev" / "register-runtime-tasks.ps1"


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


def test_runtime_task_contracts_from_arbitrary_windows_checkout(
    tmp_path: Path,
) -> None:
    powershell = shutil.which("powershell.exe")
    if powershell is None:
        pytest.skip("Windows PowerShell is required")
    checkout_root = tmp_path / "actions" / "workspace" / "dexcowin-mes"
    copied_dev_scripts = checkout_root / "scripts" / "dev"
    shutil.copytree(ROOT / "scripts" / "dev", copied_dev_scripts)

    result = subprocess.run(
        [
            powershell,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(copied_dev_scripts / "tests" / "runtime-task-control.ps1"),
        ],
        cwd=checkout_root,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "runtime task control contracts passed" in result.stdout


@pytest.mark.parametrize("safe_mode", ["-PreflightOnly", "-WhatIf"])
def test_runtime_task_registration_rejects_arbitrary_repo_root_before_task_action(
    tmp_path: Path,
    safe_mode: str,
) -> None:
    powershell = shutil.which("powershell.exe")
    if powershell is None:
        pytest.skip("Windows PowerShell is required")
    arbitrary_root = tmp_path / "arbitrary-runtime-root"
    arbitrary_root.mkdir()

    result = subprocess.run(
        [
            powershell,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(REGISTER_TASKS),
            "-RepoRoot",
            str(arbitrary_root),
            safe_mode,
        ],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )

    output = result.stdout + result.stderr
    assert result.returncode != 0
    assert "Unknown DEXCOWIN MES runtime root" in output
    assert "Runtime task entry path not found" not in output


def test_runtime_entrypoints_delegate_without_direct_fallback() -> None:
    backend = (ROOT / "scripts" / "dev" / "start-backend.ps1").read_text(encoding="utf-8-sig")
    frontend = (ROOT / "scripts" / "dev" / "start-frontend.ps1").read_text(encoding="utf-8-sig")
    runtime_control = (ROOT / "scripts" / "dev" / "runtime-control.ps1").read_text(
        encoding="utf-8-sig"
    )
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
    assert '"--workers", "1"' in backend
    assert '"--no-proxy-headers"' in backend
    assert "function Wait-BackendReady" not in backend
    assert backend.count("Wait-RuntimeHttp200 -Url $HealthUrl -Attempts 90") == 1
    assert backend.count("Wait-RuntimeHttp200 -Url $HealthUrl -Attempts 120") == 1
    assert "Wait-RuntimeHttp200 -Url $HealthUrl -Attempts 120" in frontend
    assert runtime_control.count("Wait-RuntimeHttp200 -Url $healthUrl -Attempts 90") >= 2
    assert "function Wait-FrontendReady" not in frontend
    assert "Stop-RuntimeScheduledTask" in stop_backend
    assert "Stop-RuntimeScheduledTask" in stop_frontend
    assert "Get-RuntimeTaskRegistration" in status


def test_runtime_task_production_consumers_use_strict_wrapper_only() -> None:
    control = (ROOT / "scripts" / "dev" / "runtime-task-control.ps1").read_text(
        encoding="utf-8-sig"
    )

    assert "function New-RuntimeTaskSpecification" in control
    assert "-RuntimeRepoRoot $resolvedRoot" in control
    assert "return New-RuntimeTaskSpecification -Profile $profile" in control

    for script_name in (
        "register-runtime-tasks.ps1",
        "start-backend.ps1",
        "start-frontend.ps1",
        "stop-backend.ps1",
        "stop-frontend.ps1",
        "status-servers.ps1",
    ):
        content = (ROOT / "scripts" / "dev" / script_name).read_text(
            encoding="utf-8-sig"
        )
        assert "New-RuntimeTaskSpecification" not in content
        assert "TestRepoRoot" not in content


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
