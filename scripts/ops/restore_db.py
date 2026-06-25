#!/usr/bin/env python3
"""Restore a DEXCOWIN MES database backup.

SQLite restore validates the backup before replacing the target DB and can run
inventory integrity verification after restore with --check.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
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


def restore_sqlite(backup_path: str, target_path: str, run_check: bool) -> None:
    src = Path(backup_path).resolve()
    dst = Path(target_path).resolve()

    if not src.exists():
        print(f"[RESTORE] backup file not found: {src}", file=sys.stderr)
        raise SystemExit(1)

    _verify_sqlite_backup(src)

    if dst.exists():
        snapshot = dst.with_suffix(f".pre-restore.{datetime.now().strftime('%Y%m%d_%H%M%S')}.db")
        shutil.copy2(dst, snapshot)
        print(f"[RESTORE] current DB snapshot: {snapshot}")

    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    for suffix in ("-wal", "-shm"):
        Path(str(dst) + suffix).unlink(missing_ok=True)

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
    parser.add_argument("--target", default="backend/mes.db", help="Restore target path")
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
