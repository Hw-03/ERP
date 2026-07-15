#!/usr/bin/env python3
"""Restore a DEXCOWIN MES database backup.

SQLite restore validates the backup before replacing the target DB and can run
inventory integrity verification after restore with --check.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from uuid import uuid4


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.runtime_paths import runtime_path  # noqa: E402


VERIFY_BACKUP = PROJECT_ROOT / "scripts" / "ops" / "_verify_backup.py"
CHECK_INTEGRITY = PROJECT_ROOT / "scripts" / "ops" / "check_inventory_integrity.py"


def _run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def _verify_sqlite_backup(path: Path) -> None:
    _run([sys.executable, str(VERIFY_BACKUP), str(path)])


def _run_integrity_check(db_url: str) -> None:
    if not CHECK_INTEGRITY.exists():
        print("[RESTORE] check_inventory_integrity.py missing", file=sys.stderr)
        raise SystemExit(1)
    print("[RESTORE] running inventory integrity check")
    _run([sys.executable, str(CHECK_INTEGRITY), "--db-url", db_url])


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
    try:
        source = sqlite3.connect(f"file:{source_path.as_posix()}?mode=ro", uri=True)
        destination = sqlite3.connect(destination_path)
        source.backup(destination)
    finally:
        if destination is not None:
            destination.close()
        if source is not None:
            source.close()


def _create_pre_restore_snapshot(target_path: Path) -> Path:
    """Create and verify a unique rollback snapshot before a restore begins."""
    snapshot_dir = runtime_path("backups", "sqlite", create=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    snapshot = snapshot_dir / f"mes_PRE-RESTORE_{timestamp}_{uuid4().hex}.db"
    complete = False
    try:
        _copy_live_sqlite(target_path, snapshot)
        _verify_sqlite_backup(snapshot)
        complete = True
    finally:
        if not complete:
            _remove_sqlite_files(snapshot)
    return snapshot


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


def _replace_sqlite_atomically(source_path: Path, target_path: Path) -> None:
    """Install a verified staged DB while preserving rollback for every old file."""
    staged = target_path.parent / f".{target_path.name}.restore-{uuid4().hex}.tmp"
    quarantine_base = target_path.parent / f".{target_path.name}.quarantine-{uuid4().hex}"
    moved: list[tuple[Path, Path]] = []
    installed = False
    try:
        shutil.copy2(source_path, staged)
        _verify_sqlite_backup(staged)
        try:
            for suffix in ("-wal", "-shm", "-journal", ""):
                original = Path(f"{target_path}{suffix}")
                if not original.exists():
                    continue
                quarantined = Path(f"{quarantine_base}{suffix}")
                os.replace(original, quarantined)
                moved.append((original, quarantined))
            os.replace(staged, target_path)
            installed = True
        finally:
            if moved and not installed:
                _rollback_quarantined_files(moved)
    finally:
        _remove_sqlite_files(staged)
    _cleanup_quarantined_files(moved)


def restore_sqlite(backup_path: str, target_path: str, run_check: bool) -> None:
    src = _resolve_sqlite_backup(backup_path)
    dst = Path(target_path).resolve()

    if not src.exists():
        print(f"[RESTORE] backup file not found: {src}", file=sys.stderr)
        raise SystemExit(1)

    _verify_sqlite_backup(src)

    if dst.exists():
        snapshot = _create_pre_restore_snapshot(dst)
        print(f"[RESTORE] current DB snapshot: {snapshot}")

    dst.parent.mkdir(parents=True, exist_ok=True)
    _replace_sqlite_atomically(src, dst)

    size_kb = dst.stat().st_size // 1024
    print(f"[RESTORE] OK SQLite: {src.name} -> {dst} ({size_kb} KB)")

    if run_check:
        _run_integrity_check(db_url=f"sqlite:///{dst.as_posix()}")


def restore_postgres(
    backup_path: str,
    container: str | None,
    host: str,
    port: int,
    user: str,
    dbname: str,
    run_check: bool,
) -> None:
    src = Path(backup_path).resolve()
    if not src.exists():
        print(f"[RESTORE] backup file not found: {src}", file=sys.stderr)
        raise SystemExit(1)

    print(f"[RESTORE] PostgreSQL source: {src} ({src.stat().st_size // 1024} KB)")
    print("[RESTORE] This will drop and recreate the target database. Press Enter to continue, Ctrl+C to cancel.")
    try:
        input()
    except KeyboardInterrupt:
        print("[RESTORE] cancelled")
        raise SystemExit(0)

    def pg_exec(cmd: list[str]) -> None:
        print(f"[RESTORE] running: {' '.join(cmd)}")
        _run(cmd)

    if container:
        tmp = f"/tmp/restore_{datetime.now().strftime('%Y%m%d%H%M%S')}.sql"
        pg_exec(["docker", "cp", str(src), f"{container}:{tmp}"])
        pg_exec(["docker", "exec", container, "dropdb", "-U", user, "--if-exists", dbname])
        pg_exec(["docker", "exec", container, "createdb", "-U", user, dbname])
        pg_exec(["docker", "exec", container, "psql", "-U", user, "-d", dbname, "-f", tmp])
    else:
        pg_exec(["dropdb", "-h", host, "-p", str(port), "-U", user, "--if-exists", dbname])
        pg_exec(["createdb", "-h", host, "-p", str(port), "-U", user, dbname])
        with src.open("r", encoding="utf-8") as handle:
            result = subprocess.run(
                ["psql", "-h", host, "-p", str(port), "-U", user, "-d", dbname],
                stdin=handle,
                check=False,
            )
        if result.returncode != 0:
            raise SystemExit(result.returncode)

    print(f"[RESTORE] OK PostgreSQL: {src.name} -> {dbname}")
    if run_check:
        _run_integrity_check(db_url=f"postgresql://{user}@{host}:{port}/{dbname}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Restore DEXCOWIN MES DB")
    parser.add_argument("--sqlite", metavar="BACKUP_PATH", help="SQLite backup file path")
    parser.add_argument("--target", default=str(PROJECT_ROOT / "backend" / "mes.db"), help="Restore target path")
    parser.add_argument("--postgres", metavar="BACKUP_SQL", help="PostgreSQL dump file path")
    parser.add_argument("--container", help="Docker container name")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--user", default="mes_user")
    parser.add_argument("--dbname", default="mes_db")
    parser.add_argument("--check", action="store_true", help="Run inventory integrity check after restore")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    print("=" * 54)
    print("DEXCOWIN MES DB restore")
    print("=" * 54)

    if args.sqlite:
        restore_sqlite(args.sqlite, args.target, args.check)
    elif args.postgres:
        restore_postgres(args.postgres, args.container, args.host, args.port, args.user, args.dbname, args.check)
    else:
        print("[RESTORE] pass --sqlite <backup> or --postgres <dump>", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
