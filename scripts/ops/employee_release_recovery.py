"""Recover one admitted, unconfirmed employee release without restarting services."""

from __future__ import annotations

import argparse
from contextlib import closing, contextmanager
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
from typing import Iterator
import uuid

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.ops import backup_manifest, employee_frontend_release as release  # noqa: E402
from scripts.ops import friday_profile_cutover as cutover, restore_db  # noqa: E402
from scripts.ops.recovery_owner import (  # noqa: E402
    current_process_owner,
    process_owner_is_active,
    valid_process_owner,
)
from scripts.ops.durable_file import durable_replace  # noqa: E402

ADMISSION_CONTRACT = "employee-release-recovery-admission/v1"
RECOVERY_CONTRACT = "employee-release-recovery/v1"
ROOT_FILES = ("start.bat", "watch.bat", "stop.bat", "status.bat")


def _sha(path: Path) -> str:
    """Hash physical evidence without following a deployment link."""
    return hashlib.sha256(release._physical(path).read_bytes()).hexdigest()


def _load(path: Path) -> dict:
    """Require a JSON object, including for externally supplied receipts."""
    value = json.loads(release._physical(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise release.ReleaseError("Recovery evidence must be an object")
    return value


def _write(path: Path, payload: dict) -> None:
    """Persist recovery evidence before the next irreversible operation."""
    path = release._physical(path)
    pending = path.with_name(path.name + ".pending-" + uuid.uuid4().hex)
    with pending.open("x", encoding="utf-8") as output:
        json.dump(payload, output, indent=2, sort_keys=True)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())
    durable_replace(pending, path)


def _bound_journal(record: Path, employee: Path, phase: str) -> tuple[Path, dict]:
    """Reject legacy/Friday/confirmed journals before any lifecycle action."""
    record = release._inside(record, employee / "_attic/runtime/frontend-releases")
    journal = _load(record)
    if (
        journal.get("employee_root") != str(employee)
        or journal.get("phase") != phase
        or "friday_cutover" in journal
    ):
        raise release.ReleaseError(
            "Recovery requires the matching normal employee release phase"
        )
    return record, journal


def _journal_identity(journal: dict) -> dict:
    """Only the phase and recovery binding may change after admission."""
    return {
        key: value
        for key, value in journal.items()
        if key not in {"phase", "recovery_admission"}
    }


def _code_state(employee: Path) -> dict:
    """Bind restored code, complete frontend artifacts, launchers and Node setting."""
    config = release._inside(
        employee / "_attic/runtime/frontend-node-path.txt", employee
    )
    frontend = release._inside(employee / "frontend", employee)
    if frontend.exists() and not frontend.is_dir():
        raise release.ReleaseError("Frontend restoration path is not a directory")
    return {
        "code": release._code_files(employee),
        "frontend": (release.files(frontend) if frontend.is_dir() else None),
        "node_config": _sha(config) if config.is_file() else None,
    }


def _old_state(journal: dict) -> dict:
    """Project the existing install journal into the same exact code identity."""
    return {
        "code": {
            **journal["code_backups"],
            "root": {
                key: value
                for key, value in journal["root_files"].items()
                if value is not None
            },
        },
        "frontend": journal["old_frontend"],
        "node_config": journal["config_hash"],
    }


def _verify_old_backups(record: Path, journal: dict) -> None:
    """Prove all rollback bytes still exist before a database can be replaced."""
    if set(journal.get("code_backups", {})) != {"backend", "scripts"}:
        raise release.ReleaseError("Old code backup manifest is incomplete")
    for name, manifest in journal["code_backups"].items():
        if release.files(record.parent / ("old-" + name), source=True) != manifest:
            raise release.ReleaseError("Old code backup changed")
    if release.files(record.parent / "old-frontend") != journal["old_frontend"]:
        raise release.ReleaseError("Old frontend backup changed")
    if set(journal.get("root_files", {})) - set(ROOT_FILES):
        raise release.ReleaseError("Unknown root launcher in recovery manifest")
    for name, digest in journal["root_files"].items():
        if digest is not None and _sha(record.parent / name) != digest:
            raise release.ReleaseError("Old root launcher backup changed")
    if (
        journal["config_existed"]
        and _sha(record.parent / "old-node-path.txt") != journal["config_hash"]
    ):
        raise release.ReleaseError("Old Node configuration backup changed")
    old_node = journal.get("old_node")
    if old_node is not None:
        if release.files(record.parent / "old-node") != old_node["files"]:
            raise release.ReleaseError("Old Node toolchain backup changed")
        target = release._physical(Path(old_node["path"])).parent
        employee = Path(journal["employee_root"])
        if not target.is_relative_to((employee / "_attic/runtime").resolve()) and release.files(target) != old_node["files"]:
            raise release.ReleaseError("Shared old Node toolchain changed")


def _validator_hash(root: Path) -> str:
    """Pin the whole saved backend/scripts closure used by the old public validators."""
    cutover.validator_bundle_sha256(root)
    return release._digest(release._code_files(root))


def _validate_database(root: Path, database: Path) -> None:
    """Run the old schema/FK/inventory validator and read-only ledger diagnostic."""
    cutover._run_public_database_validator(root, database, label="employee recovery")
    environment = os.environ.copy()
    for name in ("PYTHONPATH", "PYTHONHOME", "DATABASE_URL"):
        environment.pop(name, None)
    result = subprocess.run(
        [
            sys.executable,
            "-I",
            "-B",
            str(root / "scripts/ops/inventory_operation_admin.py"),
            "diagnose",
            "--db-url",
            f"sqlite:///{database.as_posix()}",
            "--json",
        ],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=300,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    if result.returncode:
        raise release.ReleaseError(
            "Old ledger validation failed: " + (result.stderr or result.stdout).strip()
        )


def _database_identity(database: Path) -> dict:
    """Use WAL-aware logical identity with an explicit Alembic revision binding."""
    identity = cutover._logical_snapshot_identity(database, label="employee recovery")
    with closing(cutover._read_complete_snapshot(database)) as connection:
        identity["alembic_revision"] = [
            row[0]
            for row in connection.execute(
                "SELECT version_num FROM alembic_version ORDER BY version_num"
            )
        ]
    return identity


def begin(record: Path, employee: Path, backup: Path) -> Path:
    """Publish immutable admission immediately before the normal migration boundary."""
    employee = release._physical(employee).resolve()
    record, journal = _bound_journal(record, employee, "INSTALLED")
    if "recovery_admission" in journal:
        raise release.ReleaseError("Recovery admission is already bound")
    _verify_old_backups(record, journal)
    backup = release._inside(
        backup, employee / "_attic/runtime/backups/sqlite"
    ).resolve()
    manifest_path = backup_manifest.manifest_path_for(backup)
    verified = backup_manifest.verify_manifest_receipt(backup, expected_engine="sqlite")
    if verified.status not in {
        backup_manifest.BackupStatus.PASS,
        backup_manifest.BackupStatus.STRUCTURAL_ONLY,
    }:
        raise release.ReleaseError("Old DB backup manifest is not verified")
    old_root = record.parent / "old-code"
    if old_root.exists():
        raise release.ReleaseError("Admission old-code snapshot already exists")
    for name, manifest in journal["code_backups"].items():
        release._copy_files(record.parent / ("old-" + name), old_root / name, manifest)
    release._copy_files(record.parent, old_root, _old_state(journal)["code"]["root"])
    validator = _validator_hash(old_root)
    _validate_database(old_root, backup)
    database = release._inside(employee / "backend/mes.db", employee)
    cutover.compare_exact_database(
        backup, database, label="pre-migration employee backup"
    )
    identity = _database_identity(backup)
    incoming = _code_state(employee)
    if incoming["frontend"] != journal.get("installed_frontend"):
        raise release.ReleaseError("Installed frontend changed before admission")
    if _validator_hash(old_root) != validator:
        raise release.ReleaseError("Old validator changed during admission")
    executor = record.parent / "recovery-tool"
    for name in ("backend", "scripts"):
        release._copy_files(employee / name, executor / name, incoming["code"][name])
    release._copy_files(employee, executor, incoming["code"]["root"])
    if release._code_files(executor) != incoming["code"]:
        raise release.ReleaseError("Preserved recovery executable closure changed")
    admission = record.parent / "recovery-admission.json"
    payload = {
        "contract": ADMISSION_CONTRACT,
        "employee_root": str(employee),
        "record": str(record.resolve()),
        "release_id": record.parent.name,
        "target": str(database.resolve()),
        "journal": _journal_identity(journal),
        "backup": str(backup),
        "backup_sha256": _sha(backup),
        "manifest_sha256": _sha(manifest_path),
        "database_identity": identity,
        "old_code": _old_state(journal),
        "incoming_code": incoming,
        "migrations": release.files(employee / "backend/alembic", source=True),
        "old_validator_root": str(old_root),
        "old_validator_sha256": validator,
        "recovery_tool": str(executor),
        "recovery_tool_code": incoming["code"],
        "validation": {
            "schema_fk_inventory": "PASS",
            "ledger": "PASS",
            "exact_rows": "PASS",
        },
    }
    with admission.open("x", encoding="utf-8") as output:
        json.dump(payload, output, indent=2, sort_keys=True)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())
    journal["recovery_admission"] = {"path": str(admission), "sha256": _sha(admission)}
    journal["phase"] = "MIGRATING"
    _write(record, journal)
    return admission


def _admission(record: Path, employee: Path, digest: str) -> tuple[dict, dict]:
    """Revalidate immutable admission and old rollback closure before trusting it."""
    record, journal = _bound_journal(record, employee, "MIGRATING")
    binding = journal.get("recovery_admission")
    expected = record.parent / "recovery-admission.json"
    if (
        not cutover._valid_sha256(digest)
        or not isinstance(binding, dict)
        or binding.get("path") != str(expected)
        or binding.get("sha256") != digest.lower()
        or _sha(expected) != digest.lower()
    ):
        raise release.ReleaseError("Recovery admission binding or SHA-256 mismatch")
    admission = _load(expected)
    if (
        admission.get("contract") != ADMISSION_CONTRACT
        or admission.get("employee_root") != str(employee)
        or admission.get("record") != str(record.resolve())
        or admission.get("release_id") != record.parent.name
        or admission.get("target") != str((employee / "backend/mes.db").resolve())
        or admission.get("journal") != _journal_identity(journal)
        or admission.get("old_code") != _old_state(journal)
    ):
        raise release.ReleaseError("Recovery admission journal identity mismatch")
    backup = release._inside(
        Path(admission["backup"]), employee / "_attic/runtime/backups/sqlite"
    )
    if (
        _sha(backup) != admission["backup_sha256"]
        or _sha(backup_manifest.manifest_path_for(backup))
        != admission["manifest_sha256"]
    ):
        raise release.ReleaseError("Recovery DB or manifest changed")
    if _database_identity(backup) != admission["database_identity"]:
        raise release.ReleaseError("Recovery DB logical identity changed")
    root = release._inside(Path(admission["old_validator_root"]), record.parent)
    if (
        root != record.parent / "old-code"
        or _validator_hash(root) != admission["old_validator_sha256"]
    ):
        raise release.ReleaseError("Old validator changed")
    executor = release._inside(Path(admission["recovery_tool"]), record.parent)
    if (
        executor != record.parent / "recovery-tool"
        or release._code_files(executor) != admission["recovery_tool_code"]
    ):
        raise release.ReleaseError("Preserved recovery executable closure changed")
    _verify_old_backups(record, journal)
    return journal, admission


def _assert_stopped(employee: Path) -> None:
    """Require both ports closed and persisted intentional-stop controls."""
    profile = release._require_employee_runtime(employee, installed_code=False)
    if not release._ports_closed(profile) or release._owner_pids(profile):
        raise release.ReleaseError("Employee service ports still have an owner")
    for service in ("backend", "frontend"):
        control = (
            employee / f"_attic/runtime/logs/{service}/{service}-runtime-control.json"
        )
        if _load(control).get("action") != "stop":
            raise release.ReleaseError("Employee intentional-stop control is missing")


def _stop_services(employee: Path) -> None:
    """Delegate owned process checks to canonical stop scripts; never restart."""
    release._require_employee_runtime(employee, installed_code=False)
    release._stop_frontend(employee)
    release._stop_backend(employee)
    profile = release._require_employee_runtime(employee, installed_code=False)
    if not release._ports_closed(profile) or release._owner_pids(profile):
        raise release.ReleaseError("Employee ports are not released after owned stop")
    # Supervisors consume their stop control. Republish it after verified shutdown
    # so a crashed recovery still leaves an explicit intentional-stop request.
    for service in ("backend", "frontend"):
        control = release._inside(
            employee / f"_attic/runtime/logs/{service}/{service}-runtime-control.json",
            employee,
        )
        control.parent.mkdir(parents=True, exist_ok=True)
        _write(
            control,
            {
                "action": "stop",
                "source": "employee-release-recovery",
                "owner": current_process_owner(),
            },
        )
    _assert_stopped(employee)


def _state(employee: Path) -> dict:
    """Record actual failed DB/code state for an explicit resume comparison."""
    return {
        "database": restore_db._sqlite_snapshot_digest(employee / "backend/mes.db"),
        "code": _code_state(employee),
    }


def _save_failed_code(employee: Path, destination: Path, manifest: dict) -> None:
    """Preserve the first failed generation without overwriting it on resume."""
    for name in ("backend", "scripts"):
        release._copy_files(employee / name, destination / name, manifest["code"][name])
    release._copy_files(
        employee / "frontend", destination / "frontend", manifest["frontend"]
    )
    release._copy_files(employee, destination, manifest["code"]["root"])
    if manifest["node_config"] is not None:
        release._copy_files(
            employee,
            destination,
            {"_attic/runtime/frontend-node-path.txt": manifest["node_config"]},
        )


def _ensure_failed_snapshot(
    record: Path, employee: Path, payload: dict, receipt: Path
) -> None:
    """Publish complete immutable failed-generation snapshots, resuming partial copies."""
    database = employee / "backend/mes.db"
    failed_db, failed_code = record.parent / "failed.db", record.parent / "failed-code"
    fence = release._acquire_writer_fence(database)
    try:
        if not failed_db.exists():
            pending = record.parent / ("failed-db.pending-" + uuid.uuid4().hex)
            restore_db._copy_live_sqlite(database, pending)
            if _sha(pending) != payload["actual"]["database"]:
                raise release.ReleaseError("Database changed before failed snapshot")
            pending.rename(failed_db)
        expected_db = payload.get("failed_db_sha256", payload["actual"]["database"])
        if _sha(failed_db) != expected_db:
            raise release.ReleaseError("Failed database snapshot changed")
        payload["failed_db_sha256"] = expected_db
        expected_code = payload.get("failed_code", payload["actual"]["code"])
        if not failed_code.exists():
            if _code_state(employee) != expected_code:
                raise release.ReleaseError("Code changed before failed snapshot")
            pending_code = record.parent / ("failed-code.pending-" + uuid.uuid4().hex)
            payload["incomplete_snapshot"] = str(pending_code)
            _write(receipt, payload)
            _save_failed_code(employee, pending_code, expected_code)
            if _code_state(pending_code) != expected_code:
                raise release.ReleaseError("Failed code snapshot copy changed")
            pending_code.rename(failed_code)
        if _code_state(failed_code) != expected_code:
            raise release.ReleaseError("Failed code snapshot changed")
        payload["failed_code"] = expected_code
        payload["state"] = "SNAPSHOTTED"
        _write(receipt, payload)
    finally:
        release._release_writer_fence(fence)


@contextmanager
def _claim(record: Path, *, resume: bool) -> Iterator[None]:
    """An exclusive claim prevents two recovery callers, including PID reuse."""
    mutex = release._inside(record.parent / "recovery.lock", record.parent)
    with mutex.open("a+b") as lock:
        lock.seek(0, os.SEEK_END)
        if not lock.tell():
            lock.write(b"0")
            lock.flush()
        lock.seek(0)
        try:
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise release.ReleaseError("Recovery is already owned") from exc
        try:
            with _claim_owner(record, resume=resume):
                yield
        finally:
            lock.seek(0)
            if os.name == "nt":
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


@contextmanager
def _claim_owner(record: Path, *, resume: bool) -> Iterator[None]:
    """Keep human-readable process evidence while the OS owns the recovery lock."""
    path = record.parent / "recovery-owner.json"
    if path.exists():
        owner = _load(path)
        if (
            not resume
            or not valid_process_owner(owner)
            or process_owner_is_active(owner)
        ):
            raise release.ReleaseError("Recovery owner is active or unknown")
        path.unlink()
    owner = current_process_owner()
    if owner["started_at_ns"] < 0:
        raise release.ReleaseError("Recovery owner identity is unavailable")
    try:
        with path.open("x", encoding="utf-8") as output:
            json.dump(owner, output)
    except FileExistsError as exc:
        raise release.ReleaseError("Recovery is already owned") from exc
    try:
        yield
    finally:
        if path.exists() and _load(path) == owner:
            path.unlink()


def _restoring_code_matches(actual: dict, before: dict, admission: dict) -> bool:
    """Recognize a prefix of the deterministic, atomic old-code restoration only."""
    old = admission["old_code"]
    # Frontend staging never edits active files; the two renames may leave it absent.
    if actual["frontend"] != old["frontend"]:
        return (
            actual["frontend"] in (before["frontend"], None)
            and actual["code"] == before["code"]
            and actual["node_config"] == before["node_config"]
        )
    initial = {
        f"{area}/{path}": digest
        for area, manifest in before["code"].items()
        for path, digest in manifest.items()
    }
    current = {
        f"{area}/{path}": digest
        for area, manifest in actual["code"].items()
        for path, digest in manifest.items()
    }
    initial["node_config"] = before["node_config"]
    current["node_config"] = actual["node_config"]
    transitions: list[tuple[str, str | None]] = []
    for area in ("backend", "scripts"):
        desired = old["code"][area]
        transitions.extend(
            (f"{area}/{path}", None)
            for path in sorted(set(before["code"][area]) - set(desired))
        )
        transitions.extend(
            (f"{area}/{path}", digest) for path, digest in sorted(desired.items())
        )
    transitions.extend(
        (f"root/{path}", digest)
        for path, digest in sorted(admission["journal"]["root_files"].items())
    )
    transitions.append(("node_config", old["node_config"]))
    pending = False
    expected = dict(initial)
    for path, digest in transitions:
        if initial.get(path) == digest:
            continue
        if not pending and current.get(path) == digest:
            if digest is None and path != "node_config":
                expected.pop(path, None)
            else:
                expected[path] = digest
        else:
            pending = True
    return current == expected


def _resume_state(employee: Path, payload: dict, admission: dict) -> dict:
    """Accept only exact persisted states or an explicitly intended atomic transition."""
    actual = _state(employee)
    if actual == payload.get("actual"):
        return actual
    intent = payload.get("restore_intent", {})
    stage = intent.get("stage")
    if (
        (
            payload.get("state") == "RESTORING"
            or (payload.get("state") == "PASS" and stage == "VERIFY")
        )
        and intent.get("database")
        == restore_db._sqlite_snapshot_digest(Path(admission["backup"]))
        and actual["database"]
        in {intent["database"], intent.get("rollback_database")}
        and (
            (stage == "DATABASE" and actual["code"] == intent.get("code_before"))
            or (
                stage == "CODE"
                and _restoring_code_matches(
                    actual["code"], intent["code_before"], admission
                )
            )
            or (
                stage == "VERIFY"
                and actual["code"] == payload["actual"]["code"] == admission["old_code"]
            )
        )
    ):
        return actual
    raise release.ReleaseError("Recovery resume DB or code drift")


def recover(
    record: Path,
    employee: Path,
    admission_sha256: str,
    *,
    resume: bool = False,
    recovery_sha256: str | None = None,
) -> Path:
    """Jointly recover an admitted DB/code pair under the existing SQLite fence."""
    employee = release._physical(employee).resolve()
    record = release._inside(record, employee / "_attic/runtime/frontend-releases")
    journal, admission = _admission(record, employee, admission_sha256)
    receipt = record.parent / "recovery.json"
    payload: dict = {}
    if resume:
        if (
            not cutover._valid_sha256(recovery_sha256)
            or _sha(receipt) != recovery_sha256.lower()
        ):
            raise release.ReleaseError(
                "Explicit recovery SHA-256 is required for resume"
            )
        payload = _load(receipt)
        if (
            payload.get("contract") != RECOVERY_CONTRACT
            or payload.get("record") != str(record)
            or payload.get("admission_sha256") != admission_sha256.lower()
            or payload.get("state")
            not in {"FAILED", "RESTORING", "SNAPSHOTTED", "VERIFIED", "ENTERED", "PASS"}
        ):
            raise release.ReleaseError("Recovery resume receipt is not bound")
        owner = payload.get("owner")
        if owner is not None and (
            not valid_process_owner(owner) or process_owner_is_active(owner)
        ):
            raise release.ReleaseError("Recovery owner is active or unknown")
        resume_state = _resume_state(employee, payload, admission)
    elif receipt.exists() or _code_state(employee) != admission["incoming_code"]:
        raise release.ReleaseError(
            "Recovery already attempted or incoming code changed; explicit resume required"
        )
    with _claim(record, resume=resume):
        # Recheck after claim, before allowing a stop or snapshot.
        _admission(record, employee, admission_sha256)
        if resume and resume_state != _resume_state(employee, payload, admission):
            raise release.ReleaseError(
                "Recovery state changed while claiming ownership"
            )
        database = employee / "backend/mes.db"
        if not resume:
            if (record.parent / "failed.db").exists() or (
                record.parent / "failed-code"
            ).exists():
                raise release.ReleaseError(
                    "Unrecorded failed-generation evidence already exists"
                )
            payload = {
                "contract": RECOVERY_CONTRACT,
                "record": str(record),
                "admission_sha256": admission_sha256.lower(),
                "steps": [],
            }
        payload.update(
            owner=current_process_owner(), actual=_state(employee), state="ENTERED"
        )
        _write(receipt, payload)
        try:
            _stop_services(employee)
            _ensure_failed_snapshot(record, employee, payload, receipt)
            if _state(employee) != payload["actual"]:
                raise release.ReleaseError(
                    "Database or code changed after failed snapshot"
                )
            payload["state"] = "RESTORING"
            payload["restore_intent"] = {
                "database": restore_db._sqlite_snapshot_digest(
                    Path(admission["backup"])
                ),
                # The restore helper may commit this exact DB on postcheck failure
                # before our exception handler can publish the resulting state.
                "rollback_database": payload["actual"]["database"],
                "code_before": payload["actual"]["code"],
                "stage": "DATABASE",
            }
            _write(receipt, payload)
            _assert_stopped(employee)
            old_root = Path(admission["old_validator_root"])
            backup = Path(admission["backup"])
            _validate_database(old_root, backup)

            def postcheck(installed: Path) -> None:
                """Keep code restoration and every final check inside the DB writer fence."""
                payload["steps"].append("DB_INSTALLED")
                payload["actual"] = {
                    "database": restore_db._sqlite_snapshot_digest(installed),
                    "code": _code_state(employee),
                }
                payload["restore_intent"]["stage"] = "CODE"
                _write(receipt, payload)
                release._restore_previous_code(record, employee, journal, preserve=True)
                payload["steps"].append("CODE_RESTORED")
                payload["actual"]["code"] = _code_state(employee)
                payload["restore_intent"]["stage"] = "VERIFY"
                _write(receipt, payload)
                if _code_state(employee) != admission["old_code"]:
                    raise release.ReleaseError("Restored code hash mismatch")
                if _validator_hash(old_root) != admission["old_validator_sha256"]:
                    raise release.ReleaseError("Old validator changed during recovery")
                _admission(record, employee, admission_sha256)
                if (
                    _sha(record.parent / "failed.db") != payload["failed_db_sha256"]
                    or _code_state(record.parent / "failed-code")
                    != payload["failed_code"]
                ):
                    raise release.ReleaseError(
                        "Failed-generation evidence changed during recovery"
                    )
                _validate_database(old_root, installed)
                cutover.compare_exact_database(
                    backup, installed, label="employee restored DB"
                )
                _assert_stopped(employee)
                if journal.get("old_node") is not None and release._previous_node(employee) != journal["old_node"]:
                    raise release.ReleaseError("Restored Node toolchain changed before recovery confirmation")
                payload["steps"].append("ALL_CHECKS_PASS")
                payload["state"] = "PASS"
                payload["owner"] = None
                # This exact DB digest is taken from the private fenced snapshot.
                payload["actual"] = {
                    "database": restore_db._sqlite_snapshot_digest(installed),
                    "code": _code_state(employee),
                }
                _write(receipt, payload)
                journal["phase"] = "ROLLED_BACK"
                _write(record, journal)

            restore_db._replace_sqlite_atomically(
                backup,
                database,
                expected_target_digest=payload["actual"]["database"],
                postcheck=postcheck,
            )
        except BaseException as exc:
            # A failed terminal publication is part of the fenced DB operation;
            # its DB rollback must also revoke any partially published marker.
            journal["phase"] = "MIGRATING"
            _write(record, journal)
            payload.update(
                state="FAILED",
                owner=None,
                error=f"{type(exc).__name__}: {exc}",
                actual=_state(employee),
            )
            _write(receipt, payload)
            print(
                f"EMPLOYEE_RECOVERY_RECEIPT={receipt}\nEMPLOYEE_RECOVERY_SHA256={_sha(receipt)}",
                file=sys.stderr,
                flush=True,
            )
            print(
                f'EMPLOYEE_RECOVERY_RESUME={"& " if os.name == "nt" else ""}"{sys.executable}" "{record.parent / "recovery-tool/scripts/ops/employee_release_recovery.py"}" recover '
                f'--record "{record}" --employee-root "{employee}" --admission-sha256 {admission_sha256} '
                f"--resume --recovery-sha256 {_sha(receipt)}",
                file=sys.stderr,
                flush=True,
            )
            raise
    return receipt


def main(argv: list[str] | None = None) -> int:
    """Expose only admission and explicit stopped-service joint recovery."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("begin", "recover"))
    parser.add_argument("--record", type=Path, required=True)
    parser.add_argument("--employee-root", type=Path, required=True)
    parser.add_argument("--backup", type=Path)
    parser.add_argument("--admission-sha256")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--recovery-sha256")
    args = parser.parse_args(argv)
    try:
        if args.command == "begin":
            if args.backup is None or args.resume or args.recovery_sha256:
                parser.error("begin requires --backup and forbids recovery flags")
            path = begin(args.record, args.employee_root, args.backup)
            print(
                f"EMPLOYEE_RECOVERY_ADMISSION={path}\nEMPLOYEE_RECOVERY_ADMISSION_SHA256={_sha(path)}\nEMPLOYEE_RECOVERY_TOOL={path.parent / 'recovery-tool/scripts/ops/employee_release_recovery.py'}"
            )
        else:
            if (
                not args.admission_sha256
                or args.backup
                or bool(args.recovery_sha256) != args.resume
            ):
                parser.error(
                    "recover requires --admission-sha256; resume also requires --recovery-sha256"
                )
            if release._physical(PROJECT_ROOT).resolve() != (
                args.record.resolve().parent / "recovery-tool"
            ):
                raise release.ReleaseError(
                    "Run recover from the preserved recovery-tool executable root"
                )
            path = recover(
                args.record,
                args.employee_root,
                args.admission_sha256,
                resume=args.resume,
                recovery_sha256=args.recovery_sha256,
            )
            print(
                f"EMPLOYEE_RECOVERY_RESULT=ROLLED_BACK\nEMPLOYEE_RECOVERY_RECEIPT={path}\nEMPLOYEE_RECOVERY_SHA256={_sha(path)}"
            )
    except (
        release.ReleaseError,
        cutover.CutoverAdmissionError,
        backup_manifest.BackupValidationError,
        OSError,
        ValueError,
        KeyError,
        sqlite3.Error,
    ) as exc:
        print(
            f"EMPLOYEE_RECOVERY_RESULT=BLOCKED\nEMPLOYEE_RECOVERY_ERROR={exc}",
            file=sys.stderr,
        )
        return 9
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
