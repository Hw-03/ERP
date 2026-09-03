from __future__ import annotations

import io
import sqlite3
from datetime import datetime
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from app import models
from app.models import Base
from bootstrap.legacy_profiles import (
    sqlite_business_data_fingerprint,
    sqlite_schema_fingerprint,
)


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
HEAD_REVISION = "20260903_0030"


def _config(url: str, *, output_buffer: io.StringIO | None = None) -> Config:
    config = Config(str(ALEMBIC_INI), output_buffer=output_buffer)
    config.set_main_option("sqlalchemy.url", url)
    return config


def test_data_revision_is_registered_in_orm_metadata() -> None:
    model = getattr(models, "DataRevision", None)

    assert model is not None
    table = Base.metadata.tables["data_revision"]
    assert model.__table__ is table
    assert list(table.primary_key.columns.keys()) == ["id"]
    assert table.c.revision.nullable is False
    assert table.c.updated_at.nullable is False
    assert table.c.updated_at.server_default is not None
    assert {constraint.name for constraint in table.constraints} >= {
        "ck_data_revision_singleton"
    }


def test_sqlite_head_creates_seeded_data_revision_singleton(tmp_path: Path) -> None:
    path = tmp_path / "data-revision.db"
    command.upgrade(_config(f"sqlite:///{path.as_posix()}"), "head")

    with sqlite3.connect(path) as db:
        columns = {
            row[1]: (row[2], row[3], row[5])
            for row in db.execute("PRAGMA table_info(data_revision)")
        }
        row = db.execute(
            "SELECT id, revision, updated_at FROM data_revision"
        ).fetchone()
        version = db.execute("SELECT version_num FROM alembic_version").fetchone()
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(
                "INSERT INTO data_revision (id, revision) VALUES (2, 0)"
            )

    assert columns == {
        "id": ("INTEGER", 1, 1),
        "revision": ("BIGINT", 1, 0),
        "updated_at": ("DATETIME", 1, 0),
    }
    assert row is not None
    assert row[:2] == (1, 0)
    assert row[2] is not None
    assert version == (HEAD_REVISION,)


def test_postgresql_offline_head_contains_data_revision_contract() -> None:
    output = io.StringIO()
    command.upgrade(
        _config(
            "postgresql+psycopg2://migration-test:unused@invalid/migration-test",
            output_buffer=output,
        ),
        "head",
        sql=True,
    )

    sql = output.getvalue().lower()
    assert "create table data_revision" in sql
    assert "ck_data_revision_singleton" in sql
    assert "insert into data_revision" in sql


def test_data_revision_is_excluded_from_legacy_schema_and_data_fingerprints() -> None:
    engine = sa.create_engine("sqlite://")
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(
                "CREATE TABLE business_row (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"
            )
            connection.exec_driver_sql(
                "INSERT INTO business_row (id, value) VALUES (1, 'stable')"
            )
            before = (
                sqlite_schema_fingerprint(connection),
                sqlite_business_data_fingerprint(connection),
            )
            connection.exec_driver_sql(
                "CREATE TABLE data_revision ("
                "id INTEGER PRIMARY KEY, revision BIGINT NOT NULL, "
                "updated_at DATETIME NOT NULL, CHECK (id = 1))"
            )
            connection.exec_driver_sql(
                "INSERT INTO data_revision VALUES (1, 0, CURRENT_TIMESTAMP)"
            )
            after_create = (
                sqlite_schema_fingerprint(connection),
                sqlite_business_data_fingerprint(connection),
            )
            connection.exec_driver_sql(
                "UPDATE data_revision SET revision = revision + 1"
            )
            after_update = (
                sqlite_schema_fingerprint(connection),
                sqlite_business_data_fingerprint(connection),
            )
    finally:
        engine.dispose()

    assert after_create == before
    assert after_update == before


@pytest.mark.parametrize(
    "ddl",
    [
        (
            "CREATE TABLE data_revision ("
            "id INTEGER PRIMARY KEY, revision BIGINT NOT NULL)"
        ),
        (
            "CREATE TABLE data_revision ("
            "id INTEGER PRIMARY KEY, revision BIGINT NOT NULL, "
            "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL)"
        ),
    ],
    ids=["missing-updated-at", "missing-singleton-check"],
)
def test_malformed_preexisting_data_revision_schema_fails_closed(
    tmp_path: Path,
    ddl: str,
) -> None:
    path = tmp_path / "malformed-schema.db"
    config = _config(f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "20260804_0012")
    with sqlite3.connect(path) as db:
        db.execute(ddl)

    with pytest.raises(RuntimeError, match="canonical contract"):
        command.upgrade(config, "head")

    with sqlite3.connect(path) as db:
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "20260804_0012",
        )


def test_preexisting_data_revision_rejects_invalid_singleton_row(
    tmp_path: Path,
) -> None:
    path = tmp_path / "invalid-row.db"
    config = _config(f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "20260804_0012")
    with sqlite3.connect(path) as db:
        db.executescript(
            """
            CREATE TABLE data_revision (
                id INTEGER NOT NULL PRIMARY KEY,
                revision BIGINT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                CONSTRAINT ck_data_revision_singleton CHECK (id = 1)
            );
            INSERT INTO data_revision (id, revision) VALUES (1, -1);
            """
        )

    with pytest.raises(RuntimeError, match="singleton row"):
        command.upgrade(config, "head")


def test_preexisting_data_revision_rejects_quoted_now_default(
    tmp_path: Path,
) -> None:
    path = tmp_path / "quoted-now-default.db"
    config = _config(f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "20260804_0012")
    with sqlite3.connect(path) as db:
        db.execute(
            "CREATE TABLE data_revision ("
            "id INTEGER NOT NULL PRIMARY KEY, revision BIGINT NOT NULL, "
            "updated_at DATETIME DEFAULT 'now()' NOT NULL, "
            "CONSTRAINT ck_data_revision_singleton CHECK (id = 1))"
        )

    with pytest.raises(RuntimeError, match="current timestamp default"):
        command.upgrade(config, "head")

    with sqlite3.connect(path) as db:
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == (
            "20260804_0012",
        )


def test_empty_canonical_preexisting_data_revision_is_seeded(tmp_path: Path) -> None:
    path = tmp_path / "empty-canonical.db"
    config = _config(f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "20260804_0012")
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        getattr(models, "DataRevision").__table__.create(engine)
    finally:
        engine.dispose()

    command.upgrade(config, "head")

    with sqlite3.connect(path) as db:
        row = db.execute(
            "SELECT id, revision, updated_at FROM data_revision"
        ).fetchone()

    assert row[:2] == (1, 0)
    assert isinstance(row[2], str)
    datetime.fromisoformat(row[2])
