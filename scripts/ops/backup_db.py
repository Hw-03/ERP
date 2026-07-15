#!/usr/bin/env python3
"""Back up the DEXCOWIN MES database into the permanent runtime tree."""

from __future__ import annotations

import argparse
import os
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
from scripts.ops.backup_retention import DEFAULT_KEEP, retain_latest_backups  # noqa: E402


VERIFY_BACKUP = PROJECT_ROOT / "scripts" / "ops" / "_verify_backup.py"


def _regular_backup_name(suffix: str) -> str:
    """Return a collision-resistant regular backup filename."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    return f"mes_{timestamp}_{uuid4().hex}{suffix}"


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


def _verify_sqlite_backup(path: Path) -> None:
    result = subprocess.run([sys.executable, str(VERIFY_BACKUP), str(path)], check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def backup_sqlite(db_path: str) -> Path:
    _reject_legacy_backup_override()
    src = Path(db_path).resolve()
    if not src.exists():
        print(f"[BACKUP] SQLite file not found: {src}", file=sys.stderr)
        raise SystemExit(1)

    backup_dir = runtime_path("backups", "sqlite", create=True)
    published = backup_dir / _regular_backup_name(".db")
    staged = _private_backup_path(published)

    source = None
    target = None
    failed = False
    try:
        try:
            source = sqlite3.connect(f"file:{src.as_posix()}?mode=ro", uri=True)
            target = sqlite3.connect(str(staged))
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
            raise SystemExit(1)
        if not staged.exists():
            print(f"[BACKUP] backup file was not created: {staged}", file=sys.stderr)
            raise SystemExit(1)
        _verify_sqlite_backup(staged)
        os.replace(staged, published)
    finally:
        _remove_private_sqlite_backup(staged)

    removed = retain_latest_backups(backup_dir, suffix=".db", keep=DEFAULT_KEEP)
    size_kb = published.stat().st_size // 1024
    print("[BACKUP] OK (python sqlite3.backup + verify)")
    print(f"  from : {src}")
    print(f"  to   : {published} ({size_kb} KB)")
    for removed_path in removed:
        print(f"  removed by latest-{DEFAULT_KEEP} retention: {removed_path.name}")
    print(f"BACKUP_PATH={published.resolve()}")
    return published


def backup_postgres(container: str | None, host: str, port: int, user: str, dbname: str) -> Path:
    backup_dir = runtime_path("backups", "postgres", create=True)
    published = backup_dir / _regular_backup_name(".sql")
    staged = _private_backup_path(published)

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

    try:
        staged.write_text(result.stdout, encoding="utf-8")
        os.replace(staged, published)
    except OSError as exc:
        print(f"[BACKUP] PostgreSQL backup publication failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
    finally:
        staged.unlink(missing_ok=True)

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
