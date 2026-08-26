#!/usr/bin/env python3
"""Create a verified local SQLite backup and publish it to a NAS directory."""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
from collections.abc import Callable
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.ops._verify_backup import main as verify_backup_main  # noqa: E402
from scripts.ops.backup_db import backup_sqlite  # noqa: E402
from scripts.ops.backup_retention import REGULAR_BACKUP_NAME, retain_latest_backups  # noqa: E402


DEFAULT_KEEP = 30
DEFAULT_DB_PATH = PROJECT_ROOT / "backend" / "mes.db"


def hash_file(path: Path) -> str:
    """Return the SHA-256 digest used to compare local and NAS backup bytes."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_backup(path: Path) -> None:
    """Reject a NAS copy unless it passes the project's backup verifier."""
    if verify_backup_main(str(path)) != 0:
        raise ValueError(f"remote backup verification failed: {path}")


def publish_existing_backup(
    source: Path,
    nas_dir: Path,
    *,
    keep: int = DEFAULT_KEEP,
    verify: Callable[[Path], None] = verify_backup,
    hash_file: Callable[[Path], str] = hash_file,
) -> Path:
    """Publish one already-verified regular backup without replacing existing NAS files."""
    if keep < 0:
        raise ValueError("keep must be zero or greater")
    if not source.is_file() or source.suffix != ".db" or not REGULAR_BACKUP_NAME.fullmatch(source.name):
        raise ValueError(f"source must be a regular .db backup: {source}")

    nas_dir.mkdir(parents=True, exist_ok=True)
    published = nas_dir / source.name
    pending = nas_dir / f".{source.name}.pending"
    if published.exists():
        raise FileExistsError(f"NAS backup already exists: {published}")
    if pending.exists():
        raise FileExistsError(f"NAS pending backup already exists: {pending}")

    try:
        shutil.copy2(source, pending)
        if hash_file(source) != hash_file(pending):
            raise ValueError(f"NAS backup hash mismatch: {source} != {pending}")
        verify(pending)
        os.replace(pending, published)
        os.utime(published, None)
        retain_latest_backups(nas_dir, suffix=".db", keep=keep)
    finally:
        pending.unlink(missing_ok=True)

    print(f"[NAS BACKUP] OK: {published}")
    return published


def create_and_publish_nas_backup(nas_dir: Path, *, keep: int = DEFAULT_KEEP) -> Path:
    """Create the verified local snapshot before publishing it to the NAS."""
    source = backup_sqlite(str(DEFAULT_DB_PATH))
    return publish_existing_backup(source, nas_dir, keep=keep)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Back up DEXCOWIN MES SQLite DB to NAS")
    parser.add_argument("--nas-dir", type=Path, required=True, help="NAS directory for regular .db backups")
    parser.add_argument("--keep", type=int, default=DEFAULT_KEEP, help="regular NAS backups to retain")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        published = create_and_publish_nas_backup(args.nas_dir, keep=args.keep)
    except (OSError, ValueError) as exc:
        print(f"[NAS BACKUP] failed: {exc}", file=sys.stderr)
        return 1
    print(f"NAS_BACKUP_PATH={published}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
