"""Bound employee recovery is exercised only against isolated code and SQLite."""

from __future__ import annotations

import importlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from scripts.ops import employee_frontend_release as release  # noqa: E402


def test_sync_uses_bound_admission_and_fenced_activation() -> None:
    source = (ROOT / "scripts/dev/sync-to-employee.ps1").read_text(encoding="utf-8-sig")
    assert "employee_release_recovery.py" in source
    assert "EMPLOYEE_RECOVERY_ADMISSION_SHA256" in source
    assert "-Command 'activate'" in source
    assert "-Command 'migrating'" not in source
    assert "-Command 'confirm'" not in source
    assert "--structural-rollback" not in source


def test_recovery_command_requires_the_explicit_admission_contract() -> None:
    """The new entry point must exist before any recovery behavior is implemented."""
    path = ROOT / "scripts/ops/employee_release_recovery.py"
    assert path.is_file(), "bound employee release recovery is not implemented"
    recovery = importlib.import_module("scripts.ops.employee_release_recovery")
    assert recovery.ADMISSION_CONTRACT == "employee-release-recovery-admission/v1"


def _write(path: Path, value: str = "fixture") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")


def _fixture(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, *, node_location: str | None = None
) -> tuple[ModuleType, Path, Path, Path, Path, Path]:
    recovery = importlib.import_module("scripts.ops.employee_release_recovery")
    employee = tmp_path / "employee"
    for name in ("backend/code.py", "scripts/code.py", "frontend/app.js", "start.bat"):
        _write(employee / name, "old")
    _write(employee / "backend/alembic/versions/0038.py", "old migration")
    old_node = (employee / "_attic/runtime/tools/old-node/node.exe" if node_location == "local"
                else tmp_path / "shared-node/node.exe") if node_location else None
    if old_node is not None:
        _write(old_node, "old executable bytes")
        _write(old_node.parent / "npm.cmd", "old npm bytes")
    old_config = str(old_node) if old_node is not None else "old node"
    _write(employee / "_attic/runtime/frontend-node-path.txt", old_config)
    database = employee / "backend/mes.db"
    with sqlite3.connect(database) as connection:
        connection.executescript(
            "CREATE TABLE alembic_version(version_num TEXT); INSERT INTO alembic_version VALUES ('0038'); CREATE TABLE data_revision(id INTEGER PRIMARY KEY, revision INTEGER, updated_at TEXT); INSERT INTO data_revision VALUES (1,8,'2026-10-07'); CREATE TABLE ledger(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO ledger VALUES (1,'old');"
        )
    directory = employee / "_attic/runtime/frontend-releases/test"
    directory.mkdir(parents=True)
    journal = {
        "employee_root": str(employee),
        "phase": "INSTALLED",
        "config_existed": True,
        "config_hash": recovery._sha(
            employee / "_attic/runtime/frontend-node-path.txt"
        ),
        "frontend_moved": True,
        "code_backups": {},
        "root_files": {"start.bat": recovery._sha(employee / "start.bat")},
    }
    for name in ("backend", "scripts"):
        journal["code_backups"][name] = release.files(employee / name, source=True)
        release._copy_files(
            employee / name, directory / ("old-" + name), journal["code_backups"][name]
        )
    journal["old_frontend"] = release.files(employee / "frontend")
    release._copy_files(
        employee / "frontend", directory / "old-frontend", journal["old_frontend"]
    )
    release._copy_files(
        employee, directory, {"start.bat": journal["root_files"]["start.bat"]}
    )
    _write(directory / "old-node-path.txt", old_config)
    if old_node is not None:
        journal["old_node"] = {"path": str(old_node), "files": release.files(old_node.parent)}
        release._copy_files(old_node.parent, directory / "old-node", journal["old_node"]["files"])
    backup = employee / "_attic/runtime/backups/sqlite/old.db"
    backup.parent.mkdir(parents=True)
    recovery.restore_db._copy_live_sqlite(database, backup)
    manifest = recovery.backup_manifest.build_structural_sqlite_manifest(
        backup,
        published_name=backup.name,
        source_snapshot={
            "method": "sqlite3.backup",
            "wal_included": True,
            "journal_mode": "delete",
            "physical_generation": "a" * 64,
        },
    )
    release._json(recovery.backup_manifest.manifest_path_for(backup), manifest)
    for name in ("backend/code.py", "scripts/code.py", "frontend/app.js", "start.bat"):
        _write(employee / name, "new")
    _write(employee / "backend/alembic/versions/0040.py", "new migration")
    _write(employee / "_attic/runtime/frontend-node-path.txt", "new node")
    journal["installed_frontend"] = release.files(employee / "frontend")
    journal["incoming_frontend"] = journal["installed_frontend"]
    record = directory / "journal.json"
    release._json(record, journal)
    monkeypatch.setattr(recovery, "_validate_database", lambda root, database: None)
    monkeypatch.setattr(
        recovery,
        "_validator_hash",
        lambda root: release._digest(release._code_files(root)),
    )
    monkeypatch.setattr(recovery, "_stop_services", lambda root: None)
    monkeypatch.setattr(recovery, "_assert_stopped", lambda root: None)
    admission = recovery.begin(record, employee, backup)
    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE alembic_version SET version_num='0040'")
        connection.execute("UPDATE ledger SET value='migrated'")
    return recovery, employee, record, database, backup, admission


def test_recovery_restores_old_db_and_code_and_preserves_original_backup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    receipt = recovery.recover(record, employee, recovery._sha(admission))
    assert json.loads(record.read_text())["phase"] == "ROLLED_BACK"
    assert json.loads(receipt.read_text())["state"] == "PASS"
    assert (record.parent / "old-frontend/app.js").read_text() == "old"
    assert (employee / "frontend/app.js").read_text() == "old"
    assert not (employee / "backend/alembic/versions/0040.py").exists()
    assert (
        employee / "_attic/runtime/frontend-node-path.txt"
    ).read_text() == "old node"
    recovery.cutover.compare_exact_database(backup, database)


@pytest.mark.parametrize("kind", ["saved-bytes", "shared-executable"])
def test_node_tampering_is_rejected_before_service_stop(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    recovery, employee, record, database, _, admission = _fixture(
        tmp_path, monkeypatch, node_location="external" if kind == "shared-executable" else "local"
    )
    old_node = Path(json.loads(record.read_text())["old_node"]["path"])
    damaged = old_node if kind == "shared-executable" else record.parent / "old-node/node.exe"
    damaged.write_text("tampered", encoding="utf-8")
    before = recovery.restore_db._sqlite_snapshot_digest(database)
    stops = []
    monkeypatch.setattr(recovery, "_stop_services", stops.append)
    with pytest.raises(release.ReleaseError, match="Node toolchain"):
        recovery.recover(record, employee, recovery._sha(admission))
    assert stops == []
    assert recovery.restore_db._sqlite_snapshot_digest(database) == before
    assert damaged.read_text() == "tampered"


def test_late_node_tamper_cannot_publish_recovery_pass(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    recovery, employee, record, database, _, admission = _fixture(tmp_path, monkeypatch, node_location="local")
    old_node = Path(json.loads(record.read_text())["old_node"]["path"])
    failed_database = recovery.restore_db._sqlite_snapshot_digest(database)
    original = release._restore_previous_code

    def tamper_after_restore(*args: object, **kwargs: object) -> None:
        original(*args, **kwargs)
        old_node.write_text("tampered after restoration", encoding="utf-8")

    monkeypatch.setattr(release, "_restore_previous_code", tamper_after_restore)
    with pytest.raises(release.ReleaseError, match="Node toolchain"):
        recovery.recover(record, employee, recovery._sha(admission))
    assert json.loads(record.read_text())["phase"] == "MIGRATING"
    assert json.loads((record.parent / "recovery.json").read_text())["state"] == "FAILED"
    assert recovery.restore_db._sqlite_snapshot_digest(database) == failed_database


@pytest.mark.parametrize(
    "kind",
    [
        "confirmed",
        "legacy",
        "friday",
        "admission-tamper",
        "backup-tamper",
        "code-drift",
    ],
)
def test_recovery_rejects_unbound_or_drifted_state_before_stop(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    digest = recovery._sha(admission)
    journal = json.loads(record.read_text())
    if kind == "confirmed":
        journal["phase"] = "CONFIRMED"
    if kind == "legacy":
        journal.pop("recovery_admission")
    if kind == "friday":
        journal["friday_cutover"] = {}
    release._json(record, journal)
    if kind == "admission-tamper":
        admission.write_text("{}")
    if kind == "backup-tamper":
        backup.write_bytes(b"tampered")
    if kind == "code-drift":
        _write(employee / "backend/code.py", "drift")
    stopped = []
    monkeypatch.setattr(recovery, "_stop_services", lambda root: stopped.append(root))
    with pytest.raises((release.ReleaseError, ValueError)):
        recovery.recover(record, employee, digest)
    assert stopped == []
    assert (employee / "frontend/app.js").read_text() == "new"


def test_code_restore_failure_keeps_db_atomic_and_can_resume_explicitly(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    failed_digest = recovery.restore_db._sqlite_snapshot_digest(database)
    original = release._restore_previous_code

    def fail_after_code(*args: object, **kwargs: object) -> None:
        original(*args, **kwargs)
        raise OSError("injected code restore failure")

    monkeypatch.setattr(release, "_restore_previous_code", fail_after_code)
    with pytest.raises(OSError, match="injected"):
        recovery.recover(record, employee, recovery._sha(admission))
    if os.name == "nt":
        assert 'EMPLOYEE_RECOVERY_RESUME=& "' in capsys.readouterr().err
    receipt = record.parent / "recovery.json"
    assert json.loads(receipt.read_text())["state"] == "FAILED"
    assert recovery.restore_db._sqlite_snapshot_digest(database) == failed_digest
    assert json.loads(record.read_text())["phase"] == "MIGRATING"
    assert (record.parent / "failed-code/frontend/app.js").read_text() == "new"
    monkeypatch.setattr(release, "_restore_previous_code", original)
    recovery.recover(
        record,
        employee,
        recovery._sha(admission),
        resume=True,
        recovery_sha256=recovery._sha(receipt),
    )
    recovery.cutover.compare_exact_database(backup, database)
    assert json.loads(record.read_text())["phase"] == "ROLLED_BACK"


def _crash_recovery(record: Path, employee: Path, admission: Path, stage: str) -> None:
    """Kill a separate owner so Python exception cleanup cannot repair its state."""
    code = """
import os, sys
from pathlib import Path
from scripts.ops import employee_release_recovery as recovery
release = recovery.release
recovery._validate_database = lambda *args: None
recovery._validator_hash = lambda root: release._digest(release._code_files(root))
recovery._stop_services = lambda root: None
recovery._assert_stopped = lambda root: None
record, employee, admission = map(Path, sys.argv[1:4])
stage = sys.argv[4]
original = release._restore_previous_code
def crash_code(*args, **kwargs):
    if stage == 'after-code':
        original(*args, **kwargs)
    os._exit(73)
if stage == 'before-db-receipt':
    copy = recovery.restore_db._copy_sqlite_into_connection
    def crash_install(*args, **kwargs):
        copy(*args, **kwargs)
        os._exit(73)
    recovery.restore_db._copy_sqlite_into_connection = crash_install
else:
    release._restore_previous_code = crash_code
if stage == 'mid-code':
    release._restore_previous_code = original
    copy = release._copy_files
    def crash_copy(source, destination, manifest):
        copy(source, destination, manifest)
        if destination == employee / 'backend':
            os._exit(73)
    release._copy_files = crash_copy
    if hasattr(release, '_copy_recovery_file'):
        atomic_copy = release._copy_recovery_file
        def crash_atomic_copy(source, target, digest, staging):
            atomic_copy(source, target, digest, staging)
            if target == employee / 'backend/code.py':
                os._exit(73)
        release._copy_recovery_file = crash_atomic_copy
if stage == 'frontend-swap':
    release._restore_previous_code = original
    rename = Path.rename
    def crash_rename(path, target):
        result = rename(path, target)
        if path == employee / 'frontend':
            os._exit(73)
        return result
    Path.rename = crash_rename
if stage.startswith('rollback-'):
    release._restore_previous_code = original
    copy_db = recovery.restore_db._copy_sqlite_into_connection
    copies = []
    def crash_after_rollback(*args, **kwargs):
        copy_db(*args, **kwargs)
        copies.append(True)
        if len(copies) == 2:
            os._exit(73)
    recovery.restore_db._copy_sqlite_into_connection = crash_after_rollback
    def fail(*args, **kwargs):
        raise OSError('injected rollback trigger')
    if stage == 'rollback-before-code':
        release._restore_previous_code = fail
    elif stage == 'rollback-mid-code':
        copy_code = release._copy_recovery_file
        def fail_after_copy(source, target, digest, staging):
            copy_code(source, target, digest, staging)
            if target == employee / 'backend/code.py':
                fail()
        release._copy_recovery_file = fail_after_copy
    elif stage == 'rollback-after-code':
        recovery._validate_database = lambda root, database: fail() if '.installed-' in database.name else None
    elif stage == 'rollback-pass':
        write = recovery._write
        def fail_terminal(path, payload):
            if path == record and payload.get('phase') == 'ROLLED_BACK':
                fail()
            write(path, payload)
        recovery._write = fail_terminal
recovery.recover(record, employee, recovery._sha(admission))
"""
    result = subprocess.run(
        [sys.executable, "-c", code, str(record), str(employee), str(admission), stage],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 73, result.stdout + result.stderr


@pytest.mark.parametrize(
    "stage",
    ["before-db-receipt", "before-code", "frontend-swap", "mid-code", "after-code"],
)
def test_resume_after_process_exit_recognizes_only_recorded_restoration_states(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, stage: str
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    _crash_recovery(record, employee, admission, stage)
    receipt = record.parent / "recovery.json"
    assert recovery._load(receipt)["state"] == "RESTORING"
    assert recovery._load(record)["phase"] == "MIGRATING"
    recovery.cutover.compare_exact_database(backup, database)
    if stage == "frontend-swap":
        assert not (employee / "frontend").exists()
    else:
        assert (employee / "frontend/app.js").read_text() == (
            "old" if stage in {"mid-code", "after-code"} else "new"
        )
    failed_digest = recovery._sha(record.parent / "failed.db")
    recovery.recover(
        record,
        employee,
        recovery._sha(admission),
        resume=True,
        recovery_sha256=recovery._sha(receipt),
    )
    assert recovery._load(receipt)["state"] == "PASS"
    assert recovery._load(record)["phase"] == "ROLLED_BACK"
    assert recovery._sha(record.parent / "failed.db") == failed_digest
    assert recovery._code_state(employee) == recovery._load(admission)["old_code"]
    recovery.cutover.compare_exact_database(backup, database)


@pytest.mark.parametrize("kind", ["database", "code", "out-of-order-old-code"])
def test_process_exit_resume_still_rejects_real_drift(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    _crash_recovery(record, employee, admission, "before-code")
    receipt = record.parent / "recovery.json"
    digest = recovery._sha(receipt)
    if kind == "database":
        with sqlite3.connect(database) as connection:
            connection.execute("UPDATE ledger SET value='external writer'")
    elif kind == "code":
        _write(employee / "frontend/app.js", "external code")
    else:
        _write(employee / "_attic/runtime/frontend-node-path.txt", "old node")
    stopped = []
    monkeypatch.setattr(recovery, "_stop_services", lambda root: stopped.append(root))
    with pytest.raises(release.ReleaseError, match="drift"):
        recovery.recover(
            record,
            employee,
            recovery._sha(admission),
            resume=True,
            recovery_sha256=digest,
        )
    assert stopped == []


@pytest.mark.parametrize(
    "stage",
    ["rollback-before-code", "rollback-mid-code", "rollback-after-code", "rollback-pass"],
)
def test_resume_after_process_exit_during_failure_rollback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, stage: str
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    failed_digest = recovery.restore_db._sqlite_snapshot_digest(database)
    _crash_recovery(record, employee, admission, stage)
    receipt = record.parent / "recovery.json"
    assert recovery.restore_db._sqlite_snapshot_digest(database) == failed_digest
    assert recovery._load(record)["phase"] == "MIGRATING"
    recovery.recover(
        record, employee, recovery._sha(admission), resume=True,
        recovery_sha256=recovery._sha(receipt),
    )
    assert recovery._load(receipt)["state"] == "PASS"
    assert recovery._load(record)["phase"] == "ROLLED_BACK"
    assert recovery._sha(record.parent / "failed.db") == failed_digest
    assert recovery._code_state(employee) == recovery._load(admission)["old_code"]
    recovery.cutover.compare_exact_database(backup, database)


@pytest.mark.parametrize("kind", ["database", "code", "out-of-order-old-code", "reverted-code"])
def test_failure_rollback_resume_rejects_drift_before_stop(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    stage = "rollback-after-code" if kind == "reverted-code" else "rollback-mid-code"
    _crash_recovery(record, employee, admission, stage)
    receipt = record.parent / "recovery.json"
    digest = recovery._sha(receipt)
    if kind == "database":
        with sqlite3.connect(database) as connection:
            connection.execute("UPDATE ledger SET value='external writer'")
    elif kind == "code":
        _write(employee / "backend/code.py", "external code")
    elif kind == "reverted-code":
        recovery._save_failed_code(
            record.parent / "failed-code", employee,
            recovery._load(receipt)["failed_code"],
        )
        assert recovery._code_state(employee) == recovery._load(admission)["incoming_code"]
    else:
        _write(employee / "_attic/runtime/frontend-node-path.txt", "old node")
    stopped = []
    monkeypatch.setattr(recovery, "_stop_services", lambda root: stopped.append(root))
    with pytest.raises(release.ReleaseError, match="drift"):
        recovery.recover(
            record, employee, recovery._sha(admission), resume=True,
            recovery_sha256=digest,
        )
    assert stopped == []


def test_existing_writer_prevents_any_code_restore(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    with sqlite3.connect(database, isolation_level=None) as writer:
        writer.execute("BEGIN IMMEDIATE")
        with pytest.raises(
            (release.ReleaseError, recovery.backup_manifest.BackupValidationError)
        ):
            recovery.recover(record, employee, recovery._sha(admission))
        writer.execute("ROLLBACK")
    assert (employee / "frontend/app.js").read_text() == "new"


@pytest.mark.parametrize("kind", ["hash", "code", "database", "owner"])
def test_resume_rejects_changed_evidence_and_active_owner(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    original = release._restore_previous_code
    monkeypatch.setattr(
        release,
        "_restore_previous_code",
        lambda *a, **k: (_ for _ in ()).throw(OSError("fault")),
    )
    with pytest.raises(OSError):
        recovery.recover(record, employee, recovery._sha(admission))
    receipt = record.parent / "recovery.json"
    digest = recovery._sha(receipt)
    if kind == "hash":
        digest = "0" * 64
    if kind == "code":
        _write(employee / "frontend/app.js", "drift")
    if kind == "database":
        with sqlite3.connect(database) as connection:
            connection.execute("UPDATE ledger SET value='drift'")
    if kind == "owner":
        payload = json.loads(receipt.read_text())
        payload["owner"] = recovery.current_process_owner()
        release._json(receipt, payload)
        digest = recovery._sha(receipt)
    monkeypatch.setattr(release, "_restore_previous_code", original)
    with pytest.raises(release.ReleaseError):
        recovery.recover(
            record,
            employee,
            recovery._sha(admission),
            resume=True,
            recovery_sha256=digest,
        )


def test_raw_confirm_cannot_bypass_normal_activation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    with pytest.raises(release.ReleaseError, match="activate"):
        release._confirm_from_cli(record, employee)


def test_live_recovery_claim_cannot_be_stolen_by_stale_owner_metadata(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    with recovery._claim(record, resume=False):
        release._json(
            record.parent / "recovery-owner.json",
            {"pid": 2147483647, "started_at_ns": 1},
        )
        with pytest.raises(release.ReleaseError, match="owned|owner"):
            with recovery._claim(record, resume=True):
                pass


@pytest.mark.parametrize("stage", ["stop", "snapshot"])
def test_early_partial_failure_has_receipt_and_explicit_resume(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, stage: str
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    name = "_stop_services" if stage == "stop" else "_save_failed_code"
    original = getattr(recovery, name)

    def fail(*args: object, **kwargs: object) -> None:
        raise OSError("early stage fault")

    monkeypatch.setattr(recovery, name, fail)
    with pytest.raises(OSError, match="early stage"):
        recovery.recover(record, employee, recovery._sha(admission))
    receipt = record.parent / "recovery.json"
    assert receipt.exists(), (
        "partial stop or snapshot failure needs a resumable receipt"
    )
    assert json.loads(receipt.read_text())["state"] == "FAILED"
    monkeypatch.setattr(recovery, name, original)
    recovery.recover(
        record,
        employee,
        recovery._sha(admission),
        resume=True,
        recovery_sha256=recovery._sha(receipt),
    )
    recovery.cutover.compare_exact_database(backup, database)


def test_backup_tamper_during_restoration_rolls_database_back(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    initial = recovery.restore_db._sqlite_snapshot_digest(database)
    original = release._restore_previous_code

    def tamper(*args: object, **kwargs: object) -> None:
        original(*args, **kwargs)
        # Logical rows remain identical; even a header mutation must invalidate admission.
        with sqlite3.connect(backup) as db:
            db.execute("PRAGMA user_version=123")

    monkeypatch.setattr(release, "_restore_previous_code", tamper)
    with pytest.raises(release.ReleaseError, match="manifest changed|DB.*changed"):
        recovery.recover(record, employee, recovery._sha(admission))
    assert recovery.restore_db._sqlite_snapshot_digest(database) == initial
    assert json.loads(record.read_text())["phase"] == "MIGRATING"


def test_public_recover_requires_the_preserved_executable_root(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    result = recovery.main(
        [
            "recover",
            "--record",
            str(record),
            "--employee-root",
            str(employee),
            "--admission-sha256",
            recovery._sha(admission),
        ]
    )
    assert result == 9
    assert not (record.parent / "recovery.json").exists()


def test_terminal_markers_are_published_before_a_post_fence_writer(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    original = recovery.restore_db._replace_sqlite_atomically
    seen = []

    def writer_after_fence(*args: object, **kwargs: object) -> None:
        original(*args, **kwargs)
        with sqlite3.connect(database, timeout=0, isolation_level=None) as writer:
            writer.execute("BEGIN IMMEDIATE")
            seen.append(json.loads(record.read_text())["phase"])
            writer.execute("UPDATE ledger SET value='later unrelated writer'")
            writer.execute("COMMIT")

    monkeypatch.setattr(
        recovery.restore_db, "_replace_sqlite_atomically", writer_after_fence
    )
    receipt = recovery.recover(record, employee, recovery._sha(admission))
    assert seen == ["ROLLED_BACK"], (
        "release must be terminal before its writer fence opens"
    )
    assert json.loads(receipt.read_text())["actual"][
        "database"
    ] != recovery.restore_db._sqlite_snapshot_digest(database)


@pytest.mark.parametrize("marker", ["receipt", "journal"])
def test_final_marker_failure_restores_failed_db_and_keeps_resumable_phase(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, marker: str
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    before = recovery.restore_db._sqlite_snapshot_digest(database)
    original = recovery._write
    failed = []

    def fail_once(path: Path, payload: dict) -> None:
        terminal = (
            (path.name == "recovery.json" and payload.get("state") == "PASS")
            if marker == "receipt"
            else (path == record and payload.get("phase") == "ROLLED_BACK")
        )
        if terminal and not failed:
            failed.append(True)
            raise OSError("terminal marker failed")
        original(path, payload)

    monkeypatch.setattr(recovery, "_write", fail_once)
    with pytest.raises(OSError, match="terminal marker"):
        recovery.recover(record, employee, recovery._sha(admission))
    assert recovery.restore_db._sqlite_snapshot_digest(database) == before
    assert json.loads(record.read_text())["phase"] == "MIGRATING"
    receipt = record.parent / "recovery.json"
    assert json.loads(receipt.read_text())["state"] == "FAILED"
    recovery.recover(
        record,
        employee,
        recovery._sha(admission),
        resume=True,
        recovery_sha256=recovery._sha(receipt),
    )
    recovery.cutover.compare_exact_database(backup, database)


def test_normal_activation_cannot_race_a_claimed_recovery(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    monkeypatch.setattr(
        release,
        "_require_employee_runtime",
        lambda root: release.RuntimeProfile(root, 8010, 3000, "http://localhost:3000"),
    )
    monkeypatch.setattr(
        release, "_require_employee_database_binding", lambda *args: None
    )
    monkeypatch.setattr(release, "_stop_until_ports_closed", lambda *args: None)
    monkeypatch.setattr(release, "_start_backend", lambda *args: None)
    monkeypatch.setattr(release, "_start_frontend", lambda *args: None)
    monkeypatch.setattr(release, "_verify_activation_http", lambda *args: None)
    with recovery._claim(record, resume=False):
        with pytest.raises(release.ReleaseError, match="owned|owner"):
            release.activate(record, employee)
    assert json.loads(record.read_text())["phase"] == "MIGRATING"


@pytest.mark.parametrize("failure", [None, "start", "health", "confirm"])
def test_normal_activation_holds_writer_fence_until_confirm_or_verified_stop(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure: str | None
) -> None:
    recovery, employee, record, database, backup, admission = _fixture(
        tmp_path, monkeypatch
    )
    assert hasattr(release, "activate"), "normal activation writer fence is missing"
    events = []

    def check(event: str) -> None:
        with sqlite3.connect(database, timeout=0, isolation_level=None) as writer:
            with pytest.raises(sqlite3.OperationalError, match="locked"):
                writer.execute("BEGIN IMMEDIATE")
        events.append(event)
        if event == failure:
            raise release.ReleaseError("injected " + event)

    monkeypatch.setattr(
        release,
        "_require_employee_runtime",
        lambda root: release.RuntimeProfile(root, 8010, 3000, "http://localhost:3000"),
    )
    monkeypatch.setattr(release, "_require_employee_database_binding", lambda *a: None)
    monkeypatch.setattr(release, "_stop_until_ports_closed", lambda *a: check("stop"))
    monkeypatch.setattr(release, "_start_backend", lambda root: check("start"))
    monkeypatch.setattr(release, "_start_frontend", lambda root: check("frontend"))
    monkeypatch.setattr(
        release, "_verify_activation_http", lambda root: check("health")
    )
    original_mark = release.mark

    def confirm(*args: object) -> None:
        check("confirm")
        original_mark(*args)

    monkeypatch.setattr(release, "mark", confirm)
    if failure:
        with pytest.raises(release.ReleaseError, match="injected"):
            release.activate(record, employee)
        assert events[-1] == "stop"
        assert json.loads(record.read_text())["phase"] == "MIGRATING"
    else:
        release.activate(record, employee)
        assert events == ["stop", "start", "frontend", "health", "confirm"]
        assert json.loads(record.read_text())["phase"] == "CONFIRMED"
    with sqlite3.connect(database, timeout=0, isolation_level=None) as writer:
        writer.execute("BEGIN IMMEDIATE")
        writer.execute("ROLLBACK")
