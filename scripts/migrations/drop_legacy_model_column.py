"""Migration: DROP COLUMN legacy_model FROM items.

Usage:
    cd backend
    python ../scripts/migrations/drop_legacy_model_column.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import sqlalchemy as sa  # noqa: E402
from app.database import engine  # noqa: E402


def main() -> None:
    with engine.connect() as conn:
        result = conn.execute(
            sa.text("SELECT COUNT(*) FROM pragma_table_info('items') WHERE name='legacy_model'")
        )
        if result.scalar() == 0:
            print("legacy_model column does not exist — nothing to do.")
            return

    with engine.begin() as conn:
        conn.execute(sa.text("DROP INDEX IF EXISTS ix_items_legacy_model"))
        conn.execute(sa.text("ALTER TABLE items DROP COLUMN legacy_model"))

    print("Done: legacy_model column removed from items table.")


if __name__ == "__main__":
    main()
