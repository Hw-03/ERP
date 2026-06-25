#!/usr/bin/env python3
"""Back up the DEXCOWIN MES database.

SQLite backups are written to backend/_backup/mes_YYYYMMDD_HHMMSS.db and
verified before the command reports success.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SQLITE_BACKUP_DIR = PROJECT_ROOT / "backend" / "_backup"
POSTGRES_BACKUP_DIR = PROJECT_ROOT / "outputs" / "backups"
VERIFY_BACKUP = PROJECT_ROOT / "scripts" / "ops" / "_verify_backup.py"


def _verify_sqlite_backup(path: Path) -> None:
    result = subprocess.run([sys.executable, str(VERIFY_BACKUP), str(path)], check=False)
    if result.returncode != 0:
        for suffix in ("", "-wal", "-shm", "-journal"):
            candidate = Path(str(path) + suffix)
            candidate.unlink(missing_ok=True)
        raise SystemExit(result.returncode)


def backup_sqlite(db_path: str) -> Path:
    src = Path(db_path).resolve()
    if not src.exists():
        print(f"[BACKUP] SQLite file not found: {src}", file=sys.stderr)
        raise SystemExit(1)

    backup_dir = Path(os.getenv("MES_SQLITE_BACKUP_DIR", str(DEFAULT_SQLITE_BACKUP_DIR))).resolve()
    backup_dir.mkdir(parents=True, exist_ok=True)
    dst = backup_dir / f"mes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"

    source = None
    target = None
    failed = False
    try:
        source = sqlite3.connect(f"file:{src.as_posix()}?mode=ro", uri=True)
        target = sqlite3.connect(str(dst))
        source.backup(target)
    except sqlite3.Error as exc:
        print(f"[BACKUP] sqlite3 backup failed: {exc}", file=sys.stderr)
        failed = True
    finally:
        if target is not None:
            target.close()
        if source is not None:
            source.close()
    if failed:
        for suffix in ("", "-wal", "-shm", "-journal"):
            Path(str(dst) + suffix).unlink(missing_ok=True)
        raise SystemExit(1)

    if not dst.exists():
        print(f"[BACKUP] backup file was not created: {dst}", file=sys.stderr)
        raise SystemExit(1)

    _verify_sqlite_backup(dst)
    size_kb = dst.stat().st_size // 1024
    print("[BACKUP] OK (python sqlite3.backup + verify)")
    print(f"  from : {src}")
    print(f"  to   : {dst} ({size_kb} KB)")
    return dst


def backup_postgres(container: str | None, host: str, port: int, user: str, dbname: str) -> Path:
    POSTGRES_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    dst = POSTGRES_BACKUP_DIR / f"mes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql"

    if container:
        cmd = ["docker", "exec", container, "pg_dump", "-U", user, dbname]
    else:
        cmd = ["pg_dump", "-h", host, "-p", str(port), "-U", user, dbname]

    print(f"[BACKUP] running: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as exc:
        print(f"[BACKUP] pg_dump failed:\n{exc.stderr}", file=sys.stderr)
        raise SystemExit(1)
    except FileNotFoundError:
        print("[BACKUP] docker or pg_dump command not found", file=sys.stderr)
        raise SystemExit(1)

    dst.write_text(result.stdout, encoding="utf-8")
    size_kb = dst.stat().st_size // 1024
    print(f"[BACKUP] OK PostgreSQL: {dst} ({size_kb} KB)")
    return dst


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Back up DEXCOWIN MES DB")
    parser.add_argument("--sqlite", metavar="PATH", help="SQLite DB file path")
    parser.add_argument("--postgres", action="store_true", help="Run PostgreSQL backup")
    parser.add_argument("--container", help="Docker container name for PostgreSQL")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--user", default="mes_user")
    parser.add_argument("--dbname", default="mes_db")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    print("=" * 50)
    print("DEXCOWIN MES DB backup")
    print("=" * 50)

    if args.sqlite:
        backup_sqlite(args.sqlite)
    elif args.postgres:
        backup_postgres(args.container, args.host, args.port, args.user, args.dbname)
    else:
        default_path = PROJECT_ROOT / "backend" / "mes.db"
        if not default_path.exists():
            print("[BACKUP] pass --sqlite <path> or --postgres", file=sys.stderr)
            return 1
        backup_sqlite(str(default_path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
