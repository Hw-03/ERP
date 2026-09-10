"""Verify backup-manifest/v1 pairs or an explicitly named live database."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.ops.backup_manifest import (  # noqa: E402
    BackupStatus,
    BackupValidationError,
    collect_database_evidence,
    verify_sqlite_backup,
)
from scripts.ops.backup_retention import REGULAR_BACKUP_NAME  # noqa: E402
from scripts.runtime_paths import runtime_path  # noqa: E402


EXIT_BY_STATUS = {
    BackupStatus.PASS: 0,
    BackupStatus.FAIL: 1,
    BackupStatus.STALE: 1,
    BackupStatus.LEGACY_UNVERIFIED: 3,
    BackupStatus.STRUCTURAL_ONLY: 3,
}


def main(path: str, *, source_path: str | None = None) -> int:
    """Print one stable bundle status and return its explicit exit code."""

    result = verify_sqlite_backup(
        Path(path),
        source_path=Path(source_path) if source_path else None,
    )
    print(f"BACKUP_STATUS={result.status.value}")
    for error in result.errors:
        print(f"BACKUP_ERROR={error}")
    return EXIT_BY_STATUS[result.status]


def verify_database(path: str) -> int:
    """Validate a live DB only when the caller explicitly requests database mode."""

    database = Path(path).expanduser().resolve()
    if not database.is_file() or database.stat().st_size <= 0:
        print("DATABASE_STATUS=FAIL")
        print("DATABASE_ERROR=database file is missing or empty")
        return 1
    try:
        collect_database_evidence(
            f"sqlite:///{database.as_posix()}",
            expected_engine="sqlite",
        )
    except BackupValidationError as exc:
        print("DATABASE_STATUS=FAIL")
        print(f"DATABASE_ERROR={exc}")
        return 1
    print("DATABASE_STATUS=PASS")
    return 0


def _latest_backup() -> Path | None:
    backup_dir = runtime_path("backups", "sqlite")
    backups = sorted(
        (
            path
            for path in backup_dir.glob("mes_*.db")
            if REGULAR_BACKUP_NAME.fullmatch(path.name)
        ),
        key=lambda path: (path.stat().st_mtime_ns, path.name),
        reverse=True,
    )
    return backups[0] if backups else None


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify a DEXCOWIN MES database backup")
    parser.add_argument("path", nargs="?", help="backup artifact path")
    parser.add_argument("--latest", action="store_true", help="verify the latest runtime backup")
    parser.add_argument("--source-db", help="compare a backup with the current SQLite source")
    parser.add_argument("--database", help="explicitly validate a live SQLite database")
    args = parser.parse_args(argv)
    selected = int(bool(args.path)) + int(args.latest) + int(bool(args.database))
    if selected != 1:
        parser.error("choose exactly one artifact path, --latest, or --database")
    if args.source_db and args.database:
        parser.error("--source-db is only valid for a backup artifact")
    return args


def cli(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.database:
        return verify_database(args.database)
    path = _latest_backup() if args.latest else Path(args.path)
    if path is None:
        print("BACKUP_STATUS=FAIL")
        print("BACKUP_ERROR=no regular backup found")
        return 1
    return main(str(path), source_path=args.source_db)


if __name__ == "__main__":
    raise SystemExit(cli())
