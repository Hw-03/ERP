from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
VERIFY_LOCAL = ROOT / "scripts" / "dev" / "verify_local.ps1"


def _script() -> str:
    return VERIFY_LOCAL.read_text(encoding="utf-8-sig")


def test_full_area_runner_uses_hidden_processes_logs_and_heartbeats() -> None:
    script = _script()

    assert "$ParallelCpuThreshold = 8" in script
    assert "$HeartbeatSeconds = 15" in script
    assert "function Invoke-ParallelAreaGates" in script
    assert "Start-Process" in script
    assert "-WindowStyle Hidden" in script
    assert "-RedirectStandardOutput" in script
    assert "-RedirectStandardError" in script
    assert "WaitForExit" in script


def test_backend_worker_cap_uses_half_the_available_cpu_up_to_four() -> None:
    script = _script()

    assert "function Get-BackendWorkerCount" in script
    assert "[Math]::Floor([Environment]::ProcessorCount / 2)" in script
    assert "[Math]::Min(4" in script
    assert "[Math]::Max(1" in script


def test_parallel_children_return_gate_timings_to_the_parent_report() -> None:
    script = _script()

    assert "function Merge-ChildTimingReport" in script
    assert "-TimingOutput" in script
    assert "child_timing" in script


def test_directly_changed_vitest_file_cannot_pass_when_no_test_is_collected() -> None:
    script = _script()

    assert "& $FrontendVitestBin run @TestFiles --pool=threads" in script
    assert "run @TestFiles --passWithNoTests" not in script


def test_parallel_full_gate_caps_frontend_workers_without_changing_standalone_mode() -> None:
    script = _script()

    assert "function Get-FrontendParallelWorkerCount" in script
    assert "[Math]::Min(2" in script
    assert "DEXCOWIN_FRONTEND_MAX_WORKERS" in script
    assert "(Get-FrontendParallelWorkerCount).ToString()" in script
    assert '"--maxWorkers=$FrontendMaxWorkers"' in script
    assert '"--minWorkers=1"' in script


def test_smart_targeted_gates_use_independent_hidden_children() -> None:
    script = _script()

    assert "function Invoke-ParallelTargetedGates" in script
    assert "$SmartParallelGateIds" in script
    for gate_id in (
        "backend-testmon",
        "backend-openapi",
        "frontend-lint-files",
        "frontend-tsc-incremental",
        "frontend-vitest-related",
        "frontend-direct-tests",
    ):
        assert f'"{gate_id}"' in script
    assert "-InternalGateFile" in script


def test_smart_frontend_gates_use_local_windows_bins_and_thread_pool() -> None:
    script = _script()

    assert 'Join-Path $FrontendRoot "node_modules\\.bin\\next.cmd"' in script
    assert 'Join-Path $FrontendRoot "node_modules\\.bin\\tsc.cmd"' in script
    assert 'Join-Path $FrontendRoot "node_modules\\.bin\\vitest.cmd"' in script
    assert "npx vitest related" not in script
    assert "npx vitest run @TestFiles" not in script
    assert "--pool=threads" in script
