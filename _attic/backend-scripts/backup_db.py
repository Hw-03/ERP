"""Compatibility entry point for the canonical verified SQLite backup."""

import argparse
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.ops.backup_db import backup_sqlite  # noqa: E402


DB_SRC = PROJECT_ROOT / "backend" / "mes.db"


def backup(db_src: Path = DB_SRC) -> Path:
    """Delegate to the verified runtime backup and latest-10 retention policy."""
    return backup_sqlite(str(db_src))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DEXCOWIN MES SQLite DB 백업")
    parser.add_argument("--database", type=Path, default=DB_SRC)
    args = parser.parse_args()
    backup(args.database)
