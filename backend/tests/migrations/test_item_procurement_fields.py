"""Item procurement master migration regression tests."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable
from alembic import command
from alembic.config import Config

from app.models import Item


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_REVISION = "20260903_0030"
PROCUREMENT_REVISION = "20260903_0031"
MIGRATION_REVISION = "20260903_0032"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def test_item_procurement_price_model_keeps_postgresql_numeric_contract():
    ddl = str(CreateTable(Item.__table__).compile(dialect=postgresql.dialect()))

    assert "standard_purchase_price NUMERIC(18, 2)" in ddl


def test_item_procurement_migration_adds_nullable_fields_preserves_rows_and_checks(tmp_path: Path):
    path = tmp_path / "item-procurement.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    item_id = "11111111111111111111111111111111"
    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) "
            "VALUES ('HR', 'H', 'R', 1)"
        )
        db.execute(
            """
            INSERT INTO items (
                item_id, item_name, unit, model_symbol, process_type_code,
                serial_no, sales_review_required, deleted_at
            ) VALUES (?, 'Existing item', 'EA', '3', 'HR', 1, 0, NULL)
            """,
            (item_id,),
        )

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        fields = {
            row[1] for row in db.execute("PRAGMA table_info(items)")
        }
        row = db.execute(
            """
            SELECT supplier_item_code, standard_purchase_price,
                   purchase_price_effective_date, procurement_lead_time_days,
                   minimum_order_quantity, reorder_point, purchase_memo
            FROM items WHERE item_id = ?
            """,
            (item_id,),
        ).fetchone()
        assert {
            "supplier_item_code",
            "standard_purchase_price",
            "purchase_price_effective_date",
            "procurement_lead_time_days",
            "minimum_order_quantity",
            "reorder_point",
            "purchase_memo",
        }.issubset(fields)
        assert row == (None, None, None, None, None, None, None)

        with pytest.raises(sqlite3.IntegrityError):
            db.execute("UPDATE items SET standard_purchase_price = -1 WHERE item_id = ?", (item_id,))
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("UPDATE items SET procurement_lead_time_days = -1 WHERE item_id = ?", (item_id,))
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("UPDATE items SET minimum_order_quantity = 0 WHERE item_id = ?", (item_id,))
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("UPDATE items SET reorder_point = -1 WHERE item_id = ?", (item_id,))

    with sqlite3.connect(path) as db:
        db.execute("UPDATE alembic_version SET version_num = ?", (PREVIOUS_REVISION,))
    command.upgrade(config, MIGRATION_REVISION)


def test_item_procurement_migration_rejects_same_named_check_with_different_sql(tmp_path: Path):
    path = tmp_path / "item-procurement-incompatible-check.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    with sqlite3.connect(path) as db:
        db.executescript(
            """
            ALTER TABLE items ADD COLUMN supplier_item_code VARCHAR(100);
            ALTER TABLE items ADD COLUMN standard_purchase_price NUMERIC(18, 2)
                CONSTRAINT ck_items_standard_purchase_price_nonneg
                CHECK (standard_purchase_price >= 0 OR standard_purchase_price IS NULL);
            ALTER TABLE items ADD COLUMN purchase_price_effective_date DATE;
            ALTER TABLE items ADD COLUMN procurement_lead_time_days INTEGER
                CONSTRAINT ck_items_procurement_lead_time_days_nonneg
                CHECK (procurement_lead_time_days >= 0 OR procurement_lead_time_days IS NULL);
            ALTER TABLE items ADD COLUMN minimum_order_quantity INTEGER
                CONSTRAINT ck_items_minimum_order_quantity_positive
                CHECK (minimum_order_quantity >= 0 OR minimum_order_quantity IS NULL);
            ALTER TABLE items ADD COLUMN reorder_point INTEGER
                CONSTRAINT ck_items_reorder_point_nonneg
                CHECK (reorder_point >= 0 OR reorder_point IS NULL);
            """
        )

    with pytest.raises(RuntimeError, match="items procurement fields"):
        command.upgrade(config, PROCUREMENT_REVISION)
