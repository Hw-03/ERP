"""주간 완료품 재고 스냅샷 Alembic 계약."""

from __future__ import annotations

from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_HEAD = "20260820_0023"
MIGRATION_REVISION = "20260824_0024"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def test_weekly_inventory_snapshot_migration_adds_only_new_tables(tmp_path):
    path = tmp_path / "weekly-snapshot.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_HEAD)
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        before_tables = set(sa.inspect(engine).get_table_names())
        command.upgrade(config, "head")
        inspector = sa.inspect(engine)
        after_tables = set(inspector.get_table_names())

        assert after_tables - before_tables == {
            "weekly_inventory_snapshots",
            "weekly_inventory_snapshot_items",
        }
        assert {
            "snapshot_id",
            "week_end",
            "as_of_utc",
            "captured_at",
            "capture_source",
            "item_count",
            "total_quantity",
        } == {column["name"] for column in inspector.get_columns("weekly_inventory_snapshots")}
        assert {
            "snapshot_item_id",
            "snapshot_id",
            "item_id",
            "mes_code",
            "item_name",
            "process_type_code",
            "quantity",
        } == {column["name"] for column in inspector.get_columns("weekly_inventory_snapshot_items")}
        assert any(
            constraint["name"] == "uq_weekly_inventory_snapshots_week_end"
            for constraint in inspector.get_unique_constraints("weekly_inventory_snapshots")
        )
        assert any(
            constraint["name"] == "uq_weekly_inventory_snapshot_items_snapshot_item"
            for constraint in inspector.get_unique_constraints("weekly_inventory_snapshot_items")
        )
        assert any(
            foreign_key["constrained_columns"] == ["snapshot_id"]
            and foreign_key["referred_table"] == "weekly_inventory_snapshots"
            and foreign_key.get("options", {}).get("ondelete", "").upper() == "CASCADE"
            for foreign_key in inspector.get_foreign_keys("weekly_inventory_snapshot_items")
        )
        with engine.connect() as connection:
            revision = connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one()
        assert revision == MIGRATION_REVISION
    finally:
        engine.dispose()


def test_weekly_inventory_snapshot_migration_declares_schema_only_policy():
    migration_path = (
        BACKEND_DIR
        / "alembic"
        / "versions"
        / "20260824_0024_weekly_inventory_snapshots.py"
    )
    source = migration_path.read_text(encoding="utf-8")

    assert 'EMPLOYEE_AUTO_DEPLOY_POLICY = {"kind": "schema-only"}' in source
