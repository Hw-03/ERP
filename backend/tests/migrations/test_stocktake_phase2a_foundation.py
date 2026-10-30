"""2-A migration must be additive and leave the stock authority in LEGACY mode."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text


BACKEND_DIR = Path(__file__).resolve().parents[2]
PREVIOUS_HEAD = "20260928_0038"
NEW_HEAD = "20261001_0039"


def test_additive_stocktake_foundation_migration(tmp_path):
    path = tmp_path / "stocktake-foundation.db"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, PREVIOUS_HEAD)
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    before_inventory_columns = {
        column["name"] for column in inspect(engine).get_columns("inventory")
    }

    command.upgrade(config, NEW_HEAD)
    command.upgrade(config, "head")
    inspector = inspect(engine)
    assert before_inventory_columns == {
        column["name"] for column in inspector.get_columns("inventory")
    }
    assert {
        "inventory_scopes",
        "stocktake_control",
        "operator_sessions",
        "defect_pool_cutovers",
        "defect_stock_pools",
        "defect_stock_movements",
        "defect_pool_bridges",
    } <= set(inspector.get_table_names())
    assert "pin_version" in {column["name"] for column in inspector.get_columns("employees")}
    with engine.connect() as connection:
        assert connection.execute(text("SELECT inventory_mode, epoch FROM stocktake_control WHERE id=1")).one() == ("LEGACY", 0)
        assert connection.execute(text("SELECT COUNT(*) FROM defect_stock_pools")).scalar_one() == 0
        assert connection.execute(text("PRAGMA foreign_key_check")).fetchall() == []
    engine.dispose()


def test_canonical_bootstrap_records_schema_readiness(tmp_path):
    from bootstrap.schema import check_schema, ensure_schema

    path = tmp_path / "stocktake-canonical.db"
    url = f"sqlite:///{path.as_posix()}"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, PREVIOUS_HEAD)
    engine = create_engine(url)

    result = ensure_schema(engine=engine)
    checked = check_schema(engine=engine)

    assert result.changed is True
    assert checked.ready is True
    assert checked.revision == "20261029_0054"
    with engine.connect() as connection:
        assert connection.execute(text("SELECT revision FROM alembic_schema_state WHERE id=1")).scalar_one() == "20261029_0054"
        assert connection.execute(text("SELECT inventory_mode FROM stocktake_control WHERE id=1")).scalar_one() == "LEGACY"
    engine.dispose()
