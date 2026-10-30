"""Cost time adds one nullable column without rebuilding generated item codes."""

from pathlib import Path
from io import StringIO

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app.models import Base


def config_for(path: Path) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def test_cost_time_upgrade_downgrade_preserves_generated_item_and_foreign_keys(tmp_path):
    path = tmp_path / "cost.db"
    config = config_for(path)
    command.upgrade(config, "20261029_0051")
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    with engine.begin() as db:
        db.exec_driver_sql("INSERT INTO process_types (code,prefix,suffix,stage_order) VALUES ('TR','T','R',10)")
        db.exec_driver_sql("INSERT INTO items (item_id,item_name,unit,model_symbol,process_type_code,serial_no) VALUES ('cost','Cost','EA','4','TR',1)")
        rootpage = db.exec_driver_sql("SELECT rootpage FROM sqlite_master WHERE name='items'").scalar_one()
    command.upgrade(config, "head")
    with engine.connect() as db:
        assert "standard_work_minutes" in {column["name"] for column in sa.inspect(db).get_columns("items")}
        assert db.exec_driver_sql("SELECT rootpage FROM sqlite_master WHERE name='items'").scalar_one() == rootpage
        assert db.exec_driver_sql("SELECT mes_code,standard_work_minutes FROM items").one() == ("4-TR-0001", None)
        assert db.exec_driver_sql("SELECT purchase_currency,foreign_purchase_price,purchase_exchange_rate FROM items").one() == ("KRW", None, None)
        assert db.exec_driver_sql("SELECT standard_yield_percent FROM items").scalar_one() is None
        for invalid in (0, -1, 100.01):
            with pytest.raises(sa.exc.IntegrityError):
                db.exec_driver_sql("UPDATE items SET standard_yield_percent=?", (invalid,))
            db.rollback()
        with pytest.raises(sa.exc.IntegrityError):
            db.exec_driver_sql("UPDATE items SET standard_work_minutes=-1")
        db.rollback()
    command.downgrade(config, "20261029_0051")
    with engine.connect() as db:
        assert "standard_work_minutes" not in {column["name"] for column in sa.inspect(db).get_columns("items")}
        assert "standard_yield_percent" not in {column["name"] for column in sa.inspect(db).get_columns("items")}
        assert db.exec_driver_sql("SELECT mes_code FROM items").scalar_one() == "4-TR-0001"
        assert db.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    engine.dispose()


def test_cost_time_accepts_metadata_first_schema(tmp_path):
    path = tmp_path / "metadata.db"
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    Base.metadata.create_all(engine)
    engine.dispose()
    config = config_for(path)
    command.stamp(config, "20261029_0051")
    command.upgrade(config, "head")
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    with engine.connect() as db:
        assert "standard_work_minutes" in {column["name"] for column in sa.inspect(db).get_columns("items")}
        from bootstrap.schema import schema_differences
        assert schema_differences(db) == ()
    engine.dispose()
    command.downgrade(config, "20261029_0051")


def test_cost_time_emits_portable_inline_check_without_rebuild():
    output = StringIO()
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"), output_buffer=output)
    config.set_main_option("sqlalchemy.url", "postgresql://localhost/unused")
    command.upgrade(config, "20261029_0051:20261029_0052", sql=True)
    sql = output.getvalue()
    assert "ALTER TABLE items ADD COLUMN standard_work_minutes NUMERIC(12, 2)" in sql
    assert "CONSTRAINT ck_items_standard_work_minutes_nonneg CHECK" in sql
    assert "CREATE TABLE" not in sql


def test_foreign_cost_currency_emits_portable_columns_without_rebuild():
    output = StringIO()
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"), output_buffer=output)
    config.set_main_option("sqlalchemy.url", "postgresql://localhost/unused")
    command.upgrade(config, "20261029_0052:20261029_0053", sql=True)
    sql = output.getvalue()
    assert "ADD COLUMN purchase_currency VARCHAR(3) DEFAULT 'KRW' NOT NULL" in sql
    assert "ADD COLUMN foreign_purchase_price NUMERIC(18, 2)" in sql
    assert "ADD COLUMN purchase_exchange_rate NUMERIC(12, 6)" in sql
    assert "CREATE TABLE" not in sql


def test_yield_migration_emits_inline_range_without_rebuild():
    output = StringIO()
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"), output_buffer=output)
    config.set_main_option("sqlalchemy.url", "postgresql://localhost/unused")
    command.upgrade(config, "20261029_0053:20261029_0054", sql=True)
    sql = output.getvalue()
    assert "ADD COLUMN standard_yield_percent NUMERIC(5, 2)" in sql
    assert "ck_items_standard_yield_range CHECK" in sql
    assert "CREATE TABLE" not in sql


@pytest.mark.parametrize("definition", ["NUMERIC(12,2)", "NUMERIC(10,2) CHECK (standard_work_minutes >= 0)"])
def test_cost_time_rejects_incompatible_metadata_first_column(tmp_path, definition):
    path = tmp_path / "incompatible.db"
    config = config_for(path)
    command.upgrade(config, "20261029_0051")
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    with engine.begin() as db:
        db.exec_driver_sql(f"ALTER TABLE items ADD COLUMN standard_work_minutes {definition}")
    engine.dispose()
    with pytest.raises(RuntimeError, match="incompatible"):
        command.upgrade(config, "head")
