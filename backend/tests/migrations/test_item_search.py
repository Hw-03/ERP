"""Search schema upgrades remain empty and exactly match the model registry."""
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
import pytest

from bootstrap.schema import schema_differences


def test_search_migration_is_empty_and_matches_registered_models(tmp_path):
    path = tmp_path / "item-search.db"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "20261014_0045")
    command.upgrade(config, "head")
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with engine.connect() as connection:
            assert schema_differences(connection) == ()
            assert connection.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one() == "20261020_0047"
            for table in ["item_aliases", "item_synonym_groups", "item_synonym_terms"]:
                assert connection.exec_driver_sql(f"SELECT count(*) FROM {table}").scalar_one() == 0
    finally:
        engine.dispose()


def test_metadata_first_replay_preserves_groups_and_rejects_partial_schema(tmp_path):
    path = tmp_path / "search-replay.db"
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "head")
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql("INSERT INTO item_synonym_groups VALUES ('existing', 7)")
        command.stamp(config, "20261014_0045")
        command.upgrade(config, "head")
        with engine.begin() as connection:
            assert connection.exec_driver_sql("SELECT version FROM item_synonym_groups").scalar_one() == 7
            connection.exec_driver_sql("DROP INDEX ix_item_aliases_item_id")
        command.stamp(config, "20261014_0045")
        with pytest.raises(RuntimeError, match="Missing item search lookup index"):
            command.upgrade(config, "head")
    finally:
        engine.dispose()
