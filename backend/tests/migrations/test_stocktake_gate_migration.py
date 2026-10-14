"""Counting fences are additive; upgrading never starts a round or changes stock."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
import pytest


def test_gate_migration_preserves_mode_and_adds_empty_fences(tmp_path):
    path = tmp_path / "gate-migration.db"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "20261001_0040")
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    with engine.begin() as connection:
        connection.execute(text("UPDATE stocktake_control SET inventory_mode='POOL', epoch=3 WHERE id=1"))
    command.upgrade(config, "head")
    assert {"stocktake_gates", "stocktake_progress"} <= set(inspect(engine).get_table_names())
    with engine.connect() as connection:
        assert connection.execute(text("SELECT inventory_mode, epoch, active_round_id FROM stocktake_control WHERE id=1")).one() == ("POOL", 3, None)
        assert connection.execute(text("SELECT COUNT(*) FROM stocktake_gates")).scalar_one() == 0
        assert connection.execute(text("PRAGMA foreign_key_check")).fetchall() == []
    engine.dispose()


def test_gate_migration_rejects_partial_preexisting_schema(tmp_path):
    path = tmp_path / "partial-gate.db"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "20261001_0040")
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE stocktake_gates (item_id TEXT PRIMARY KEY)"))
    with pytest.raises(RuntimeError, match="Partial stocktake gate"):
        command.upgrade(config, "head")
    engine.dispose()
