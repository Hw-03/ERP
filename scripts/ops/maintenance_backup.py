"""Create pre-maintenance SQLite snapshots in the permanent runtime tree."""

from __future__ import annotations

import re
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from uuid import uuid4


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.runtime_paths import runtime_path  # noqa: E402
from scripts.ops.backup_manifest import (  # noqa: E402
    BackupValidationError,
    create_sqlite_manifest,
    publish_backup_pair,
    sqlite_file_generation,
)


def create_sqlite_snapshot(source_path: Path, label: str) -> Path:
    """Back up one SQLite file before maintenance and return its absolute path."""
    source_path = Path(source_path).resolve()
    if not source_path.is_file():
        raise FileNotFoundError(f"SQLite source file not found: {source_path}")

    safe_label = re.sub(r"[^A-Za-z0-9-]+", "-", label).strip("-")
    if not safe_label:
        raise ValueError("maintenance backup label must not be empty")

    backup_dir = runtime_path("backups", "sqlite", create=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    backup_path = backup_dir / f"mes_PRE-{safe_label}_{timestamp}.db"
    staged = backup_dir / f".{backup_path.name}.pending-{uuid4().hex}.tmp"

    source = None
    destination = None
    source_snapshot: dict[str, object] = {
        "method": "sqlite3.backup",
        "journal_mode": "unknown",
        "wal_included": True,
    }
    try:
        source = sqlite3.connect(f"file:{source_path.as_posix()}?mode=ro", uri=True)
        source_snapshot["journal_mode"] = str(
            source.execute("PRAGMA journal_mode").fetchone()[0]
        )
        destination = sqlite3.connect(staged)
        generation_before = sqlite_file_generation(source_path)
        source.backup(destination)
        generation_after = sqlite_file_generation(source_path)
        if generation_after != generation_before:
            raise BackupValidationError(
                "SQLite source generation changed during maintenance snapshot"
            )
        integrity = destination.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise sqlite3.DatabaseError(f"SQLite integrity check failed: {integrity}")
        destination.close()
        destination = None
        source.close()
        source = None
        source_snapshot["physical_generation"] = generation_after
        manifest = create_sqlite_manifest(
            staged,
            published_name=backup_path.name,
            source_snapshot=source_snapshot,
        )
        publish_backup_pair(staged, backup_path, manifest)
    except BaseException as primary_error:
        cleanup_errors: list[BaseException] = []
        if destination is not None:
            try:
                destination.close()
            except BaseException as cleanup_error:
                cleanup_errors.append(cleanup_error)
            destination = None
        if source is not None:
            try:
                source.close()
            except BaseException as cleanup_error:
                cleanup_errors.append(cleanup_error)
            source = None
        for suffix in ("", "-wal", "-shm", "-journal"):
            try:
                Path(f"{staged}{suffix}").unlink(missing_ok=True)
            except OSError as cleanup_error:
                cleanup_errors.append(cleanup_error)
        for cleanup_error in cleanup_errors:
            primary_error.add_note(
                f"maintenance backup cleanup failed: {cleanup_error}"
            )
        raise
    finally:
        if destination is not None:
            destination.close()
        if source is not None:
            source.close()

    return backup_path.resolve()
