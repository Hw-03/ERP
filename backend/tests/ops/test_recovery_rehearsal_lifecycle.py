"""The rehearsal adapter cannot manage production or an unowned listener."""
from __future__ import annotations

import importlib.util
import hashlib
import json
from pathlib import Path
import socket
import os
import sqlite3
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[3]


def _adapter():
    path = Path(__file__).with_name("recovery_rehearsal.py")
    assert path.is_file(), "The real-process recovery rehearsal adapter is missing"
    spec = importlib.util.spec_from_file_location("recovery_rehearsal", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_lifecycle_rejects_production_and_paths_outside_rehearsal(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    module = _adapter()
    monkeypatch.setattr(module, "OUTPUT_ROOT", tmp_path / "output")
    for employee in (Path("C:/ERP"), Path("C:/ERP-dev"), tmp_path / "employee"):
        with pytest.raises(module.release.ReleaseError, match="isolated"):
            module.IsolatedLifecycle(employee)


def test_lifecycle_refuses_occupied_port_without_signalling_owner(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    module = _adapter()
    monkeypatch.setattr(module, "OUTPUT_ROOT", tmp_path)
    employee = tmp_path / "sandbox" / "employee"
    employee.mkdir(parents=True)
    lifecycle = module.IsolatedLifecycle(employee)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        monkeypatch.setattr(module, "BACKEND_PORT", listener.getsockname()[1])
        with pytest.raises(module.release.ReleaseError, match="occupied|owned"):
            lifecycle.assert_stopped(employee)
        assert listener.getsockname()[1] > 0


def test_lifecycle_refuses_unknown_process_identity(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    module = _adapter()
    monkeypatch.setattr(module, "OUTPUT_ROOT", tmp_path)
    employee = tmp_path / "sandbox" / "employee"
    employee.mkdir(parents=True)
    lifecycle = module.IsolatedLifecycle(employee)
    monkeypatch.setattr(module, "process_started_at_ns", lambda _pid: -1)
    with pytest.raises(module.release.ReleaseError, match="identity"):
        lifecycle.require_identity({"pid": 1, "started_at_ns": 123})


def test_test_adapter_does_not_relax_employee_production_contract() -> None:
    module = _adapter()
    assert module.release.EMPLOYEE_BACKEND_PORT == 8010
    assert module.release.EMPLOYEE_FRONTEND_PORT == 3000
    assert module.release.BUILD_ENV["BACKEND_INTERNAL_URL"] == "http://localhost:8010"
    with pytest.raises(module.release.ReleaseError, match="canonical"):
        module.release._require_employee_runtime(ROOT, installed_code=False)


def test_lifecycle_stops_its_real_owned_process_and_releases_port(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Use a harmless actual HTTP child to test handles and port release on both OSes."""
    module = _adapter()
    monkeypatch.setattr(module, "OUTPUT_ROOT", tmp_path)
    employee = tmp_path / "sandbox/employee"
    employee.mkdir(parents=True)
    with socket.socket() as selection:
        selection.bind(("127.0.0.1", 0))
        port = selection.getsockname()[1]
    monkeypatch.setattr(module, "BACKEND_PORT", port)
    lifecycle = module.IsolatedLifecycle(employee)
    lifecycle.assert_stopped(employee)
    try:
        lifecycle._spawn("backend", [sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
                         employee, os.environ.copy())
        assert lifecycle._probe(f"http://127.0.0.1:{port}/")
        with pytest.raises(module.release.ReleaseError, match="occupied"):
            lifecycle.assert_stopped(employee)
    finally:
        lifecycle.stop(employee)
    assert lifecycle.processes == {}
    lifecycle.assert_stopped(employee)


def test_frozen_capture_rejects_frontend_only_source_change(tmp_path: Path) -> None:
    module = _adapter()
    for relative in ("backend/code.py", "scripts/code.py", "frontend/app/page.tsx"):
        path = tmp_path / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("captured source", encoding="utf-8")
    code = module.release._code_files(tmp_path)
    frontend = module.release.files(tmp_path / "frontend", source=True)
    assert hasattr(module, "assert_frozen_source"), "Full frontend freeze comparison is missing"
    module.assert_frozen_source(tmp_path, code, frontend)
    (tmp_path / "frontend/app/page.tsx").write_text("changed while building", encoding="utf-8")
    with pytest.raises(module.release.ReleaseError, match="source"):
        module.assert_frozen_source(tmp_path, code, frontend)


@pytest.mark.parametrize("change", ["path", "raw-bytes", "toolchain"])
def test_node_capture_rejects_changed_selection_or_bytes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, change: str) -> None:
    module = _adapter()
    config = tmp_path / "frontend-node-path.txt"
    node = tmp_path / "tools/node.exe"
    node.parent.mkdir()
    node.write_bytes(b"captured executable")
    config.write_text(str(node) + "\n", encoding="utf-8")
    monkeypatch.setattr(module.release, "_toolchain", lambda selected: {
        "version": "v20.20.2", "files": module.release.files(selected.parent),
    })
    assert hasattr(module, "node_selection"), "Exact Node selection capture is missing"
    before = module.node_selection(config)
    if change == "path":
        config.write_text(str(tmp_path / "other/node.exe"), encoding="utf-8")
    elif change == "raw-bytes":
        config.write_bytes(config.read_bytes().replace(b"\r\n", b"\n").rstrip(b"\n") + b"\n\n")
    else:
        node.write_bytes(b"changed executable")
    with pytest.raises(module.release.ReleaseError, match="Node"):
        module.assert_node_selection(config, before)


def test_forward_install_failure_restores_actual_previous_release_bytes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Exercise real install_code partial mutation and its automatic rollback."""
    from test_employee_frontend_release import _fake_toolchain, _prepare, _write

    module = _adapter()
    source, node, prepared, _ = _prepare(module.release, tmp_path, monkeypatch)
    employee = tmp_path / "employee"
    for area in ("backend", "scripts"):
        _write(source.parent / area / "code.py", "new source")
        _write(employee / area / "code.py", "old source")
    _write(employee / "frontend/package.json", "old package")
    _write(employee / "frontend/.next-prod/BUILD_ID", "old exact build")
    _write(employee / "frontend/node_modules/old.js", "old exact dependency")
    old_node = _fake_toolchain(employee / "_attic/runtime/old")
    _write(employee / "_attic/runtime/frontend-node-path.txt", str(old_node) + "\n")
    with sqlite3.connect(employee / "backend/mes.db") as connection:
        connection.execute("CREATE TABLE preserved(value TEXT)")
        connection.execute("INSERT INTO preserved VALUES ('old row')")
    before = module.recovery._state(employee)
    previous_node = module.release._previous_node(employee)
    assert hasattr(module, "rehearse_install_failure"), "Forward install failure is not rehearsed"
    result = module.rehearse_install_failure(prepared, source.parent, node, employee)
    assert result["status"] == "PASS"
    assert result["failed_stage"] == "install_code_after_backend_copy"
    assert module.recovery._state(employee) == before
    assert module.release._previous_node(employee) == previous_node


def _crash_receipts(directory: Path, owner: dict[str, int]) -> tuple[Path, bytes, bytes]:
    """Retain deliberate whitespace to prove raw evidence is never reserialized."""
    directory.mkdir()
    record = directory / "journal.json"
    record.write_text("{}", encoding="utf-8")
    owner_raw = (json.dumps(owner, indent=3) + "\r\n").encode()
    receipt_raw = (json.dumps({"owner": owner, "state": "RESTORING", "steps": ["DB_INSTALLED"],
                               "restore_intent": {"stage": "CODE"}, "admission_sha256": "a" * 64}, indent=4) + "\r\n").encode()
    (directory / "recovery-owner.json").write_bytes(owner_raw)
    (directory / "recovery.json").write_bytes(receipt_raw)
    return record, owner_raw, receipt_raw


def test_crash_evidence_preserves_raw_bytes_and_refuses_overwrite(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    module = _adapter()
    owner = {"pid": 7654, "started_at_ns": 123456}
    record, owner_raw, receipt_raw = _crash_receipts(tmp_path / "release", owner)
    monkeypatch.setattr(module.recovery, "process_owner_is_active", lambda observed: False)
    digest = hashlib.sha256(receipt_raw).hexdigest()
    evidence = module._preserve_crash_evidence(record, owner, 73, digest)
    metadata = json.loads(evidence.read_text(encoding="utf-8"))
    assert metadata["status"] == "CAPTURED_BEFORE_RESUME"
    assert metadata["child_exit_code"] == 73 and metadata["child_owner"] == owner
    assert metadata["admission_sha256"] == "a" * 64
    assert metadata["raw_sha256"] == {"recovery-owner.json": hashlib.sha256(owner_raw).hexdigest(), "recovery.json": digest}
    assert (evidence.parent / "recovery-owner.json").read_bytes() == owner_raw
    assert (evidence.parent / "recovery.json").read_bytes() == receipt_raw
    metadata_before = evidence.read_bytes()
    with pytest.raises(FileExistsError):
        module._preserve_crash_evidence(record, owner, 73, digest)
    assert evidence.read_bytes() == metadata_before


@pytest.mark.parametrize("change", ["owner", "receipt-owner", "active", "unknown", "receipt-hash", "exit-code"])
def test_crash_evidence_rejects_unbound_or_unconfirmed_child(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, change: str) -> None:
    module = _adapter()
    owner = {"pid": 7654, "started_at_ns": 123456}
    record, _, receipt_raw = _crash_receipts(tmp_path / "release", owner)
    child_owner = {**owner, "pid": 7655} if change == "owner" else owner
    if change == "receipt-owner":
        receipt = json.loads(receipt_raw)
        receipt["owner"]["pid"] = 7655
        receipt_raw = json.dumps(receipt).encode()
        (record.parent / "recovery.json").write_bytes(receipt_raw)
    if change == "unknown":
        child_owner = {**owner, "started_at_ns": -1}
    monkeypatch.setattr(module.recovery, "process_owner_is_active", lambda observed: change == "active")
    digest = "0" * 64 if change == "receipt-hash" else hashlib.sha256(receipt_raw).hexdigest()
    with pytest.raises(module.release.ReleaseError):
        module._preserve_crash_evidence(record, child_owner, 0 if change == "exit-code" else 73, digest)
    assert not (record.parent / "hard-exit-evidence").exists()


@pytest.mark.parametrize("known_identity", [True, False])
def test_crash_child_collects_native_exit_and_waits_on_unknown_identity(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, known_identity: bool) -> None:
    """A tiny real owned child proves exit collection and avoids an orphan on failure."""
    module = _adapter()
    native_popen = module.subprocess.Popen
    native_started_at_ns = module.process_started_at_ns
    release_signal = tmp_path / "release-child.signal"
    children = []

    def spawn(*args: object, **kwargs: object) -> subprocess.Popen:
        child = native_popen([sys.executable, "-c",
                              "import os,sys,time; from pathlib import Path\n"
                              "while not Path(sys.argv[1]).exists(): time.sleep(0.01)\n"
                              "os._exit(73)", str(release_signal)], **kwargs)
        children.append(child)
        return child

    def probe_identity(pid: int) -> int | None:
        """Keep the child alive until the real birth query completes, including failure."""
        try:
            started_at_ns = native_started_at_ns(pid)
            return started_at_ns if known_identity else None
        finally:
            release_signal.touch()

    monkeypatch.setattr(module.subprocess, "Popen", spawn)
    monkeypatch.setattr(module, "process_started_at_ns", probe_identity)
    if not known_identity:
        with pytest.raises(module.release.ReleaseError, match="identity"):
            module._run_crash_child(tmp_path / "record", tmp_path / "employee", tmp_path / "admission")
    else:
        owner, exit_code = module._run_crash_child(tmp_path / "record", tmp_path / "employee", tmp_path / "admission")
        assert owner["pid"] == children[0].pid and owner["started_at_ns"] >= 0
        assert exit_code == 73
    assert len(children) == 1 and children[0].poll() == 73
