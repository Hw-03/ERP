"""Contracts for the opt-in frontend Windows crash-dump tools."""

from __future__ import annotations

from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile
import textwrap
from datetime import datetime, timezone

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
DEV_SCRIPTS = REPO_ROOT / "scripts" / "dev"
ENABLE_SCRIPT = DEV_SCRIPTS / "enable-frontend-crash-dumps.ps1"
DISABLE_SCRIPT = DEV_SCRIPTS / "disable-frontend-crash-dumps.ps1"
ANALYZE_SCRIPT = DEV_SCRIPTS / "analyze-frontend-crash-dump.ps1"
ATTRIBUTION_SCRIPT = DEV_SCRIPTS / "get-frontend-stop-attribution.ps1"

REGISTRY_KEY = (
    r"HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting"
    r"\LocalDumps\node.exe"
)
DUMP_FOLDER = r"C:\ERP\_attic\runtime\logs\frontend\crashdumps"
MARKER_ROOT = r"C:\ProgramData\DEXCOWIN MES\CrashDumps"


def read_script(path: Path) -> str:
    """Read a PowerShell script as UTF-8."""
    return path.read_text(encoding="utf-8")


def test_enable_configures_only_node_minidumps_with_bounded_retention() -> None:
    """The opt-in registry contract is app-specific, minimal, and bounded."""
    script = read_script(ENABLE_SCRIPT)

    assert "SupportsShouldProcess" in script
    assert "ShouldProcess" in script
    assert REGISTRY_KEY in script
    assert DUMP_FOLDER in script
    assert MARKER_ROOT in script
    assert 'New-ItemProperty -Name "DumpType"' in script
    assert 'New-ItemProperty -Name "DumpCount"' in script
    assert '-Value 1' in script
    assert '-Value 3' in script
    assert 'New-ItemProperty -Name "DumpFolder"' in script
    assert "existing node.exe LocalDumps configuration" in script
    assert "Test-Administrator" in script


def test_disable_requires_owned_marker_and_exact_registry_values() -> None:
    """Removal cannot delete a WER configuration the project does not own."""
    script = read_script(DISABLE_SCRIPT)

    assert "SupportsShouldProcess" in script
    assert "ShouldProcess" in script
    assert REGISTRY_KEY in script
    assert DUMP_FOLDER in script
    assert MARKER_ROOT in script
    assert "ConvertFrom-Json" in script
    assert "Refusing removal" in script
    assert "DumpType" in script
    assert "DumpCount" in script
    assert "DumpFolder" in script
    assert "Remove-Item -LiteralPath $RegistryKey" in script
    assert "Remove-Item -LiteralPath $DumpFolder" not in script


@pytest.mark.skipif(shutil.which("powershell.exe") is None, reason="requires Windows PowerShell")
@pytest.mark.parametrize("script_path", [ENABLE_SCRIPT, DISABLE_SCRIPT])
def test_configuration_scripts_parse_in_windows_powershell(script_path: Path) -> None:
    """Both administrative entry points remain compatible with PowerShell 5.1."""
    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-Command",
            "$errors=$null; [void][System.Management.Automation.Language.Parser]::ParseFile("
            f"'{script_path}', [ref]$null, [ref]$errors); "
            "if ($errors.Count) { $errors | ForEach-Object { $_.Message }; exit 1 }",
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )

    assert result.returncode == 0, result.stderr or result.stdout


@pytest.mark.skipif(shutil.which("powershell.exe") is None, reason="requires Windows PowerShell")
def test_enable_whatif_does_not_require_elevation_or_create_artifacts() -> None:
    """Dry-run is usable before elevation and keeps all mutations behind ShouldProcess."""
    with tempfile.TemporaryDirectory() as temporary_directory:
        wrapper = Path(temporary_directory) / "run-enable-whatif.ps1"
        wrapper.write_text(
            textwrap.dedent(
                """\
                function Test-Path {
                    param([string] $LiteralPath)
                    return $false
                }
                function New-Item { throw "New-Item must not run during -WhatIf" }
                function New-ItemProperty { throw "New-ItemProperty must not run during -WhatIf" }
                function Set-Content { throw "Set-Content must not run during -WhatIf" }
                function Remove-Item { throw "Remove-Item must not run during -WhatIf" }

                . $env:ENABLE_CRASH_DUMPS_SCRIPT -WhatIf
                exit 0
                """
            ),
            encoding="utf-8",
        )
        result = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(wrapper),
            ],
            cwd=REPO_ROOT,
            env={**os.environ, "ENABLE_CRASH_DUMPS_SCRIPT": str(ENABLE_SCRIPT)},
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

    assert result.returncode == 0, result.stderr or result.stdout
    assert "What if" in result.stdout or "가상" in result.stdout


@pytest.mark.skipif(shutil.which("powershell.exe") is None, reason="requires Windows PowerShell")
def test_disable_whatif_preserves_owned_live_configuration_and_dumps() -> None:
    """Dry-run removal leaves the marked registry key, marker, and evidence unchanged."""
    marker = Path(MARKER_ROOT) / "dexcowin-mes-frontend-crash-dumps.json"
    dump_folder = Path(DUMP_FOLDER)
    if not marker.is_file():
        pytest.skip("the live host does not have the marked crash-dump configuration")

    marker_before = marker.read_bytes()
    dump_names_before = sorted(path.name for path in dump_folder.glob("*"))
    registry_before = subprocess.run(
        ["reg.exe", "query", REGISTRY_KEY.replace("HKLM:", "HKLM", 1)],
        capture_output=True,
        check=False,
    )
    assert registry_before.returncode == 0, registry_before.stderr.decode(errors="replace")

    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(DISABLE_SCRIPT),
            "-WhatIf",
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    registry_after = subprocess.run(
        ["reg.exe", "query", REGISTRY_KEY.replace("HKLM:", "HKLM", 1)],
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr or result.stdout
    assert "What if" in result.stdout or "가상" in result.stdout
    assert marker.read_bytes() == marker_before
    assert sorted(path.name for path in dump_folder.glob("*")) == dump_names_before
    assert registry_after.returncode == 0
    assert registry_after.stdout == registry_before.stdout


@pytest.mark.skipif(shutil.which("powershell.exe") is None, reason="requires Windows PowerShell")
def test_enable_refuses_owned_existing_configuration_without_mutation() -> None:
    """Setup refuses an existing node.exe policy even when invoked as a dry-run."""
    marker = Path(MARKER_ROOT) / "dexcowin-mes-frontend-crash-dumps.json"
    if not marker.is_file():
        pytest.skip("the live host does not have the marked crash-dump configuration")

    marker_before = marker.read_bytes()
    registry_before = subprocess.run(
        ["reg.exe", "query", REGISTRY_KEY.replace("HKLM:", "HKLM", 1)],
        capture_output=True,
        check=False,
    )
    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(ENABLE_SCRIPT),
            "-WhatIf",
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    registry_after = subprocess.run(
        ["reg.exe", "query", REGISTRY_KEY.replace("HKLM:", "HKLM", 1)],
        capture_output=True,
        check=False,
    )

    assert result.returncode != 0
    assert "existing node.exe LocalDumps configuration" in (result.stderr + result.stdout)
    assert marker.read_bytes() == marker_before
    assert registry_after.returncode == 0
    assert registry_after.stdout == registry_before.stdout


def run_attribution_with_dump(
    *,
    dump_pid: int | None,
    dump_utc: datetime | None,
    dump_last_write_utc: datetime | None = None,
    dump_bytes: bytes = b"minidump",
    node_reports: list[dict[str, object] | str] | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run the real attribution script with an isolated runtime and empty Sysmon."""
    powershell = shutil.which("powershell.exe")
    if powershell is None:
        pytest.skip("Windows PowerShell is required for this regression test")

    with tempfile.TemporaryDirectory() as temporary_directory:
        runtime_root = Path(temporary_directory)
        log_path = runtime_root / "logs" / "frontend" / "dev-server.log"
        log_path.parent.mkdir(parents=True)
        log_path.write_text(
            "\n".join(
                [
                    '[2026-08-20T01:00:00.000Z] NEXT_SIGNAL_PROBE_READY '
                    '{"readyAtUtc":"2026-08-20T01:00:00.000Z","targetPid":200,'
                    '"targetPpid":100,"port":"3001","uptimeMs":10,'
                    '"isNextPrivateWorker":false}',
                    '[2026-08-20T01:00:01.000Z] NEXT_SIGNAL_PROBE_READY '
                    '{"readyAtUtc":"2026-08-20T01:00:01.000Z","targetPid":300,'
                    '"targetPpid":200,"port":"3001","uptimeMs":12,'
                    '"isNextPrivateWorker":true}',
                    '[2026-08-20T01:02:03.000Z] NEXT_PROCESS_EXIT '
                    '{"exitAtUtc":"2026-08-20T01:02:03.000Z","exitCode":0,'
                    '"targetPid":200,"targetPpid":100,"port":"3001",'
                    '"uptimeMs":123000,"isNextPrivateWorker":false}',
                    "",
                ]
            ),
            encoding="utf-8",
        )
        if dump_pid is not None and dump_utc is not None:
            dump_dir = runtime_root / "logs" / "frontend" / "crashdumps"
            dump_dir.mkdir(parents=True)
            dump_path = dump_dir / f"node.exe.{dump_pid}.dmp"
            dump_path.write_bytes(dump_bytes)
            creation_environment = os.environ.copy()
            creation_environment.update(
                {
                    "TEST_DUMP_PATH": str(dump_path),
                    "TEST_DUMP_UTC": dump_utc.astimezone(timezone.utc).isoformat(),
                }
            )
            creation_result = subprocess.run(
                [
                    powershell,
                    "-NoProfile",
                    "-Command",
                    "[IO.File]::SetCreationTimeUtc($env:TEST_DUMP_PATH, "
                    "[datetime]::Parse($env:TEST_DUMP_UTC).ToUniversalTime())",
                ],
                env=creation_environment,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            assert creation_result.returncode == 0, (
                creation_result.stderr or creation_result.stdout
            )
            write_utc = dump_last_write_utc or dump_utc
            timestamp = write_utc.astimezone(timezone.utc).timestamp()
            os.utime(dump_path, (timestamp, timestamp))

        if node_reports:
            reports_dir = runtime_root / "logs" / "frontend" / "node-reports"
            reports_dir.mkdir(parents=True)
            for index, report in enumerate(node_reports):
                report_path = reports_dir / f"report.test-{index}.json"
                if isinstance(report, str):
                    report_path.write_text(report, encoding="utf-8")
                else:
                    report_path.write_text(
                        json.dumps(report), encoding="utf-8"
                    )

        wrapper = runtime_root / "run-dump-attribution.ps1"
        wrapper.write_text(
            textwrap.dedent(
                """\
                function Get-WinEvent {
                    [CmdletBinding()]
                    param(
                        [hashtable] $FilterHashtable,
                        [string] $LogName,
                        [string] $FilterXPath,
                        [string] $ListLog
                    )
                    if ($PSBoundParameters.ContainsKey("ListLog")) {
                        return [pscustomobject]@{ IsEnabled = $true }
                    }
                }

                & $env:ATTRIBUTION_SCRIPT `
                    -Since ([datetime]::Parse("2026-08-20T01:01:00.000Z")) `
                    -WindowSeconds 5 `
                    -AsJson
                exit $LASTEXITCODE
                """
            ),
            encoding="utf-8",
        )
        environment = os.environ.copy()
        environment.update(
            {
                "ATTRIBUTION_SCRIPT": str(ATTRIBUTION_SCRIPT),
                "MES_RUNTIME_ROOT": str(runtime_root),
            }
        )
        return subprocess.run(
            [
                powershell,
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(wrapper),
            ],
            cwd=REPO_ROOT,
            env=environment,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )


def test_attribution_links_nearest_dump_by_worker_pid_and_time() -> None:
    """A completed WER dump is evidence only for the matching worker lifetime."""
    result = run_attribution_with_dump(
        dump_pid=300,
        dump_utc=datetime(2026, 8, 20, 1, 2, 2, tzinfo=timezone.utc),
        dump_last_write_utc=datetime(2026, 8, 20, 1, 10, 0, tzinfo=timezone.utc),
        dump_bytes=b"captured-minidump",
    )

    assert result.returncode == 0, result.stderr or result.stdout
    payload = json.loads(result.stdout)
    assert payload["targetPid"] == 300
    assert payload["dumpStatus"] == "process_crash_dump_captured"
    assert payload["dumpPath"].endswith(r"crashdumps\node.exe.300.dmp")
    assert payload["dumpCapturedUtc"] == "2026-08-20T01:02:02.0000000Z"
    assert payload["dumpSizeBytes"] == len(b"captured-minidump")


@pytest.mark.parametrize(
    ("dump_pid", "dump_utc"),
    [
        (301, datetime(2026, 8, 20, 1, 2, 2, tzinfo=timezone.utc)),
        (300, datetime(2026, 8, 20, 0, 50, 0, tzinfo=timezone.utc)),
        (None, None),
    ],
)
def test_attribution_does_not_attach_another_pid_or_lifetime_dump(
    dump_pid: int | None,
    dump_utc: datetime | None,
) -> None:
    """PID and time-window mismatch cannot be presented as crash evidence."""
    result = run_attribution_with_dump(dump_pid=dump_pid, dump_utc=dump_utc)

    assert result.returncode == 0, result.stderr or result.stdout
    payload = json.loads(result.stdout)
    assert payload["dumpStatus"] == "dump_not_captured"
    assert payload["dumpPath"] is None
    assert payload["dumpCapturedUtc"] is None
    assert payload["dumpSizeBytes"] is None


def test_attribution_links_node_report_only_to_matching_worker_lifetime() -> None:
    """A Node report requires both the private worker PID and the exit time window."""
    matching_report = {
        "header": {
            "processId": 300,
            "dumpEventTime": "2026-08-20T01:02:02.000Z",
            "event": "Exception",
            "trigger": "Exception",
        },
        "javascriptStack": {"message": "Error: worker-report-probe"},
        "nativeStack": [{"pc": str(index), "symbol": f"frame-{index}"} for index in range(12)],
    }
    result = run_attribution_with_dump(
        dump_pid=None,
        dump_utc=None,
        node_reports=[
            {
                "header": {
                    "processId": 300,
                    "dumpEventTime": "2026-08-20T00:50:00.000Z",
                    "event": "Exception",
                    "trigger": "Exception",
                }
            },
            {
                "header": {
                    "processId": 301,
                    "dumpEventTime": "2026-08-20T01:02:02.000Z",
                    "event": "Exception",
                    "trigger": "Exception",
                }
            },
            matching_report,
        ],
    )

    assert result.returncode == 0, result.stderr or result.stdout
    payload = json.loads(result.stdout)
    assert payload["nodeReportStatus"] == "node_report_captured"
    assert payload["nodeReportPath"].endswith(r"node-reports\report.test-2.json")
    assert payload["nodeReportCapturedUtc"] == "2026-08-20T01:02:02.0000000Z"
    assert payload["nodeReportEvent"] == "Exception"
    assert payload["nodeReportTrigger"] == "Exception"
    assert payload["nodeReportJavaScriptMessage"] == "Error: worker-report-probe"
    assert len(payload["nodeReportNativeStack"]) == 10
    assert payload["dumpStatus"] == "dump_not_captured"


def test_attribution_skips_truncated_node_report_and_preserves_json_stdout() -> None:
    """Malformed report files do not turn the machine-readable result into mixed output."""
    result = run_attribution_with_dump(
        dump_pid=None,
        dump_utc=None,
        node_reports=['{"header":'],
    )

    assert result.returncode == 0, result.stderr or result.stdout
    payload = json.loads(result.stdout)
    assert payload["nodeReportStatus"] == "node_report_not_captured"
    assert payload["nodeReportPath"] is None
    assert "Skipped unreadable Node diagnostic report" in result.stderr


def test_attribution_preserves_dump_and_node_report_evidence_together() -> None:
    """Native and JavaScript diagnostics are complementary, not mutually exclusive."""
    result = run_attribution_with_dump(
        dump_pid=300,
        dump_utc=datetime(2026, 8, 20, 1, 2, 2, tzinfo=timezone.utc),
        node_reports=[
            {
                "header": {
                    "processId": 300,
                    "dumpEventTime": "2026-08-20T01:02:02.000Z",
                    "event": "Exception",
                    "trigger": "Exception",
                }
            }
        ],
    )

    assert result.returncode == 0, result.stderr or result.stdout
    payload = json.loads(result.stdout)
    assert payload["dumpStatus"] == "process_crash_dump_captured"
    assert payload["nodeReportStatus"] == "node_report_captured"


def test_analyzer_uses_noninteractive_cdb_and_writes_only_runtime_analysis_reports() -> None:
    """The analyzer uses CDB with an approved dump and a bounded command set."""
    script = read_script(ANALYZE_SCRIPT)

    assert "Microsoft.WinDbg" in script
    assert "amd64\\cdb.exe" in script
    assert "[Alias(\"WinDbgPath\")]" in script
    assert "-logo" in script
    assert "-y" in script
    assert "-z" in script
    assert "-c" in script
    assert "WinDbgX.exe" not in script
    assert "Get-MesRuntimePath" in script
    assert '"logs\\frontend\\crashdumps"' in script
    assert "GetFullPath" in script
    assert 'Extension -ne ".dmp"' in script
    assert "!analyze -v" in script
    assert ".ecxr" in script
    assert ".logopen" not in script
    assert ".analysis.txt" in script
    assert "outside the approved frontend crash-dump directory" in script
    assert "Start-Process -FilePath $debugger" in script
    assert "Stop-Process -Id $debuggerProcess.Id -Force" in script
    assert "DEXCOWIN_ANALYSIS_COMPLETE" in script
    assert ".sympath $symbolPath" not in script
    assert "; q" in script


@pytest.mark.skipif(shutil.which("powershell.exe") is None, reason="requires Windows PowerShell")
def test_analyzer_runs_cdb_from_a_path_with_spaces_without_a_gui() -> None:
    """CDB receives quoted -logo arguments even when the debugger path contains spaces."""
    with tempfile.TemporaryDirectory() as temporary_directory:
        root = Path(temporary_directory)
        runtime_root = root / "runtime"
        crash_dir = runtime_root / "logs" / "frontend" / "crashdumps"
        crash_dir.mkdir(parents=True)
        dump_path = crash_dir / "node.exe.300.dmp"
        dump_path.write_bytes(b"test-minidump")
        debugger_dir = root / "debugger path with spaces"
        debugger_dir.mkdir()
        debugger_path = debugger_dir / "fake-cdb.cmd"
        debugger_path.write_text(
            textwrap.dedent(
                """\
                @echo off
                :next
                if "%~1"=="" exit /b 0
                if /I "%~1"=="-logo" (
                  > "%~2" echo DEXCOWIN_ANALYSIS_COMPLETE
                  exit /b 0
                )
                shift
                goto next
                """
            ),
            encoding="utf-8",
        )

        result = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(ANALYZE_SCRIPT),
                "-DumpPath",
                str(dump_path),
                "-DebuggerPath",
                str(debugger_path),
            ],
            cwd=REPO_ROOT,
            env={**os.environ, "MES_RUNTIME_ROOT": str(runtime_root)},
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

        reports = list(crash_dir.glob("*.analysis.txt"))
        assert result.returncode == 0, result.stderr or result.stdout
        assert len(reports) == 1
        assert "DEXCOWIN_ANALYSIS_COMPLETE" in reports[0].read_text(encoding="utf-8")


@pytest.mark.skipif(shutil.which("powershell.exe") is None, reason="requires Windows PowerShell")
def test_analyzer_rejects_dump_outside_approved_runtime_directory() -> None:
    """A caller cannot make WinDbg open an arbitrary .dmp path."""
    with tempfile.TemporaryDirectory() as temporary_directory:
        root = Path(temporary_directory)
        runtime_root = root / "runtime"
        runtime_root.mkdir()
        outside_dump = root / "outside.dmp"
        outside_dump.write_bytes(b"not-a-real-dump")
        result = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(ANALYZE_SCRIPT),
                "-DumpPath",
                str(outside_dump),
            ],
            cwd=REPO_ROOT,
            env={**os.environ, "MES_RUNTIME_ROOT": str(runtime_root)},
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

    assert result.returncode != 0
    assert "outside the approved frontend crash-dump directory" in (
        result.stderr + result.stdout
    )


@pytest.mark.skipif(shutil.which("powershell.exe") is None, reason="requires Windows PowerShell")
def test_analyzer_rejects_non_dump_file_inside_runtime_directory() -> None:
    """Only .dmp evidence files can reach WinDbg."""
    with tempfile.TemporaryDirectory() as temporary_directory:
        runtime_root = Path(temporary_directory)
        crash_dir = runtime_root / "logs" / "frontend" / "crashdumps"
        crash_dir.mkdir(parents=True)
        text_file = crash_dir / "node.exe.300.txt"
        text_file.write_text("not-a-dump", encoding="utf-8")
        result = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(ANALYZE_SCRIPT),
                "-DumpPath",
                str(text_file),
            ],
            cwd=REPO_ROOT,
            env={**os.environ, "MES_RUNTIME_ROOT": str(runtime_root)},
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

    assert result.returncode != 0
    assert ".dmp" in (result.stderr + result.stdout)
