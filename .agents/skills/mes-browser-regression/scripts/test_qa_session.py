"""Test observable QA-session safety boundaries without touching MES servers."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import socket
from types import SimpleNamespace
from pathlib import Path

import pytest


SCRIPT = Path(__file__).with_name("qa_session.py")


def invoke(*args: str) -> subprocess.CompletedProcess[str]:
    """Run the public CLI so rejected starts cannot hide behind mocked helpers."""
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=15,
    )


@pytest.mark.parametrize("run_id", ["../backend", "..", "a/b", "a\\b"])
def test_start_rejects_run_path_escape_before_creating_files(tmp_path: Path, run_id: str) -> None:
    result = invoke("start", "--repo-root", str(tmp_path), "--run-id", run_id)
    assert result.returncode == 2
    assert "invalid run ID" in result.stderr
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("backend,frontend", [(8011, 3031), (8010, 3031), (8031, 3001), (8031, 3000)])
def test_start_rejects_original_server_ports(tmp_path: Path, backend: int, frontend: int) -> None:
    result = invoke(
        "start", "--repo-root", str(tmp_path), "--run-id", "test",
        "--backend-port", str(backend), "--frontend-port", str(frontend),
    )
    assert result.returncode == 2
    assert "protected port" in result.stderr
    assert list(tmp_path.iterdir()) == []


def test_stop_refuses_unowned_process_without_killing_it(tmp_path: Path) -> None:
    psutil = pytest.importorskip("psutil")
    process = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
    try:
        run = tmp_path / "_attic" / "runtime" / "mes-browser-regression" / "test"
        run.mkdir(parents=True)
        (run / "session.json").write_text(json.dumps({
            "schema_version": 1,
            "repo_root": str(tmp_path.resolve()),
            "run_dir": str(run.resolve()),
            "status": "running",
            "processes": [{
                "pid": process.pid,
                "created_at": psutil.Process(process.pid).create_time() + 100,
                "command": ["not-the-recorded-command"],
            }],
        }), encoding="utf-8")
        result = invoke("stop", "--repo-root", str(tmp_path), "--run-id", "test")
        assert result.returncode == 2
        assert "ownership mismatch" in result.stderr
        assert process.poll() is None
    finally:
        process.terminate()
        process.wait(timeout=10)


def test_existing_run_is_never_overwritten(tmp_path: Path) -> None:
    run = tmp_path / "_attic" / "runtime" / "mes-browser-regression" / "test"
    run.mkdir(parents=True)
    marker = run / "keep.txt"
    marker.write_text("previous evidence", encoding="utf-8")
    result = invoke("start", "--repo-root", str(tmp_path), "--run-id", "test")
    assert result.returncode == 2
    assert "run already exists" in result.stderr
    assert marker.read_text(encoding="utf-8") == "previous evidence"


def load_module():
    """Load only after the CLI RED phase has established missing functionality."""
    spec = importlib.util.spec_from_file_location("qa_session_test_target", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_overlay_cannot_include_a_database_or_secret(tmp_path: Path) -> None:
    module = load_module()
    for relative in ["backend/mes.db", "frontend/.env.local", "../outside.py"]:
        with pytest.raises(ValueError):
            module.validate_overlay(tmp_path, relative)


def test_overlay_respects_source_bytes_without_including_other_dirty_files(tmp_path: Path) -> None:
    module = load_module()
    repo = tmp_path / "repo"
    snapshot = tmp_path / "snapshot"
    (repo / "backend").mkdir(parents=True)
    (snapshot / "backend").mkdir(parents=True)
    selected = repo / "backend" / "selected.py"
    selected.write_bytes("선택한 수정\n".encode("utf-8"))
    (repo / "backend" / "unrelated.py").write_text("unrelated dirty", encoding="utf-8")
    (snapshot / "backend" / "unrelated.py").write_text("committed baseline", encoding="utf-8")
    result = module.copy_overlays(repo, snapshot, ["backend/selected.py"])
    assert (snapshot / "backend" / "selected.py").read_bytes() == selected.read_bytes()
    assert (snapshot / "backend" / "unrelated.py").read_text(encoding="utf-8") == "committed baseline"
    assert set(result) == {"backend/selected.py"}


def test_snapshot_extraction_rejects_traversal(tmp_path: Path) -> None:
    import io
    import zipfile

    module = load_module()
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zipped:
        zipped.writestr("../outside.txt", "not allowed")
    with pytest.raises(ValueError):
        module.extract_snapshot(archive.getvalue(), tmp_path / "workspace")
    assert not (tmp_path / "outside.txt").exists()


def test_start_rejects_occupied_port_before_creating_files(tmp_path: Path) -> None:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = listener.getsockname()[1]
        result = invoke("start", "--repo-root", str(tmp_path), "--run-id", "test", "--backend-port", str(port))
    assert result.returncode == 2
    assert "occupied port" in result.stderr
    assert list(tmp_path.iterdir()) == []


def test_stop_continues_when_observed_child_disappears(monkeypatch) -> None:
    module = load_module()
    class Child:
        pid = 999999
    class Root:
        def children(self, recursive):
            return [Child()]
        def terminate(self):
            self.terminated = True
    root = Root()
    monkeypatch.setattr(module, "owned_process", lambda row: root)
    def vanished(pid):
        raise module.psutil.NoSuchProcess(pid)
    monkeypatch.setattr(module, "receipt", vanished)
    monkeypatch.setattr(module.psutil, "wait_procs", lambda processes, timeout: (processes, []))
    module.stop_processes({"processes": [{"pid": 1}]})
    assert root.terminated


def test_status_reports_exited_instead_of_stale_running(tmp_path: Path) -> None:
    run = tmp_path / "_attic/runtime/mes-browser-regression/test"
    run.mkdir(parents=True)
    (run / "session.json").write_text(json.dumps({
        "repo_root": str(tmp_path.resolve()), "run_dir": str(run.resolve()),
        "status": "running", "processes": [{"pid": 99999999, "created_at": 0, "command": []}],
    }), encoding="utf-8")
    result = invoke("status", "--repo-root", str(tmp_path), "--run-id", "test")
    assert result.returncode == 0
    assert json.loads(result.stdout)["status"] == "exited"


def test_start_readiness_failure_stops_owned_processes_and_retains_evidence(tmp_path: Path, monkeypatch) -> None:
    import io
    import zipfile
    module = load_module()
    monkeypatch.setenv("NEXT_PUBLIC_API_URL", "http://original-server:8011")
    (tmp_path / "frontend/node_modules/next/dist/bin").mkdir(parents=True)
    (tmp_path / "frontend/node_modules/next/dist/bin/next").touch()
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zipped:
        zipped.writestr("backend/bootstrap_db.py", "")
        zipped.writestr("frontend/package.json", "{}")
    monkeypatch.setattr(module.subprocess, "check_output", lambda command, **kwargs: "v20.20.2" if command[-1] == "--version" else (archive.getvalue() if "archive" in command else "test-head"))
    monkeypatch.setattr(module.subprocess, "run", lambda *args, **kwargs: None)
    processes = []
    def launch_owned(command, cwd, env, log):
        assert not env.get("NEXT_PUBLIC_API_URL")
        process = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
        processes.append(process)
        return module.receipt(process.pid)
    monkeypatch.setattr(module, "launch", launch_owned)
    def not_ready(session):
        raise ValueError("forced readiness failure")
    monkeypatch.setattr(module, "await_ready", not_ready)
    with socket.socket() as first, socket.socket() as second:
        first.bind(("127.0.0.1", 0)); second.bind(("127.0.0.1", 0))
        ports = first.getsockname()[1], second.getsockname()[1]
    args = SimpleNamespace(backend_port=ports[0], frontend_port=ports[1], frontend_host="localhost", overlay=[], overlay_file=None, node=sys.executable)
    run = tmp_path / "_attic/runtime/mes-browser-regression/test"
    try:
        with pytest.raises(ValueError, match="forced readiness failure"):
            module.start(args, tmp_path, run)
        assert all(process.wait(timeout=5) is not None for process in processes)
        assert json.loads((run / "session.json").read_text(encoding="utf-8"))["status"] == "failed"
        assert json.loads((run / "session.json").read_text(encoding="utf-8"))["frontend_url"] == f"http://localhost:{ports[1]}"
        assert (run / "workspace/backend/bootstrap_db.py").exists()
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=5)


def test_reused_worker_pid_does_not_block_owned_root_cleanup(monkeypatch) -> None:
    module = load_module()
    class Root:
        def children(self, recursive):
            return []
        def terminate(self):
            self.terminated = True
    root = Root()
    def ownership(row):
        if row["pid"] == 3:
            raise ValueError("ownership mismatch")
        return root
    monkeypatch.setattr(module, "owned_process", ownership)
    monkeypatch.setattr(module.psutil, "wait_procs", lambda processes, timeout: (processes, []))
    module.stop_processes({"processes": [{"pid": 1}, {"pid": 2}, {"pid": 3}]})
    assert root.terminated
