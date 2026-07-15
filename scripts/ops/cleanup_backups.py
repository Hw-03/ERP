#!/usr/bin/env python3
"""Remove expired SQLite backups from the permanent runtime tree."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.runtime_paths import runtime_path  # noqa: E402
from scripts.ops.backup_retention import DEFAULT_KEEP, retain_latest_backups  # noqa: E402


def cleanup_backups(keep: int = DEFAULT_KEEP) -> list[Path]:
    """Keep only the newest regular runtime SQLite backups."""
    backup_dir = runtime_path("backups", "sqlite")
    return retain_latest_backups(backup_dir, suffix=".db", keep=keep)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Remove expired DEXCOWIN MES SQLite backups")
    parser.add_argument("--keep", type=int, default=DEFAULT_KEEP, help="Number of regular backups to keep (default: 10)")
    args = parser.parse_args()
    if args.keep < 0:
        parser.error("--keep must be zero or greater")
    return args


def main() -> int:
    args = parse_args()
    backup_dir = runtime_path("backups", "sqlite")
    removed = cleanup_backups(args.keep)
    print(f"[CLEANUP] {backup_dir} (keep latest {args.keep} regular backups)")
    if removed:
        for path in removed:
            print(f"  removed: {path.name}")
    else:
        print("  nothing to remove")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
