"""Pause migrations add one table without rebuilding preserved work."""
from pathlib import Path
from io import StringIO
import uuid

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app import models


def _config(path: Path) -> Config:
    """All migrations explicitly target a disposable database."""
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def test_pause_upgrade_and_empty_downgrade_preserve_existing_tables(tmp_path: Path) -> None:
    path = tmp_path / "pause.db"
    config = _config(path)
    command.upgrade(config, "20261021_0048")
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    with engine.connect() as connection:
        before = connection.execute(text("SELECT name, rootpage, sql FROM sqlite_schema WHERE type='table' AND name IN ('io_batches','stock_requests') ORDER BY name")).all()
    command.upgrade(config, "20261023_0049")
    assert "stocktake_work_pauses" in inspect(engine).get_table_names(), "The pause revision must add active pauses"
    with engine.connect() as connection:
        assert connection.execute(text("SELECT name, rootpage, sql FROM sqlite_schema WHERE type='table' AND name IN ('io_batches','stock_requests') ORDER BY name")).all() == before
        context = MigrationContext.configure(connection, opts={
            "include_object": lambda obj, name, type_, reflected, compare_to:
                (name if type_ == "table" else getattr(getattr(obj, "table", None), "name", None)) == "stocktake_work_pauses",
            "compare_server_default": True,
        })
        assert compare_metadata(context, models.Base.metadata) == []
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    command.downgrade(config, "20261021_0048")
    assert "stocktake_work_pauses" not in inspect(engine).get_table_names()
    engine.dispose()


def test_pause_migration_adopts_complete_metadata_schema(tmp_path: Path) -> None:
    path = tmp_path / "metadata.db"
    config = _config(path)
    command.upgrade(config, "20261021_0048")
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    assert hasattr(models, "StocktakeWorkPause"), "Metadata bootstrap must include pauses"
    models.StocktakeWorkPause.__table__.create(engine)
    command.upgrade(config, "20261023_0049")
    engine.dispose()


def test_pause_migration_rejects_partial_preexisting_table(tmp_path: Path) -> None:
    path = tmp_path / "partial.db"
    config = _config(path)
    command.upgrade(config, "20261021_0048")
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE stocktake_work_pauses (kind TEXT PRIMARY KEY)"))
    with pytest.raises(RuntimeError, match="pause schema"):
        command.upgrade(config, "20261023_0049")
    engine.dispose()


def test_pause_downgrade_preserves_active_work_fences(tmp_path: Path) -> None:
    path = tmp_path / "active.db"
    config = _config(path)
    command.upgrade(config, "20261023_0049")
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    with Session(engine) as db:
        actor = models.Employee(employee_code="pause-migration", name="Pause owner", role="staff")
        db.add(actor)
        db.flush()
        round_ = models.StocktakeRound(title="Pause migration", epoch=1, started_by=actor.employee_id)
        db.add(round_)
        db.flush()
        db.add(models.StocktakeWorkPause(kind="io", work_id=uuid.uuid4(), round_id=round_.round_id, required_cells=[]))
        db.commit()
    with pytest.raises(RuntimeError, match="active work pauses"):
        command.downgrade(config, "20261021_0048")
    with engine.connect() as connection:
        assert connection.execute(text("SELECT COUNT(*) FROM stocktake_work_pauses")).scalar_one() == 1
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "20261023_0049"
    engine.dispose()


def test_pause_offline_downgrade_cannot_discard_unverified_fences() -> None:
    output = StringIO()
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"), output_buffer=output)
    config.set_main_option("sqlalchemy.url", "sqlite:///synthetic.db")
    with pytest.raises(RuntimeError, match="online downgrade"):
        command.downgrade(config, "20261023_0049:20261021_0048", sql=True)
    assert "DROP TABLE" not in output.getvalue()
