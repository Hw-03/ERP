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

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.runtime_paths import runtime_path  # noqa: E402
from scripts.ops.backup_retention import REGULAR_BACKUP_NAME  # noqa: E402


REQUIRED_TABLES = [
    "items",
    "inventory",
    "inventory_locations",
    "stock_requests",
    "stock_request_lines",
    "transaction_logs",
    "bom",
    "admin_audit_logs",
    "warehouse_angles",
    "warehouse_boxes",
    "warehouse_box_items",
    "io_batches",
    "io_bundles",
    "io_lines",
    "shipping_requests",
    "shipping_request_bom_lines",
    "shipping_request_companion_lines",
    "shipping_allocations",
    "shipping_request_checklist_lines",
    "shipping_request_events",
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

        foreign_key_violations = c.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_violations:
            print(f"foreign_key_check: failed ({len(foreign_key_violations)} violation(s))")
            for table, row_id, parent, fk_id in foreign_key_violations[:10]:
                print(f"  {table} rowid={row_id} -> {parent} fk={fk_id}")
        else:
            print("foreign_key_check: ok")

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

        if foreign_key_violations or missing:
            print(f"missing required table(s): {', '.join(missing)}")
            return 1
        return 0
    except sqlite3.Error as exc:
        print(f"verify failed: {exc}", file=sys.stderr)
        return 1
    finally:
        c.close()


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--latest":
        backup_dir = runtime_path("backups", "sqlite")
        backups = sorted(
            (path for path in backup_dir.glob("mes_*.db") if REGULAR_BACKUP_NAME.fullmatch(path.name)),
            key=lambda path: (path.stat().st_mtime, path.name),
            reverse=True,
        )
        if not backups:
            print(f"no backup found in {backup_dir}", file=sys.stderr)
            sys.exit(1)
        print(f"latest backup : {backups[0]}")
        sys.exit(main(str(backups[0])))
    if len(sys.argv) != 2:
        print("usage: _verify_backup.py <db-path> | --latest", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
