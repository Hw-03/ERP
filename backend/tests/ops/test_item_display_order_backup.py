"""품목 표시 순서 변경 전 SQLite 백업의 이름과 내용 보존을 검증한다."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ops import backup_db


def test_backup_sqlite_labels_item_display_order_snapshot(tmp_path, monkeypatch):
    source = tmp_path / "mes.db"
    with sqlite3.connect(source) as connection:
        connection.execute("CREATE TABLE items (item_id TEXT PRIMARY KEY, sort_order INTEGER)")
        connection.execute("INSERT INTO items VALUES ('item-1', 7)")

    monkeypatch.setenv("MES_RUNTIME_ROOT", str(tmp_path / "runtime"))
    monkeypatch.setattr(backup_db, "_verify_sqlite_backup", lambda _path: None)

    backup = backup_db.backup_sqlite(str(source), label="item-display-order")

    assert backup.name.startswith("mes-before-item-display-order-")
    with sqlite3.connect(backup) as connection:
        assert connection.execute("SELECT item_id, sort_order FROM items").fetchall() == [("item-1", 7)]
