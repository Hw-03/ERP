"""Retention rules for regular DEXCOWIN MES database backups."""

from __future__ import annotations

import re
from pathlib import Path


DEFAULT_KEEP = 10
REGULAR_BACKUP_NAME = re.compile(
    r"^mes_\d{8}_\d{6}(?:_\d{6}_[0-9a-f]{32})?\.(?:db|sql)$"
)


def retain_latest_backups(directory: Path, *, suffix: str, keep: int = DEFAULT_KEEP) -> list[Path]:
    """Keep the newest regular backups and never include PRE snapshots."""
    if keep < 0:
        raise ValueError("keep must be zero or greater")
    if not directory.exists():
        return []

    snapshots: list[tuple[int, str, Path]] = []
    for path in directory.iterdir():
        try:
            if path.is_file() and path.suffix == suffix and REGULAR_BACKUP_NAME.fullmatch(path.name):
                snapshots.append((path.stat().st_mtime_ns, path.name, path))
        except FileNotFoundError:
            continue

    candidates = [entry[2] for entry in sorted(snapshots, reverse=True)]
    removed = candidates[keep:]
    for path in removed:
        path.unlink(missing_ok=True)
    return removed
