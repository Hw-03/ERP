from __future__ import annotations

from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def test_daily_work_report_migration_rejects_partial_existing_table(tmp_path):
    path = tmp_path / "partial-daily-work-report.db"
    config = _config(path)
    command.upgrade(config, "20260727_0008")
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with engine.begin() as connection:
            connection.execute(sa.text("CREATE TABLE daily_work_reports (report_id VARCHAR(32) PRIMARY KEY)"))

        with pytest.raises(RuntimeError, match="daily_work_reports"):
            command.upgrade(config, "head")
    finally:
        engine.dispose()
