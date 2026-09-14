"""Safely preview or apply the one-time DEXCOWIN MES item display order reset."""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path
from typing import Callable

from sqlalchemy import create_engine
from sqlalchemy.orm import Session


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.models import Item
from app.services.item_display_order import apply_default_item_display_order, default_item_display_order
from scripts.ops.backup_db import backup_sqlite


class ItemDisplayOrderApplyResult:
    """Report the verified snapshot and count of reordered active items."""

    def __init__(self, backup_path: Path, item_count: int) -> None:
        self.backup_path = backup_path
        self.item_count = item_count


def _item_sort_rows(path: Path) -> list[tuple[str, int | None]]:
    """Read the complete persisted item ordering for source-backup comparison."""
    with sqlite3.connect(path) as connection:
        return connection.execute(
            "SELECT item_id, sort_order FROM items ORDER BY item_id"
        ).fetchall()


def apply_item_display_order(
    db_path: Path,
    *,
    backup_fn: Callable[..., Path] = backup_sqlite,
) -> ItemDisplayOrderApplyResult:
    """Back up, verify, and transactionally reset one SQLite database's item order."""
    source = db_path.resolve()
    backup_path = backup_fn(str(source), label="item-display-order")
    if _item_sort_rows(source) != _item_sort_rows(backup_path):
        raise ValueError("backup item sort_order values do not match the source database")

    engine = create_engine(f"sqlite:///{source.as_posix()}")
    try:
        with Session(engine) as db:
            ordered = apply_default_item_display_order(db)
            db.commit()
            return ItemDisplayOrderApplyResult(backup_path=backup_path, item_count=len(ordered))
    finally:
        engine.dispose()


def preview_item_display_order(db_path: Path) -> list[Item]:
    """Return the non-persisted baseline order for the command's default preview mode."""
    engine = create_engine(f"sqlite:///{db_path.resolve().as_posix()}")
    try:
        with Session(engine) as db:
            items = db.query(Item).filter(Item.deleted_at.is_(None)).all()
            return default_item_display_order(items)
    finally:
        engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description="Preview or apply DEXCOWIN MES item display order")
    parser.add_argument("--db", type=Path, default=BACKEND_ROOT / "mes.db")
    parser.add_argument("--apply", action="store_true", help="Back up and persist the new display order")
    args = parser.parse_args()

    if not args.apply:
        preview = preview_item_display_order(args.db)
        print(f"[PREVIEW] active items: {len(preview)}")
        for item in preview[:10]:
            print(f"  {item.mes_code} {item.item_name}")
        return 0

    result = apply_item_display_order(args.db)
    print(f"[APPLY] reordered active items: {result.item_count}")
    print(f"BACKUP_PATH={result.backup_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
