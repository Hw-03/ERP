"""품목 표시 순서 최초 적용 스크립트의 안전 계약 테스트."""

from __future__ import annotations

import importlib.util
import sqlite3
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session


ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = ROOT / "backend" / "scripts" / "apply_item_display_order.py"
if str(ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(ROOT / "backend"))

from app.models import Item, ProcessType
from app.models.base import Base


def _load_script_module():
    spec = importlib.util.spec_from_file_location("apply_item_display_order", SCRIPT_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _seed_database(path: Path) -> None:
    engine = create_engine(f"sqlite:///{path}")
    try:
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            db.add_all([
                ProcessType(code="TR", prefix="T", suffix="R", stage_order=10),
                ProcessType(code="TF", prefix="T", suffix="F", stage_order=25),
            ])
            db.add_all([
                Item(item_name="finished", unit="EA", model_symbol="9", process_type_code="TF", serial_no=1, sort_order=0),
                Item(item_name="raw late", unit="EA", model_symbol="9", process_type_code="TR", serial_no=2, sort_order=1),
                Item(item_name="raw early", unit="EA", model_symbol="9", process_type_code="TR", serial_no=1, sort_order=2),
            ])
            db.commit()
    finally:
        engine.dispose()


def _read_order(path: Path) -> list[tuple[str, int]]:
    with sqlite3.connect(path) as connection:
        return connection.execute("SELECT item_name, sort_order FROM items ORDER BY sort_order").fetchall()


def test_apply_creates_labeled_backup_then_resets_default_order(tmp_path):
    db_path = tmp_path / "mes.db"
    backup_path = tmp_path / "mes-before-item-display-order-20260805-170000.db"
    _seed_database(db_path)
    module = _load_script_module()

    def backup(source: str, *, label: str):
        assert Path(source) == db_path
        assert label == "item-display-order"
        with sqlite3.connect(source) as src, sqlite3.connect(backup_path) as target:
            src.backup(target)
        return backup_path

    result = module.apply_item_display_order(db_path, backup_fn=backup)

    assert result.backup_path == backup_path
    assert _read_order(backup_path) == [("finished", 0), ("raw late", 1), ("raw early", 2)]
    assert _read_order(db_path) == [("raw early", 0), ("raw late", 1), ("finished", 2)]


def test_apply_does_not_change_order_when_backup_fails(tmp_path):
    db_path = tmp_path / "mes.db"
    _seed_database(db_path)
    module = _load_script_module()
    before = _read_order(db_path)

    def fail_backup(_source: str, *, label: str):
        raise OSError(f"backup failed for {label}")

    with pytest.raises(OSError, match="backup failed"):
        module.apply_item_display_order(db_path, backup_fn=fail_backup)

    assert _read_order(db_path) == before
