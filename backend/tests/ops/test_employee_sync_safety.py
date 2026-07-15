from __future__ import annotations

import os
import shutil
import subprocess
import textwrap
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
SYNC_SCRIPT = ROOT / "scripts" / "dev" / "sync-to-employee.ps1"
CHECKED_COMMAND = ROOT / "scripts" / "dev" / "checked-command.ps1"
START_BAT = ROOT / "start.bat"
RUNTIME_SCRIPTS = (
    "resolve-server-profile.ps1",
    "runtime-paths.ps1",
    "runtime-control.ps1",
    "service_supervisor.py",
    "start-backend.ps1",
    "stop-backend.ps1",
    "start-frontend.ps1",
    "stop-frontend.ps1",
    "stop-servers.ps1",
    "open-watch.ps1",
    "watch-service.ps1",
    "watch-servers.ps1",
    "status-servers.ps1",
)


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _fake_service_script(event: str, exit_variable: str) -> str:
    return textwrap.dedent(
        f"""
        Add-Content -LiteralPath $env:SYNC_EVENT_LOG -Value "{event}"
        $exitValue = [Environment]::GetEnvironmentVariable("{exit_variable}")
        if ([string]::IsNullOrEmpty($exitValue)) {{ $exitValue = "0" }}
        exit [int] $exitValue
        """
    )


def _fake_python_tool(event: str, exit_variable: str, success_body: str = "") -> str:
    normalized_body = textwrap.dedent(success_body).strip()
    return textwrap.dedent(
        f"""
        import os
        from pathlib import Path

        with Path(os.environ["SYNC_EVENT_LOG"]).open("a", encoding="utf-8") as handle:
            handle.write("{event}\\n")
        exit_code = int(os.environ.get("{exit_variable}", "0"))
        if exit_code:
            raise SystemExit(exit_code)
        """
    ) + (f"\n{normalized_body}\n" if normalized_body else "")


def _fake_bootstrap_tool() -> str:
    return textwrap.dedent(
        """
        import os
        import sys
        from pathlib import Path

        mode = sys.argv[1] if len(sys.argv) > 1 else ""
        contracts = {
            "--migrate": ("migrate", "FAKE_MIGRATE_EXIT", "FAKE_MIGRATE_OUTPUT"),
            "--check": ("schema-check", "FAKE_SCHEMA_CHECK_EXIT", "FAKE_SCHEMA_CHECK_OUTPUT"),
        }
        if mode not in contracts:
            raise SystemExit(91)
        event, exit_variable, output_variable = contracts[mode]
        with Path(os.environ["SYNC_EVENT_LOG"]).open("a", encoding="utf-8") as handle:
            handle.write(f"{event}\\n")
        output = os.environ.get(output_variable, "")
        if output:
            print(output)
        raise SystemExit(int(os.environ.get(exit_variable, "0")))
        """
    )


def _prepare_sync_sandbox(tmp_path: Path, overrides: dict[str, str]) -> tuple[Path, dict[str, str], Path]:
    dev_root = tmp_path / "dev"
    emp_root = tmp_path / "employee"
    fake_bin = tmp_path / "fake-bin"
    event_log = tmp_path / "events.log"
    backup_path = emp_root / "_attic" / "runtime" / "backups" / "sqlite" / "mes_20990101_000000.db"

    for directory in (
        dev_root / "backend",
        dev_root / "frontend",
        dev_root / "scripts" / "dev",
        dev_root / "scripts" / "ops",
        emp_root / "backend",
        emp_root / "frontend",
        emp_root / "scripts" / "dev",
        emp_root / "scripts" / "ops",
        fake_bin,
    ):
        directory.mkdir(parents=True, exist_ok=True)

    checked_command = CHECKED_COMMAND.read_text(encoding="utf-8") + textwrap.dedent(
        """

        function Test-TcpPortFree {
            param([int] $Port)
            return $true
        }

        function Invoke-WebRequest {
            return [pscustomobject] @{ StatusCode = 200 }
        }

        function Start-Process {
            param([string] $FilePath, [string] $WindowStyle)
        }
        """
    )
    _write(dev_root / "scripts" / "dev" / "checked-command.ps1", checked_command)
    for script_name in RUNTIME_SCRIPTS:
        _write(dev_root / "scripts" / "dev" / script_name, "# fake runtime script\n")
    _write(dev_root / "scripts" / "runtime_paths.py", "# fake runtime paths\n")
    for bat_name in ("start.bat", "watch.bat", "stop.bat", "status.bat"):
        _write(dev_root / bat_name, "@exit /b 0\n")

    service_scripts = {
        "stop-backend.ps1": _fake_service_script("stop-backend", "FAKE_STOP_BACKEND_EXIT"),
        "stop-frontend.ps1": _fake_service_script("stop-frontend", "FAKE_STOP_FRONTEND_EXIT"),
        "start-backend.ps1": _fake_service_script("start-backend", "FAKE_START_BACKEND_EXIT"),
        "start-frontend.ps1": _fake_service_script("start-frontend", "FAKE_START_FRONTEND_EXIT"),
    }
    for service_root in (dev_root, emp_root):
        for script_name, content in service_scripts.items():
            _write(service_root / "scripts" / "dev" / script_name, content)

    backup_body = """
    backup_path = Path(os.environ["FAKE_EMP_BACKUP_PATH"]).resolve()
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    backup_path.write_bytes(b"fake sqlite backup")
    print(f"BACKUP_PATH={backup_path}")
    """
    _write(
        dev_root / "scripts" / "ops" / "backup_db.py",
        _fake_python_tool("backup", "FAKE_BACKUP_EXIT", backup_body),
    )
    _write(
        emp_root / "backend" / "bootstrap_db.py",
        _fake_bootstrap_tool(),
    )
    _write(
        emp_root / "scripts" / "ops" / "_verify_backup.py",
        _fake_python_tool("verify-schema", "FAKE_SCHEMA_VERIFY_EXIT"),
    )
    _write(
        emp_root / "scripts" / "ops" / "check_inventory_integrity.py",
        _fake_python_tool("verify-inventory", "FAKE_INVENTORY_VERIFY_EXIT"),
    )
    _write(emp_root / "backend" / "mes.db", "fake employee database\n")

    _write(
        fake_bin / "robocopy.cmd",
        textwrap.dedent(
            """
            @echo off
            set "source=%~1"
            set "mode=sync"
            :scan
            if "%~1"=="" goto log
            if /I "%~1"=="/L" set "mode=dryrun"
            shift
            goto scan
            :log
            if /I "%mode%"=="dryrun" goto dryrun
            >>"%SYNC_EVENT_LOG%" echo robocopy-sync:%source%
            exit /b 0
            :dryrun
            >>"%SYNC_EVENT_LOG%" echo robocopy-dryrun:%source%
            exit /b 0
            """
        ).lstrip(),
    )

    sync_copy = SYNC_SCRIPT.read_text(encoding="utf-8-sig")
    sync_copy = sync_copy.replace('$DevRoot = "C:\\ERP"', f'$DevRoot = "{dev_root.as_posix()}"')
    sync_copy = sync_copy.replace('$EmpRoot = "C:\\ERP-dev"', f'$EmpRoot = "{emp_root.as_posix()}"')
    assert '$DevRoot = "C:\\ERP"' not in sync_copy
    assert '$EmpRoot = "C:\\ERP-dev"' not in sync_copy
    sync_path = tmp_path / "sync-under-test.ps1"
    sync_path.write_text(sync_copy, encoding="utf-8-sig")

    environment = os.environ.copy()
    environment.update(
        {
            "PATH": f"{fake_bin}{os.pathsep}{environment['PATH']}",
            "SYNC_EVENT_LOG": str(event_log),
            "FAKE_EMP_BACKUP_PATH": str(backup_path),
            "FAKE_STOP_BACKEND_EXIT": "0",
            "FAKE_STOP_FRONTEND_EXIT": "0",
            "FAKE_START_BACKEND_EXIT": "0",
            "FAKE_START_FRONTEND_EXIT": "0",
            "FAKE_BACKUP_EXIT": "0",
            "FAKE_MIGRATE_EXIT": "0",
            "FAKE_MIGRATE_OUTPUT": "failed=0",
            "FAKE_SCHEMA_CHECK_EXIT": "0",
            "FAKE_SCHEMA_CHECK_OUTPUT": "ready=true",
            "FAKE_SCHEMA_VERIFY_EXIT": "0",
            "FAKE_INVENTORY_VERIFY_EXIT": "0",
        }
    )
    environment.update(overrides)
    return sync_path, environment, event_log


def _run_sync(sync_path: Path, environment: dict[str, str]) -> subprocess.CompletedProcess[str]:
    powershell = shutil.which("powershell.exe")
    if powershell is None:
        pytest.skip("Windows PowerShell is required")
    return subprocess.run(
        [powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(sync_path), "-Force"],
        cwd=sync_path.parent,
        env=environment,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )


def _event_kinds(event_log: Path) -> list[str]:
    return [line.split(":", 1)[0] for line in event_log.read_text(encoding="utf-8-sig").splitlines()]


def test_employee_sync_stop_failure_restarts_services_without_backup_or_sync(tmp_path: Path) -> None:
    sync_path, environment, event_log = _prepare_sync_sandbox(
        tmp_path, {"FAKE_STOP_BACKEND_EXIT": "11"}
    )

    result = _run_sync(sync_path, environment)
    events = _event_kinds(event_log)

    assert result.returncode == 7, result.stdout + result.stderr
    assert events == [
        "robocopy-dryrun",
        "stop-backend",
        "stop-frontend",
        "start-backend",
        "start-frontend",
    ]
    assert "backup" not in events
    assert "robocopy-sync" not in events
    assert "migrate" not in events


def test_employee_sync_backup_failure_restarts_services_without_sync_or_migration(tmp_path: Path) -> None:
    sync_path, environment, event_log = _prepare_sync_sandbox(
        tmp_path, {"FAKE_BACKUP_EXIT": "12"}
    )

    result = _run_sync(sync_path, environment)
    events = _event_kinds(event_log)

    assert result.returncode == 7, result.stdout + result.stderr
    assert events == [
        "robocopy-dryrun",
        "stop-backend",
        "stop-frontend",
        "backup",
        "start-backend",
        "start-frontend",
    ]
    assert "robocopy-sync" not in events
    assert "migrate" not in events


def test_employee_sync_post_verify_failure_keeps_services_stopped_and_prints_recovery(tmp_path: Path) -> None:
    sync_path, environment, event_log = _prepare_sync_sandbox(
        tmp_path, {"FAKE_SCHEMA_VERIFY_EXIT": "13"}
    )

    result = _run_sync(sync_path, environment)
    events = _event_kinds(event_log)
    output = result.stdout + result.stderr

    assert result.returncode == 8, output
    assert events == [
        "robocopy-dryrun",
        "stop-backend",
        "stop-frontend",
        "backup",
        "robocopy-sync",
        "robocopy-sync",
        "robocopy-sync",
        "migrate",
        "schema-check",
        "verify-schema",
    ]
    assert "start-backend" not in events
    assert "start-frontend" not in events
    assert "verify-inventory" not in events
    assert "restore_db.py" in output
    assert "--check" in output


def test_employee_sync_success_uses_migrate_then_read_only_head_check(tmp_path: Path) -> None:
    sync_path, environment, event_log = _prepare_sync_sandbox(tmp_path, {})

    result = _run_sync(sync_path, environment)
    events = _event_kinds(event_log)

    assert result.returncode == 0, result.stdout + result.stderr
    assert events == [
        "robocopy-dryrun",
        "stop-backend",
        "stop-frontend",
        "backup",
        "robocopy-sync",
        "robocopy-sync",
        "robocopy-sync",
        "migrate",
        "schema-check",
        "verify-schema",
        "verify-inventory",
        "start-backend",
        "start-frontend",
    ]


def test_employee_sync_migrate_failure_keeps_services_stopped_and_prints_recovery(tmp_path: Path) -> None:
    sync_path, environment, event_log = _prepare_sync_sandbox(
        tmp_path, {"FAKE_MIGRATE_EXIT": "14"}
    )

    result = _run_sync(sync_path, environment)
    events = _event_kinds(event_log)
    output = result.stdout + result.stderr

    assert result.returncode == 5, output
    assert events[-1] == "migrate"
    assert "schema-check" not in events
    assert "start-backend" not in events
    assert "start-frontend" not in events
    assert str(environment["FAKE_EMP_BACKUP_PATH"]) in output
    assert "restore_db.py" in output


def test_employee_sync_schema_check_failure_keeps_services_stopped_and_prints_recovery(tmp_path: Path) -> None:
    sync_path, environment, event_log = _prepare_sync_sandbox(
        tmp_path, {"FAKE_SCHEMA_CHECK_EXIT": "15"}
    )

    result = _run_sync(sync_path, environment)
    events = _event_kinds(event_log)
    output = result.stdout + result.stderr

    assert result.returncode == 8, output
    assert events[-2:] == ["migrate", "schema-check"]
    assert "verify-schema" not in events
    assert "verify-inventory" not in events
    assert "start-backend" not in events
    assert "start-frontend" not in events
    assert str(environment["FAKE_EMP_BACKUP_PATH"]) in output
    assert "restore_db.py" in output


def test_employee_sync_ignores_failed_count_text_when_migrate_exit_is_zero(tmp_path: Path) -> None:
    sync_path, environment, event_log = _prepare_sync_sandbox(
        tmp_path, {"FAKE_MIGRATE_OUTPUT": "failed=99"}
    )

    result = _run_sync(sync_path, environment)
    events = _event_kinds(event_log)

    assert result.returncode == 0, result.stdout + result.stderr
    assert "failed=99" in result.stdout
    assert events[-2:] == ["start-backend", "start-frontend"]


def test_employee_sync_checks_stop_commands_and_actual_ports_before_backup() -> None:
    script = SYNC_SCRIPT.read_text(encoding="utf-8-sig")

    backend_stop = script.index('"stop-backend.ps1"')
    frontend_stop = script.index('"stop-frontend.ps1"')
    backup = script.index('"scripts\\ops\\backup_db.py"')

    assert '. (Join-Path $DevRoot "scripts\\dev\\checked-command.ps1")' in script
    assert "Invoke-CheckedExternalCommand" in script
    assert "Test-TcpPortFree -Port 8010" in script
    assert "Test-TcpPortFree -Port 3000" in script
    assert backend_stop < backup
    assert frontend_stop < backup


def test_employee_sync_uses_exact_machine_readable_backup_path() -> None:
    script = SYNC_SCRIPT.read_text(encoding="utf-8-sig")

    assert "BACKUP_PATH=" in script
    assert "[regex]::Match" in script
    assert "GetFullPath" in script
    assert "Get-ChildItem -LiteralPath $EmpBackupDir -Filter \"mes_*.db\"" not in script


def test_employee_sync_restarts_both_services_with_checked_results_on_backup_failure() -> None:
    script = SYNC_SCRIPT.read_text(encoding="utf-8-sig")
    restart_function = script[script.index("function Restart-EmployeeServices"):script.index("function Write-RecoveryInstructions")]
    backup_failure = script.index("if (-not $backupResult.Success)")
    exit_seven = script.index("exit 7", backup_failure)
    failure_block = script[backup_failure:exit_seven]

    assert '"start-backend.ps1"' in restart_function
    assert '"start-frontend.ps1"' in restart_function
    assert "Invoke-EmployeeServiceScript" in restart_function
    assert "Restart-EmployeeServices" in failure_block
    assert "Success" in failure_block


def test_employee_sync_runs_schema_and_inventory_verification_before_start() -> None:
    script = SYNC_SCRIPT.read_text(encoding="utf-8-sig")

    migrate = script.index('"--migrate"')
    schema_check = script.index('"--check"', migrate)
    schema_verify = script.index('"scripts\\ops\\_verify_backup.py"')
    inventory_verify = script.index('"scripts\\ops\\check_inventory_integrity.py"')
    start = script.index('Write-Host "[start]')

    assert migrate < schema_check < schema_verify < inventory_verify < start
    assert '"--db-url"' in script[inventory_verify:start]
    assert "Write-RecoveryInstructions" in script[inventory_verify:start]
    assert "exit 8" in script[inventory_verify:start]


def test_employee_sync_uses_checked_alembic_commands_and_schema_patterns() -> None:
    script = SYNC_SCRIPT.read_text(encoding="utf-8-sig")

    assert '"--migrate"' in script
    assert '"--check"' in script
    assert "Invoke-CheckedExternalCommand" in script
    assert "failed=(\\d+)" not in script
    assert "$failedCount" not in script
    assert "\\\\alembic\\\\" in script
    assert "alembic\\.ini" in script
    assert "migration_type_compare\\.py" in script


def test_start_bat_checks_schema_read_only_before_starting_servers() -> None:
    script = START_BAT.read_text(encoding="utf-8-sig")
    command_lines = [line.strip() for line in script.splitlines() if line.strip().lower().startswith("py ")]

    assert "py bootstrap_db.py --check" in command_lines
    assert not any(
        option in line
        for line in command_lines
        for option in ("--all", "--schema", "--migrate")
    )
    check = script.index("py bootstrap_db.py --check")
    failure = script.index("if errorlevel 1", check)
    abort = script.index("exit /b 1", failure)
    failure_block = script[failure:abort]
    assert "py bootstrap_db.py --all" in failure_block
    assert script.index("start-backend.ps1") > abort
