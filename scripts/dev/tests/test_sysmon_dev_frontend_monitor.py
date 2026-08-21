"""Static contracts for the opt-in Sysmon frontend stop-attribution tools."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import textwrap
import xml.etree.ElementTree as ET

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
DEV_SCRIPTS = REPO_ROOT / "scripts" / "dev"
SYSMON_CONFIG = DEV_SCRIPTS / "sysmon-dev-frontend.xml"
INSTALL_SCRIPT = DEV_SCRIPTS / "install-sysmon-dev-frontend-monitor.ps1"
UNINSTALL_SCRIPT = DEV_SCRIPTS / "uninstall-sysmon-dev-frontend-monitor.ps1"
ATTRIBUTION_SCRIPT = DEV_SCRIPTS / "get-frontend-stop-attribution.ps1"
DISABLED_EVENT_TAGS = {
    "ProcessCreate",
    "FileCreateTime",
    "NetworkConnect",
    "ProcessTerminate",
    "DriverLoad",
    "ImageLoad",
    "CreateRemoteThread",
    "RawAccessRead",
    "FileCreate",
    "RegistryEvent",
    "FileCreateStreamHash",
    "PipeEvent",
    "WmiEvent",
    "DnsQuery",
    "FileDelete",
    "ClipboardChange",
    "ProcessTampering",
    "FileDeleteDetected",
    "FileBlockExecutable",
    "FileBlockShredding",
    "FileExecutableDetected",
}


def read_script(path: Path) -> str:
    """Read a PowerShell contract file as UTF-8."""
    return path.read_text(encoding="utf-8")


def test_sysmon_config_collects_only_node_target_process_access() -> None:
    """Every schema 4.82 filter except Event ID 10 is explicitly disabled."""
    root = ET.parse(SYSMON_CONFIG).getroot()

    assert root.tag == "Sysmon"
    assert root.attrib["schemaversion"] == "4.82"
    event_filtering = root.find("EventFiltering")
    assert event_filtering is not None

    process_access = event_filtering.findall("ProcessAccess")
    assert len(process_access) == 1
    assert process_access[0].attrib["onmatch"] == "include"
    target_images = process_access[0].findall("TargetImage")
    assert len(target_images) == 1
    assert target_images[0].attrib["condition"] == "end with"
    assert target_images[0].text == r"\node.exe"

    filters = {element.tag: element for element in event_filtering}
    assert set(filters) == DISABLED_EVENT_TAGS | {"ProcessAccess"}
    for tag in DISABLED_EVENT_TAGS:
        assert filters[tag].attrib == {"onmatch": "include"}
        assert list(filters[tag]) == []
    assert "CommandLine" not in SYSMON_CONFIG.read_text(encoding="utf-8")


def test_install_refuses_existing_sysmon_and_keeps_mutations_behind_whatif() -> None:
    """Installation has explicit WhatIf, service-collision, and signed-binary guards."""
    script = read_script(INSTALL_SCRIPT)

    assert "SupportsShouldProcess" in script
    assert "ShouldProcess" in script
    assert 'Get-Service -Name @("Sysmon", "Sysmon64")' in script
    assert "existing Sysmon service" in script
    assert "https://download.sysinternals.com/files/Sysmon.zip" in script
    assert "C:\\ProgramData\\DEXCOWIN MES\\Sysmon" in script
    assert "Get-AuthenticodeSignature" in script
    assert "Microsoft" in script
    assert "Valid" in script
    assert "-accepteula -i" in script
    assert "$MarkerPath" in script
    assert "Microsoft-Windows-Sysmon/Operational" in script
    assert "$effectiveConfigurationText -notmatch \"ProcessAccess\"" in script
    assert "$effectiveConfigurationText -notmatch \"node\\.exe\"" in script
    assert "$createdInstallRoot = $false" in script
    assert "Remove-Item -LiteralPath $InstallRoot -Recurse -Force -ErrorAction Stop" in script
    assert "Manual recovery is required" in script
    assert "Get-CimInstance -ClassName Win32_Service" in script


def test_install_uses_windows_powershell_compatible_directory_creation() -> None:
    """Windows PowerShell 5.1 must not receive New-Item's unsupported LiteralPath argument."""
    script = read_script(INSTALL_SCRIPT)

    assert "New-Item -ItemType Directory -LiteralPath" not in script
    assert "New-Item -ItemType Directory -Path $InstallRoot -Force" in script
    assert "New-Item -ItemType Directory -Path $StagingRoot -Force" in script


def test_uninstall_requires_marker_signature_and_matching_service_path() -> None:
    """Removal rejects a valid binary when Sysmon64 belongs to another path."""
    script = read_script(UNINSTALL_SCRIPT)

    assert "SupportsShouldProcess" in script
    assert "ShouldProcess" in script
    assert "$MarkerPath" in script
    assert "ConvertFrom-Json" in script
    assert "Get-AuthenticodeSignature" in script
    assert "Sysmon64" in script
    assert 'Get-CimInstance -ClassName Win32_Service -Filter "Name=\'Sysmon64\'"' in script
    assert "PathName" in script
    assert "Assert-OwnedSysmon64ServicePath" in script
    assert "$marker.executablePath" in script
    assert "-u" in script
    assert "Remove-Item -LiteralPath $InstallRoot -Recurse -Force" in script


def test_attribution_contract_returns_each_signal_with_its_event_10_candidates() -> None:
    """Read-only correlation keeps the signal context and approved evidence fields."""
    script = read_script(ATTRIBUTION_SCRIPT)

    assert "[datetime] $Since" in script
    assert "[ValidateRange(1, 60)]" in script
    assert "[int] $WindowSeconds = 5" in script
    assert "[switch] $AsJson" in script
    assert '"dev-server.log"' in script
    assert "NEXT_SIGNAL_RECEIVED" in script
    assert "$SysmonQueryStartUtc = $SinceUtc.Subtract($window)" in script
    assert 'Get-WinEvent -FilterHashtable @{ LogName = "Microsoft-Windows-Sysmon/Operational"; Id = 10; StartTime = $SysmonQueryStartUtc' in script
    for field in ("signalUtc", "signal", "targetPid", "targetPpid", "candidates"):
        assert field in script
    assert "candidates = @($candidateEvents" in script
    assert "$_.eventUtc - $signalEvent.SignalUtc" in script
    assert "Select-Object sourcePid, sourceImage, grantedAccess, targetPid, targetImage, utcTime" in script
    for field in (
        "sourcePid",
        "sourceImage",
        "grantedAccess",
        "targetPid",
        "targetImage",
        "utcTime",
    ):
        assert field in script
    assert "SourceCommandLine" not in script
    assert "CommandLine" not in script
    assert "Write-AttributionWarning" in script
    assert "(?<payload>.*)" in script
    assert "signal payload is missing" in script
    assert '$targetImage.EndsWith("\\node.exe", [System.StringComparison]::OrdinalIgnoreCase)' in script
    assert "ConvertTo-Json" in script
    assert "Candidate evidence:" in script


def test_attribution_treats_no_matching_event_10_as_empty_candidates() -> None:
    """A real Windows PowerShell run keeps valid signals when Event ID 10 has no rows."""
    powershell = shutil.which("powershell.exe")
    if powershell is None:
        pytest.skip("Windows PowerShell is required for this regression test")

    with tempfile.TemporaryDirectory() as temporary_directory:
        runtime_root = Path(temporary_directory)
        log_path = runtime_root / "logs" / "frontend" / "dev-server.log"
        log_path.parent.mkdir(parents=True)
        log_path.write_text(
            '[2026-08-20T01:02:03.000Z] NEXT_SIGNAL_RECEIVED '
            '{"receivedAtUtc":"2026-08-20T01:02:03.000Z","signal":"SIGTERM",'
            '"targetPid":1234,"targetPpid":4321,"port":"3001","uptimeMs":25}\n',
            encoding="utf-8",
        )
        wrapper = runtime_root / "run-attribution.ps1"
        wrapper.write_text(
            textwrap.dedent(
                """\
                function Get-WinEvent {
                    [CmdletBinding()]
                    param(
                        [hashtable] $FilterHashtable,
                        [string] $ListLog
                    )
                    if ($PSBoundParameters.ContainsKey("ListLog")) {
                        return [pscustomobject]@{ IsEnabled = $true }
                    }
                    $exception = [System.Exception]::new("No Event ID 10 records")
                    $record = [System.Management.Automation.ErrorRecord]::new(
                        $exception,
                        $env:EVENT_ERROR_ID,
                        [System.Management.Automation.ErrorCategory]::ObjectNotFound,
                        $null
                    )
                    throw $record
                }

                & $env:ATTRIBUTION_SCRIPT -Since ([datetime]::Parse("2026-08-20T01:00:00.000Z")) -AsJson
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
                "EVENT_ERROR_ID": "NoMatchingEventsFound,Microsoft.PowerShell.Commands.GetWinEventCommand",
            }
        )
        result = subprocess.run(
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
        access_environment = environment.copy()
        access_environment["EVENT_ERROR_ID"] = "AccessDenied,Microsoft.PowerShell.Commands.GetWinEventCommand"
        access_result = subprocess.run(
            [
                powershell,
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(wrapper),
            ],
            cwd=REPO_ROOT,
            env=access_environment,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

    assert result.returncode == 0, result.stderr or result.stdout
    payload = json.loads(result.stdout)
    assert payload["signal"] == "SIGTERM"
    assert payload["candidates"] == []
    assert access_result.returncode == 2, access_result.stderr or access_result.stdout


def test_attribution_correlates_worker_ready_to_signal_less_cli_exit() -> None:
    """A CLI exit can anchor Event ID 10 against its most recently attached worker."""
    powershell = shutil.which("powershell.exe")
    if powershell is None:
        pytest.skip("Windows PowerShell is required for this regression test")

    with tempfile.TemporaryDirectory() as temporary_directory:
        runtime_root = Path(temporary_directory)
        log_path = runtime_root / "logs" / "frontend" / "dev-server.log"
        log_path.parent.mkdir(parents=True)
        log_path.write_text(
            '\n'.join(
                [
                    '[2026-08-20T01:00:00.000Z] NEXT_SIGNAL_PROBE_READY '
                    '{"readyAtUtc":"2026-08-20T01:00:00.000Z","targetPid":200,'
                    '"targetPpid":100,"port":"3001","uptimeMs":10,'
                    '"isNextPrivateWorker":false,"argv":["node","next","dev"],"cwd":"C:\\\\ERP\\\\frontend"}',
                    '[2026-08-20T01:00:01.000Z] NEXT_SIGNAL_PROBE_READY '
                    '{"readyAtUtc":"2026-08-20T01:00:01.000Z","targetPid":300,'
                    '"targetPpid":200,"port":"3001","uptimeMs":12,'
                    '"isNextPrivateWorker":true,"argv":["node","start-server"],"cwd":"C:\\\\ERP\\\\frontend"}',
                    '[2026-08-20T01:02:03.000Z] NEXT_PROCESS_EXIT '
                    '{"exitAtUtc":"2026-08-20T01:02:03.000Z","exitCode":0,"targetPid":200,'
                    '"targetPpid":100,"port":"3001","uptimeMs":123000,'
                    '"isNextPrivateWorker":false,"argv":["node","next","dev"],"cwd":"C:\\\\ERP\\\\frontend"}',
                    '[2026-08-20T01:02:04.000Z] NEXT_PROCESS_EXIT '
                    '{"exitAtUtc":"2026-08-20T01:02:04.000Z","exitCode":0,"targetPid":999,'
                    '"targetPpid":100,"port":"3001","uptimeMs":124000,'
                    '"isNextPrivateWorker":false,"argv":["node","next","dev"],"cwd":"C:\\\\ERP\\\\frontend"}',
                    '',
                ]
            ),
            encoding="utf-8",
        )
        wrapper = runtime_root / "run-worker-exit-attribution.ps1"
        wrapper.write_text(
            textwrap.dedent(
                r'''\
                function Get-WinEvent {
                    [CmdletBinding()]
                    param(
                        [hashtable] $FilterHashtable,
                        [string] $ListLog
                    )
                    if ($PSBoundParameters.ContainsKey("ListLog")) {
                        return [pscustomobject]@{ IsEnabled = $true }
                    }

                    $event = [pscustomobject]@{
                        TimeCreated = [datetime]::Parse("2026-08-20T01:02:02.000Z")
                    }
                    $event | Add-Member -MemberType ScriptMethod -Name ToXml -Value {
                        return '<Event><EventData>' +
                            '<Data Name="SourceProcessId">444</Data>' +
                            '<Data Name="SourceImage">C:\Tools\terminator.exe</Data>' +
                            '<Data Name="GrantedAccess">0x0001</Data>' +
                            '<Data Name="TargetProcessId">300</Data>' +
                            '<Data Name="TargetImage">C:\Program Files\nodejs\node.exe</Data>' +
                            '</EventData></Event>'
                    }
                    return $event
                }

                & $env:ATTRIBUTION_SCRIPT -Since ([datetime]::Parse("2026-08-20T01:01:00.000Z")) -AsJson
                exit $LASTEXITCODE
                '''
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
        result = subprocess.run(
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

    assert result.returncode == 0, result.stderr or result.stdout
    payload = json.loads(result.stdout)
    assert payload["anchorType"] == "worker_exit_without_signal"
    assert payload["exitUtc"] == "2026-08-20T01:02:03.0000000Z"
    assert payload["exitCode"] == 0
    assert payload["cliPid"] == 200
    assert payload["targetPid"] == 300
    assert payload["targetPpid"] == 200
    assert payload["port"] == "3001"
    assert payload["cliUptimeMs"] == 123000
    assert payload["workerReadyUptimeMs"] == 12
    assert "uptimeMs" not in payload
    assert payload["candidates"] == [
        {
            "sourcePid": 444,
            "sourceImage": r"C:\Tools\terminator.exe",
            "grantedAccess": "0x0001",
            "targetPid": 300,
            "targetImage": r"C:\Program Files\nodejs\node.exe",
            "utcTime": "2026-08-20T01:02:02.0000000Z",
        }
    ]


def run_attribution_with_empty_sysmon(log_lines: list[str]) -> subprocess.CompletedProcess[str]:
    """Run the real attribution script with an enabled but empty Sysmon channel."""
    powershell = shutil.which("powershell.exe")
    if powershell is None:
        pytest.skip("Windows PowerShell is required for this regression test")

    with tempfile.TemporaryDirectory() as temporary_directory:
        runtime_root = Path(temporary_directory)
        log_path = runtime_root / "logs" / "frontend" / "dev-server.log"
        log_path.parent.mkdir(parents=True)
        log_path.write_text("\n".join([*log_lines, ""]), encoding="utf-8")
        wrapper = runtime_root / "run-empty-sysmon-attribution.ps1"
        wrapper.write_text(
            textwrap.dedent(
                """\
                function Get-WinEvent {
                    [CmdletBinding()]
                    param(
                        [hashtable] $FilterHashtable,
                        [string] $ListLog
                    )
                    if ($PSBoundParameters.ContainsKey("ListLog")) {
                        return [pscustomobject]@{ IsEnabled = $true }
                    }
                }

                & $env:ATTRIBUTION_SCRIPT -Since ([datetime]::Parse("2026-08-20T01:01:00.000Z")) -AsJson
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


def test_attribution_does_not_map_a_worker_from_an_older_reused_cli_pid_lifetime() -> None:
    """A worker before the current CLI READY belongs to an earlier PID lifetime."""
    result = run_attribution_with_empty_sysmon(
        [
            '[2026-08-20T00:50:00.000Z] NEXT_SIGNAL_PROBE_READY '
            '{"readyAtUtc":"2026-08-20T00:50:00.000Z","targetPid":200,'
            '"targetPpid":100,"port":"3001","uptimeMs":10,"isNextPrivateWorker":false}',
            '[2026-08-20T00:50:01.000Z] NEXT_SIGNAL_PROBE_READY '
            '{"readyAtUtc":"2026-08-20T00:50:01.000Z","targetPid":300,'
            '"targetPpid":200,"port":"3001","uptimeMs":12,"isNextPrivateWorker":true}',
            '[2026-08-20T01:00:00.000Z] NEXT_SIGNAL_PROBE_READY '
            '{"readyAtUtc":"2026-08-20T01:00:00.000Z","targetPid":200,'
            '"targetPpid":101,"port":"3001","uptimeMs":9,"isNextPrivateWorker":false}',
            '[2026-08-20T01:02:03.000Z] NEXT_PROCESS_EXIT '
            '{"exitAtUtc":"2026-08-20T01:02:03.000Z","exitCode":0,"targetPid":200,'
            '"targetPpid":101,"port":"3001","uptimeMs":123000,"isNextPrivateWorker":false}',
        ]
    )

    assert result.returncode == 0, result.stderr or result.stdout
    assert json.loads(result.stdout) == []


def test_attribution_requires_cli_ready_and_exit_to_share_pid_and_ppid() -> None:
    """A reused CLI PID with a different parent cannot inherit the old worker."""
    result = run_attribution_with_empty_sysmon(
        [
            '[2026-08-20T00:59:00.000Z] NEXT_SIGNAL_PROBE_READY '
            '{"readyAtUtc":"2026-08-20T00:59:00.000Z","targetPid":200,'
            '"targetPpid":100,"port":"3001","uptimeMs":10,"isNextPrivateWorker":false}',
            '[2026-08-20T01:00:00.000Z] NEXT_SIGNAL_PROBE_READY '
            '{"readyAtUtc":"2026-08-20T01:00:00.000Z","targetPid":300,'
            '"targetPpid":200,"port":"3001","uptimeMs":12,"isNextPrivateWorker":true}',
            '[2026-08-20T01:02:03.000Z] NEXT_PROCESS_EXIT '
            '{"exitAtUtc":"2026-08-20T01:02:03.000Z","exitCode":0,"targetPid":200,'
            '"targetPpid":101,"port":"3001","uptimeMs":123000,"isNextPrivateWorker":false}',
        ]
    )

    assert result.returncode == 0, result.stderr or result.stdout
    assert json.loads(result.stdout) == []


def test_attribution_requires_worker_ready_after_cli_ready() -> None:
    """An equal-timestamp worker record is not ordered inside the CLI lifetime."""
    result = run_attribution_with_empty_sysmon(
        [
            '[2026-08-20T01:00:00.000Z] NEXT_SIGNAL_PROBE_READY '
            '{"readyAtUtc":"2026-08-20T01:00:00.000Z","targetPid":200,'
            '"targetPpid":100,"port":"3001","uptimeMs":10,"isNextPrivateWorker":false}',
            '[2026-08-20T01:00:00.000Z] NEXT_SIGNAL_PROBE_READY '
            '{"readyAtUtc":"2026-08-20T01:00:00.000Z","targetPid":300,'
            '"targetPpid":200,"port":"3001","uptimeMs":12,"isNextPrivateWorker":true}',
            '[2026-08-20T01:02:03.000Z] NEXT_PROCESS_EXIT '
            '{"exitAtUtc":"2026-08-20T01:02:03.000Z","exitCode":0,"targetPid":200,'
            '"targetPpid":100,"port":"3001","uptimeMs":123000,"isNextPrivateWorker":false}',
        ]
    )

    assert result.returncode == 0, result.stderr or result.stdout
    assert json.loads(result.stdout) == []


def test_attribution_previous_cli_lifetime_signal_does_not_suppress_fallback() -> None:
    """A same-PID signal with another PPID is not part of the current CLI lifetime."""
    result = run_attribution_with_empty_sysmon(
        [
            '[2026-08-20T00:59:00.000Z] NEXT_SIGNAL_PROBE_READY '
            '{"readyAtUtc":"2026-08-20T00:59:00.000Z","targetPid":200,'
            '"targetPpid":101,"port":"3001","uptimeMs":10,"isNextPrivateWorker":false}',
            '[2026-08-20T01:00:00.000Z] NEXT_SIGNAL_PROBE_READY '
            '{"readyAtUtc":"2026-08-20T01:00:00.000Z","targetPid":300,'
            '"targetPpid":200,"port":"3001","uptimeMs":12,"isNextPrivateWorker":true}',
            '[2026-08-20T01:01:00.000Z] NEXT_SIGNAL_RECEIVED '
            '{"receivedAtUtc":"2026-08-20T01:01:00.000Z","signal":"SIGTERM",'
            '"targetPid":200,"targetPpid":100,"port":"3001","uptimeMs":121000}',
            '[2026-08-20T01:02:03.000Z] NEXT_PROCESS_EXIT '
            '{"exitAtUtc":"2026-08-20T01:02:03.000Z","exitCode":0,"targetPid":200,'
            '"targetPpid":101,"port":"3001","uptimeMs":123000,"isNextPrivateWorker":false}',
        ]
    )

    assert result.returncode == 0, result.stderr or result.stdout
    payload = json.loads(result.stdout)
    assert isinstance(payload, list)
    assert payload[0]["signal"] == "SIGTERM"
    assert payload[1]["anchorType"] == "worker_exit_without_signal"


def test_attribution_json_stays_valid_when_lifecycle_record_is_malformed() -> None:
    """JSON mode must not mix lifecycle warnings into standard output."""
    result = run_attribution_with_empty_sysmon(
        [
            '[2026-08-20T01:00:00.000Z] NEXT_SIGNAL_PROBE_READY {not-json}',
            '[2026-08-20T01:01:00.000Z] NEXT_SIGNAL_RECEIVED '
            '{"receivedAtUtc":"2026-08-20T01:01:00.000Z","signal":"SIGTERM",'
            '"targetPid":200,"targetPpid":100,"port":"3001","uptimeMs":120000}',
        ]
    )

    assert result.returncode == 0, result.stderr or result.stdout
    payload = json.loads(result.stdout)
    assert payload["signal"] == "SIGTERM"
    assert "Skipped invalid" not in result.stdout


@pytest.mark.parametrize(
    ("signal_target_pid", "signal_target_ppid"),
    [(200, 100), (300, 200)],
)
def test_attribution_keeps_signal_but_suppresses_worker_exit_fallback(
    signal_target_pid: int,
    signal_target_ppid: int,
) -> None:
    """A CLI or worker signal in the mapped lifetime makes fallback redundant."""
    result = run_attribution_with_empty_sysmon(
        [
            '[2026-08-20T00:59:00.000Z] NEXT_SIGNAL_PROBE_READY '
            '{"readyAtUtc":"2026-08-20T00:59:00.000Z","targetPid":200,'
            '"targetPpid":100,"port":"3001","uptimeMs":10,"isNextPrivateWorker":false}',
            '[2026-08-20T01:00:00.000Z] NEXT_SIGNAL_PROBE_READY '
            '{"readyAtUtc":"2026-08-20T01:00:00.000Z","targetPid":300,'
            '"targetPpid":200,"port":"3001","uptimeMs":12,"isNextPrivateWorker":true}',
            '[2026-08-20T01:02:00.000Z] NEXT_SIGNAL_RECEIVED '
            f'{{"receivedAtUtc":"2026-08-20T01:02:00.000Z","signal":"SIGTERM",'
            f'"targetPid":{signal_target_pid},"targetPpid":{signal_target_ppid},'
            '"port":"3001","uptimeMs":120000}',
            '[2026-08-20T01:02:01.000Z] NEXT_PROCESS_EXIT '
            '{"exitAtUtc":"2026-08-20T01:02:01.000Z","exitCode":0,"targetPid":200,'
            '"targetPpid":100,"port":"3001","uptimeMs":121000,"isNextPrivateWorker":false}',
        ]
    )

    assert result.returncode == 0, result.stderr or result.stdout
    payload = json.loads(result.stdout)
    assert isinstance(payload, dict)
    assert payload["signal"] == "SIGTERM"
    assert payload["targetPid"] == signal_target_pid
    assert "anchorType" not in payload
