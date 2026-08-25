from __future__ import annotations

import os
import shutil
import subprocess
import textwrap
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
SYNC_SCRIPT = ROOT / "scripts" / "dev" / "sync-to-employee.ps1"
AUTO_SYNC_SCRIPT = ROOT / "scripts" / "dev" / "auto-sync-to-employee.ps1"
DATA_SYNC_SCRIPT = ROOT / "scripts" / "dev" / "sync-from-employee-data.ps1"
CHECKED_COMMAND = ROOT / "scripts" / "dev" / "checked-command.ps1"
START_BAT = ROOT / "start.bat"
SCHEMA_HELPER = ROOT / "scripts" / "dev" / "ensure-schema-ready.ps1"
RUNTIME_SCRIPTS = (
    "resolve-server-profile.ps1",
    "ensure-schema-ready.ps1",
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
    _write(emp_root / "scripts" / "dev" / "checked-command.ps1", checked_command)
    for script_name in RUNTIME_SCRIPTS:
        _write(dev_root / "scripts" / "dev" / script_name, "# fake runtime script\n")
        _write(emp_root / "scripts" / "dev" / script_name, "# fake runtime script\n")
    _write(dev_root / "scripts" / "dev" / "checked-command.ps1", checked_command)
    _write(emp_root / "scripts" / "dev" / "checked-command.ps1", checked_command)
    for runtime_root in (dev_root, emp_root):
        _write(runtime_root / "scripts" / "runtime_paths.py", "# fake runtime paths\n")
    for bat_name in ("start.bat", "watch.bat", "stop.bat", "status.bat"):
        _write(dev_root / bat_name, "@exit /b 0\n")
        _write(emp_root / bat_name, "@exit /b 0\n")

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
            echo %source% | findstr /I /C:"backend" >nul
            if not errorlevel 1 exit /b %FAKE_BACKEND_DRYRUN_EXIT%
            echo %source% | findstr /I /C:"frontend" >nul
            if not errorlevel 1 exit /b %FAKE_FRONTEND_DRYRUN_EXIT%
            exit /b %FAKE_OPS_DRYRUN_EXIT%
            """
        ).lstrip(),
    )
    _write(
        fake_bin / "npm.cmd",
        textwrap.dedent(
            r"""
            @echo off
            >>"%SYNC_EVENT_LOG%" echo frontend-build
            if not "%FAKE_FRONTEND_BUILD_EXIT%"=="0" exit /b %FAKE_FRONTEND_BUILD_EXIT%
            if not exist ".next-prod" mkdir ".next-prod"
            >".next-prod\BUILD_ID" echo fake-build
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
            "FAKE_FRONTEND_BUILD_EXIT": "0",
            "FAKE_BACKEND_DRYRUN_EXIT": "0",
            "FAKE_FRONTEND_DRYRUN_EXIT": "0",
            "FAKE_OPS_DRYRUN_EXIT": "0",
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


def _run_sync(
    sync_path: Path, environment: dict[str, str], *arguments: str
) -> subprocess.CompletedProcess[str]:
    powershell = shutil.which("powershell.exe")
    if powershell is None:
        pytest.skip("Windows PowerShell is required")
    return subprocess.run(
        [
            powershell,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(sync_path),
            *(arguments or ("-Force",)),
        ],
        cwd=sync_path.parent,
        env=environment,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )


def _event_kinds(event_log: Path) -> list[str]:
    return [line.split(":", 1)[0] for line in event_log.read_text(encoding="utf-8-sig").splitlines()]


def _fake_data_backup_tool() -> str:
    return textwrap.dedent(
        """
        import os
        import shutil
        import sys
        from pathlib import Path

        source = Path(sys.argv[sys.argv.index("--sqlite") + 1]).resolve()
        source_db = Path(os.environ["FAKE_SOURCE_DB"]).resolve()
        event = "snapshot-source" if source == source_db else "backup-target"
        with Path(os.environ["SYNC_EVENT_LOG"]).open("a", encoding="utf-8") as handle:
            handle.write(f"{event}\\n")
        failure = "FAKE_SOURCE_BACKUP_EXIT" if event == "snapshot-source" else "FAKE_TARGET_BACKUP_EXIT"
        exit_code = int(os.environ.get(failure, "0"))
        if exit_code:
            raise SystemExit(exit_code)
        backup_dir = Path(os.environ["MES_RUNTIME_ROOT"]) / "backups" / "sqlite"
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup = backup_dir / f"mes_{event}_fake.db"
        shutil.copyfile(source, backup)
        print(f"BACKUP_PATH={backup.resolve()}")
        """
    )


def _fake_data_bootstrap_tool() -> str:
    return textwrap.dedent(
        """
        import os
        import sys
        from pathlib import Path

        mode = sys.argv[1]
        database = Path(os.environ["DATABASE_URL"].removeprefix("sqlite:///") ).resolve()
        target = Path(os.environ["FAKE_TARGET_DB"]).resolve()
        event = "migrate-stage" if mode == "--migrate" else "check-post" if database == target else "check-stage"
        with Path(os.environ["SYNC_EVENT_LOG"]).open("a", encoding="utf-8") as handle:
            handle.write(f"{event}\\n")
        exit_name = (
            "FAKE_MIGRATE_EXIT"
            if mode == "--migrate"
            else "FAKE_POST_CHECK_EXIT"
            if database == target
            else "FAKE_STAGE_CHECK_EXIT"
        )
        exit_code = int(os.environ.get(exit_name, "0"))
        if exit_code:
            raise SystemExit(exit_code)
        if mode == "--migrate":
            with database.open("ab") as handle:
                handle.write(b"|migrated")
        """
    )


def _fake_data_verify_tool(event_prefix: str) -> str:
    return textwrap.dedent(
        f"""
        import os
        import sys
        from pathlib import Path

        candidate = Path(sys.argv[-1].removeprefix("sqlite:///" )).resolve()
        target = Path(os.environ["FAKE_TARGET_DB"]).resolve()
        phase = "post" if candidate == target else "stage"
        event = f"{{phase}}-{event_prefix}"
        with Path(os.environ["SYNC_EVENT_LOG"]).open("a", encoding="utf-8") as handle:
            handle.write(f"{{event}}\\n")
        is_inventory = "{event_prefix}" == "inventory"
        exit_name = (
            "FAKE_POST_INVENTORY_EXIT"
            if phase == "post" and is_inventory
            else "FAKE_STAGE_INVENTORY_EXIT"
            if is_inventory
            else "FAKE_POST_VERIFY_EXIT"
            if phase == "post"
            else "FAKE_STAGE_VERIFY_EXIT"
        )
        raise SystemExit(int(os.environ.get(exit_name, "0")))
        """
    )


def _fake_data_restore_tool() -> str:
    return textwrap.dedent(
        """
        import os
        import shutil
        import sys
        from pathlib import Path

        source = Path(sys.argv[sys.argv.index("--sqlite") + 1]).resolve()
        target = Path(sys.argv[sys.argv.index("--target") + 1]).resolve()
        real_target = Path(os.environ["FAKE_TARGET_DB"]).resolve()
        preparing = target != real_target
        target_changed = not preparing and os.environ.get("FAKE_TARGET_CHANGED_AFTER_BACKUP") == "1"
        rollback = (
            not preparing
            and not target_changed
            and source.read_bytes().startswith(b"development-original")
        )
        event = "prepare-stage" if preparing else "rollback-target" if rollback else "install-stage"
        with Path(os.environ["SYNC_EVENT_LOG"]).open("a", encoding="utf-8") as handle:
            handle.write(f"{event}\\n")
        if target_changed:
            if os.environ.get("FAKE_CANDIDATE_MISSING") == "1":
                source.unlink()
            target.write_bytes(b"development-newer")
            print("RESTORE_RESULT=TARGET_CHANGED_AFTER_ROLLBACK", file=sys.stderr)
            raise SystemExit(3)
        exit_name = (
            "FAKE_PREPARE_EXIT" if preparing else "FAKE_ROLLBACK_EXIT" if rollback else "FAKE_INSTALL_EXIT"
        )
        exit_code = int(os.environ.get(exit_name, "0"))
        if exit_code:
            if not rollback:
                target.write_bytes(b"partial-install")
            raise SystemExit(exit_code)
        shutil.copyfile(source, target)
        """
    )


def _prepare_data_sync_sandbox(
    tmp_path: Path, overrides: dict[str, str]
) -> tuple[Path, dict[str, str], Path, Path, Path]:
    dev_root = tmp_path / "dev"
    employee_root = tmp_path / "employee"
    event_log = tmp_path / "data-sync-events.log"
    source_db = employee_root / "backend" / "mes.db"
    target_db = dev_root / "backend" / "mes.db"

    for directory in (
        dev_root / "backend",
        dev_root / "scripts" / "dev",
        dev_root / "scripts" / "ops",
        employee_root / "backend",
    ):
        directory.mkdir(parents=True, exist_ok=True)
    source_db.write_bytes(b"employee-source")
    target_db.write_bytes(b"development-original")

    checked_command = CHECKED_COMMAND.read_text(encoding="utf-8") + textwrap.dedent(
        """

        function Test-TcpPortFree {
            param([int] $Port)
            return [int] $env:FAKE_PORTS_FREE -eq 1
        }

        function Start-Sleep {
            param([int] $Milliseconds)
        }

        function Invoke-WebRequest {
            param(
                [string] $Uri,
                [int] $TimeoutSec,
                [switch] $UseBasicParsing,
                [string] $ErrorAction
            )
            if ([int] $env:FAKE_HEALTH_EXIT -ne 0) { throw "fake health failure" }
            return [pscustomobject] @{ StatusCode = 200 }
        }
        """
    )
    _write(dev_root / "scripts" / "dev" / "checked-command.ps1", checked_command)
    for script_name, content in {
        "stop-backend.ps1": _fake_service_script("stop-backend", "FAKE_STOP_BACKEND_EXIT"),
        "stop-frontend.ps1": _fake_service_script("stop-frontend", "FAKE_STOP_FRONTEND_EXIT"),
        "start-backend.ps1": _fake_service_script("start-backend", "FAKE_START_BACKEND_EXIT"),
        "start-frontend.ps1": _fake_service_script("start-frontend", "FAKE_START_FRONTEND_EXIT"),
    }.items():
        _write(dev_root / "scripts" / "dev" / script_name, content)
    _write(dev_root / "scripts" / "ops" / "backup_db.py", _fake_data_backup_tool())
    _write(dev_root / "scripts" / "ops" / "restore_db.py", _fake_data_restore_tool())
    _write(dev_root / "scripts" / "ops" / "_verify_backup.py", _fake_data_verify_tool("sqlite-fk"))
    _write(
        dev_root / "scripts" / "ops" / "check_inventory_integrity.py",
        _fake_data_verify_tool("inventory"),
    )
    _write(dev_root / "backend" / "bootstrap_db.py", _fake_data_bootstrap_tool())

    script_copy = DATA_SYNC_SCRIPT.read_text(encoding="utf-8-sig")
    script_copy = script_copy.replace('$DevRoot = "C:\\ERP"', f'$DevRoot = "{dev_root.as_posix()}"')
    script_copy = script_copy.replace(
        '$EmployeeRoot = "C:\\ERP-dev"', f'$EmployeeRoot = "{employee_root.as_posix()}"'
    )
    assert '$DevRoot = "C:\\ERP"' not in script_copy
    assert '$EmployeeRoot = "C:\\ERP-dev"' not in script_copy
    sync_path = tmp_path / "data-sync-under-test.ps1"
    sync_path.write_text(script_copy, encoding="utf-8-sig")

    environment = os.environ.copy()
    environment.update(
        {
            "SYNC_EVENT_LOG": str(event_log),
            "FAKE_SOURCE_DB": str(source_db),
            "FAKE_TARGET_DB": str(target_db),
            "FAKE_SOURCE_BACKUP_EXIT": "0",
            "FAKE_TARGET_BACKUP_EXIT": "0",
            "FAKE_MIGRATE_EXIT": "0",
            "FAKE_STAGE_CHECK_EXIT": "0",
            "FAKE_STAGE_VERIFY_EXIT": "0",
            "FAKE_STAGE_INVENTORY_EXIT": "0",
            "FAKE_POST_VERIFY_EXIT": "0",
            "FAKE_POST_INVENTORY_EXIT": "0",
            "FAKE_POST_CHECK_EXIT": "0",
            "FAKE_INSTALL_EXIT": "0",
            "FAKE_PREPARE_EXIT": "0",
            "FAKE_ROLLBACK_EXIT": "0",
            "FAKE_STOP_BACKEND_EXIT": "0",
            "FAKE_STOP_FRONTEND_EXIT": "0",
            "FAKE_START_BACKEND_EXIT": "0",
            "FAKE_START_FRONTEND_EXIT": "0",
            "FAKE_HEALTH_EXIT": "0",
            "FAKE_PORTS_FREE": "1",
            "FAKE_TARGET_CHANGED_AFTER_BACKUP": "0",
            "FAKE_CANDIDATE_MISSING": "0",
        }
    )
    environment.update(overrides)
    return sync_path, environment, event_log, source_db, target_db


def _run_data_sync(
    sync_path: Path, environment: dict[str, str], *arguments: str
) -> subprocess.CompletedProcess[str]:
    powershell = shutil.which("powershell.exe")
    if powershell is None:
        pytest.skip("Windows PowerShell is required")
    return subprocess.run(
        [powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(sync_path), *arguments],
        cwd=sync_path.parent,
        env=environment,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )


def _prepare_auto_sync_sandbox(
    tmp_path: Path, *, dry_run_exit: int, changes: int
) -> tuple[Path, dict[str, str], Path]:
    event_log = tmp_path / "auto-sync-events.log"
    fake_shell = tmp_path / "fake-powershell.cmd"
    _write(
        fake_shell,
        textwrap.dedent(
            f"""
            @echo off
            >>"%SYNC_EVENT_LOG%" echo %*
            echo %* | findstr /C:"-DryRun" >nul
            if not errorlevel 1 (
              echo SYNC_CHANGES={changes}
              exit /b {dry_run_exit}
            )
            echo APPLY_CALLED=1
            exit /b 0
            """
        ).lstrip(),
    )
    script_copy = AUTO_SYNC_SCRIPT.read_text(encoding="utf-8-sig")
    script_copy = script_copy.replace('$RepoRoot = "C:\\ERP"', f'$RepoRoot = "{tmp_path.as_posix()}"')
    script_copy = script_copy.replace("& powershell.exe", "& $env:FAKE_POWERSHELL")
    sync_path = tmp_path / "auto-sync-under-test.ps1"
    sync_path.write_text(script_copy, encoding="utf-8-sig")
    environment = os.environ.copy()
    environment.update({"SYNC_EVENT_LOG": str(event_log), "FAKE_POWERSHELL": str(fake_shell)})
    return sync_path, environment, event_log


def _run_auto_sync(sync_path: Path, environment: dict[str, str]) -> subprocess.CompletedProcess[str]:
    powershell = shutil.which("powershell.exe")
    if powershell is None:
        pytest.skip("Windows PowerShell is required")
    return subprocess.run(
        [powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(sync_path)],
        cwd=sync_path.parent,
        env=environment,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )


def test_employee_data_sync_defaults_to_verified_dry_run_without_target_mutation(tmp_path: Path) -> None:
    sync_path, environment, event_log, source_db, target_db = _prepare_data_sync_sandbox(tmp_path, {})
    original_source = source_db.read_bytes()
    original_target = target_db.read_bytes()

    result = _run_data_sync(sync_path, environment)
    output = result.stdout + result.stderr

    assert result.returncode == 0, output
    assert _event_kinds(event_log) == [
        "snapshot-source",
        "prepare-stage",
        "migrate-stage",
        "check-stage",
        "stage-sqlite-fk",
        "stage-inventory",
    ]
    assert source_db.read_bytes() == original_source
    assert target_db.read_bytes() == original_target
    assert "SYNC_DATA_MODE=DRY_RUN" in output
    assert "SYNC_DATA_RESULT=VERIFIED" in output
    assert not list((sync_path.parent / "dev" / "_attic" / "runtime" / "employee-data-sync" / "staging").glob("*.db"))


def test_employee_data_sync_rejects_apply_and_dry_run_together(tmp_path: Path) -> None:
    sync_path, environment, event_log, source_db, target_db = _prepare_data_sync_sandbox(tmp_path, {})
    original_source = source_db.read_bytes()
    original_target = target_db.read_bytes()

    result = _run_data_sync(sync_path, environment, "-Apply", "-DryRun")

    assert result.returncode == 2, result.stdout + result.stderr
    assert not event_log.exists()
    assert source_db.read_bytes() == original_source
    assert target_db.read_bytes() == original_target


@pytest.mark.parametrize(
    ("overrides", "last_event"),
    [
        ({"FAKE_SOURCE_BACKUP_EXIT": "11"}, "snapshot-source"),
        ({"FAKE_PREPARE_EXIT": "12"}, "prepare-stage"),
        ({"FAKE_MIGRATE_EXIT": "12"}, "migrate-stage"),
        ({"FAKE_STAGE_CHECK_EXIT": "13"}, "check-stage"),
        ({"FAKE_STAGE_VERIFY_EXIT": "14"}, "stage-sqlite-fk"),
        ({"FAKE_STAGE_INVENTORY_EXIT": "15"}, "stage-inventory"),
    ],
)
def test_employee_data_sync_preflight_failure_never_backs_up_or_installs_target(
    tmp_path: Path, overrides: dict[str, str], last_event: str
) -> None:
    sync_path, environment, event_log, source_db, target_db = _prepare_data_sync_sandbox(
        tmp_path, overrides
    )
    original_source = source_db.read_bytes()
    original_target = target_db.read_bytes()

    result = _run_data_sync(sync_path, environment, "-Apply")
    events = _event_kinds(event_log)

    assert result.returncode != 0, result.stdout + result.stderr
    assert events[-1] == last_event
    assert "backup-target" not in events
    assert "stop-backend" not in events
    assert "install-stage" not in events
    assert source_db.read_bytes() == original_source
    assert target_db.read_bytes() == original_target


def test_employee_data_sync_target_backup_failure_does_not_stop_or_install(tmp_path: Path) -> None:
    sync_path, environment, event_log, source_db, target_db = _prepare_data_sync_sandbox(
        tmp_path, {"FAKE_TARGET_BACKUP_EXIT": "15"}
    )
    original_source = source_db.read_bytes()
    original_target = target_db.read_bytes()

    result = _run_data_sync(sync_path, environment, "-Apply")
    events = _event_kinds(event_log)

    assert result.returncode != 0, result.stdout + result.stderr
    assert events[-1] == "backup-target"
    assert "stop-backend" not in events
    assert "install-stage" not in events
    assert source_db.read_bytes() == original_source
    assert target_db.read_bytes() == original_target


@pytest.mark.parametrize(
    "overrides",
    [
        {"FAKE_STOP_BACKEND_EXIT": "19"},
        {"FAKE_STOP_FRONTEND_EXIT": "19"},
        {"FAKE_PORTS_FREE": "0"},
    ],
)
def test_employee_data_sync_stop_or_port_failure_keeps_target_and_restarts(
    tmp_path: Path, overrides: dict[str, str]
) -> None:
    sync_path, environment, event_log, source_db, target_db = _prepare_data_sync_sandbox(
        tmp_path, overrides
    )
    original_source = source_db.read_bytes()
    original_target = target_db.read_bytes()

    result = _run_data_sync(sync_path, environment, "-Apply")
    events = _event_kinds(event_log)

    assert result.returncode != 0, result.stdout + result.stderr
    assert "install-stage" not in events
    assert events[-4:] == ["stop-backend", "stop-frontend", "start-backend", "start-frontend"]
    assert source_db.read_bytes() == original_source
    assert target_db.read_bytes() == original_target
    assert "SYNC_DATA_RECOVERY=NOT_NEEDED" in result.stdout


def test_employee_data_sync_install_failure_rolls_back_and_restarts(tmp_path: Path) -> None:
    sync_path, environment, event_log, source_db, target_db = _prepare_data_sync_sandbox(
        tmp_path, {"FAKE_INSTALL_EXIT": "16"}
    )
    original_source = source_db.read_bytes()
    original_target = target_db.read_bytes()

    result = _run_data_sync(sync_path, environment, "-Apply")
    events = _event_kinds(event_log)
    output = result.stdout + result.stderr

    assert result.returncode != 0, output
    assert events[-6:] == [
        "stop-backend",
        "stop-frontend",
        "install-stage",
        "rollback-target",
        "start-backend",
        "start-frontend",
    ]
    assert source_db.read_bytes() == original_source
    assert target_db.read_bytes() == original_target
    assert "SYNC_DATA_RECOVERY=SUCCESS" in output
    assert "SYNC_DATA_BACKUP=" in output


@pytest.mark.parametrize(
    "failure_override",
    [
        {"FAKE_INSTALL_EXIT": "16"},
        {"FAKE_CANDIDATE_MISSING": "1"},
    ],
)
def test_employee_data_sync_target_change_after_backup_never_installs_stale_rollback(
    tmp_path: Path, failure_override: dict[str, str]
) -> None:
    overrides = {"FAKE_TARGET_CHANGED_AFTER_BACKUP": "1", **failure_override}
    sync_path, environment, event_log, source_db, target_db = _prepare_data_sync_sandbox(
        tmp_path, overrides
    )
    original_source = source_db.read_bytes()

    result = _run_data_sync(sync_path, environment, "-Apply")
    events = _event_kinds(event_log)

    assert result.returncode == 15, result.stdout + result.stderr
    assert "install-stage" in events
    assert "rollback-target" not in events
    assert events[-2:] == ["start-backend", "start-frontend"]
    assert source_db.read_bytes() == original_source
    assert target_db.read_bytes() == b"development-newer"
    assert "SYNC_DATA_RESULT=TARGET_CHANGED_AFTER_BACKUP" in result.stdout
    assert "SYNC_DATA_RECOVERY=NOT_NEEDED" in result.stdout


def test_employee_data_sync_postcheck_failure_rolls_back_and_restarts(tmp_path: Path) -> None:
    sync_path, environment, event_log, source_db, target_db = _prepare_data_sync_sandbox(
        tmp_path, {"FAKE_POST_VERIFY_EXIT": "17"}
    )
    original_source = source_db.read_bytes()
    original_target = target_db.read_bytes()

    result = _run_data_sync(sync_path, environment, "-Apply")
    events = _event_kinds(event_log)

    assert result.returncode != 0, result.stdout + result.stderr
    assert events[-6:] == [
        "install-stage",
        "check-post",
        "post-sqlite-fk",
        "rollback-target",
        "start-backend",
        "start-frontend",
    ]
    assert source_db.read_bytes() == original_source
    assert target_db.read_bytes() == original_target
    assert "SYNC_DATA_RECOVERY=SUCCESS" in result.stdout


def test_employee_data_sync_health_failure_rolls_back_and_restarts_again(tmp_path: Path) -> None:
    sync_path, environment, event_log, source_db, target_db = _prepare_data_sync_sandbox(
        tmp_path, {"FAKE_HEALTH_EXIT": "18"}
    )
    original_source = source_db.read_bytes()
    original_target = target_db.read_bytes()

    result = _run_data_sync(sync_path, environment, "-Apply")
    events = _event_kinds(event_log)

    assert result.returncode != 0, result.stdout + result.stderr
    assert events.count("start-backend") == 2
    assert events.count("start-frontend") == 2
    assert events[-5:] == [
        "stop-backend",
        "stop-frontend",
        "rollback-target",
        "start-backend",
        "start-frontend",
    ]
    assert source_db.read_bytes() == original_source
    assert target_db.read_bytes() == original_target
    assert "SYNC_DATA_RECOVERY_HEALTH=FAILED" in result.stdout


@pytest.mark.parametrize(
    "overrides",
    [
        {"FAKE_START_BACKEND_EXIT": "20"},
        {"FAKE_START_FRONTEND_EXIT": "21"},
    ],
)
def test_employee_data_sync_start_failure_rolls_back_and_restarts_again(
    tmp_path: Path, overrides: dict[str, str]
) -> None:
    sync_path, environment, event_log, source_db, target_db = _prepare_data_sync_sandbox(
        tmp_path, overrides
    )
    original_source = source_db.read_bytes()
    original_target = target_db.read_bytes()

    result = _run_data_sync(sync_path, environment, "-Apply")
    events = _event_kinds(event_log)

    assert result.returncode != 0, result.stdout + result.stderr
    assert events.count("start-backend") == 2
    assert events.count("start-frontend") == 2
    assert "rollback-target" in events
    assert source_db.read_bytes() == original_source
    assert target_db.read_bytes() == original_target
    assert "SYNC_DATA_RESULT=START_FAILED" in result.stdout


def test_employee_data_sync_apply_success_uses_safe_order_and_preserves_source(tmp_path: Path) -> None:
    sync_path, environment, event_log, source_db, target_db = _prepare_data_sync_sandbox(tmp_path, {})
    original_source = source_db.read_bytes()

    result = _run_data_sync(sync_path, environment, "-Apply")

    assert result.returncode == 0, result.stdout + result.stderr
    assert _event_kinds(event_log) == [
        "snapshot-source",
        "prepare-stage",
        "migrate-stage",
        "check-stage",
        "stage-sqlite-fk",
        "stage-inventory",
        "backup-target",
        "stop-backend",
        "stop-frontend",
        "install-stage",
        "check-post",
        "post-sqlite-fk",
        "post-inventory",
        "start-backend",
        "start-frontend",
    ]
    assert source_db.read_bytes() == original_source
    assert target_db.read_bytes() == b"employee-source|migrated"
    assert not list((sync_path.parent / "dev" / "_attic" / "runtime" / "employee-data-sync" / "staging").glob("*.db"))
    assert "SYNC_DATA_RESULT=APPLIED" in result.stdout
    assert "SYNC_DATA_HEALTH=OK" in result.stdout


def test_employee_data_sync_uses_online_backup_and_never_raw_copies_source() -> None:
    script = DATA_SYNC_SCRIPT.read_text(encoding="utf-8-sig")

    assert '"scripts\\ops\\backup_db.py"' in script
    assert '-Database $EmployeeDb' in script
    assert '-IntegrityOnly' in script
    assert '-SourceIntegrityOnly' in script
    assert 'Copy-Item -LiteralPath $EmployeeDb' not in script
    assert 'Copy-Item $EmployeeDb' not in script
    assert '"--label"' not in script
    assert '"--preverified-rollback"' in script
    assert "finally" in script[script.rindex("try {") :]


def test_code_sync_dry_run_reports_machine_readable_no_change(tmp_path: Path) -> None:
    sync_path, environment, _ = _prepare_sync_sandbox(tmp_path, {})

    result = _run_sync(sync_path, environment, "-Force", "-DryRun")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "SYNC_CHANGES=0" in result.stdout


@pytest.mark.parametrize(
    "overrides",
    [
        {"FAKE_BACKEND_DRYRUN_EXIT": "1"},
        {"FAKE_FRONTEND_DRYRUN_EXIT": "1"},
    ],
)
def test_code_sync_dry_run_reports_machine_readable_change(
    tmp_path: Path, overrides: dict[str, str]
) -> None:
    sync_path, environment, _ = _prepare_sync_sandbox(
        tmp_path, overrides
    )

    result = _run_sync(sync_path, environment, "-Force", "-DryRun")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "SYNC_CHANGES=1" in result.stdout


def test_code_sync_dry_run_reports_comparison_error_without_apply(tmp_path: Path) -> None:
    sync_path, environment, event_log = _prepare_sync_sandbox(
        tmp_path, {"FAKE_FRONTEND_DRYRUN_EXIT": "8"}
    )

    result = _run_sync(sync_path, environment, "-Force", "-DryRun")

    assert result.returncode == 4, result.stdout + result.stderr
    assert "SYNC_CHANGES=ERROR" in result.stdout
    assert "robocopy-sync" not in _event_kinds(event_log)


def test_automatic_sync_skips_apply_when_dry_run_reports_no_changes(tmp_path: Path) -> None:
    sync_path, environment, event_log = _prepare_auto_sync_sandbox(
        tmp_path, dry_run_exit=0, changes=0
    )

    result = _run_auto_sync(sync_path, environment)

    assert result.returncode == 0, result.stdout + result.stderr
    assert len(event_log.read_text(encoding="utf-8-sig").splitlines()) == 1
    assert "AUTO_SYNC_RESULT=NO_CHANGES" in result.stdout


def test_automatic_sync_applies_only_when_dry_run_reports_changes(tmp_path: Path) -> None:
    sync_path, environment, event_log = _prepare_auto_sync_sandbox(
        tmp_path, dry_run_exit=0, changes=1
    )

    result = _run_auto_sync(sync_path, environment)

    assert result.returncode == 0, result.stdout + result.stderr
    assert len(event_log.read_text(encoding="utf-8-sig").splitlines()) == 2
    assert "APPLY_CALLED=1" in result.stdout


def test_automatic_sync_preserves_activity_guard_exit_two_without_apply(tmp_path: Path) -> None:
    sync_path, environment, event_log = _prepare_auto_sync_sandbox(
        tmp_path, dry_run_exit=2, changes=1
    )

    result = _run_auto_sync(sync_path, environment)

    assert result.returncode == 2, result.stdout + result.stderr
    assert len(event_log.read_text(encoding="utf-8-sig").splitlines()) == 1
    assert "APPLY_CALLED=1" not in result.stdout


def test_automatic_sync_preserves_schema_ready_exit_three_with_auto_schema(tmp_path: Path) -> None:
    sync_path, environment, event_log = _prepare_auto_sync_sandbox(
        tmp_path, dry_run_exit=3, changes=1
    )

    result = _run_auto_sync(sync_path, environment)
    events = event_log.read_text(encoding="utf-8-sig").splitlines()

    assert result.returncode == 0, result.stdout + result.stderr
    assert len(events) == 2
    assert "-AutoSchema" in events[-1]
    assert "-Force" not in events[-1]


def test_automatic_sync_propagates_dry_run_error_without_apply(tmp_path: Path) -> None:
    sync_path, environment, event_log = _prepare_auto_sync_sandbox(
        tmp_path, dry_run_exit=4, changes=1
    )

    result = _run_auto_sync(sync_path, environment)

    assert result.returncode == 4, result.stdout + result.stderr
    assert len(event_log.read_text(encoding="utf-8-sig").splitlines()) == 1
    assert "APPLY_CALLED=1" not in result.stdout


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


def test_employee_sync_frontend_build_failure_restores_services_before_backend_sync(tmp_path: Path) -> None:
    sync_path, environment, event_log = _prepare_sync_sandbox(
        tmp_path, {"FAKE_FRONTEND_BUILD_EXIT": "16"}
    )

    result = _run_sync(sync_path, environment)
    events = _event_kinds(event_log)

    assert result.returncode == 9, result.stdout + result.stderr
    assert events == [
        "robocopy-dryrun",
        "stop-backend",
        "stop-frontend",
        "backup",
        "robocopy-sync",
        "frontend-build",
        "start-backend",
        "start-frontend",
    ]
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
        "frontend-build",
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
        "frontend-build",
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
    schema_verify = script.index('$verifyTool = Join-Path $EmpRoot "scripts\\ops\\_verify_backup.py"')
    inventory_verify = script.index('$inventoryVerifyTool = Join-Path $EmpRoot "scripts\\ops\\check_inventory_integrity.py"')
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


def test_employee_sync_excludes_local_test_and_build_caches() -> None:
    script = SYNC_SCRIPT.read_text(encoding="utf-8-sig")

    dry_run_backend = script[script.index("$backendDryRun"):script.index("$schemaHits")]
    dry_run_frontend = script[script.index("$frontendDryRun"):script.index("$env:MES_RUNTIME_ROOT")]
    sync_frontend_start = script.index('robocopy "$DevRoot\\frontend" $EmpFrontend /MIR')
    sync_backend_start = script.index('robocopy "$DevRoot\\backend" $EmpBackend /MIR')
    sync_frontend = script[sync_frontend_start:sync_backend_start]
    sync_backend = script[sync_backend_start:script.index("# ---------------------------------------------------------------\n# 6)", sync_backend_start)]

    for backend_copy in (dry_run_backend, sync_backend):
        assert "/XD __pycache__ .git .venv data logs .pytest_cache .ruff_cache _backup" in backend_copy
        assert '".testmondata"' in backend_copy
        assert '".testmondata-*"' in backend_copy

    for frontend_copy in (dry_run_frontend, sync_frontend):
        assert '"tsconfig.tsbuildinfo"' in frontend_copy


def test_employee_sync_auto_schema_preflight_runs_before_stopping_services() -> None:
    script = SYNC_SCRIPT.read_text(encoding="utf-8-sig")

    assert "[switch] $AutoSchema" in script
    preflight = script.index("employee_schema_preflight.py")
    stop = script.index('Write-Host "[stop] 직원 서버 정지 중..."')
    assert preflight < stop
    assert "--source-migrations" in script[preflight:stop]
    assert "--target-migrations" in script[preflight:stop]
    assert "exit 9" in script[preflight:stop]


def test_automatic_sync_uses_dry_run_and_never_blocks_on_source_git_state() -> None:
    script = AUTO_SYNC_SCRIPT.read_text(encoding="utf-8-sig")

    assert "-DryRun" in script
    assert "-AutoSchema" in script
    assert "git status --porcelain" not in script
    assert "git rev-list" not in script
    assert "@{u}" not in script
    assert "-Force" not in script
    assert "return [int] $LASTEXITCODE" not in script
    assert "$script:EmployeeSyncExit" in script
    assert "| Out-Host" in script


def test_start_bat_delegates_read_only_schema_check_before_servers() -> None:
    script = START_BAT.read_text(encoding="utf-8-sig")
    helper = SCHEMA_HELPER.read_text(encoding="utf-8-sig")
    command_lines = [line.strip() for line in script.splitlines() if line.strip().lower().startswith("py ")]

    assert "ensure-schema-ready.ps1" in script
    assert "-Mode Start" in script
    assert not any(
        option in line
        for line in command_lines
        for option in ("--all", "--schema", "--migrate")
    )
    readiness = script.index("ensure-schema-ready.ps1")
    failure = script.index("SCHEMA_EXIT", readiness)
    abort = script.index("exit /b %SCHEMA_EXIT%", failure)
    failure_block = script[failure:abort]
    assert "schema readiness" in failure_block.lower()
    assert script.index("start-backend.ps1") > abort

    assert "bootstrap_db.py" in helper
    assert '"--check"' in helper
    assert "ready=True" in helper
    assert "ready=False" in helper
    for forbidden in (
        "--migrate",
        "stop-servers.ps1",
        "backup_db.py",
        "restore_db.py",
        "_verify_backup.py",
        "check_inventory_integrity.py",
        "Read-Host",
        "mes.db",
    ):
        assert forbidden not in helper
