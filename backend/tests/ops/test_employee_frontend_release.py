"""Prove release preparation and rollback without touching either running server."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[3]
TOOL = ROOT / "scripts" / "ops" / "employee_frontend_release.py"


def _module():
    assert TOOL.is_file(), "isolated frontend release preparation is not implemented"
    spec = importlib.util.spec_from_file_location("employee_frontend_release", TOOL)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _write(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")


def _source(tmp_path: Path) -> Path:
    frontend = tmp_path / "source" / "frontend"
    _write(frontend / "package.json", json.dumps({"name": "fixture", "engines": {"node": ">=20 <21"}, "dependencies": {"next": "16.3.4", "react": "19.2.8", "react-dom": "19.2.8"}}))
    _write(frontend / "package-lock.json", json.dumps({"lockfileVersion": 3, "packages": {"node_modules/" + name: {"version": version} for name, version in {"next": "16.3.4", "react": "19.2.8", "react-dom": "19.2.8"}.items()}}))
    _write(frontend / "app" / "page.tsx", "export default function Page() { return null; }")
    _write(frontend / ".env.local", "PRIVATE_FIXTURE=do-not-export")
    _write(frontend / "node_modules" / "old" / "index.js", "old installed dependency")
    _write(frontend / ".next" / "cache", "development cache")
    _write(frontend / "next-env.d.ts", "generated development paths")
    return frontend


def _fake_toolchain(tmp_path: Path) -> Path:
    node = tmp_path / "tools" / "node.exe"
    _write(node, "node20 fixture")
    _write(node.parent / "npm.cmd", "npm fixture")
    _write(node.parent / "node_modules" / "npm" / "bin" / "npm-cli.js", "npm CLI fixture")
    return node


def _prepare(module, tmp_path: Path, monkeypatch, *, fail: str = ""):
    source = _source(tmp_path)
    node = _fake_toolchain(tmp_path)
    monkeypatch.setattr(module, "node_version", lambda _node: "v20.20.2")
    events = []

    def command(argv, cwd, environment, log):
        label = "install" if "ci" in argv else "build" if "build" in argv else "bundle"
        events.append(label)
        assert environment["BACKEND_INTERNAL_URL"] == "http://localhost:8010"
        assert environment["NEXT_PUBLIC_MES_ENV"] == "employee"
        assert not (cwd / ".env.local").exists()
        if label == fail:
            raise module.ReleaseError("fixture " + label + " failure")
        if label == "install":
            for name, version in {"next": "16.3.4", "react": "19.2.8", "react-dom": "19.2.8"}.items():
                _write(cwd / "node_modules" / name / "package.json", json.dumps({"version": version}))
        if label == "build":
            _write(cwd / ".next-prod" / "BUILD_ID", "built-id")
        _write(log, label + " passed")

    monkeypatch.setattr(module, "run_command", command)
    release = module.prepare(source, tmp_path / "runtime", node)
    return source, node, release, events


def test_preparation_isolated_excludes_secrets_and_builds_matching_dependencies(tmp_path, monkeypatch):
    module = _module()
    source, _, release, events = _prepare(module, tmp_path, monkeypatch)
    assert events == ["install", "build", "bundle"]
    assert (source / "node_modules" / "old" / "index.js").is_file()
    assert not (release / "frontend" / ".env.local").exists()
    assert not (release / "frontend" / ".next").exists()
    assert not (release / "frontend" / "node_modules" / "old").exists()
    assert json.loads((release / "receipt.json").read_text())["status"] == "READY"


@pytest.mark.parametrize("stage", ["install", "build", "bundle"])
def test_failed_preparation_never_publishes_ready(tmp_path, monkeypatch, stage):
    module = _module()
    with pytest.raises(module.ReleaseError, match="fixture"):
        _prepare(module, tmp_path, monkeypatch, fail=stage)
    assert not list((tmp_path / "runtime").rglob("receipt.json"))


def test_source_change_and_artifact_tampering_invalidate_prepared_release(tmp_path, monkeypatch):
    module = _module()
    source, node, release, _ = _prepare(module, tmp_path, monkeypatch)
    module.verify(release, source, node)
    _write(source / "app" / "page.tsx", "changed after verification")
    with pytest.raises(module.ReleaseError, match="source"):
        module.verify(release, source, node)
    _write(source / "app" / "page.tsx", "export default function Page() { return null; }")
    _write(release / "frontend" / ".next-prod" / "BUILD_ID", "tampered")
    with pytest.raises(module.ReleaseError, match="artifact"):
        module.verify(release, source, node)


def test_install_and_rollback_restore_old_code_dependencies_build_and_node_setting(tmp_path, monkeypatch):
    module = _module()
    source, node, release, _ = _prepare(module, tmp_path, monkeypatch)
    employee = tmp_path / "employee"
    _write(employee / "frontend" / "package.json", "old package")
    _write(employee / "frontend" / "node_modules" / "old.txt", "old dependency")
    _write(employee / "frontend" / ".next-prod" / "BUILD_ID", "old build")
    _write(employee / "frontend" / ".env.local", "EMPLOYEE_FIXTURE=preserve")
    _write(employee / "scripts" / "dev" / "start-frontend.ps1", "old runtime")
    _write(employee / "_attic" / "runtime" / "frontend-node-path.txt", "old-node.exe")
    record = module.install(release, source, node, employee)
    assert (employee / "frontend" / ".next-prod" / "BUILD_ID").read_text() == "built-id"
    assert (employee / "frontend" / ".env.local").read_text() == "EMPLOYEE_FIXTURE=preserve"
    _write(employee / "scripts" / "dev" / "start-frontend.ps1", "new runtime")
    module.rollback(record, employee)
    assert (employee / "frontend" / "package.json").read_text() == "old package"
    assert (employee / "frontend" / "node_modules" / "old.txt").read_text() == "old dependency"
    assert (employee / "frontend" / ".next-prod" / "BUILD_ID").read_text() == "old build"
    assert (employee / "scripts" / "dev" / "start-frontend.ps1").read_text() == "old runtime"
    assert (employee / "_attic" / "runtime" / "frontend-node-path.txt").read_text() == "old-node.exe"


def test_wrong_node_is_rejected_before_any_install(tmp_path, monkeypatch):
    module = _module()
    monkeypatch.setattr(module, "node_version", lambda _node: "v24.15.0")
    with pytest.raises(module.ReleaseError, match="Node 20"):
        module.prepare(_source(tmp_path), tmp_path / "runtime", _fake_toolchain(tmp_path))
    assert not list((tmp_path / "runtime").rglob("receipt.json"))


def test_backend_change_invalidates_code_manifest_but_database_does_not(tmp_path):
    module = _module()
    root = tmp_path / "source"
    _write(root / "backend" / "app" / "main.py", "old code")
    _write(root / "scripts" / "ops" / "check.py", "checker")
    _write(root / "backend" / "mes.db", "original")
    record = module.snapshot_code(root, tmp_path / "runtime")
    _write(root / "backend" / "mes.db", "ongoing business")
    module.verify_code(root, record)
    _write(root / "backend" / "app" / "main.py", "new code")
    with pytest.raises(module.ReleaseError, match="source changed"):
        module.verify_code(root, record)


def test_migration_boundary_blocks_automatic_rollback_and_pending_deploy(tmp_path, monkeypatch):
    module = _module()
    source, node, release, _ = _prepare(module, tmp_path, monkeypatch)
    employee = tmp_path / "employee"
    _write(employee / "frontend" / "package.json", "old package")
    _write(employee / "backend" / "mes.db", "business rows")
    record = module.install(release, source, node, employee)
    with pytest.raises(module.ReleaseError, match="recovery"):
        module.assert_no_pending(employee)
    module.mark(record, employee, "MIGRATING")
    with pytest.raises(module.ReleaseError, match="migration boundary"):
        module.rollback(record, employee)
    assert (employee / "backend" / "mes.db").read_text() == "business rows"
    module.mark(record, employee, "CONFIRMED")
    module.assert_no_pending(employee)


def test_corrupt_backup_never_becomes_backed_up(tmp_path, monkeypatch):
    module = _module()
    source, node, release, _ = _prepare(module, tmp_path, monkeypatch)
    employee = tmp_path / "employee"
    _write(employee / "frontend" / "package.json", "old package")
    _write(employee / "backend" / "app.py", "old backend")
    copy = module.shutil.copy2

    def corrupt(source, target, *args, **kwargs):
        result = copy(source, target, *args, **kwargs)
        if "old-backend" in str(target):
            Path(target).write_text("corrupt")
        return result

    monkeypatch.setattr(module.shutil, "copy2", corrupt)
    with pytest.raises(module.ReleaseError, match="copy"):
        module.install(release, source, node, employee)
    assert (employee / "frontend" / "package.json").read_text() == "old package"


def test_install_preflight_rejects_missing_source_before_employee_write(tmp_path, monkeypatch):
    module = _module()
    source, node, release, _ = _prepare(module, tmp_path, monkeypatch)
    employee = tmp_path / "employee"
    _write(employee / "frontend" / "package.json", "old package")
    before = module.files(employee)
    with pytest.raises(module.ReleaseError, match="required"):
        module.install_preflight(release, source, node, employee, ["start.bat"])
    assert module.files(employee) == before


def test_retry_cannot_accept_a_corrupt_restored_frontend(tmp_path, monkeypatch):
    module = _module()
    source, node, release, _ = _prepare(module, tmp_path, monkeypatch)
    employee = tmp_path / "employee"
    _write(employee / "frontend" / "package.json", "old package")
    record = module.install(release, source, node, employee)
    _write(record.parent / "old-frontend" / "package.json", "corrupt backup")
    for _ in range(2):
        with pytest.raises(module.ReleaseError, match="frontend restoration"):
            module.rollback(record, employee)
        assert json.loads(record.read_text())["phase"] != "ROLLED_BACK"


def test_missing_employee_frontend_is_detected_in_preflight(tmp_path, monkeypatch):
    module = _module()
    source, node, release, _ = _prepare(module, tmp_path, monkeypatch)
    with pytest.raises(module.ReleaseError, match="directory"):
        module.install_preflight(release, source, node, tmp_path / "missing-employee", [])


def test_missing_node_backup_cannot_accept_new_node_setting(tmp_path, monkeypatch):
    module = _module()
    source, node, release, _ = _prepare(module, tmp_path, monkeypatch)
    employee = tmp_path / "employee"
    _write(employee / "frontend" / "package.json", "old package")
    _write(employee / "_attic/runtime/frontend-node-path.txt", "old-node")
    record = module.install(release, source, node, employee)
    (record.parent / "old-node-path.txt").unlink()
    with pytest.raises(module.ReleaseError, match="Node setting"):
        module.rollback(record, employee)
    assert json.loads(record.read_text())["phase"] != "ROLLED_BACK"
