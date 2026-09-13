from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
ENTRY = ROOT / "scripts/dev/sync-employee-environments.ps1"
LEGACY = ROOT / "scripts/dev/auto-sync-to-employee.ps1"


def _prepare(tmp_path: Path, **overrides: str) -> tuple[Path, dict[str, str]]:
    """Run only disposable child scripts; never invoke a live sync or service."""
    scripts = tmp_path / "scripts/dev"
    scripts.mkdir(parents=True)
    for name, stage in (
        ("auto-sync-to-employee.ps1", "CODE"),
        ("sync-to-employee.ps1", "CODE"),
        ("sync-from-employee-data.ps1", "DATA"),
    ):
        (scripts / name).write_text(
            f'Add-Content -LiteralPath $env:SYNC_TEST_EVENTS -Value "{stage}:$args"\n'
            f'if ($env:SYNC_TEST_{stage}_WAIT) {{ Start-Sleep -Seconds 3 }}\n'
            f'[Console]::Error.WriteLine("{stage} diagnostic on stderr")\n'
            'Write-Output "SYNC_CHANGES=0"\n'
            'Write-Output "AUTO_SYNC_RESULT=$env:SYNC_TEST_CODE_RESULT"\n'
            'if ($env:SYNC_TEST_DATA_RESULT) { '
            'Write-Output "SYNC_DATA_RESULT=$env:SYNC_TEST_DATA_RESULT" }\n'
            f'exit [int] $env:SYNC_TEST_{stage}_EXIT\n',
            encoding="utf-8-sig",
        )
    # The old scheduled command is the regression baseline until the entry exists.
    source = ENTRY if ENTRY.exists() else LEGACY
    script = tmp_path / "entry.ps1"
    script.write_text(
        source.read_text(encoding="utf-8-sig").replace(
            '$RepoRoot = "C:\\ERP"', f'$RepoRoot = "{tmp_path.as_posix()}"'
        ),
        encoding="utf-8-sig",
    )
    env = os.environ.copy()
    env.update(
        SYNC_TEST_EVENTS=str(tmp_path / "events.log"),
        SYNC_TEST_CODE_EXIT="0",
        SYNC_TEST_DATA_EXIT="0",
        SYNC_TEST_CODE_RESULT="NO_CHANGES",
        SYNC_TEST_DATA_RESULT="APPLIED",
    )
    env.update(overrides)
    return script, env


def _command(script: Path) -> list[str]:
    """Use the same Windows shell as the real scheduled entry."""
    shell = shutil.which("powershell.exe")
    if not shell:
        pytest.skip("Windows PowerShell required")
    return [shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)]


def _run(script: Path, env: dict[str, str], *, discard_output: bool = False) -> subprocess.CompletedProcess:
    """A lost caller output must not interrupt the code-to-data transition."""
    return subprocess.run(
        _command(script), env=env, cwd=script.parent,
        stdout=subprocess.DEVNULL if discard_output else subprocess.PIPE,
        stderr=subprocess.PIPE, timeout=30, check=False,
    )


def _receipt(tmp_path: Path) -> dict:
    paths = list((tmp_path / "_attic/runtime/scheduled-sync").glob("*/receipt.json"))
    assert len(paths) == 1, paths
    return json.loads(paths[0].read_text(encoding="utf-8-sig"))


@pytest.mark.parametrize("code_result", ["NO_CHANGES", "APPLIED"])
def test_code_success_always_runs_data_once_even_when_caller_output_is_lost(
    tmp_path: Path, code_result: str,
) -> None:
    script, env = _prepare(tmp_path, SYNC_TEST_CODE_RESULT=code_result)
    result = _run(script, env, discard_output=True)
    assert result.returncode == 0, result.stderr
    assert (tmp_path / "events.log").read_text(encoding="utf-8-sig").splitlines() == [
        "CODE:", "DATA:-Apply",
    ]
    receipt = _receipt(tmp_path)
    assert receipt["result"] == "COMPLETED"
    assert receipt["code"]["exitCode"] == receipt["data"]["exitCode"] == 0
    assert "diagnostic on stderr" in Path(receipt["code"]["stderr"]).read_text()
    assert "SYNC_DATA_RESULT=APPLIED" in Path(receipt["data"]["stdout"]).read_text()


@pytest.mark.parametrize("code_exit", [2, 4, 6, 9])
def test_code_failure_is_durable_and_never_starts_data(tmp_path: Path, code_exit: int) -> None:
    script, env = _prepare(tmp_path, SYNC_TEST_CODE_EXIT=str(code_exit))
    result = _run(script, env)
    assert result.returncode == code_exit, result.stderr
    assert (tmp_path / "events.log").read_text(encoding="utf-8-sig").splitlines() == ["CODE:"]
    receipt = _receipt(tmp_path)
    assert receipt["result"] == "CODE_FAILED"
    assert receipt["code"]["exitCode"] == code_exit
    assert receipt["data"]["exitCode"] is None


def test_data_failure_is_not_retried_or_reported_as_success(tmp_path: Path) -> None:
    script, env = _prepare(tmp_path, SYNC_TEST_DATA_EXIT="15", SYNC_TEST_DATA_RESULT="INSTALL_FAILED")
    result = _run(script, env)
    assert result.returncode == 15, result.stderr
    assert (tmp_path / "events.log").read_text(encoding="utf-8-sig").splitlines() == ["CODE:", "DATA:-Apply"]
    receipt = _receipt(tmp_path)
    assert receipt["result"] == "DATA_FAILED"
    assert receipt["data"]["exitCode"] == 15


def test_missing_data_completion_marker_is_not_success(tmp_path: Path) -> None:
    script, env = _prepare(tmp_path, SYNC_TEST_DATA_RESULT="")
    result = _run(script, env)
    assert result.returncode != 0
    assert _receipt(tmp_path)["result"] == "DATA_RESULT_UNCONFIRMED"


def test_missing_child_has_terminal_receipt_without_data_launch(tmp_path: Path) -> None:
    script, env = _prepare(tmp_path)
    (tmp_path / "scripts/dev/sync-from-employee-data.ps1").unlink()
    result = _run(script, env)
    assert result.returncode != 0
    receipt = _receipt(tmp_path)
    assert receipt["result"] == "WRAPPER_FAILED"
    assert receipt["data"]["status"] == "FAILED"
    assert receipt["data"]["completedAt"]
    assert receipt["data"]["exitCode"] is None
    assert (tmp_path / "events.log").read_text(encoding="utf-8-sig").splitlines() == ["CODE:"]


def test_duplicate_entry_is_blocked_without_second_sync(tmp_path: Path) -> None:
    script, env = _prepare(tmp_path, SYNC_TEST_CODE_WAIT="1")
    with subprocess.Popen(_command(script), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) as first:
        deadline = time.monotonic() + 15
        while not (tmp_path / "events.log").exists() and time.monotonic() < deadline:
            time.sleep(0.05)
        assert (tmp_path / "events.log").exists()
        second = _run(script, env)
        assert second.returncode == 20, second.stderr
        assert first.wait(timeout=25) == 0
    assert (tmp_path / "events.log").read_text(encoding="utf-8-sig").splitlines() == ["CODE:", "DATA:-Apply"]
    assert _receipt(tmp_path)["result"] == "COMPLETED"


def test_receipt_failure_keeps_lock_until_running_child_exits(tmp_path: Path) -> None:
    script, env = _prepare(tmp_path, SYNC_TEST_CODE_WAIT="1")
    source = script.read_text(encoding="utf-8-sig")
    source = source.replace(
        "function Save-SyncReceipt {",
        "function Save-SyncReceipt {\n"
        "    if ($script:Receipt.code.pid -and -not $script:InjectedReceiptFailure) {\n"
        "        $script:InjectedReceiptFailure = $true\n"
        "        throw 'Injected receipt write failure after child start'\n"
        "    }\n",
    )
    script.write_text(source, encoding="utf-8-sig")
    with subprocess.Popen(_command(script), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) as first:
        deadline = time.monotonic() + 15
        while not (tmp_path / "events.log").exists() and time.monotonic() < deadline:
            time.sleep(0.05)
        assert (tmp_path / "events.log").exists()
        second = _run(script, env)
        assert second.returncode == 20
        assert first.wait(timeout=25) != 0
    assert (tmp_path / "events.log").read_text(encoding="utf-8-sig").splitlines() == ["CODE:"]
    receipt = _receipt(tmp_path)
    assert receipt["result"] == "WRAPPER_FAILED"
    assert receipt["data"]["status"] == "NOT_STARTED"
