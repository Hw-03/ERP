#!/usr/bin/env python3
"""Back up the DEXCOWIN MES database into the permanent runtime tree."""

from __future__ import annotations

import argparse
from collections.abc import Callable
from contextlib import ExitStack
import os
import re
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

from sqlalchemy.engine import make_url


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.runtime_paths import runtime_path  # noqa: E402
from scripts.ops.backup_manifest import (  # noqa: E402
    BackupValidationError,
    build_structural_sqlite_manifest,
    build_manifest,
    collect_database_evidence,
    collect_database_evidence_from_connection,
    file_sha256,
    publish_backup_pair,
    sqlite_file_generation,
)
from scripts.ops.backup_retention import DEFAULT_KEEP, retain_latest_backups  # noqa: E402


VERIFY_BACKUP = PROJECT_ROOT / "scripts" / "ops" / "_verify_backup.py"
POSTGRES_BACKUP_VALIDATION_TARGET = "ic18_backup_validation"


def _regular_backup_name(suffix: str) -> str:
    """Return a collision-resistant regular backup filename."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    return f"mes_{timestamp}_{uuid4().hex}{suffix}"


def _labeled_backup_name(label: str, suffix: str) -> str:
    """Return a descriptive, collision-resistant backup filename."""
    if not re.fullmatch(r"[a-z0-9-]+", label):
        raise ValueError("backup label must contain only lowercase letters, digits, and hyphens")
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"mes-before-{label}-{timestamp}-{uuid4().hex[:8]}{suffix}"


def _private_backup_path(published_path: Path) -> Path:
    """Return a same-directory path that retention can never classify as regular."""
    return published_path.parent / f".{published_path.name}.pending-{uuid4().hex}.tmp"


def _remove_private_sqlite_backup(path: Path) -> None:
    """Remove one unpublished SQLite backup and its private sidecars."""
    for suffix in ("", "-wal", "-shm", "-journal"):
        Path(f"{path}{suffix}").unlink(missing_ok=True)


def _reject_legacy_backup_override() -> None:
    if "MES_SQLITE_BACKUP_DIR" in os.environ:
        print(
            "[BACKUP] MES_SQLITE_BACKUP_DIR is unsupported; set MES_RUNTIME_ROOT instead",
            file=sys.stderr,
        )
        raise SystemExit(2)


def _verify_sqlite_backup(path: Path) -> dict[str, object]:
    """Collect the complete v1 evidence before an artifact is published."""

    try:
        return collect_database_evidence(
            f"sqlite:///{path.resolve().as_posix()}",
            expected_engine="sqlite",
        )
    except BackupValidationError as exc:
        print(f"[BACKUP] verification failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


def _verify_sqlite_integrity(path: Path) -> None:
    """Verify a snapshot is structurally sound before current-schema migration."""
    connection = None
    operation_error: BaseException | None = None
    try:
        connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
        rows = connection.execute("PRAGMA integrity_check").fetchall()
    except sqlite3.Error as exc:
        print(f"[BACKUP] SQLite integrity check failed: {exc}", file=sys.stderr)
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
        print(f"[BACKUP] SQLite integrity check failed: {rows}", file=sys.stderr)
        raise SystemExit(1)


def backup_sqlite(
    db_path: str,
    *,
    label: str | None = None,
    integrity_only: bool = False,
) -> Path:
    _reject_legacy_backup_override()
    src = Path(db_path).resolve()
    if not src.exists():
        print(f"[BACKUP] SQLite file not found: {src}", file=sys.stderr)
        raise SystemExit(1)

    backup_dir = runtime_path("backups", "sqlite", create=True)
    filename = _labeled_backup_name(label, ".db") if label else _regular_backup_name(".db")
    published = backup_dir / filename
    staged = _private_backup_path(published)

    source = None
    target = None
    source_snapshot: dict[str, object] = {
        "method": "sqlite3.backup",
        "journal_mode": "unknown",
        "wal_included": True,
    }
    generation_before: str | None = None
    generation_after: str | None = None
    operation_error: BaseException | None = None
    try:
        snapshot_error: BaseException | None = None
        try:
            source = sqlite3.connect(f"file:{src.as_posix()}?mode=ro", uri=True)
            source_snapshot["journal_mode"] = str(
                source.execute("PRAGMA journal_mode").fetchone()[0]
            )
            target = sqlite3.connect(str(staged))
            generation_before = sqlite_file_generation(src)
            source.backup(target)
            generation_after = sqlite_file_generation(src)
        except sqlite3.Error as exc:
            print(f"[BACKUP] sqlite3 backup failed: {exc}", file=sys.stderr)
            snapshot_error = SystemExit(1)
            raise snapshot_error from exc
        except BaseException as exc:
            snapshot_error = exc
            raise
        finally:
            cleanup_errors: list[BaseException] = []
            for label, connection in (("target", target), ("source", source)):
                if connection is None:
                    continue
                try:
                    connection.close()
                except BaseException as cleanup_error:
                    cleanup_errors.append(
                        OSError(f"SQLite {label} close failed: {cleanup_error}")
                    )
            if snapshot_error is not None:
                for cleanup_error in cleanup_errors:
                    snapshot_error.add_note(str(cleanup_error))
            elif cleanup_errors:
                primary_cleanup_error = cleanup_errors[0]
                for cleanup_error in cleanup_errors[1:]:
                    primary_cleanup_error.add_note(str(cleanup_error))
                raise primary_cleanup_error
        if not staged.exists():
            print(f"[BACKUP] backup file was not created: {staged}", file=sys.stderr)
            raise SystemExit(1)
        if generation_before is None or generation_after != generation_before:
            print(
                "[BACKUP] SQLite source generation changed during snapshot capture",
                file=sys.stderr,
            )
            raise SystemExit(1)
        source_snapshot["physical_generation"] = generation_after
        if integrity_only:
            _verify_sqlite_integrity(staged)
            manifest = build_structural_sqlite_manifest(
                staged,
                published_name=published.name,
                source_snapshot=source_snapshot,
            )
            publish_backup_pair(staged, published, manifest)
        else:
            evidence = _verify_sqlite_backup(staged)
            manifest = build_manifest(
                staged,
                published_name=published.name,
                evidence=evidence,
                source_snapshot=source_snapshot,
            )
            publish_backup_pair(staged, published, manifest)
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        try:
            _remove_private_sqlite_backup(staged)
        except OSError as cleanup_error:
            if operation_error is None:
                raise
            operation_error.add_note(
                f"SQLite private backup cleanup failed: {cleanup_error}"
            )

    removed = retain_latest_backups(backup_dir, suffix=".db", keep=DEFAULT_KEEP)
    size_kb = published.stat().st_size // 1024
    verification = "SQLite integrity" if integrity_only else "schema/SQLite/FK"
    print(f"[BACKUP] OK (python sqlite3.backup + {verification} verify)")
    print(f"  from : {src}")
    print(f"  to   : {published} ({size_kb} KB)")
    for removed_path in removed:
        print(f"  removed by latest-{DEFAULT_KEEP} retention: {removed_path.name}")
    print(f"BACKUP_PATH={published.resolve()}")
    return published


def _postgres_database_url(
    host: str,
    port: int,
    user: str,
    dbname: str,
    *,
    validation_url: str | None = None,
) -> str:
    """Build the local connection URL used to inspect a disposable restore."""

    if validation_url:
        url = make_url(validation_url)
        if not url.drivername.startswith("postgresql"):
            raise BackupValidationError("PostgreSQL validation URL is not PostgreSQL")
        return url.set(database=dbname).render_as_string(hide_password=False)
    return f"postgresql://{quote(user, safe='')}@{host}:{port}/{quote(dbname, safe='')}"


def _run_postgres_validation_command(
    command: list[str],
) -> subprocess.CompletedProcess[str]:
    """Run one staging command and normalize failures for backup callers."""

    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
    except FileNotFoundError as exc:
        raise BackupValidationError(f"PostgreSQL validation command not found: {command[0]}") from exc
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "no command output"
        raise BackupValidationError(
            f"PostgreSQL validation command failed ({command[0]}): {detail}"
        )
    return result


def _postgres_mutation_system_identifier(
    *,
    container: str | None,
    host: str,
    port: int,
    user: str,
) -> str:
    """Read the physical cluster identity from the exact mutation endpoint."""

    query = "SELECT system_identifier::text FROM pg_control_system()"
    command = (
        [
            "docker",
            "exec",
            container,
            "psql",
            "-X",
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            user,
            "-d",
            "postgres",
            "-c",
            query,
        ]
        if container
        else [
            "psql",
            "-h",
            host,
            "-p",
            str(port),
            "-U",
            user,
            "-X",
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-d",
            "postgres",
            "-c",
            query,
        ]
    )
    result = _run_postgres_validation_command(command)
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if len(lines) != 1 or not lines[0].isdigit():
        raise BackupValidationError(
            "PostgreSQL mutation endpoint returned an invalid cluster identifier"
        )
    return lines[0]


def _run_postgres_import_with_admission_fence(
    command: list[str],
    payload: bytes,
    on_importer_connected: Callable[[int], None],
) -> None:
    """Admit only the importer and verifier before sending any dump bytes."""

    environment = os.environ.copy()
    environment.setdefault("PGCONNECT_TIMEOUT", "10")
    try:
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=environment,
        )
    except FileNotFoundError as exc:
        raise BackupValidationError(
            f"PostgreSQL validation command not found: {command[0]}"
        ) from exc
    assert process.stdin is not None
    assert process.stdout is not None
    marker = b"IC18_IMPORTER_PID="
    operation_error: BaseException | None = None
    try:
        process.stdin.write(
            b"SELECT 'IC18_IMPORTER_PID=' || pg_backend_pid();\n"
        )
        process.stdin.flush()
        importer_pid: int | None = None
        while True:
            line = process.stdout.readline()
            if not line:
                break
            stripped = line.strip()
            if stripped.startswith(marker):
                value = stripped.removeprefix(marker)
                if value.isdigit():
                    importer_pid = int(value)
                break
        if importer_pid is None:
            _stdout, stderr = process.communicate()
            detail = stderr.decode("utf-8", errors="replace").strip()
            raise BackupValidationError(
                "PostgreSQL importer did not establish a fenced session"
                + (f": {detail}" if detail else "")
            )
        on_importer_connected(importer_pid)
        _stdout, stderr = process.communicate(input=payload)
        if process.returncode != 0:
            detail = stderr.decode("utf-8", errors="replace").strip()
            raise BackupValidationError(
                "PostgreSQL validation command failed "
                f"({command[0]}): {detail or 'no command output'}"
            )
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.communicate(timeout=10)
            except subprocess.TimeoutExpired as cleanup_error:
                process.kill()
                process.communicate()
                if operation_error is None:
                    raise BackupValidationError(
                        "PostgreSQL importer cleanup timed out"
                    ) from cleanup_error
                operation_error.add_note(
                    f"PostgreSQL importer cleanup timed out: {cleanup_error}"
                )


def _restore_postgres_dump_to_database(
    dump_path: Path,
    *,
    database_name: str,
    container: str | None,
    host: str,
    port: int,
    user: str,
    validation_url: str | None = None,
    require_absent: bool = False,
    on_database_created: Callable[[], None] | None = None,
    on_importer_connected: Callable[[int], None] | None = None,
    expected_system_identifier: str | None = None,
) -> None:
    """Import immutable dump bytes into one disposable PostgreSQL database."""

    if expected_system_identifier is not None:
        actual_system_identifier = _postgres_mutation_system_identifier(
            container=container,
            host=host,
            port=port,
            user=user,
        )
        if actual_system_identifier != expected_system_identifier:
            raise BackupValidationError(
                "PostgreSQL mutation endpoint cluster identifier mismatch: "
                f"expected {expected_system_identifier}, got {actual_system_identifier}"
            )

    if container:
        container_dump = f"/tmp/ic18-restore-{uuid4().hex}.sql"
        operation_error: BaseException | None = None
        try:
            if not require_absent:
                _run_postgres_validation_command(
                    [
                        "docker",
                        "exec",
                        container,
                        "dropdb",
                        "-U",
                        user,
                        "--if-exists",
                        database_name,
                    ]
                )
            _run_postgres_validation_command(
                ["docker", "exec", container, "createdb", "-U", user, database_name]
            )
            if on_database_created is not None:
                on_database_created()
            _run_postgres_validation_command(
                ["docker", "cp", str(dump_path), f"{container}:{container_dump}"]
            )
            checksum = _run_postgres_validation_command(
                ["docker", "exec", container, "sha256sum", container_dump]
            )
            actual_hash = checksum.stdout.strip().split(maxsplit=1)[0]
            if actual_hash.lower() != file_sha256(dump_path):
                raise BackupValidationError(
                    "container PostgreSQL dump checksum mismatch"
                )
            import_command = [
                "docker",
                "exec",
                "-i",
                container,
                "psql",
                "-X",
                "-Atq",
                "-v",
                "ON_ERROR_STOP=1",
                "-U",
                user,
                "-d",
                database_name,
            ]
            if on_importer_connected is None:
                _run_postgres_validation_command(
                    [*import_command, "-f", container_dump]
                )
            else:
                _run_postgres_import_with_admission_fence(
                    import_command,
                    f"\\i {container_dump}\n".encode("utf-8"),
                    on_importer_connected,
                )
        except BaseException as exc:
            operation_error = exc
            raise
        finally:
            try:
                _run_postgres_validation_command(
                    ["docker", "exec", container, "rm", "-f", container_dump]
                )
            except BackupValidationError as cleanup_error:
                if operation_error is None:
                    raise
                operation_error.add_note(
                    f"PostgreSQL container dump cleanup failed: {cleanup_error}"
                )
        return

    connection = ["-h", host, "-p", str(port), "-U", user]
    if not require_absent:
        _run_postgres_validation_command(
            ["dropdb", *connection, "--if-exists", database_name]
        )
    _run_postgres_validation_command(["createdb", *connection, database_name])
    if on_database_created is not None:
        on_database_created()
    import_command = [
        "psql",
        *connection,
        "-X",
        "-Atq",
        "-v",
        "ON_ERROR_STOP=1",
        "-d",
        database_name,
    ]
    if on_importer_connected is None:
        _run_postgres_validation_command([*import_command, "-f", str(dump_path)])
    else:
        _run_postgres_import_with_admission_fence(
            import_command,
            dump_path.read_bytes(),
            on_importer_connected,
        )


def _drop_postgres_database(
    database_name: str,
    *,
    container: str | None,
    host: str,
    port: int,
    user: str,
) -> None:
    """Drop one disposable PostgreSQL database and fail on cleanup errors."""

    command = (
        [
            "docker",
            "exec",
            container,
            "dropdb",
            "-U",
            user,
            "--if-exists",
            database_name,
        ]
        if container
        else [
            "dropdb",
            "-h",
            host,
            "-p",
            str(port),
            "-U",
            user,
            "--if-exists",
            database_name,
        ]
    )
    _run_postgres_validation_command(command)


def _validate_postgres_dump(
    dump_path: Path,
    *,
    container: str | None,
    host: str,
    port: int,
    user: str,
    validation_url: str | None = None,
) -> dict[str, object]:
    """Restore a dump into a disposable DB and collect the complete evidence set."""

    # Imported at call time because restore_db imports this module's dump helper.
    from scripts.ops import restore_db

    admin_url = _postgres_database_url(
        host,
        port,
        user,
        "postgres",
        validation_url=validation_url,
    )
    with restore_db._postgres_restore_operation_scope(
        admin_url,
        target_name=POSTGRES_BACKUP_VALIDATION_TARGET,
    ) as (
        admin_connection,
        system_identifier,
        _cutover_receipt,
        operation_receipt,
    ):
        temporary_db = restore_db._postgres_restore_candidate_name(
            system_identifier,
            POSTGRES_BACKUP_VALIDATION_TARGET,
        )
        restore_db._claim_postgres_restore_operation_locked(
            admin_connection,
            operation_receipt,
            target_name=POSTGRES_BACKUP_VALIDATION_TARGET,
            system_identifier=system_identifier,
            candidate_name=temporary_db,
        )
        operation_error: BaseException | None = None
        try:

            def record_created_candidate_oid() -> None:
                """Bind the verification DB before dump import can fail or crash."""

                restore_db._record_postgres_restore_candidate_oid(
                    admin_connection,
                    operation_receipt,
                    target_name=POSTGRES_BACKUP_VALIDATION_TARGET,
                    system_identifier=system_identifier,
                )

            candidate_url = _postgres_database_url(
                host,
                port,
                user,
                temporary_db,
                validation_url=validation_url,
            )
            with ExitStack() as verifier_stack:
                verifier_connection = None

                def fence_importer(importer_pid: int) -> None:
                    """Admit the importer and verifier, then close the DB gate."""

                    nonlocal verifier_connection
                    verifier_connection = verifier_stack.enter_context(
                        restore_db._postgres_candidate_admission_fence(
                            candidate_url,
                            admin_url=admin_url,
                            candidate_name=temporary_db,
                            expected_system_identifier=system_identifier,
                            admin_connection=admin_connection,
                            importer_pid=importer_pid,
                        )
                    )

                _restore_postgres_dump_to_database(
                    dump_path,
                    database_name=temporary_db,
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
                    raise BackupValidationError(
                        "PostgreSQL importer admission fence was not established"
                    )
                return collect_database_evidence_from_connection(
                    verifier_connection,
                    expected_engine="postgresql",
                )
        except BaseException as exc:
            operation_error = exc
            raise
        finally:
            try:
                restore_db._recover_postgres_restore_operation_receipt(
                    admin_connection,
                    operation_receipt,
                    target_name=POSTGRES_BACKUP_VALIDATION_TARGET,
                    system_identifier=system_identifier,
                    allow_current_owner=True,
                )
            except (Exception, SystemExit) as cleanup_error:
                if operation_error is None:
                    raise BackupValidationError(
                        "PostgreSQL temporary restore cleanup failed: "
                        f"{cleanup_error}"
                    ) from cleanup_error
                operation_error.add_note(
                    "PostgreSQL temporary restore cleanup failed: "
                    f"{cleanup_error}"
                )


def backup_postgres(
    container: str | None,
    host: str,
    port: int,
    user: str,
    dbname: str,
    *,
    validation_url: str | None = None,
) -> Path:
    backup_dir = runtime_path("backups", "postgres", create=True)
    published = backup_dir / _regular_backup_name(".sql")
    staged = _private_backup_path(published)

    if container:
        cmd = [
            "docker",
            "exec",
            container,
            "pg_dump",
            "-U",
            user,
            "--encoding=UTF8",
            dbname,
        ]
    else:
        cmd = [
            "pg_dump",
            "-h",
            host,
            "-p",
            str(port),
            "-U",
            user,
            "--encoding=UTF8",
            dbname,
        ]

    print(f"[BACKUP] running: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, capture_output=True, check=True)
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr
        if isinstance(stderr, bytes):
            stderr = stderr.decode("utf-8", errors="replace")
        print(f"[BACKUP] pg_dump failed:\n{stderr}", file=sys.stderr)
        raise SystemExit(1)
    except FileNotFoundError:
        print("[BACKUP] docker or pg_dump command not found", file=sys.stderr)
        raise SystemExit(1)

    operation_error: BaseException | None = None
    try:
        try:
            dump_bytes = (
                result.stdout.encode("utf-8")
                if isinstance(result.stdout, str)
                else result.stdout
            )
            staged.write_bytes(dump_bytes)
            evidence = _validate_postgres_dump(
                staged,
                container=container,
                host=host,
                port=port,
                user=user,
                validation_url=validation_url,
            )
            manifest = build_manifest(
                staged,
                published_name=published.name,
                evidence=evidence,
                source_snapshot={"method": "pg_dump", "transaction_snapshot": True},
            )
            publish_backup_pair(staged, published, manifest)
        except (BackupValidationError, OSError) as exc:
            print(
                f"[BACKUP] PostgreSQL backup validation/publication failed: {exc}",
                file=sys.stderr,
            )
            raise SystemExit(1) from exc
    except BaseException as exc:
        operation_error = exc
        raise
    finally:
        try:
            staged.unlink(missing_ok=True)
        except OSError as cleanup_error:
            if operation_error is None:
                raise
            operation_error.add_note(
                f"PostgreSQL staged backup cleanup failed: {cleanup_error}"
            )

    removed = retain_latest_backups(backup_dir, suffix=".sql", keep=DEFAULT_KEEP)
    size_kb = published.stat().st_size // 1024
    print(f"[BACKUP] OK PostgreSQL: {published} ({size_kb} KB)")
    for removed_path in removed:
        print(f"  removed by latest-{DEFAULT_KEEP} retention: {removed_path.name}")
    print(f"BACKUP_PATH={published.resolve()}")
    return published


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Back up DEXCOWIN MES DB")
    parser.add_argument("--sqlite", metavar="PATH", help="SQLite DB file path")
    parser.add_argument("--label", help="Descriptive lowercase-hyphen backup label")
    parser.add_argument(
        "--integrity-only",
        action="store_true",
        help="Verify SQLite integrity only; intended for a pre-migration source snapshot",
    )
    parser.add_argument("--postgres", action="store_true", help="Run PostgreSQL backup")
    parser.add_argument("--container", help="Docker container name for PostgreSQL")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--user", default="mes_user")
    parser.add_argument("--dbname", default="mes_db")
    parser.add_argument(
        "--validation-url",
        help="Host-reachable PostgreSQL URL used for disposable restore evidence",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    print("=" * 50)
    print("DEXCOWIN MES DB backup")
    print("=" * 50)

    if args.sqlite:
        backup_sqlite(args.sqlite, label=args.label, integrity_only=args.integrity_only)
    elif args.postgres:
        if args.integrity_only:
            print("[BACKUP] --integrity-only is only valid for SQLite", file=sys.stderr)
            return 2
        backup_postgres(
            args.container,
            args.host,
            args.port,
            args.user,
            args.dbname,
            validation_url=args.validation_url,
        )
    else:
        default_path = PROJECT_ROOT / "backend" / "mes.db"
        if not default_path.exists():
            print("[BACKUP] pass --sqlite <path> or --postgres", file=sys.stderr)
            return 1
        backup_sqlite(str(default_path), label=args.label, integrity_only=args.integrity_only)
    return 0


if __name__ == "__main__":
    sys.exit(main())
