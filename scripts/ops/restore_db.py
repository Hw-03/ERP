#!/usr/bin/env python3
"""Restore a DEXCOWIN MES database backup.

SQLite restore validates the backup before replacing the target DB and can run
inventory integrity verification after restore with --check. A new, empty
pre-migration candidate may opt into structural-only validation.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable, Iterator
from contextlib import ExitStack, contextmanager, nullcontext
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy.engine import Connection


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.runtime_paths import runtime_path  # noqa: E402
from scripts.ops import backup_manifest  # noqa: E402
from scripts.ops.durable_file import (  # noqa: E402
    durable_replace as _shared_durable_replace,
    windows_write_through_replace as _shared_windows_write_through_replace,
)
from scripts.ops.recovery_owner import (  # noqa: E402
    current_process_owner,
    process_owner_is_active,
    valid_process_owner,
)
from scripts.ops.backup_db import (  # noqa: E402
    _postgres_database_url,
    _restore_postgres_dump_to_database,
    backup_sqlite,
)


VERIFY_BACKUP = PROJECT_ROOT / "scripts" / "ops" / "_verify_backup.py"
CHECK_INTEGRITY = PROJECT_ROOT / "scripts" / "ops" / "check_inventory_integrity.py"
VERIFY_RUNTIME_TASKS = PROJECT_ROOT / "scripts" / "dev" / "verify-runtime-tasks.ps1"
STOP_BACKEND = PROJECT_ROOT / "scripts" / "dev" / "stop-backend.ps1"
POSTGRES_CUTOVER_RECOVERY_CONTRACT = "postgres-cutover-recovery/v1"
POSTGRES_RESTORE_OPERATION_CONTRACT = "postgres-restore-operation/v1"
POSTGRES_CLUSTER_RECOVERY_PREFIX = "DEXCOWIN_MES_IC18_RECOVERY:"


def _run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def _verify_sqlite_backup(path: Path) -> dict[str, object]:
    result = backup_manifest.verify_sqlite_backup(path)
    if result.status is not backup_manifest.BackupStatus.PASS or result.manifest is None:
        detail = "; ".join(result.errors)
        print(
            f"[RESTORE] backup status={result.status.value}: {detail}",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return result.manifest


def _verify_sqlite_integrity(path: Path) -> None:
    """Verify structural SQLite integrity without requiring the current schema."""
    connection = None
    operation_error: BaseException | None = None
    try:
        connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
        rows = connection.execute("PRAGMA integrity_check").fetchall()
    except sqlite3.Error as exc:
        print(f"[RESTORE] SQLite integrity check failed: {exc}", file=sys.stderr)
        operation_error = SystemExit(1)
        raise operation_error from exc
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        if connection is not None:
            try:
                connection.close()
            except BaseException as cleanup_error:
                if operation_error is None:
                    raise
                operation_error.add_note(
                    f"SQLite integrity connection cleanup failed: {cleanup_error}"
                )
    if rows != [("ok",)]:
        print(f"[RESTORE] SQLite integrity check failed: {rows}", file=sys.stderr)
        raise SystemExit(1)


def _run_integrity_check(db_url: str) -> None:
    if not CHECK_INTEGRITY.exists():
        print("[RESTORE] check_inventory_integrity.py missing", file=sys.stderr)
        raise SystemExit(1)
    print("[RESTORE] running inventory integrity check")
    _run([sys.executable, str(CHECK_INTEGRITY), "--db-url", db_url])


def _verify_collected_postgres_integrity(evidence: dict[str, object]) -> None:
    """Consume the inventory result collected by the already-admitted verifier."""

    print("[RESTORE] running inventory integrity check")
    verification = evidence.get("verification")
    inventory = verification.get("inventory") if isinstance(verification, dict) else None
    if (
        not isinstance(inventory, dict)
        or inventory.get("contract") != backup_manifest.INVENTORY_CONTRACT
        or inventory.get("status") not in {"pass", "warning"}
        or inventory.get("blocking_count") != 0
    ):
        raise backup_manifest.BackupValidationError(
            "admitted PostgreSQL inventory integrity evidence is invalid"
        )


def _resolve_sqlite_backup(path: str) -> Path:
    """Resolve a bare backup name inside the canonical runtime backup directory."""
    candidate = Path(path).expanduser()
    if not candidate.is_absolute() and candidate.parent == Path("."):
        return runtime_path("backups", "sqlite") / candidate.name
    return candidate.resolve()


def _remove_sqlite_files(path: Path) -> None:
    """Remove one private SQLite artifact and only its own sidecars."""
    for suffix in ("", "-wal", "-shm", "-journal"):
        Path(f"{path}{suffix}").unlink(missing_ok=True)


def _copy_live_sqlite(source_path: Path, destination_path: Path) -> None:
    """Snapshot committed SQLite state, including WAL frames, with the backup API."""
    source = None
    destination = None
    operation_error: BaseException | None = None
    try:
        source = sqlite3.connect(f"file:{source_path.as_posix()}?mode=ro", uri=True)
        destination = sqlite3.connect(destination_path)
        source.backup(destination)
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        cleanup_errors: list[BaseException] = []
        for label, connection in (("destination", destination), ("source", source)):
            if connection is None:
                continue
            try:
                connection.close()
            except BaseException as cleanup_error:
                cleanup_errors.append(
                    OSError(f"SQLite {label} close failed: {cleanup_error}")
                )
        if operation_error is not None:
            for cleanup_error in cleanup_errors:
                operation_error.add_note(str(cleanup_error))
        elif cleanup_errors:
            primary_cleanup_error = cleanup_errors[0]
            for cleanup_error in cleanup_errors[1:]:
                primary_cleanup_error.add_note(str(cleanup_error))
            raise primary_cleanup_error


def _create_pre_restore_snapshot(
    target_path: Path,
    *,
    integrity_only: bool = False,
) -> Path:
    """Create and verify a unique rollback snapshot before a restore begins."""
    return backup_sqlite(
        str(target_path),
        label="pre-restore",
        integrity_only=integrity_only,
    )


def _sqlite_snapshot_digest(path: Path) -> str:
    """Hash a transient online snapshot so WAL-backed state is compared safely."""
    staged = path.parent / f".{path.name}.digest-{uuid4().hex}.tmp"
    operation_error: BaseException | None = None
    try:
        _copy_live_sqlite(path, staged)
        digest = hashlib.sha256()
        with staged.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        try:
            _remove_sqlite_files(staged)
        except OSError as cleanup_error:
            if operation_error is None:
                raise
            operation_error.add_note(
                f"SQLite digest snapshot cleanup failed: {cleanup_error}"
            )


@contextmanager
def _sqlite_writer_fence(path: Path) -> Iterator[sqlite3.Connection]:
    """Hold SQLite's exclusive locking mode across install and post-check."""

    connection: sqlite3.Connection | None = None
    operation_error: BaseException | None = None
    try:
        connection = sqlite3.connect(path, timeout=0, isolation_level=None)
        connection.execute("PRAGMA busy_timeout = 0")
        mode = connection.execute("PRAGMA locking_mode = EXCLUSIVE").fetchone()
        if mode != ("exclusive",):
            raise backup_manifest.BackupValidationError(
                "SQLite target writer fence could not enter exclusive locking mode"
            )
        connection.execute("BEGIN EXCLUSIVE")
        connection.execute("COMMIT")
        yield connection
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        if connection is not None:
            try:
                connection.close()
            except sqlite3.Error as cleanup_error:
                if operation_error is None:
                    raise
                operation_error.add_note(
                    f"SQLite writer fence cleanup failed: {cleanup_error}"
                )


def _copy_sqlite_into_connection(
    source_path: Path,
    destination: sqlite3.Connection,
) -> None:
    """Copy committed source state into an already writer-fenced destination."""

    source: sqlite3.Connection | None = None
    operation_error: BaseException | None = None
    try:
        source = sqlite3.connect(f"file:{source_path.as_posix()}?mode=ro", uri=True)
        source.backup(destination)
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        if source is not None:
            try:
                source.close()
            except sqlite3.Error as cleanup_error:
                if operation_error is None:
                    raise
                operation_error.add_note(
                    f"SQLite source connection cleanup failed: {cleanup_error}"
                )


def _copy_sqlite_connection_to_path(
    source: sqlite3.Connection,
    destination_path: Path,
) -> None:
    """Copy one fenced connection into a private SQLite snapshot."""

    destination: sqlite3.Connection | None = None
    operation_error: BaseException | None = None
    try:
        destination = sqlite3.connect(destination_path)
        source.backup(destination)
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        if destination is not None:
            try:
                destination.close()
            except sqlite3.Error as cleanup_error:
                if operation_error is None:
                    raise
                operation_error.add_note(
                    f"SQLite snapshot connection cleanup failed: {cleanup_error}"
                )


def _sqlite_connection_snapshot_digest(
    connection: sqlite3.Connection,
    anchor_path: Path,
) -> str:
    """Hash one snapshot from a connection that already owns the writer fence."""

    staged = anchor_path.parent / f".{anchor_path.name}.digest-{uuid4().hex}.tmp"
    operation_error: BaseException | None = None
    try:
        _copy_sqlite_connection_to_path(connection, staged)
        digest = hashlib.sha256()
        with staged.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        try:
            _remove_sqlite_files(staged)
        except OSError as cleanup_error:
            if operation_error is None:
                raise
            operation_error.add_note(
                f"SQLite digest snapshot cleanup failed: {cleanup_error}"
            )


def _verify_sqlite_install_snapshot(
    snapshot: Path,
    manifest: dict[str, object],
) -> backup_manifest.BackupVerification:
    """Verify a backup-API snapshot without treating its new schema cookie as drift."""

    evidence = backup_manifest.collect_database_evidence(
        f"sqlite:///{snapshot.as_posix()}",
        expected_engine="sqlite",
    )
    database = manifest.get("database")
    expected_metadata = (
        database.get("snapshot_metadata") if isinstance(database, dict) else None
    )
    actual_metadata = evidence.get("snapshot_metadata")
    if isinstance(expected_metadata, dict) and isinstance(actual_metadata, dict):
        normalized_metadata = dict(actual_metadata)
        normalized_metadata["schema_version"] = expected_metadata.get("schema_version")
        evidence = {**evidence, "snapshot_metadata": normalized_metadata}
    return backup_manifest.verify_database_evidence(manifest, evidence)


def _resolve_preverified_rollback(path: str, target_path: Path, restore_source: Path) -> Path:
    """Validate an explicit rollback receipt inside the bounded runtime backup set."""
    rollback = Path(path).resolve()
    backup_dir = runtime_path("backups", "sqlite").resolve()
    if not rollback.is_file():
        print(f"[RESTORE] preverified rollback missing: {rollback}", file=sys.stderr)
        raise SystemExit(1)
    if rollback.parent != backup_dir:
        print(
            f"[RESTORE] preverified rollback must be inside {backup_dir}: {rollback}",
            file=sys.stderr,
        )
        raise SystemExit(1)
    result = backup_manifest.verify_sqlite_backup(
        rollback,
        source_path=None if rollback == restore_source.resolve() else target_path,
    )
    if result.status is backup_manifest.BackupStatus.STALE:
        print(
            f"[RESTORE] preverified rollback does not match current target: {rollback}",
            file=sys.stderr,
        )
        print("RESTORE_RESULT=TARGET_CHANGED_AFTER_ROLLBACK", file=sys.stderr)
        raise SystemExit(3)
    if result.status is not backup_manifest.BackupStatus.PASS:
        print(
            f"[RESTORE] preverified rollback is not PASS: {result.status.value}",
            file=sys.stderr,
        )
        raise SystemExit(1)
    restoring_the_rollback = rollback == restore_source.resolve()
    if not restoring_the_rollback and _sqlite_snapshot_digest(rollback) != _sqlite_snapshot_digest(target_path):
        print(
            f"[RESTORE] preverified rollback does not match current target: {rollback}",
            file=sys.stderr,
        )
        print("RESTORE_RESULT=TARGET_CHANGED_AFTER_ROLLBACK", file=sys.stderr)
        raise SystemExit(3)
    return rollback


def _rollback_quarantined_files(moved: list[tuple[Path, Path]]) -> None:
    """Restore quarantined SQLite files in reverse move order."""
    rollback_errors: list[str] = []
    for original, quarantined in reversed(moved):
        if not quarantined.exists():
            continue
        try:
            os.replace(quarantined, original)
        except OSError as exc:
            rollback_errors.append(f"{quarantined} -> {original}: {exc}")
    if rollback_errors:
        raise RuntimeError("SQLite restore rollback failed: " + "; ".join(rollback_errors))


def _cleanup_quarantined_files(moved: list[tuple[Path, Path]]) -> None:
    """Best-effort delete obsolete files after the new DB is active."""
    for _, quarantined in moved:
        try:
            quarantined.unlink(missing_ok=True)
        except OSError as exc:
            print(
                f"[RESTORE] WARN quarantine cleanup failed; retained at {quarantined}: {exc}",
                file=sys.stderr,
            )


def _replace_existing_sqlite_under_writer_fence(
    staged: Path,
    target_path: Path,
    *,
    expected_target_digest: str,
    postcheck: Callable[[Path], None] | None,
) -> None:
    """Replace an existing DB in place while every competing writer is blocked."""

    failure_rollback_snapshot = target_path.parent / (
        f".{target_path.name}.failure-rollback-{uuid4().hex}.tmp"
    )
    verification_snapshot = target_path.parent / (
        f".{target_path.name}.installed-{uuid4().hex}.tmp"
    )
    operation_error: BaseException | None = None
    preserve_failure_rollback = False
    try:
        with _sqlite_writer_fence(target_path) as target_connection:
            if (
                _sqlite_connection_snapshot_digest(target_connection, target_path)
                != expected_target_digest
            ):
                print(
                    "[RESTORE] target changed after rollback snapshot",
                    file=sys.stderr,
                )
                print(
                    "RESTORE_RESULT=TARGET_CHANGED_AFTER_ROLLBACK",
                    file=sys.stderr,
                )
                raise SystemExit(3)

            _copy_sqlite_connection_to_path(
                target_connection,
                failure_rollback_snapshot,
            )
            if (
                backup_manifest.file_sha256(failure_rollback_snapshot)
                != expected_target_digest
            ):
                raise RuntimeError(
                    "SQLite writer-fenced failure rollback digest mismatch"
                )

            install_started = False
            try:
                install_started = True
                _copy_sqlite_into_connection(staged, target_connection)
                _copy_sqlite_connection_to_path(
                    target_connection,
                    verification_snapshot,
                )
                if postcheck is not None:
                    postcheck(verification_snapshot)
            except BaseException:
                if install_started:
                    try:
                        _copy_sqlite_into_connection(
                            failure_rollback_snapshot,
                            target_connection,
                        )
                        if (
                            _sqlite_connection_snapshot_digest(
                                target_connection,
                                target_path,
                            )
                            != expected_target_digest
                        ):
                            raise RuntimeError(
                                "SQLite writer-fenced rollback digest mismatch"
                            )
                    except BaseException as rollback_error:
                        preserve_failure_rollback = failure_rollback_snapshot.exists()
                        raise RuntimeError(
                            "SQLite writer-fenced restore rollback failed; private rollback "
                            f"retained at {failure_rollback_snapshot}"
                        ) from rollback_error
                raise
    except sqlite3.OperationalError as exc:
        operation_error = backup_manifest.BackupValidationError(
            "SQLite target writer fence could not exclude concurrent writers"
        )
        raise operation_error from exc
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        snapshots_to_remove = [verification_snapshot]
        if preserve_failure_rollback:
            print(
                f"[RESTORE] rollback snapshot retained at {failure_rollback_snapshot}",
                file=sys.stderr,
            )
            print(
                f"RESTORE_ROLLBACK_PATH={failure_rollback_snapshot.resolve()}",
                file=sys.stderr,
            )
        else:
            snapshots_to_remove.append(failure_rollback_snapshot)
        for private_snapshot in snapshots_to_remove:
            try:
                _remove_sqlite_files(private_snapshot)
            except OSError as cleanup_error:
                if operation_error is None:
                    _report_restore_cleanup_pending(
                        private_snapshot,
                        cleanup_error,
                    )
                    continue
                operation_error.add_note(
                    f"SQLite private snapshot cleanup failed: {cleanup_error}"
                )


def _replace_sqlite_atomically(
    source_path: Path,
    target_path: Path,
    *,
    source_integrity_only: bool = False,
    manifest: dict[str, object] | None = None,
    expected_target_digest: str | None = None,
    expected_target_absent: bool = False,
    expected_absent_sidecar_digests: dict[str, str] | None = None,
    postcheck: Callable[[Path], None] | None = None,
) -> None:
    """Install and post-check a staged DB before releasing its old rollback files."""
    staged = target_path.parent / f".{target_path.name}.restore-{uuid4().hex}.tmp"
    quarantine_base = target_path.parent / f".{target_path.name}.quarantine-{uuid4().hex}"
    failed_base = target_path.parent / f".{target_path.name}.restore-failed-{uuid4().hex}"
    moved: list[tuple[Path, Path]] = []
    failed_install: list[tuple[Path, Path]] = []
    installed = False
    operation_error: BaseException | None = None
    try:
        shutil.copy2(source_path, staged)
        if source_integrity_only:
            _verify_sqlite_integrity(staged)
        elif manifest is not None:
            verification = backup_manifest.verify_sqlite_candidate(staged, manifest)
            if verification.status is not backup_manifest.BackupStatus.PASS:
                print(
                    "[RESTORE] staged candidate failed: " + "; ".join(verification.errors),
                    file=sys.stderr,
                )
                raise SystemExit(1)
        else:
            _verify_sqlite_integrity(staged)
        if expected_target_digest is not None and target_path.exists():
            _replace_existing_sqlite_under_writer_fence(
                staged,
                target_path,
                expected_target_digest=expected_target_digest,
                postcheck=postcheck,
            )
            return
        try:
            if expected_target_absent:
                try:
                    os.link(staged, target_path)
                except FileExistsError as exc:
                    print(
                        "[RESTORE] target changed after initial absence check",
                        file=sys.stderr,
                    )
                    print(
                        "RESTORE_RESULT=TARGET_CHANGED_AFTER_ROLLBACK",
                        file=sys.stderr,
                    )
                    raise SystemExit(3) from exc
                installed = True
                expected_sidecars = expected_absent_sidecar_digests or {}
                sidecars_to_quarantine: list[Path] = []
                sidecar_changed = False
                for suffix in ("-wal", "-shm", "-journal"):
                    current = Path(f"{target_path}{suffix}")
                    expected_digest = expected_sidecars.get(suffix)
                    if expected_digest is None:
                        sidecar_changed = sidecar_changed or current.exists()
                        continue
                    if (
                        not current.is_file()
                        or backup_manifest.file_sha256(current) != expected_digest
                    ):
                        sidecar_changed = True
                        continue
                    sidecars_to_quarantine.append(current)
                if sidecar_changed:
                    if (
                        target_path.exists()
                        and staged.exists()
                        and os.path.samefile(staged, target_path)
                    ):
                        target_path.unlink()
                    installed = False
                    print(
                        "[RESTORE] target sidecars changed after initial absence check",
                        file=sys.stderr,
                    )
                    print(
                        "RESTORE_RESULT=TARGET_CHANGED_AFTER_ROLLBACK",
                        file=sys.stderr,
                    )
                    raise SystemExit(3)
                try:
                    for current in sidecars_to_quarantine:
                        suffix = str(current)[len(str(target_path)) :]
                        quarantined = Path(f"{quarantine_base}{suffix}")
                        os.replace(current, quarantined)
                        moved.append((current, quarantined))
                except BaseException:
                    installed = False
                    if (
                        target_path.exists()
                        and staged.exists()
                        and os.path.samefile(staged, target_path)
                    ):
                        target_path.unlink()
                    raise
            else:
                for suffix in ("-wal", "-shm", "-journal", ""):
                    original = Path(f"{target_path}{suffix}")
                    if not original.exists():
                        continue
                    quarantined = Path(f"{quarantine_base}{suffix}")
                    os.replace(original, quarantined)
                    moved.append((original, quarantined))
                if expected_target_digest is not None:
                    quarantined_target = next(
                        (
                            quarantined
                            for original, quarantined in moved
                            if original == target_path
                        ),
                        None,
                    )
                    reappeared = [
                        Path(f"{target_path}{suffix}")
                        for suffix in ("-wal", "-shm", "-journal", "")
                        if Path(f"{target_path}{suffix}").exists()
                    ]
                    if reappeared:
                        for current in reappeared:
                            suffix = str(current)[len(str(target_path)) :]
                            failed = Path(f"{failed_base}{suffix}")
                            os.replace(current, failed)
                            failed_install.append((current, failed))
                    if (
                        quarantined_target is None
                        or reappeared
                        or _sqlite_snapshot_digest(quarantined_target)
                        != expected_target_digest
                    ):
                        print(
                            "[RESTORE] target changed after rollback snapshot",
                            file=sys.stderr,
                        )
                        print(
                            "RESTORE_RESULT=TARGET_CHANGED_AFTER_ROLLBACK",
                            file=sys.stderr,
                        )
                        raise SystemExit(3)
                os.replace(staged, target_path)
                installed = True
            if postcheck is not None:
                postcheck(target_path)
        except BaseException:
            if installed:
                quarantine_errors: list[str] = []
                for suffix in ("-wal", "-shm", "-journal", ""):
                    current = Path(f"{target_path}{suffix}")
                    if not current.exists():
                        continue
                    failed = Path(f"{failed_base}{suffix}")
                    try:
                        os.replace(current, failed)
                        failed_install.append((current, failed))
                    except OSError as exc:
                        quarantine_errors.append(f"{current} -> {failed}: {exc}")
                try:
                    if moved:
                        _rollback_quarantined_files(moved)
                except BaseException as rollback_error:
                    raise RuntimeError(
                        "SQLite post-check rollback failed; old target remains quarantined"
                    ) from rollback_error
                if quarantine_errors:
                    raise RuntimeError(
                        "SQLite failed-install quarantine failed after old target rollback: "
                        + "; ".join(quarantine_errors)
                    )
                _cleanup_quarantined_files(failed_install)
            elif moved:
                _rollback_quarantined_files(moved)
            raise
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        try:
            _remove_sqlite_files(staged)
        except OSError as cleanup_error:
            if operation_error is None:
                _report_restore_cleanup_pending(staged, cleanup_error)
            else:
                operation_error.add_note(
                    f"SQLite staged restore cleanup failed: {cleanup_error}"
                )
    _cleanup_quarantined_files(moved)


def _requires_runtime_recovery_check(target_path: Path) -> bool:
    """Only a real operational DB install owns the local runtime tasks."""

    return target_path.resolve() == (PROJECT_ROOT / "backend" / "mes.db").resolve()


def _requires_postgres_runtime_recovery_check(database_name: str) -> bool:
    """Only the canonical operational PostgreSQL database owns runtime tasks."""

    return database_name == "mes_db"


def _verify_runtime_recovery() -> None:
    """Verify Task Scheduler schema, owner, and retry registration without mutation."""

    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(VERIFY_RUNTIME_TASKS),
            "-RepoRoot",
            str(PROJECT_ROOT),
        ],
        cwd=PROJECT_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        print(f"[RESTORE] runtime recovery verification failed: {detail}", file=sys.stderr)
        raise SystemExit(1)


def _enter_runtime_restore_fence() -> None:
    """Stop the canonical backend and keep intentional-stop fencing active."""

    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(STOP_BACKEND),
        ],
        cwd=PROJECT_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        print(f"[RESTORE] runtime writer fence failed: {detail}", file=sys.stderr)
        raise SystemExit(1)


def _report_restore_cleanup_pending(resource: Path | str, error: BaseException) -> None:
    """Report recoverable post-install cleanup without reversing a valid install."""

    print(
        f"[RESTORE] WARN cleanup pending for {resource}: {error}",
        file=sys.stderr,
    )
    print(f"RESTORE_CLEANUP_PENDING={resource}", file=sys.stderr)


@contextmanager
def _stage_sqlite_restore_pair(source: Path) -> Iterator[Path]:
    """Copy a SQLite source and optional receipt into one private immutable scope."""

    if not source.is_file():
        raise backup_manifest.BackupValidationError(
            "SQLite restore artifact is missing"
        )
    companion = backup_manifest.manifest_path_for(source)
    staging_root = runtime_path("restore-staging", "sqlite", create=True)
    staging_directory = staging_root / f".restore-{uuid4().hex}"
    staging_directory.mkdir()
    staged = staging_directory / source.name
    try:
        shutil.copy2(source, staged)
        if companion.is_file():
            shutil.copy2(companion, backup_manifest.manifest_path_for(staged))
        yield staged
    finally:
        try:
            shutil.rmtree(staging_directory, ignore_errors=False)
        except OSError as exc:
            _report_restore_cleanup_pending(staging_directory, exc)


def restore_sqlite(
    backup_path: str,
    target_path: str,
    run_check: bool,
    preverified_rollback: str | None = None,
    source_integrity_only: bool = False,
    structural_rollback: bool = False,
    offline_target: bool = False,
) -> None:
    original_src = _resolve_sqlite_backup(backup_path)
    dst = Path(target_path).resolve()
    target_existed_at_start = dst.exists()
    expected_absent_sidecar_digests = (
        {
            suffix: backup_manifest.file_sha256(sidecar)
            for suffix in ("-wal", "-shm", "-journal")
            if (sidecar := Path(f"{dst}{suffix}")).is_file()
        }
        if not target_existed_at_start
        else {}
    )

    if preverified_rollback and not target_existed_at_start:
        print("[RESTORE] preverified rollback requires an existing target DB", file=sys.stderr)
        raise SystemExit(1)
    if structural_rollback and (
        source_integrity_only
        or preverified_rollback
        or not target_existed_at_start
        or run_check
    ):
        print(
            "[RESTORE] --structural-rollback requires an existing target and no "
            "--source-integrity-only, --preverified-rollback, or --check",
            file=sys.stderr,
        )
        raise SystemExit(2)
    if source_integrity_only and (
        preverified_rollback or target_existed_at_start or run_check
    ):
        print(
            "[RESTORE] --source-integrity-only requires a new candidate target without --check",
            file=sys.stderr,
        )
        raise SystemExit(2)

    snapshot = None
    if preverified_rollback:
        snapshot = _resolve_preverified_rollback(
            preverified_rollback,
            dst,
            original_src,
        )

    if not original_src.exists():
        print(f"[RESTORE] backup file not found: {original_src}", file=sys.stderr)
        raise SystemExit(1)

    runtime_check = _requires_runtime_recovery_check(dst)
    if target_existed_at_start and not runtime_check and not offline_target:
        print(
            "[RESTORE] existing noncanonical SQLite target requires --offline-target",
            file=sys.stderr,
        )
        raise SystemExit(2)

    try:
        with _stage_sqlite_restore_pair(original_src) as src:
            if source_integrity_only or structural_rollback:
                receipt = backup_manifest.verify_manifest_receipt(
                    src,
                    expected_engine="sqlite",
                )
                allowed_statuses = (
                    {backup_manifest.BackupStatus.STRUCTURAL_ONLY}
                    if structural_rollback
                    else {
                        backup_manifest.BackupStatus.LEGACY_UNVERIFIED,
                        backup_manifest.BackupStatus.STRUCTURAL_ONLY,
                    }
                )
                if receipt.status not in allowed_statuses:
                    print(
                        "[RESTORE] structural source status is not allowed: "
                        f"{receipt.status.value}",
                        file=sys.stderr,
                    )
                    raise SystemExit(1)
                if receipt.status is backup_manifest.BackupStatus.STRUCTURAL_ONLY:
                    assert receipt.manifest is not None
                    structural = backup_manifest.verify_structural_sqlite_candidate(
                        src,
                        receipt.manifest,
                    )
                    if structural.status is not backup_manifest.BackupStatus.STRUCTURAL_ONLY:
                        print(
                            "[RESTORE] structural source verification failed: "
                            + "; ".join(structural.errors),
                            file=sys.stderr,
                        )
                        raise SystemExit(1)
                else:
                    _verify_sqlite_integrity(src)
                source_manifest = None
            else:
                source_manifest = _verify_sqlite_backup(src)

            if runtime_check:
                _verify_runtime_recovery()
                _enter_runtime_restore_fence()

            if preverified_rollback:
                snapshot = _resolve_preverified_rollback(
                    preverified_rollback,
                    dst,
                    original_src,
                )

            expected_target_digest = None
            if target_existed_at_start:
                if snapshot is None:
                    snapshot = (
                        _create_pre_restore_snapshot(dst, integrity_only=True)
                        if structural_rollback
                        else _create_pre_restore_snapshot(dst)
                    )
                print(f"[RESTORE] current DB rollback: {snapshot}")
                print(f"ROLLBACK_PATH={snapshot.resolve()}")
                expected_target_digest = _sqlite_snapshot_digest(dst)
                if snapshot.resolve() != original_src.resolve():
                    rollback_freshness = backup_manifest.verify_sqlite_backup(
                        snapshot,
                        source_path=dst,
                    )
                    if rollback_freshness.status is backup_manifest.BackupStatus.STALE:
                        print(
                            "[RESTORE] target changed while rollback snapshot was created",
                            file=sys.stderr,
                        )
                        print(
                            "RESTORE_RESULT=TARGET_CHANGED_AFTER_ROLLBACK",
                            file=sys.stderr,
                        )
                        raise SystemExit(3)
                    allowed_rollback_statuses = {
                        backup_manifest.BackupStatus.PASS,
                        backup_manifest.BackupStatus.STRUCTURAL_ONLY,
                    }
                    if rollback_freshness.status not in allowed_rollback_statuses:
                        raise backup_manifest.BackupValidationError(
                            "rollback snapshot verification failed: "
                            + "; ".join(rollback_freshness.errors)
                        )

            def verify_installed_target(verification_target: Path) -> None:
                if source_manifest is not None:
                    installed = _verify_sqlite_install_snapshot(
                        verification_target,
                        source_manifest,
                    )
                    if installed.status is not backup_manifest.BackupStatus.PASS:
                        print(
                            "[RESTORE] installed target failed post-check: "
                            + "; ".join(installed.errors),
                            file=sys.stderr,
                        )
                        raise SystemExit(1)
                else:
                    _verify_sqlite_integrity(verification_target)
                if runtime_check:
                    _verify_runtime_recovery()
                if run_check:
                    _run_integrity_check(
                        db_url=f"sqlite:///{verification_target.as_posix()}"
                    )

            dst.parent.mkdir(parents=True, exist_ok=True)
            _replace_sqlite_atomically(
                src,
                dst,
                source_integrity_only=source_integrity_only or structural_rollback,
                manifest=source_manifest,
                expected_target_digest=expected_target_digest,
                expected_target_absent=not target_existed_at_start,
                expected_absent_sidecar_digests=expected_absent_sidecar_digests,
                postcheck=verify_installed_target,
            )
    except backup_manifest.BackupValidationError as exc:
        print(f"[RESTORE] SQLite restore failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    size_kb = dst.stat().st_size // 1024
    print(f"[RESTORE] OK SQLite: {original_src.name} -> {dst} ({size_kb} KB)")


@contextmanager
def _stage_postgres_restore_pair(source: Path) -> Iterator[Path]:
    """Copy an artifact/manifest pair into a private immutable restore scope."""

    companion = backup_manifest.manifest_path_for(source)
    if not source.is_file() or not companion.is_file():
        raise backup_manifest.BackupValidationError(
            "PostgreSQL restore artifact/manifest pair is missing"
        )
    staging_root = runtime_path("restore-staging", "postgres", create=True)
    staging_directory = staging_root / f".restore-{uuid4().hex}"
    staging_directory.mkdir()
    staged = staging_directory / source.name
    try:
        shutil.copy2(source, staged)
        shutil.copy2(companion, backup_manifest.manifest_path_for(staged))
        receipt = backup_manifest.verify_manifest_receipt(
            staged,
            expected_engine="postgresql",
        )
        if (
            receipt.status is not backup_manifest.BackupStatus.PASS
            or receipt.manifest is None
        ):
            raise backup_manifest.BackupValidationError(
                f"PostgreSQL staged pair status={receipt.status.value}: "
                + "; ".join(receipt.errors)
        )
        yield staged
    finally:
        try:
            shutil.rmtree(staging_directory, ignore_errors=False)
        except OSError as exc:
            _report_restore_cleanup_pending(staging_directory, exc)


def _postgres_database_exists(connection: Connection, name: str) -> bool:
    """Return whether one database exists on the connected PostgreSQL cluster."""

    return (
        connection.execute(
            sa.text("SELECT 1 FROM pg_database WHERE datname = :name"),
            {"name": name},
        ).first()
        is not None
    )


def _postgres_database_oid(connection: Connection, name: str) -> int | None:
    value = connection.execute(
        sa.text("SELECT oid::bigint FROM pg_database WHERE datname = :name"),
        {"name": name},
    ).scalar_one_or_none()
    return int(value) if value is not None else None


def _postgres_database_name_for_oid(connection: Connection, oid: int) -> str | None:
    value = connection.execute(
        sa.text("SELECT datname FROM pg_database WHERE oid = :oid"),
        {"oid": oid},
    ).scalar_one_or_none()
    return str(value) if value is not None else None


def _set_postgres_allow_connections(
    connection: Connection,
    name: str,
    allowed: bool,
) -> None:
    preparer = connection.dialect.identifier_preparer
    setting = "true" if allowed else "false"
    connection.exec_driver_sql(
        f"ALTER DATABASE {preparer.quote(name)} ALLOW_CONNECTIONS {setting}"
    )


def _postgres_restore_lock_key(target_name: str) -> int:
    digest = hashlib.sha256(
        f"DEXCOWIN MES PostgreSQL restore:{target_name}".encode("utf-8")
    ).digest()
    return int.from_bytes(digest[:8], "big", signed=True)


@contextmanager
def _postgres_restore_lock(
    connection: Connection,
    target_name: str,
) -> Iterator[None]:
    """Serialize every cutover and release automatically with the admin session."""

    lock_key = _postgres_restore_lock_key(target_name)
    connection.execute(
        sa.text("SELECT pg_advisory_lock(:lock_key)"),
        {"lock_key": lock_key},
    )
    operation_error: BaseException | None = None
    try:
        yield
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        try:
            connection.execute(
                sa.text("SELECT pg_advisory_unlock(:lock_key)"),
                {"lock_key": lock_key},
            )
        except BaseException as cleanup_error:
            if operation_error is None:
                raise
            operation_error.add_note(
                f"PostgreSQL advisory unlock failed: {cleanup_error}"
            )


def _terminate_postgres_connections(
    connection: Connection,
    name: str,
    *,
    except_pid: int | None = None,
    except_pids: tuple[int, ...] = (),
) -> None:
    """Fence all sessions connected to one target database."""

    statement = (
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
        "WHERE datname = :name AND pid <> pg_backend_pid()"
    )
    parameters: dict[str, object] = {"name": name}
    excluded_pids = set(except_pids)
    if except_pid is not None:
        excluded_pids.add(except_pid)
    if excluded_pids:
        placeholders: list[str] = []
        for index, excluded_pid in enumerate(sorted(excluded_pids)):
            key = f"except_pid_{index}"
            placeholders.append(f":{key}")
            parameters[key] = excluded_pid
        statement += " AND pid NOT IN (" + ", ".join(placeholders) + ")"
    connection.execute(sa.text(statement), parameters)


@contextmanager
def _postgres_candidate_admission_fence(
    candidate_url: str,
    *,
    admin_url: str,
    candidate_name: str,
    expected_system_identifier: str | None = None,
    admin_connection: Connection | None = None,
    importer_pid: int | None = None,
) -> Iterator[Connection]:
    """Keep only pre-admitted importer/verifier sessions on one candidate."""

    candidate_engine = sa.create_engine(candidate_url, poolclass=sa.pool.NullPool)
    admin_engine = (
        None
        if admin_connection is not None
        else sa.create_engine(admin_url, poolclass=sa.pool.NullPool)
    )
    try:
        with candidate_engine.connect() as verifier:
            if expected_system_identifier is not None:
                _require_postgres_system_identifier(
                    verifier,
                    expected_system_identifier,
                )
            verifier_pid = int(
                verifier.exec_driver_sql("SELECT pg_backend_pid()").scalar_one()
            )
            verifier.rollback()
            except_pids = (
                (verifier_pid, importer_pid)
                if importer_pid is not None
                else (verifier_pid,)
            )
            if admin_connection is not None:
                if expected_system_identifier is not None:
                    _require_postgres_system_identifier(
                        admin_connection,
                        expected_system_identifier,
                    )
                _set_postgres_allow_connections(
                    admin_connection,
                    candidate_name,
                    False,
                )
                _terminate_postgres_connections(
                    admin_connection,
                    candidate_name,
                    except_pids=except_pids,
                )
            else:
                assert admin_engine is not None
                with admin_engine.connect().execution_options(
                    isolation_level="AUTOCOMMIT"
                ) as standalone_admin:
                    if expected_system_identifier is not None:
                        _require_postgres_system_identifier(
                            standalone_admin,
                            expected_system_identifier,
                        )
                    _set_postgres_allow_connections(
                        standalone_admin,
                        candidate_name,
                        False,
                    )
                    _terminate_postgres_connections(
                        standalone_admin,
                        candidate_name,
                        except_pids=except_pids,
                    )
            yield verifier
    finally:
        candidate_engine.dispose()
        if admin_engine is not None:
            admin_engine.dispose()


def _collect_fenced_postgres_candidate_evidence(
    candidate_url: str,
    *,
    admin_url: str,
    candidate_name: str,
    expected_system_identifier: str | None = None,
    admin_connection: Connection | None = None,
) -> dict[str, object]:
    """Fence candidate admission before collecting its immutable evidence."""

    with _postgres_candidate_admission_fence(
        candidate_url,
        admin_url=admin_url,
        candidate_name=candidate_name,
        expected_system_identifier=expected_system_identifier,
        admin_connection=admin_connection,
    ) as verifier:
        return backup_manifest.collect_database_evidence_from_connection(
            verifier,
            expected_engine="postgresql",
        )


def _rename_postgres_database(
    connection: Connection,
    old_name: str,
    new_name: str,
) -> None:
    """Rename one fenced database using dialect-safe identifiers."""

    preparer = connection.dialect.identifier_preparer
    connection.exec_driver_sql(
        f"ALTER DATABASE {preparer.quote(old_name)} RENAME TO "
        f"{preparer.quote(new_name)}"
    )


def _drop_postgres_database(connection: Connection, name: str) -> None:
    """Drop one cutover quarantine database after terminating its sessions."""

    _terminate_postgres_connections(connection, name)
    quoted = connection.dialect.identifier_preparer.quote(name)
    connection.exec_driver_sql(f"DROP DATABASE IF EXISTS {quoted}")


def _postgres_system_identifier(connection: Connection) -> str:
    """Return the stable PostgreSQL cluster identity used to scope recovery."""

    value = str(
        connection.exec_driver_sql(
            "SELECT system_identifier::text FROM pg_control_system()"
        ).scalar_one()
    )
    if not value.isdigit():
        raise OSError("invalid PostgreSQL cluster system identifier")
    return value


def _require_postgres_system_identifier(
    connection: Connection,
    expected: str,
) -> None:
    actual = _postgres_system_identifier(connection)
    if actual != expected:
        raise OSError(
            "PostgreSQL cluster identifier changed: "
            f"expected={expected}, actual={actual}"
        )


def _postgres_cutover_receipt_path(
    system_identifier: str,
    target_name: str,
) -> Path:
    scope = hashlib.sha256(
        f"{system_identifier}:{target_name}".encode("utf-8")
    ).hexdigest()[:20]
    return runtime_path(
        "restore-recovery",
        "postgres",
        create=True,
    ) / f"cutover-{scope}.json"


def _postgres_restore_operation_receipt_path(
    system_identifier: str,
    target_name: str,
) -> Path:
    scope = hashlib.sha256(
        f"{system_identifier}:{target_name}".encode("utf-8")
    ).hexdigest()[:20]
    return runtime_path(
        "restore-recovery",
        "postgres",
        create=True,
    ) / f"operation-{scope}.json"


def _postgres_cutover_suffix() -> str:
    return uuid4().hex[:12]


def _windows_write_through_replace(source: Path, destination: Path) -> None:
    _shared_windows_write_through_replace(source, destination)


def _durable_replace(source: Path, destination: Path) -> None:
    """Atomically replace one file and persist the resulting directory entry."""

    if os.name == "nt":
        _windows_write_through_replace(source, destination)
        return
    _shared_durable_replace(source, destination)


def _write_postgres_cutover_receipt(
    receipt: Path,
    payload: dict[str, object],
    *,
    state: str,
) -> None:
    pending = receipt.with_name(f".{receipt.name}.pending-{uuid4().hex}.tmp")
    value = {**payload, "state": state}
    receipt.parent.mkdir(parents=True, exist_ok=True)
    operation_error: BaseException | None = None
    try:
        with pending.open("wb") as handle:
            handle.write(
                json.dumps(
                    value,
                    ensure_ascii=True,
                    separators=(",", ":"),
                    sort_keys=True,
                ).encode("utf-8")
                + b"\n"
            )
            handle.flush()
            os.fsync(handle.fileno())
        for attempt in range(5):
            try:
                _durable_replace(pending, receipt)
                break
            except PermissionError:
                if attempt == 4:
                    raise
                time.sleep(0.01 * (attempt + 1))
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        try:
            pending.unlink(missing_ok=True)
        except OSError as cleanup_error:
            if operation_error is None:
                raise
            operation_error.add_note(
                f"PostgreSQL cutover receipt cleanup failed: {cleanup_error}"
            )


def _postgres_generated_name_suffix(name: str, prefix: str) -> str | None:
    """Return the bounded random suffix for one internally generated database name."""

    if not name.startswith(prefix):
        return None
    suffix = name.removeprefix(prefix)
    if len(suffix) != 12 or any(
        character not in "0123456789abcdef" for character in suffix
    ):
        return None
    return suffix


def _load_postgres_cutover_receipt(
    receipt: Path,
    *,
    target_name: str,
    system_identifier: str,
) -> dict[str, object]:
    try:
        payload = json.loads(receipt.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise OSError(f"invalid PostgreSQL cutover recovery receipt: {receipt}") from exc

    return _validate_postgres_cutover_payload(
        payload,
        target_name=target_name,
        system_identifier=system_identifier,
        source=receipt,
    )


def _validate_postgres_cutover_payload(
    payload: object,
    *,
    target_name: str,
    system_identifier: str,
    source: object,
) -> dict[str, object]:
    """Validate cutover identity before any catalog mutation."""

    name_keys = ("target_name", "candidate_name", "rollback_name", "failed_name")
    if (
        not isinstance(payload, dict)
        or payload.get("contract") != POSTGRES_CUTOVER_RECOVERY_CONTRACT
        or not isinstance(payload.get("system_identifier"), str)
        or payload.get("target_name") != target_name
        or payload.get("state")
        not in {"prepared", "target_renamed", "candidate_installed", "committed"}
        or not isinstance(payload.get("target_existed"), bool)
        or not isinstance(payload.get("candidate_oid"), int)
        or int(payload["candidate_oid"]) <= 0
        or (
            payload.get("target_existed") is True
            and (
                not isinstance(payload.get("target_oid"), int)
                or int(payload["target_oid"]) <= 0
            )
        )
        or (
            payload.get("target_existed") is False
            and payload.get("target_oid") is not None
        )
    ):
        raise OSError(f"invalid PostgreSQL cutover recovery receipt: {source}")
    if payload["system_identifier"] != system_identifier:
        raise OSError("PostgreSQL cutover receipt cluster identifier mismatch")
    for key in name_keys:
        name = payload.get(key)
        if (
            not isinstance(name, str)
            or not name
            or len(name.encode("utf-8")) > 63
            or "\x00" in name
        ):
            raise OSError(f"invalid PostgreSQL cutover recovery receipt: {source}")
    target = str(payload["target_name"])
    candidate = str(payload["candidate_name"])
    rollback = str(payload["rollback_name"])
    failed = str(payload["failed_name"])
    candidate_valid = _postgres_candidate_name_is_valid(
        candidate,
        system_identifier=system_identifier,
        target_name=target_name,
    )
    rollback_suffix = _postgres_generated_name_suffix(
        rollback,
        "ic18_restore_rollback_",
    )
    failed_suffix = _postgres_generated_name_suffix(
        failed,
        "ic18_restore_failed_",
    )
    if (
        not candidate_valid
        or rollback_suffix is None
        or failed_suffix is None
        or rollback_suffix != failed_suffix
        or len({target, candidate, rollback, failed}) != len(name_keys)
        or (
            payload["target_existed"] is True
            and payload["candidate_oid"] == payload["target_oid"]
        )
    ):
        raise OSError(f"invalid PostgreSQL cutover recovery receipt: {source}")
    return payload


def _validate_postgres_restore_operation_payload(
    payload: object,
    *,
    target_name: str,
    system_identifier: str,
    source: object,
) -> dict[str, object]:
    """Validate one bounded candidate allocation from any durable store."""

    candidate_name = payload.get("candidate_name") if isinstance(payload, dict) else None
    candidate_valid = (
        _postgres_candidate_name_is_valid(
            candidate_name,
            system_identifier=system_identifier,
            target_name=target_name,
        )
        if isinstance(candidate_name, str)
        else False
    )
    if (
        not isinstance(payload, dict)
        or payload.get("contract") != POSTGRES_RESTORE_OPERATION_CONTRACT
        or payload.get("state") not in {"candidate_allocated", "candidate_created"}
        or payload.get("system_identifier") != system_identifier
        or payload.get("target_name") != target_name
        or not valid_process_owner(payload.get("owner"))
        or not isinstance(candidate_name, str)
        or not candidate_valid
        or len(candidate_name.encode("utf-8")) > 63
        or (
            payload.get("state") == "candidate_allocated"
            and payload.get("candidate_oid") is not None
        )
        or (
            payload.get("state") == "candidate_created"
            and (
                not isinstance(payload.get("candidate_oid"), int)
                or int(payload["candidate_oid"]) <= 0
            )
        )
    ):
        raise OSError(f"invalid PostgreSQL restore operation receipt: {source}")
    return payload


def _load_postgres_restore_operation_receipt(
    receipt: Path,
    *,
    target_name: str,
    system_identifier: str,
) -> dict[str, object]:
    """Load one bounded candidate allocation owned by a restore process."""

    try:
        payload = json.loads(receipt.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise OSError(f"invalid PostgreSQL restore operation receipt: {receipt}") from exc
    return _validate_postgres_restore_operation_payload(
        payload,
        target_name=target_name,
        system_identifier=system_identifier,
        source=receipt,
    )


def _postgres_cluster_recovery_scope(
    system_identifier: str,
    target_name: str,
) -> str:
    return hashlib.sha256(
        f"{system_identifier}:{target_name}".encode("utf-8")
    ).hexdigest()[:20]


def _postgres_scoped_candidate_prefix(
    system_identifier: str,
    target_name: str,
) -> str:
    scope = _postgres_cluster_recovery_scope(system_identifier, target_name)
    return f"ic18_restore_candidate_{scope}_"


def _postgres_restore_candidate_name(
    system_identifier: str,
    target_name: str,
) -> str:
    """Create a catalog-discoverable name for the pre-marker crash interval."""

    return f"{_postgres_scoped_candidate_prefix(system_identifier, target_name)}{uuid4().hex[:12]}"


def _postgres_candidate_name_is_valid(
    candidate_name: str,
    *,
    system_identifier: str,
    target_name: str,
) -> bool:
    legacy_prefix = "ic18_restore_candidate_"
    legacy_suffix = candidate_name.removeprefix(legacy_prefix)
    scoped_prefix = _postgres_scoped_candidate_prefix(system_identifier, target_name)
    scoped_suffix = candidate_name.removeprefix(scoped_prefix)
    return (
        candidate_name.startswith(scoped_prefix)
        and len(scoped_suffix) == 12
        and all(character in "0123456789abcdef" for character in scoped_suffix)
    ) or (
        candidate_name.startswith(legacy_prefix)
        and len(legacy_suffix) == 12
        and all(character in "0123456789abcdef" for character in legacy_suffix)
    )


def _postgres_unmarked_scoped_candidate(
    connection: Connection,
    *,
    target_name: str,
    system_identifier: str,
) -> tuple[int, str] | None:
    """Find the single atomic name marker left before an OID comment exists."""

    prefix = _postgres_scoped_candidate_prefix(system_identifier, target_name)
    rows = connection.execute(
        sa.text(
            "SELECT oid, datname, shobj_description(oid, 'pg_database') AS comment "
            "FROM pg_database WHERE left(datname, :length) = :prefix ORDER BY oid"
        ),
        {"length": len(prefix), "prefix": prefix},
    ).mappings().all()
    valid_rows = [
        row
        for row in rows
        if _postgres_candidate_name_is_valid(
            str(row["datname"]),
            system_identifier=system_identifier,
            target_name=target_name,
        )
    ]
    if len(valid_rows) > 1:
        raise OSError("multiple PostgreSQL scoped restore candidates exist for one target")
    if not valid_rows:
        return None
    row = valid_rows[0]
    if row["comment"] is not None:
        return None
    return int(row["oid"]), str(row["datname"])


def _postgres_cluster_recovery_marker_prefix(
    system_identifier: str,
    target_name: str,
) -> str:
    scope = _postgres_cluster_recovery_scope(system_identifier, target_name)
    return f"{POSTGRES_CLUSTER_RECOVERY_PREFIX}{scope}:"


def _postgres_database_comment(connection: Connection, database_name: str) -> str | None:
    return connection.execute(
        sa.text(
            "SELECT shobj_description(oid, 'pg_database') "
            "FROM pg_database WHERE datname = :database_name"
        ),
        {"database_name": database_name},
    ).scalar_one_or_none()


def _set_postgres_database_comment(
    connection: Connection,
    database_name: str,
    comment: str | None,
) -> None:
    quoted_name = connection.dialect.identifier_preparer.quote(database_name)
    if comment is None:
        connection.exec_driver_sql(f"COMMENT ON DATABASE {quoted_name} IS NULL")
        return
    connection.execute(
        sa.text(f"COMMENT ON DATABASE {quoted_name} IS :comment"),
        {"comment": comment},
    )


def _write_postgres_restore_cluster_marker(
    connection: Connection,
    payload: dict[str, object],
    *,
    state: str,
) -> None:
    """Persist operation or cutover state on the exact candidate OID."""

    value = {**payload, "state": state}
    validated = _validate_postgres_cluster_marker_payload(
        value,
        target_name=str(value.get("target_name")),
        system_identifier=str(value.get("system_identifier")),
        source="PostgreSQL cluster marker",
    )
    candidate_name = str(validated["candidate_name"])
    candidate_oid = int(validated["candidate_oid"])
    current_name = _postgres_database_name_for_oid(connection, candidate_oid)
    if current_name is None:
        raise OSError("PostgreSQL cluster marker candidate OID mismatch")
    if validated["contract"] == POSTGRES_RESTORE_OPERATION_CONTRACT:
        if validated["state"] != "candidate_created" or current_name != candidate_name:
            raise OSError("PostgreSQL cluster marker requires a created candidate")
    elif current_name not in {
        candidate_name,
        str(validated["target_name"]),
        str(validated["failed_name"]),
    }:
        raise OSError("PostgreSQL cutover cluster marker candidate identity mismatch")
    prefix = _postgres_cluster_recovery_marker_prefix(
        str(validated["system_identifier"]),
        str(validated["target_name"]),
    )
    existing_comment = _postgres_database_comment(connection, current_name)
    if existing_comment is not None and not existing_comment.startswith(prefix):
        raise OSError("PostgreSQL restore candidate already has a database comment")
    if existing_comment is not None:
        existing = _decode_postgres_cluster_marker_comment(
            existing_comment,
            row_oid=candidate_oid,
            row_name=current_name,
            target_name=str(validated["target_name"]),
            system_identifier=str(validated["system_identifier"]),
        )
        invariant_keys = (
            "system_identifier",
            "target_name",
            "candidate_name",
            "candidate_oid",
        )
        if any(existing[key] != validated[key] for key in invariant_keys):
            raise OSError("PostgreSQL cluster marker identity changed")
        if (
            existing["contract"] == POSTGRES_CUTOVER_RECOVERY_CONTRACT
            and validated["contract"] == POSTGRES_RESTORE_OPERATION_CONTRACT
        ):
            raise OSError("PostgreSQL cutover cluster marker cannot regress")
    marker = prefix + json.dumps(
        validated,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )
    _set_postgres_database_comment(connection, current_name, marker)


def _validate_postgres_cluster_marker_payload(
    payload: object,
    *,
    target_name: str,
    system_identifier: str,
    source: object,
) -> dict[str, object]:
    contract = payload.get("contract") if isinstance(payload, dict) else None
    if contract == POSTGRES_RESTORE_OPERATION_CONTRACT:
        return _validate_postgres_restore_operation_payload(
            payload,
            target_name=target_name,
            system_identifier=system_identifier,
            source=source,
        )
    if contract == POSTGRES_CUTOVER_RECOVERY_CONTRACT:
        return _validate_postgres_cutover_payload(
            payload,
            target_name=target_name,
            system_identifier=system_identifier,
            source=source,
        )
    raise OSError(f"invalid PostgreSQL restore cluster marker: {source}")


def _decode_postgres_cluster_marker_comment(
    comment: str,
    *,
    row_oid: int,
    row_name: str,
    target_name: str,
    system_identifier: str,
) -> dict[str, object]:
    prefix = _postgres_cluster_recovery_marker_prefix(
        system_identifier,
        target_name,
    )
    if not comment.startswith(prefix):
        raise OSError("invalid PostgreSQL restore cluster marker prefix")
    try:
        payload = json.loads(comment[len(prefix) :])
    except json.JSONDecodeError as exc:
        raise OSError("invalid PostgreSQL restore cluster marker") from exc
    validated = _validate_postgres_cluster_marker_payload(
        payload,
        target_name=target_name,
        system_identifier=system_identifier,
        source="PostgreSQL cluster marker",
    )
    if validated["candidate_oid"] != row_oid:
        raise OSError("PostgreSQL restore cluster marker OID mismatch")
    if validated["contract"] == POSTGRES_RESTORE_OPERATION_CONTRACT:
        if validated["state"] != "candidate_created" or validated["candidate_name"] != row_name:
            raise OSError("PostgreSQL restore cluster marker identity mismatch")
    elif row_name not in {
        str(validated["candidate_name"]),
        str(validated["target_name"]),
        str(validated["failed_name"]),
    }:
        raise OSError("PostgreSQL cutover cluster marker identity mismatch")
    return validated


def _load_postgres_restore_cluster_marker(
    connection: Connection,
    *,
    target_name: str,
    system_identifier: str,
) -> dict[str, object] | None:
    """Load one target-scoped candidate marker from the cluster catalog."""

    prefix = _postgres_cluster_recovery_marker_prefix(
        system_identifier,
        target_name,
    )
    rows = connection.execute(
        sa.text(
            "SELECT oid, datname, shobj_description(oid, 'pg_database') AS comment "
            "FROM pg_database "
            "WHERE left(coalesce(shobj_description(oid, 'pg_database'), ''), :length) "
            "= :prefix ORDER BY oid"
        ),
        {"length": len(prefix), "prefix": prefix},
    ).mappings().all()
    if not rows:
        return None
    if len(rows) != 1:
        raise OSError("multiple PostgreSQL restore cluster markers exist for one target")
    row = rows[0]
    validated = _decode_postgres_cluster_marker_comment(
        str(row["comment"]),
        row_oid=int(row["oid"]),
        row_name=str(row["datname"]),
        target_name=target_name,
        system_identifier=system_identifier,
    )
    return validated


def _recover_postgres_restore_cluster_marker(
    connection: Connection,
    operation_receipt: Path,
    *,
    cutover_receipt: Path | None = None,
    target_name: str,
    system_identifier: str,
    allow_current_owner: bool = False,
) -> None:
    """Validate every durable view, then recover from cluster-visible state."""

    payload = _load_postgres_restore_cluster_marker(
        connection,
        target_name=target_name,
        system_identifier=system_identifier,
    )
    local_cutover = (
        _load_postgres_cutover_receipt(
            cutover_receipt,
            target_name=target_name,
            system_identifier=system_identifier,
        )
        if cutover_receipt is not None and cutover_receipt.is_file()
        else None
    )
    local_operation = (
        _load_postgres_restore_operation_receipt(
            operation_receipt,
            target_name=target_name,
            system_identifier=system_identifier,
        )
        if operation_receipt.is_file()
        else None
    )
    if payload is None:
        if local_cutover is not None and local_operation is not None:
            if local_operation["state"] != "candidate_created":
                raise OSError("PostgreSQL operation receipt/cutover state mismatch")
            for key in (
                "system_identifier",
                "target_name",
                "candidate_name",
                "candidate_oid",
            ):
                if local_operation.get(key) != local_cutover[key]:
                    raise OSError("PostgreSQL operation receipt/cutover mismatch")
        unmarked = _postgres_unmarked_scoped_candidate(
            connection,
            target_name=target_name,
            system_identifier=system_identifier,
        )
        if unmarked is None:
            if local_cutover is not None:
                recovery_payload = local_cutover
                if local_cutover["state"] == "candidate_installed":
                    candidate_oid = int(local_cutover["candidate_oid"])
                    target_oid = (
                        int(local_cutover["target_oid"])
                        if local_cutover["target_existed"]
                        else None
                    )
                    candidate_current = _postgres_database_name_for_oid(
                        connection,
                        candidate_oid,
                    )
                    target_current = (
                        _postgres_database_name_for_oid(connection, target_oid)
                        if target_oid is not None
                        else None
                    )
                    if candidate_current == target_name and target_current is None:
                        recovery_payload = {**local_cutover, "state": "committed"}
                _recover_postgres_cutover_payload(
                    connection,
                    recovery_payload,
                    receipt=cutover_receipt,
                    target_name=target_name,
                    system_identifier=system_identifier,
                )
            return
        if local_cutover is not None:
            raise OSError("PostgreSQL cutover receipt/unmarked candidate mismatch")
        candidate_oid, candidate_name = unmarked
        if local_operation is not None:
            if (
                local_operation["state"] != "candidate_allocated"
                or local_operation["candidate_name"] != candidate_name
                or local_operation.get("candidate_oid") is not None
            ):
                raise OSError("PostgreSQL restore receipt/unmarked candidate mismatch")
        if _postgres_database_oid(connection, candidate_name) != candidate_oid:
            raise OSError("PostgreSQL unmarked restore candidate OID changed")
        _drop_postgres_database(connection, candidate_name)
        if operation_receipt.is_file():
            operation_receipt.unlink()
        return

    if payload["contract"] == POSTGRES_CUTOVER_RECOVERY_CONTRACT:
        if local_cutover is not None:
            invariant_keys = (
                "contract",
                "system_identifier",
                "target_name",
                "candidate_name",
                "candidate_oid",
                "target_existed",
                "target_oid",
                "rollback_name",
                "failed_name",
            )
            if any(local_cutover[key] != payload[key] for key in invariant_keys):
                raise OSError("PostgreSQL cutover receipt/cluster marker mismatch")
            states = ("prepared", "target_renamed", "candidate_installed", "committed")
            marker_index = states.index(str(payload["state"]))
            local_index = states.index(str(local_cutover["state"]))
            if marker_index < local_index or marker_index - local_index > 1:
                raise OSError("PostgreSQL cutover receipt/cluster marker state mismatch")
        if local_operation is not None:
            for key in (
                "system_identifier",
                "target_name",
                "candidate_name",
                "candidate_oid",
            ):
                if local_operation.get(key) != payload[key]:
                    raise OSError("PostgreSQL operation receipt/cutover marker mismatch")
        _recover_postgres_cutover_payload(
            connection,
            payload,
            receipt=cutover_receipt if local_cutover is not None else None,
            target_name=target_name,
            system_identifier=system_identifier,
        )
        if operation_receipt.is_file():
            _recover_postgres_restore_operation_receipt(
                connection,
                operation_receipt,
                target_name=target_name,
                system_identifier=system_identifier,
                allow_current_owner=allow_current_owner,
            )
        return

    if local_cutover is not None:
        raise OSError("PostgreSQL operation marker/cutover receipt mismatch")
    if local_operation is not None:
        for key in (
            "contract",
            "system_identifier",
            "target_name",
            "candidate_name",
            "owner",
        ):
            if local_operation[key] != payload[key]:
                raise OSError("PostgreSQL restore receipt/cluster marker mismatch")
        if local_operation.get("candidate_oid") not in {None, payload["candidate_oid"]}:
            raise OSError("PostgreSQL restore receipt/cluster marker OID mismatch")
    _write_postgres_cutover_receipt(
        operation_receipt,
        payload,
        state="candidate_created",
    )
    _recover_postgres_restore_operation_receipt(
        connection,
        operation_receipt,
        target_name=target_name,
        system_identifier=system_identifier,
        allow_current_owner=allow_current_owner,
    )


def _recover_postgres_restore_operation_receipt(
    connection: Connection,
    receipt: Path,
    *,
    target_name: str,
    system_identifier: str,
    allow_current_owner: bool = False,
) -> None:
    """Drop only the exact dead-owner candidate named by a durable allocation."""

    payload = _load_postgres_restore_operation_receipt(
        receipt,
        target_name=target_name,
        system_identifier=system_identifier,
    )
    if allow_current_owner:
        if payload["owner"] != current_process_owner():
            raise backup_manifest.BackupValidationError(
                "PostgreSQL restore operation ownership changed"
            )
    elif process_owner_is_active(payload["owner"]):
        raise backup_manifest.BackupValidationError(
            "PostgreSQL restore operation is owned by an active process"
        )
    candidate_name = str(payload["candidate_name"])
    current_oid = _postgres_database_oid(connection, candidate_name)
    expected_oid = payload.get("candidate_oid")
    if payload["state"] == "candidate_allocated":
        if current_oid is not None:
            raise OSError(
                "PostgreSQL restore candidate exists without a durable OID receipt"
            )
    elif current_oid is not None:
        if current_oid != expected_oid:
            raise OSError("PostgreSQL restore candidate OID mismatch")
        _drop_postgres_database(connection, candidate_name)
    elif isinstance(expected_oid, int):
        installed_name = _postgres_database_name_for_oid(connection, expected_oid)
        if installed_name is not None:
            prefix = _postgres_cluster_recovery_marker_prefix(
                system_identifier,
                target_name,
            )
            comment = _postgres_database_comment(connection, installed_name)
            if comment is not None and comment.startswith(prefix):
                raise OSError(
                    "PostgreSQL installed candidate still has a recovery marker"
                )
    receipt.unlink()


def _claim_postgres_restore_operation_locked(
    connection: Connection,
    receipt: Path,
    *,
    target_name: str,
    system_identifier: str,
    candidate_name: str,
) -> None:
    """Claim one absent candidate while the caller holds the target lock."""

    _require_postgres_system_identifier(connection, system_identifier)
    if receipt.is_file():
        _recover_postgres_restore_operation_receipt(
            connection,
            receipt,
            target_name=target_name,
            system_identifier=system_identifier,
        )
    if _postgres_database_oid(connection, candidate_name) is not None:
        raise backup_manifest.BackupValidationError(
            f"PostgreSQL restore candidate name is already occupied: {candidate_name}"
        )
    _write_postgres_cutover_receipt(
        receipt,
        {
            "contract": POSTGRES_RESTORE_OPERATION_CONTRACT,
            "system_identifier": system_identifier,
            "target_name": target_name,
            "candidate_name": candidate_name,
            "candidate_oid": None,
            "owner": current_process_owner(),
        },
        state="candidate_allocated",
    )


def _record_postgres_restore_candidate_oid(
    connection: Connection,
    receipt: Path,
    *,
    target_name: str,
    system_identifier: str,
) -> int:
    """Bind the allocated candidate name to its cluster OID durably."""

    _require_postgres_system_identifier(connection, system_identifier)
    payload = _load_postgres_restore_operation_receipt(
        receipt,
        target_name=target_name,
        system_identifier=system_identifier,
    )
    if payload["owner"] != current_process_owner():
        raise backup_manifest.BackupValidationError(
            "PostgreSQL restore operation ownership changed"
        )
    candidate_name = str(payload["candidate_name"])
    candidate_oid = _postgres_database_oid(connection, candidate_name)
    if candidate_oid is None:
        raise backup_manifest.BackupValidationError(
            f"PostgreSQL restore candidate is missing: {candidate_name}"
        )
    value = {**payload, "candidate_oid": candidate_oid}
    _write_postgres_restore_cluster_marker(
        connection,
        value,
        state="candidate_created",
    )
    _write_postgres_cutover_receipt(
        receipt,
        value,
        state="candidate_created",
    )
    return candidate_oid


def _claim_postgres_restore_operation(
    admin_url: str,
    *,
    target_name: str,
    system_identifier: str,
    candidate_name: str,
) -> Path:
    """Durably reserve an exact candidate name before PostgreSQL creates it."""

    receipt = _postgres_restore_operation_receipt_path(
        system_identifier,
        target_name,
    )
    admin_engine = sa.create_engine(admin_url, poolclass=sa.pool.NullPool)
    try:
        with admin_engine.connect().execution_options(
            isolation_level="AUTOCOMMIT"
        ) as connection:
            with _postgres_restore_lock(connection, target_name):
                _claim_postgres_restore_operation_locked(
                    connection,
                    receipt,
                    target_name=target_name,
                    system_identifier=system_identifier,
                    candidate_name=candidate_name,
                )
    finally:
        admin_engine.dispose()
    return receipt


def _recover_postgres_cutover_receipt(
    connection: Connection,
    receipt: Path,
    *,
    target_name: str,
    system_identifier: str,
) -> None:
    payload = _load_postgres_cutover_receipt(
        receipt,
        target_name=target_name,
        system_identifier=system_identifier,
    )
    _recover_postgres_cutover_payload(
        connection,
        payload,
        receipt=receipt,
        target_name=target_name,
        system_identifier=system_identifier,
    )


def _clear_postgres_cluster_marker(
    connection: Connection,
    payload: dict[str, object],
    *,
    target_name: str,
    system_identifier: str,
) -> None:
    candidate_oid = int(payload["candidate_oid"])
    current_name = _postgres_database_name_for_oid(connection, candidate_oid)
    if current_name is None:
        return
    comment = _postgres_database_comment(connection, current_name)
    if comment is None:
        return
    prefix = _postgres_cluster_recovery_marker_prefix(system_identifier, target_name)
    if not comment.startswith(prefix):
        raise OSError("PostgreSQL candidate cluster marker changed before cleanup")
    existing = _decode_postgres_cluster_marker_comment(
        comment,
        row_oid=candidate_oid,
        row_name=current_name,
        target_name=target_name,
        system_identifier=system_identifier,
    )
    invariant_keys = (
        "system_identifier",
        "target_name",
        "candidate_name",
        "candidate_oid",
    )
    if any(existing[key] != payload[key] for key in invariant_keys):
        raise OSError("PostgreSQL cluster marker identity changed before cleanup")
    _set_postgres_database_comment(connection, current_name, None)


def _recover_postgres_cutover_payload(
    connection: Connection,
    payload: dict[str, object],
    *,
    receipt: Path | None,
    target_name: str,
    system_identifier: str,
) -> None:
    """Recover a prevalidated cutover from either durable state store."""

    candidate_name = str(payload["candidate_name"])
    rollback_name = str(payload["rollback_name"])
    failed_name = str(payload["failed_name"])
    candidate_oid = int(payload["candidate_oid"])
    target_existed = bool(payload["target_existed"])
    target_oid = int(payload["target_oid"]) if target_existed else None
    candidate_current = _postgres_database_name_for_oid(connection, candidate_oid)
    target_current = (
        _postgres_database_name_for_oid(connection, target_oid)
        if target_oid is not None
        else None
    )
    if candidate_current not in {None, candidate_name, target_name, failed_name}:
        raise OSError("PostgreSQL cutover candidate OID/name mismatch")
    if target_current not in {None, target_name, rollback_name}:
        raise OSError("PostgreSQL cutover target OID/name mismatch")

    if payload["state"] == "committed":
        if candidate_current != target_name:
            raise OSError("committed PostgreSQL cutover target OID mismatch")
        _set_postgres_allow_connections(connection, target_name, True)
        if target_current is not None:
            _drop_postgres_database(connection, target_current)
        _clear_postgres_cluster_marker(
            connection,
            payload,
            target_name=target_name,
            system_identifier=system_identifier,
        )
        if receipt is not None:
            receipt.unlink(missing_ok=True)
        return

    if target_existed and target_current is None:
        raise OSError("original PostgreSQL target is missing during recovery")
    if candidate_current == target_name and target_existed:
        if _postgres_database_exists(connection, failed_name):
            raise OSError("PostgreSQL failed-candidate quarantine already exists")
        _set_postgres_allow_connections(connection, target_name, False)
        _terminate_postgres_connections(connection, target_name)
        _rename_postgres_database(connection, target_name, failed_name)
        candidate_current = failed_name
    if target_existed:
        assert target_current is not None
        target_current = _postgres_database_name_for_oid(connection, int(target_oid))
        if target_current != target_name:
            if _postgres_database_exists(connection, target_name):
                raise OSError("PostgreSQL target name is occupied during recovery")
            _rename_postgres_database(connection, target_current, target_name)
        _set_postgres_allow_connections(connection, target_name, True)
    candidate_current = _postgres_database_name_for_oid(connection, candidate_oid)
    if candidate_current is not None:
        _drop_postgres_database(connection, candidate_current)
    if receipt is not None:
        receipt.unlink(missing_ok=True)


def _recover_pending_postgres_cutover(
    admin_url: str,
    *,
    target_name: str,
) -> tuple[str, Path]:
    """Recover an interrupted cutover before validating a new restore request."""

    admin_engine = sa.create_engine(admin_url, poolclass=sa.pool.NullPool)
    try:
        with admin_engine.connect().execution_options(
            isolation_level="AUTOCOMMIT"
        ) as connection:
            system_identifier = _postgres_system_identifier(connection)
            receipt = _postgres_cutover_receipt_path(system_identifier, target_name)
            operation_receipt = _postgres_restore_operation_receipt_path(
                system_identifier,
                target_name,
            )
            with _postgres_restore_lock(connection, target_name):
                _recover_postgres_restore_cluster_marker(
                    connection,
                    operation_receipt,
                    cutover_receipt=receipt,
                    target_name=target_name,
                    system_identifier=system_identifier,
                )
                if operation_receipt.is_file():
                    _recover_postgres_restore_operation_receipt(
                        connection,
                        operation_receipt,
                        target_name=target_name,
                        system_identifier=system_identifier,
                    )
            return system_identifier, receipt
    finally:
        admin_engine.dispose()


@contextmanager
def _postgres_restore_operation_scope(
    admin_url: str,
    *,
    target_name: str,
) -> Iterator[tuple[Connection, str, Path, Path]]:
    """Hold one cluster-visible target lock through claim, cutover, and cleanup."""

    admin_engine = sa.create_engine(admin_url, poolclass=sa.pool.NullPool)
    try:
        with admin_engine.connect().execution_options(
            isolation_level="AUTOCOMMIT"
        ) as connection:
            system_identifier = _postgres_system_identifier(connection)
            cutover_receipt = _postgres_cutover_receipt_path(
                system_identifier,
                target_name,
            )
            operation_receipt = _postgres_restore_operation_receipt_path(
                system_identifier,
                target_name,
            )
            with _postgres_restore_lock(connection, target_name):
                _require_postgres_system_identifier(connection, system_identifier)
                _recover_postgres_restore_cluster_marker(
                    connection,
                    operation_receipt,
                    cutover_receipt=cutover_receipt,
                    target_name=target_name,
                    system_identifier=system_identifier,
                )
                if operation_receipt.is_file():
                    _recover_postgres_restore_operation_receipt(
                        connection,
                        operation_receipt,
                        target_name=target_name,
                        system_identifier=system_identifier,
                    )
                yield (
                    connection,
                    system_identifier,
                    cutover_receipt,
                    operation_receipt,
                )
    finally:
        admin_engine.dispose()


def _cutover_postgres_candidate(
    connection: Connection,
    *,
    candidate_name: str,
    target_name: str,
    postcheck: Callable[[], None],
    recovery_receipt: Path | None = None,
    system_identifier: str | None = None,
    lock_already_held: bool = False,
) -> None:
    """Commit a fenced, recoverable target rename under one cluster lock."""

    cluster_identifier = system_identifier or _postgres_system_identifier(connection)
    receipt = recovery_receipt or _postgres_cutover_receipt_path(
        cluster_identifier,
        target_name,
    )
    lock_context = (
        nullcontext()
        if lock_already_held
        else _postgres_restore_lock(connection, target_name)
    )
    _require_postgres_system_identifier(connection, cluster_identifier)
    with lock_context:
        _require_postgres_system_identifier(connection, cluster_identifier)
        if receipt.is_file():
            _recover_postgres_cutover_receipt(
                connection,
                receipt,
                target_name=target_name,
                system_identifier=cluster_identifier,
            )
        candidate_oid = _postgres_database_oid(connection, candidate_name)
        if candidate_oid is None:
            raise OSError(f"PostgreSQL restore candidate is missing: {candidate_name}")
        suffix = _postgres_cutover_suffix()
        rollback_name = f"ic18_restore_rollback_{suffix}"
        failed_name = f"ic18_restore_failed_{suffix}"
        target_oid = _postgres_database_oid(connection, target_name)
        target_existed = target_oid is not None
        payload: dict[str, object] = {
            "contract": POSTGRES_CUTOVER_RECOVERY_CONTRACT,
            "system_identifier": cluster_identifier,
            "target_name": target_name,
            "candidate_name": candidate_name,
            "rollback_name": rollback_name,
            "failed_name": failed_name,
            "target_existed": target_existed,
            "target_oid": target_oid,
            "candidate_oid": candidate_oid,
        }
        _write_postgres_restore_cluster_marker(
            connection,
            payload,
            state="prepared",
        )
        cluster_state = "prepared"
        try:
            _write_postgres_cutover_receipt(receipt, payload, state="prepared")
            _set_postgres_allow_connections(connection, candidate_name, False)
            _terminate_postgres_connections(connection, candidate_name)
            if target_existed:
                _set_postgres_allow_connections(connection, target_name, False)
                _terminate_postgres_connections(connection, target_name)
                _rename_postgres_database(connection, target_name, rollback_name)
                _write_postgres_restore_cluster_marker(
                    connection,
                    payload,
                    state="target_renamed",
                )
                cluster_state = "target_renamed"
                _write_postgres_cutover_receipt(
                    receipt,
                    payload,
                    state="target_renamed",
                )
            _rename_postgres_database(connection, candidate_name, target_name)
            _write_postgres_restore_cluster_marker(
                connection,
                payload,
                state="candidate_installed",
            )
            cluster_state = "candidate_installed"
            _write_postgres_cutover_receipt(
                receipt,
                payload,
                state="candidate_installed",
            )
            if _postgres_database_oid(connection, target_name) != candidate_oid:
                raise backup_manifest.BackupValidationError(
                    "installed PostgreSQL target OID mismatch"
                )
            postcheck()
            _write_postgres_restore_cluster_marker(
                connection,
                payload,
                state="committed",
            )
            cluster_state = "committed"
            _write_postgres_cutover_receipt(receipt, payload, state="committed")
            _set_postgres_allow_connections(connection, target_name, True)
        except (Exception, SystemExit) as primary_error:
            try:
                _recover_postgres_cutover_payload(
                    connection,
                    {**payload, "state": cluster_state},
                    receipt=receipt,
                    target_name=target_name,
                    system_identifier=cluster_identifier,
                )
            except (Exception, SystemExit) as recovery_error:
                raise RuntimeError(
                    "PostgreSQL target rollback failed; durable recovery receipt remains at "
                    f"{receipt}"
                ) from recovery_error
            if _postgres_database_oid(connection, target_name) == candidate_oid:
                return
            raise primary_error

        try:
            if target_existed:
                _drop_postgres_database(connection, rollback_name)
            _clear_postgres_cluster_marker(
                connection,
                {**payload, "state": "committed"},
                target_name=target_name,
                system_identifier=cluster_identifier,
            )
            receipt.unlink()
        except Exception as cleanup_error:  # noqa: BLE001 - durable retry marker remains
            _report_restore_cleanup_pending(receipt, cleanup_error)


def restore_postgres(
    backup_path: str,
    container: str | None,
    host: str,
    port: int,
    user: str,
    dbname: str,
    run_check: bool,
    assume_yes: bool = False,
    validation_url: str | None = None,
) -> None:
    src = Path(backup_path).resolve()
    admin_url = _postgres_database_url(
        host,
        port,
        user,
        "postgres",
        validation_url=validation_url,
    )
    runtime_check = _requires_postgres_runtime_recovery_check(dbname)
    try:
        with _postgres_restore_operation_scope(
            admin_url,
            target_name=dbname,
        ) as (
            admin_connection,
            system_identifier,
            recovery_receipt,
            operation_receipt,
        ):
            candidate_name = _postgres_restore_candidate_name(
                system_identifier,
                dbname,
            )
            if not src.exists():
                print(f"[RESTORE] backup file not found: {src}", file=sys.stderr)
                raise SystemExit(1)
            with _stage_postgres_restore_pair(src) as staged_source:
                receipt = backup_manifest.verify_manifest_receipt(
                    staged_source,
                    expected_engine="postgresql",
                )
                source_manifest = receipt.manifest
                if (
                    receipt.status is not backup_manifest.BackupStatus.PASS
                    or source_manifest is None
                ):
                    raise backup_manifest.BackupValidationError(
                        f"backup status={receipt.status.value}: "
                        + "; ".join(receipt.errors)
                    )
                _claim_postgres_restore_operation_locked(
                    admin_connection,
                    operation_receipt,
                    target_name=dbname,
                    system_identifier=system_identifier,
                    candidate_name=candidate_name,
                )
                cutover_succeeded = False
                try:
                    _require_postgres_system_identifier(
                        admin_connection,
                        system_identifier,
                    )

                    def record_created_candidate_oid() -> None:
                        """Bind the created DB to this receipt before dump import begins."""

                        _require_postgres_system_identifier(
                            admin_connection,
                            system_identifier,
                        )
                        _record_postgres_restore_candidate_oid(
                            admin_connection,
                            operation_receipt,
                            target_name=dbname,
                            system_identifier=system_identifier,
                        )

                    candidate_url = _postgres_database_url(
                        host,
                        port,
                        user,
                        candidate_name,
                        validation_url=validation_url,
                    )
                    with ExitStack() as verifier_stack:
                        verifier_connection: Connection | None = None

                        def fence_importer(importer_pid: int) -> None:
                            """Close admission before the importer receives dump bytes."""

                            nonlocal verifier_connection
                            verifier_connection = verifier_stack.enter_context(
                                _postgres_candidate_admission_fence(
                                    candidate_url,
                                    admin_url=admin_url,
                                    candidate_name=candidate_name,
                                    expected_system_identifier=system_identifier,
                                    admin_connection=admin_connection,
                                    importer_pid=importer_pid,
                                )
                            )

                        _restore_postgres_dump_to_database(
                            staged_source,
                            database_name=candidate_name,
                            container=container,
                            host=host,
                            port=port,
                            user=user,
                            validation_url=validation_url,
                            require_absent=True,
                            on_database_created=record_created_candidate_oid,
                            on_importer_connected=fence_importer,
                            expected_system_identifier=system_identifier,
                        )
                        if verifier_connection is None:
                            raise backup_manifest.BackupValidationError(
                                "PostgreSQL importer admission fence was not established"
                            )
                        candidate_evidence = (
                            backup_manifest.collect_database_evidence_from_connection(
                                verifier_connection,
                                expected_engine="postgresql",
                            )
                        )
                    candidate = backup_manifest.verify_database_evidence(
                        source_manifest,
                        candidate_evidence,
                    )
                    if candidate.status is not backup_manifest.BackupStatus.PASS:
                        raise backup_manifest.BackupValidationError(
                            "temporary restore evidence mismatch: "
                            + "; ".join(candidate.errors)
                        )
                    if run_check:
                        _verify_collected_postgres_integrity(candidate_evidence)

                    if runtime_check:
                        _verify_runtime_recovery()
                    print(
                        f"[RESTORE] PostgreSQL source: {src} "
                        f"({staged_source.stat().st_size // 1024} KB)"
                    )
                    if not assume_yes:
                        print(
                            "[RESTORE] This will replace the target database. "
                            "Press Enter to continue, Ctrl+C to cancel."
                        )
                        try:
                            input()
                        except KeyboardInterrupt:
                            print("[RESTORE] cancelled")
                            raise SystemExit(0)
                    if runtime_check:
                        _enter_runtime_restore_fence()

                    def verify_installed_target() -> None:
                        if runtime_check:
                            _verify_runtime_recovery()

                    _cutover_postgres_candidate(
                        admin_connection,
                        candidate_name=candidate_name,
                        target_name=dbname,
                        postcheck=verify_installed_target,
                        recovery_receipt=recovery_receipt,
                        system_identifier=system_identifier,
                        lock_already_held=True,
                    )
                    cutover_succeeded = True
                finally:
                    try:
                        _recover_postgres_restore_operation_receipt(
                            admin_connection,
                            operation_receipt,
                            target_name=dbname,
                            system_identifier=system_identifier,
                            allow_current_owner=True,
                        )
                    except (Exception, SystemExit) as cleanup_error:
                        _report_restore_cleanup_pending(
                            operation_receipt,
                            cleanup_error,
                        )
                    if cutover_succeeded and operation_receipt.is_file():
                        _report_restore_cleanup_pending(
                            operation_receipt,
                            OSError("completed operation receipt remains"),
                        )
    except (
        backup_manifest.BackupValidationError,
        OSError,
        sa.exc.SQLAlchemyError,
    ) as exc:
        print(f"[RESTORE] PostgreSQL restore failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    print(f"[RESTORE] OK PostgreSQL: {src.name} -> {dbname}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Restore DEXCOWIN MES DB")
    parser.add_argument("--sqlite", metavar="BACKUP_PATH", help="SQLite backup file path")
    parser.add_argument("--target", default=str(PROJECT_ROOT / "backend" / "mes.db"), help="Restore target path")
    parser.add_argument(
        "--preverified-rollback",
        help="Verified rollback snapshot in the runtime backup directory; skips a duplicate pre-restore snapshot",
    )
    parser.add_argument(
        "--source-integrity-only",
        action="store_true",
        help="Allow a structurally valid legacy SQLite source only for a new pre-migration candidate",
    )
    parser.add_argument(
        "--structural-rollback",
        action="store_true",
        help="Restore a STRUCTURAL_ONLY pair over an existing SQLite target",
    )
    parser.add_argument(
        "--offline-target",
        action="store_true",
        help="Assert that a noncanonical existing SQLite target has no active writers",
    )
    parser.add_argument("--postgres", metavar="BACKUP_SQL", help="PostgreSQL dump file path")
    parser.add_argument("--container", help="Docker container name")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--user", default="mes_user")
    parser.add_argument("--dbname", default="mes_db")
    parser.add_argument(
        "--validation-url",
        help="Host-reachable PostgreSQL URL used for restore evidence and cutover",
    )
    parser.add_argument("--check", action="store_true", help="Run inventory integrity check after restore")
    parser.add_argument("--yes", action="store_true", help="Skip the PostgreSQL destructive-action prompt")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    print("=" * 54)
    print("DEXCOWIN MES DB restore")
    print("=" * 54)

    if args.sqlite:
        restore_sqlite(
            args.sqlite,
            args.target,
            args.check,
            args.preverified_rollback,
            args.source_integrity_only,
            args.structural_rollback,
            args.offline_target,
        )
    elif args.postgres:
        if args.source_integrity_only or args.structural_rollback or args.offline_target:
            print("[RESTORE] structural SQLite flags are not valid for PostgreSQL", file=sys.stderr)
            return 2
        restore_postgres(
            args.postgres,
            args.container,
            args.host,
            args.port,
            args.user,
            args.dbname,
            args.check,
            assume_yes=args.yes,
            validation_url=args.validation_url,
        )
    else:
        print("[RESTORE] pass --sqlite <backup> or --postgres <dump>", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
