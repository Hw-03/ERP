#!/usr/bin/env python3
"""Read-only operational readiness gate for DEXCOWIN MES.

Checks that the local SQLite DB exists, the latest backup is a verified DEXCOWIN
MES backup, and current inventory invariants pass. The script never mutates the
DB; it only reads files and runs existing validators.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = PROJECT_ROOT / "backend" / "mes.db"
DEFAULT_BACKUP_DIR = PROJECT_ROOT / "backend" / "_backup"
VERIFY_BACKUP = PROJECT_ROOT / "scripts" / "ops" / "_verify_backup.py"
CHECK_INTEGRITY = PROJECT_ROOT / "scripts" / "ops" / "check_inventory_integrity.py"


def _print_result(ok: bool, label: str, detail: str = "") -> None:
    status = "PASS" if ok else "FAIL"
    suffix = f": {detail}" if detail else ""
    print(f"{status} {label}{suffix}")


def _run_validator(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=PROJECT_ROOT, text=True, capture_output=True, check=False)


def _latest_backup(backup_dir: Path) -> Path | None:
    files = sorted(backup_dir.glob("mes_*.db"), key=lambda p: (p.stat().st_mtime, p.name), reverse=True)
    return files[0] if files else None


def check_database_file(db_path: Path) -> bool:
    if not db_path.exists():
        _print_result(False, "database file", f"missing {db_path}")
        return False
    if db_path.stat().st_size <= 0:
        _print_result(False, "database file", f"empty {db_path}")
        return False
    _print_result(True, "database file", str(db_path))
    return True


def check_latest_backup(db_path: Path, backup_dir: Path, max_age_hours: float) -> bool:
    latest = _latest_backup(backup_dir)
    if latest is None:
        _print_result(False, "latest backup", f"no mes_*.db in {backup_dir}")
        return False

    latest_stat = latest.stat()
    age_hours = (time.time() - latest_stat.st_mtime) / 3600
    if age_hours > max_age_hours:
        _print_result(False, "latest backup", f"stale {age_hours:.1f}h old: {latest}")
        return False

    db_mtime = db_path.stat().st_mtime
    if latest_stat.st_mtime + 1 < db_mtime:
        _print_result(False, "latest backup", f"older than database: {latest.name}")
        return False

    result = _run_validator([sys.executable, str(VERIFY_BACKUP), str(latest)])
    if result.returncode != 0:
        _print_result(False, "latest backup", f"verification failed: {latest}")
        if result.stdout.strip():
            print(result.stdout.strip())
        if result.stderr.strip():
            print(result.stderr.strip(), file=sys.stderr)
        return False

    _print_result(True, "latest backup", latest.name)
    return True


def check_inventory_integrity(db_path: Path) -> bool:
    db_url = f"sqlite:///{db_path.resolve().as_posix()}"
    result = _run_validator([sys.executable, str(CHECK_INTEGRITY), "--db-url", db_url])
    if result.returncode != 0:
        _print_result(False, "inventory integrity")
        if result.stdout.strip():
            print(result.stdout.strip())
        if result.stderr.strip():
            print(result.stderr.strip(), file=sys.stderr)
        return False
    for line in result.stdout.splitlines():
        if line.startswith("WARN "):
            print(line)
    _print_result(True, "inventory integrity")
    return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check whether DEXCOWIN MES is ready for daily operation")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite DB path")
    parser.add_argument("--backup-dir", default=str(DEFAULT_BACKUP_DIR), help="SQLite backup directory")
    parser.add_argument("--max-backup-age-hours", type=float, default=24.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db_path = Path(args.db).resolve()
    backup_dir = Path(args.backup_dir).resolve()

    checks = [
        check_database_file(db_path),
        check_latest_backup(db_path, backup_dir, args.max_backup_age_hours),
        check_inventory_integrity(db_path),
    ]
    if all(checks):
        _print_result(True, "operational readiness")
        return 0
    _print_result(False, "operational readiness")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
