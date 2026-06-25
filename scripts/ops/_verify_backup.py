"""Verify a DEXCOWIN MES SQLite backup file.

Checks:
- SQLite PRAGMA integrity_check returns ok.
- Required operational tables exist.
- Row counts for required tables can be read.

Exit codes:
- 0: valid backup
- 1: invalid backup
- 2: usage error
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path


REQUIRED_TABLES = [
    "items",
    "inventory",
    "inventory_locations",
    "stock_request_lines",
    "transaction_logs",
    "bom",
    "admin_audit_logs",
]


def main(path: str) -> int:
    db_path = Path(path)
    if not db_path.exists():
        print(f"backup file missing: {db_path}", file=sys.stderr)
        return 1

    try:
        c = sqlite3.connect(str(db_path))
    except sqlite3.Error as exc:
        print(f"open failed: {exc}", file=sys.stderr)
        return 1

    try:
        integrity = c.execute("PRAGMA integrity_check").fetchone()[0]
        print(f"integrity     : {integrity}")
        if integrity != "ok":
            return 1

        existing = {
            row[0]
            for row in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
        missing = [table for table in REQUIRED_TABLES if table not in existing]
        for table in REQUIRED_TABLES:
            if table in existing:
                count = c.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
                print(f"{table:20}: {count} rows")
            else:
                print(f"{table:20}: missing required table")

        if missing:
            print(f"missing required table(s): {', '.join(missing)}")
            return 1
        return 0
    except sqlite3.Error as exc:
        print(f"verify failed: {exc}", file=sys.stderr)
        return 1
    finally:
        c.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: _verify_backup.py <db-path>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
