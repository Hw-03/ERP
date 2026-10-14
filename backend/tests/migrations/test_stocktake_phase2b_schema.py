"""The POOL consumer schema stays inactive and protects immutable evidence."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text


def test_pool_link_and_append_only_triggers(tmp_path):
    path = tmp_path / "pool-consumers.db"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "head")
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    assert "pool_id" in {col["name"] for col in inspect(engine).get_columns("stock_request_lines")}
    with engine.connect() as connection:
        assert connection.execute(text("SELECT inventory_mode FROM stocktake_control")).scalar_one() == "LEGACY"
        triggers = set(connection.execute(text("SELECT name FROM sqlite_master WHERE type='trigger'")).scalars())
        assert "stocktake_defect_pool_bridges_no_update" in triggers
        assert "stocktake_defect_stock_movements_no_delete" in triggers
        assert "stocktake_frozen_occurrence" in triggers
    engine.dispose()
