"""Create pre-maintenance SQLite snapshots in the permanent runtime tree."""

from __future__ import annotations

import re
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.runtime_paths import runtime_path  # noqa: E402


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

    source = None
    destination = None
    try:
        source = sqlite3.connect(f"file:{source_path.as_posix()}?mode=ro", uri=True)
        destination = sqlite3.connect(backup_path)
        source.backup(destination)
        integrity = destination.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise sqlite3.DatabaseError(f"SQLite integrity check failed: {integrity}")
    except Exception:
        if destination is not None:
            destination.close()
            destination = None
        if source is not None:
            source.close()
            source = None
        backup_path.unlink(missing_ok=True)
        raise
    finally:
        if destination is not None:
            destination.close()
        if source is not None:
            source.close()

    return backup_path.resolve()
