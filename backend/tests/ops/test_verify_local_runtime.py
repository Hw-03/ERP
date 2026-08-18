from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
VERIFY_LOCAL = ROOT / "scripts" / "dev" / "verify_local.ps1"
VERIFICATION_POLICY = ROOT / "scripts" / "dev" / "verification_policy.py"


def _git(repo: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True)


def _verification_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    script_dir = repo / "scripts" / "dev"
    script_dir.mkdir(parents=True)
    shutil.copy2(VERIFY_LOCAL, script_dir / VERIFY_LOCAL.name)
    shutil.copy2(VERIFICATION_POLICY, script_dir / VERIFICATION_POLICY.name)
    (repo / "backend").mkdir()
    (repo / "frontend").mkdir()
    (repo / "README.md").write_text("baseline\n", encoding="utf-8")
    _git(repo, "init", "-q")
    _git(repo, "config", "user.email", "test@example.com")
    _git(repo, "config", "user.name", "Verification Test")
    _git(repo, "add", ".")
    _git(repo, "commit", "-qm", "baseline")
    return repo


def _run_verify(
    repo: Path,
    *args: str,
    extra_env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[bytes]:
    powershell = shutil.which("powershell.exe")
    assert powershell is not None
    return subprocess.run(
        [
            powershell,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(repo / "scripts" / "dev" / "verify_local.ps1"),
            *args,
        ],
        cwd=repo,
        env={**os.environ, "PYTHONUTF8": "1", **(extra_env or {})},
        capture_output=True,
        timeout=30,
        check=False,
    )


def _output(result: subprocess.CompletedProcess[bytes]) -> str:
    return (result.stdout + result.stderr).decode("utf-8", errors="replace")


def _mock_full_gate_runtime(
    tmp_path: Path,
    *,
    npm_exit_code: int = 0,
) -> tuple[Path, dict[str, str]]:
    """실제 PowerShell 병렬 orchestration만 남기고 느린 하위 명령을 대체한다."""
    repo = _verification_repo(tmp_path)
    baseline = repo / "_dev" / "baselines" / "openapi.json"
    baseline.parent.mkdir(parents=True)
    baseline.write_bytes(b"{}\r\n")
    _git(repo, "add", ".")
    _git(repo, "commit", "-qm", "openapi baseline")

    fake_bin = tmp_path / "fake-bin"
    fake_bin.mkdir()
    real_python = Path(sys.executable)
    (fake_bin / "python.cmd").write_text(
        "\r\n".join(
            [
                "@echo off",
                'if /I "%~nx1"=="verification_policy.py" (',
                f'  "{real_python}" %*',
                "  exit /b %ERRORLEVEL%",
                ")",
                'if "%~1"=="-" (',
                "  more >nul",
                '  >"%~2" echo {}',
                "  exit /b 0",
                ")",
                "exit /b 0",
                "",
            ]
        ),
        encoding="ascii",
    )
    (fake_bin / "npm.cmd").write_text(
        f"@echo off\r\nexit /b {npm_exit_code}\r\n",
        encoding="ascii",
    )
    (fake_bin / "npx.cmd").write_text("@echo off\r\nexit /b 0\r\n", encoding="ascii")
    return repo, {
        "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
        "DEXCOWIN_VERIFY_PARALLEL_CPU_THRESHOLD": "1",
    }


def _mock_smart_targeted_runtime(
    tmp_path: Path,
    *,
    lint_exit_code: int = 0,
) -> tuple[Path, dict[str, str], Path]:
    """여섯 smart 게이트의 실제 child orchestration만 실행한다."""
    repo = _verification_repo(tmp_path)
    (repo / ".gitignore").write_text(
        "backend/.testmondata\nfrontend/node_modules/\n",
        encoding="utf-8",
    )
    backend_router = repo / "backend" / "app" / "routers" / "sample.py"
    frontend_source = repo / "frontend" / "app" / "sample.ts"
    frontend_test = repo / "frontend" / "app" / "sample.test.ts"
    for path in (backend_router, frontend_source, frontend_test):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("baseline\n", encoding="utf-8")
    baseline = repo / "_dev" / "baselines" / "openapi.json"
    baseline.parent.mkdir(parents=True)
    baseline.write_bytes(b"{}\r\n")
    _git(repo, "add", ".")
    _git(repo, "commit", "-qm", "targeted baseline")

    (repo / "backend" / ".testmondata").write_text("cache", encoding="ascii")
    backend_router.write_text("changed backend\n", encoding="utf-8")
    frontend_source.write_text("changed frontend\n", encoding="utf-8")
    frontend_test.write_text("changed frontend test\n", encoding="utf-8")

    gate_log = tmp_path / "gate logs[1]" / "events.log"
    gate_log.parent.mkdir()
    fake_bin = tmp_path / "fake-bin"
    fake_bin.mkdir()
    real_python = Path(sys.executable)
    (fake_bin / "python.cmd").write_text(
        "\r\n".join(
            [
                "@echo off",
                'if /I "%~nx1"=="verification_policy.py" (',
                f'  "{real_python}" %*',
                "  exit /b %ERRORLEVEL%",
                ")",
                'if "%~1"=="-" (',
                '  >>"%DEXCOWIN_MOCK_GATE_LOG%" echo backend-openapi start',
                "  more >nul",
                "  ping -n 4 127.0.0.1 >nul",
                '  >"%~2" echo {}',
                '  >>"%DEXCOWIN_MOCK_GATE_LOG%" echo backend-openapi end',
                "  exit /b 0",
                ")",
                '>>"%DEXCOWIN_MOCK_GATE_LOG%" echo backend-testmon start',
                "ping -n 4 127.0.0.1 >nul",
                '>>"%DEXCOWIN_MOCK_GATE_LOG%" echo backend-testmon end',
                "exit /b 0",
                "",
            ]
        ),
        encoding="ascii",
    )
    local_bin = repo / "frontend" / "node_modules" / ".bin"
    local_bin.mkdir(parents=True)
    commands = {
        "next.cmd": ("frontend-lint-files", lint_exit_code),
        "tsc.cmd": ("frontend-tsc-incremental", 0),
        "vitest.cmd": ("frontend-vitest", 0),
    }
    for filename, (label, exit_code) in commands.items():
        argument_capture = (
            [
                'if /I "%~1"=="related" >"%DEXCOWIN_MOCK_GATE_LOG%.related" echo %*',
                'if /I "%~1"=="run" >"%DEXCOWIN_MOCK_GATE_LOG%.run" echo %*',
            ]
            if filename == "vitest.cmd"
            else []
        )
        (local_bin / filename).write_text(
            "\r\n".join(
                [
                    "@echo off",
                    *argument_capture,
                    f'>>"%DEXCOWIN_MOCK_GATE_LOG%" echo {label} start %*',
                    "ping -n 4 127.0.0.1 >nul",
                    f'>>"%DEXCOWIN_MOCK_GATE_LOG%" echo {label} end %*',
                    f"exit /b {exit_code}",
                    "",
                ]
            ),
            encoding="ascii",
        )
    return repo, {
        "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
        "DEXCOWIN_VERIFY_PARALLEL_CPU_THRESHOLD": "1",
        "DEXCOWIN_MOCK_GATE_LOG": str(gate_log),
    }, gate_log


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell runtime test is Windows-only")
def test_plan_only_prints_staged_plan_without_running_gates_and_writes_empty_timings(tmp_path: Path) -> None:
    repo = _verification_repo(tmp_path)
    timing = repo / "timings[1].json"
    (repo / "README.md").write_text("staged docs change\n", encoding="utf-8")
    _git(repo, "add", "README.md")

    result = _run_verify(repo, "-PlanOnly", "-TimingOutput", str(timing))

    output = _output(result)
    assert result.returncode == 0, output
    assert "Change set: staged" in output
    assert "README.md" in output
    assert "docs-whitespace" in output
    assert "docs-only whitespace check" in output
    assert "==> Docs whitespace check" not in output
    report = json.loads(timing.read_text(encoding="utf-8-sig"))
    assert report["mode"] == "smart"
    assert report["change_set"] == "staged"
    assert report["plan_only"] is True
    assert report["gates"] == []


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell runtime test is Windows-only")
def test_plan_only_warns_that_ignored_changes_still_exist_in_working_tree(tmp_path: Path) -> None:
    repo = _verification_repo(tmp_path)
    (repo / "README.md").write_text("staged docs change\n", encoding="utf-8")
    _git(repo, "add", "README.md")
    ignored = repo / "frontend" / "app" / "ignored.ts"
    ignored.parent.mkdir(parents=True)
    ignored.write_text("export const ignored = true\n", encoding="utf-8")

    result = _run_verify(repo, "-PlanOnly")

    output = _output(result)
    assert result.returncode == 0, output
    assert "Ignored changes affect only impact planning" in output
    assert "Gates still run against the current working tree" in output
    assert "use a clean dedicated worktree" in output


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell runtime test is Windows-only")
def test_plan_only_stops_on_staged_and_unstaged_same_file(tmp_path: Path) -> None:
    repo = _verification_repo(tmp_path)
    target = repo / "README.md"
    target.write_text("staged\n", encoding="utf-8")
    _git(repo, "add", "README.md")
    target.write_text("working\n", encoding="utf-8")

    result = _run_verify(repo, "-PlanOnly")

    output = _output(result)
    assert result.returncode != 0
    assert "conflict" in output.lower()
    assert "README.md" in output


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell runtime test is Windows-only")
def test_failed_gate_still_writes_completed_timing_summary(tmp_path: Path) -> None:
    repo = _verification_repo(tmp_path)
    timing = repo / "timings.json"
    (repo / "README.md").write_text("trailing whitespace   \n", encoding="utf-8")

    result = _run_verify(repo, "-Mode", "docs", "-TimingOutput", str(timing))

    output = _output(result)
    assert result.returncode != 0
    assert "Timing summary" in output
    report = json.loads(timing.read_text(encoding="utf-8-sig"))
    assert report["plan_only"] is False
    assert report["gates"][0]["id"] == "docs-whitespace"
    assert report["gates"][0]["status"] == "failed"
    assert report["gates"][0]["duration_ms"] >= 0
    assert report["total_ms"] >= report["gates"][0]["duration_ms"]


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell runtime test is Windows-only")
def test_smart_staged_docs_gate_checks_the_cached_diff(tmp_path: Path) -> None:
    repo = _verification_repo(tmp_path)
    (repo / "README.md").write_text("staged trailing whitespace   \n", encoding="utf-8")
    _git(repo, "add", "README.md")

    result = _run_verify(repo)

    output = _output(result)
    assert result.returncode != 0
    assert "README.md:1: trailing whitespace" in output


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell runtime test is Windows-only")
def test_smart_working_docs_gate_checks_untracked_files(tmp_path: Path) -> None:
    repo = _verification_repo(tmp_path)
    (repo / "notes.md").write_text("untracked trailing whitespace   \n", encoding="utf-8")

    result = _run_verify(repo)

    output = _output(result)
    assert result.returncode != 0
    assert "notes.md:1: trailing whitespace" in output


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell runtime test is Windows-only")
def test_smart_docs_gate_treats_untracked_bracket_path_literally(tmp_path: Path) -> None:
    repo = _verification_repo(tmp_path)
    (repo / "notes[1].md").write_text("untracked trailing whitespace   \n", encoding="utf-8")

    result = _run_verify(repo)

    output = _output(result)
    assert result.returncode != 0
    assert "notes[1].md:1: trailing whitespace" in output


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell runtime test is Windows-only")
def test_full_mode_runs_both_areas_in_parallel_and_merges_timings(tmp_path: Path) -> None:
    repo, extra_env = _mock_full_gate_runtime(tmp_path)

    timing = repo / "full-timings.json"
    result = _run_verify(
        repo,
        "-Mode",
        "full",
        "-TimingOutput",
        str(timing),
        extra_env=extra_env,
    )

    output = _output(result)
    assert result.returncode == 0, output
    assert "Running backend and frontend gates in parallel" in output
    report = json.loads(timing.read_text(encoding="utf-8-sig"))
    gate_ids = {gate["id"] for gate in report["gates"]}
    assert gate_ids == {
        "backend-pytest-full",
        "backend-openapi",
        "frontend-lint",
        "frontend-typecheck",
        "frontend-coverage",
        "frontend-build",
        "frontend-bundle-size",
        "git-status",
    }


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell runtime test is Windows-only")
def test_openapi_gate_removes_pid_scoped_temporary_capture(tmp_path: Path) -> None:
    repo, extra_env = _mock_full_gate_runtime(tmp_path)
    temp_dir = tmp_path / "temp[1]"
    temp_dir.mkdir()
    gate_file = repo / "openapi-gate.json"
    gate_file.write_text(
        json.dumps(
            {
                "id": "backend-openapi",
                "area": "backend",
                "kind": "contract",
                "reason": "runtime cleanup contract",
                "files": [],
            }
        ),
        encoding="utf-8",
    )

    result = _run_verify(
        repo,
        "-InternalGateFile",
        str(gate_file),
        extra_env={**extra_env, "TEMP": str(temp_dir), "TMP": str(temp_dir)},
    )

    output = _output(result)
    assert result.returncode == 0, output
    assert list(temp_dir.glob("openapi-current-*.json")) == []


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell runtime test is Windows-only")
def test_parallel_failure_waits_for_other_area_and_stops_followup_gates(tmp_path: Path) -> None:
    repo, extra_env = _mock_full_gate_runtime(tmp_path, npm_exit_code=17)
    timing = repo / "failed-full-timings.json"

    result = _run_verify(
        repo,
        "-Mode",
        "full",
        "-TimingOutput",
        str(timing),
        extra_env=extra_env,
    )

    output = _output(result)
    assert result.returncode != 0
    assert "Parallel area verification failed: frontend=1" in output
    assert "backend-openapi: passed" in output
    report = json.loads(timing.read_text(encoding="utf-8-sig"))
    gate_statuses = {gate["id"]: gate["status"] for gate in report["gates"]}
    assert gate_statuses == {
        "backend-pytest-full": "passed",
        "backend-openapi": "passed",
        "frontend-lint": "failed",
    }


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell runtime test is Windows-only")
def test_smart_targeted_gates_run_in_parallel_and_merge_each_timing(tmp_path: Path) -> None:
    repo, extra_env, gate_log = _mock_smart_targeted_runtime(tmp_path)
    timing = repo / "smart timings[1].json"

    result = _run_verify(
        repo,
        "-Mode",
        "smart",
        "-ChangeSet",
        "working",
        "-TimingOutput",
        str(timing),
        extra_env=extra_env,
    )

    output = _output(result)
    assert result.returncode == 0, output
    assert "Running 6 smart targeted gates in parallel" in output
    report = json.loads(timing.read_text(encoding="utf-8-sig"))
    assert {gate["id"] for gate in report["gates"]} == {
        "backend-testmon",
        "backend-openapi",
        "frontend-lint-files",
        "frontend-tsc-incremental",
        "frontend-vitest-related",
        "frontend-direct-tests",
    }
    events = gate_log.read_text(encoding="utf-8").splitlines()
    first_end = next(index for index, event in enumerate(events) if " end" in event)
    assert len([event for event in events[:first_end] if " start" in event]) >= 2
    assert report["total_ms"] < sum(gate["duration_ms"] for gate in report["gates"])
    related_args = Path(f"{gate_log}.related").read_text(encoding="utf-8")
    direct_args = Path(f"{gate_log}.run").read_text(encoding="utf-8")
    assert related_args.startswith("related ")
    assert direct_args.startswith("run ")
    assert "--pool=threads" in related_args
    assert "--pool=threads" in direct_args


@pytest.mark.skipif(sys.platform != "win32", reason="PowerShell runtime test is Windows-only")
def test_smart_parallel_failure_waits_for_all_children_and_merges_timings(tmp_path: Path) -> None:
    repo, extra_env, gate_log = _mock_smart_targeted_runtime(tmp_path, lint_exit_code=17)
    timing = repo / "failed-smart-timings.json"

    result = _run_verify(
        repo,
        "-Mode",
        "smart",
        "-ChangeSet",
        "working",
        "-TimingOutput",
        str(timing),
        extra_env=extra_env,
    )

    output = _output(result)
    assert result.returncode != 0
    assert "Parallel targeted verification failed: frontend-lint-files=1" in output
    events = gate_log.read_text(encoding="utf-8").splitlines()
    assert "backend-testmon end" in events
    assert "backend-openapi end" in events
    assert any(event.startswith("frontend-tsc-incremental end") for event in events)
    report = json.loads(timing.read_text(encoding="utf-8-sig"))
    statuses = {gate["id"]: gate["status"] for gate in report["gates"]}
    assert statuses["frontend-lint-files"] == "failed"
    assert len(statuses) == 6


def test_verify_local_keeps_existing_switches_and_adds_smart_policy_parameters() -> None:
    script = VERIFY_LOCAL.read_text(encoding="utf-8-sig")

    assert '[ValidateSet("smart", "auto", "full", "frontend", "backend", "docs")]' in script
    assert '[string] $Mode = "smart"' in script
    assert '[ValidateSet("auto", "staged", "working")]' in script
    assert '[string] $ChangeSet = "auto"' in script
    assert "[switch] $PlanOnly" in script
    assert "[string] $TimingOutput" in script
    assert "[switch] $DbReadOnlyCheck" in script
    assert "[switch] $IncludeE2E" in script
