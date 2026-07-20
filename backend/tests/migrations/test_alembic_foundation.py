from __future__ import annotations

import io
import logging
import os
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.schema import CreateTable

from app import models
from app.models import Base, Item, ModelPfPin
from migration_type_compare import compare_migration_type


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
BASELINE_REVISION = (
    BACKEND_DIR
    / "alembic"
    / "versions"
    / "20260715_0001_current_schema_baseline.py"
)


def _config(url: str, *, output_buffer: io.StringIO | None = None) -> Config:
    config = Config(str(ALEMBIC_INI), output_buffer=output_buffer)
    config.set_main_option("sqlalchemy.url", url)
    return config


def test_alembic_upgrade_keeps_application_logger_enabled(tmp_path, caplog):
    logger = logging.getLogger("mes")
    previous_disabled = logger.disabled
    previous_level = logger.level
    logger.disabled = False
    logger.setLevel(logging.INFO)
    logger.addHandler(caplog.handler)
    try:
        db_path = tmp_path / "logging-state.db"
        command.upgrade(_config(f"sqlite:///{db_path.as_posix()}"), "head")
        logger.info("alembic-preserved-mes-log")

        assert logger.disabled is False
        assert "alembic-preserved-mes-log" in caplog.messages
    finally:
        logger.removeHandler(caplog.handler)
        logger.disabled = previous_disabled
        logger.setLevel(previous_level)


def test_item_code_parts_are_not_nullable_and_use_portable_computed_sql():
    table = Item.__table__

    assert table.c.model_symbol.nullable is False
    assert table.c.process_type_code.nullable is False
    assert table.c.serial_no.nullable is False
    assert "ck_items_serial_no_positive" not in {
        constraint.name for constraint in table.constraints
    }

    sqlite_ddl = str(CreateTable(table).compile(dialect=sqlite.dialect())).lower()
    postgresql_ddl = str(
        CreateTable(table).compile(dialect=postgresql.dialect())
    ).lower()
    assert "printf('%04d', serial_no)" in sqlite_ddl
    assert "printf" not in postgresql_ddl
    assert "case" in postgresql_ddl
    assert "cast" in postgresql_ddl


def test_model_pf_pins_is_part_of_orm_metadata():
    model_pf_pin = getattr(models, "ModelPfPin", None)
    assert model_pf_pin is not None
    table = Base.metadata.tables["model_pf_pins"]

    assert model_pf_pin.__table__ is table
    assert list(table.primary_key.columns.keys()) == ["model_symbol"]
    assert table.c.pf_item_id.nullable is False
    assert table.c.updated_at.nullable is False
    assert table.c.updated_at.server_default is not None

    fk = next(iter(table.c.pf_item_id.foreign_keys))
    assert fk.target_fullname == "items.item_id"
    assert fk.ondelete == "CASCADE"


def test_model_pf_pins_sqlite_legacy_types_preserve_uuid_and_datetime_processors(
    tmp_path,
):
    db_path = tmp_path / "model-pf-types.db"
    url = f"sqlite:///{db_path.as_posix()}"
    command.upgrade(_config(url), "head")
    engine = sa.create_engine(url)
    item_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    explicit_time = datetime(2026, 7, 15, 12, 30, 45)
    try:
        inspector = sa.inspect(engine)
        columns = {
            column["name"]: column for column in inspector.get_columns("model_pf_pins")
        }
        assert isinstance(columns["model_symbol"]["type"], sa.Text)
        assert isinstance(columns["pf_item_id"]["type"], sa.CHAR)
        assert columns["pf_item_id"]["type"].length == 36
        assert isinstance(columns["updated_at"]["type"], sa.Text)

        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    "INSERT INTO process_types "
                    "(code, prefix, suffix, stage_order) VALUES ('TR', 'T', 'R', 1)"
                )
            )
            connection.execute(
                sa.text(
                    "INSERT INTO items "
                    "(item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
                    "VALUES (:item_id, 'pin-target', 'EA', '9', 'TR', 1)"
                ),
                {"item_id": item_id.hex},
            )

        with sa.orm.Session(engine) as session:
            session.add(
                ModelPfPin(
                    model_symbol="9",
                    pf_item_id=item_id,
                    updated_at=explicit_time,
                )
            )
            session.commit()
            pin = session.get(ModelPfPin, "9")
            assert pin is not None
            assert pin.pf_item_id == item_id
            assert pin.updated_at == explicit_time

        with engine.begin() as connection:
            assert connection.scalar(
                sa.text(
                    "SELECT pf_item_id FROM model_pf_pins WHERE model_symbol='9'"
                )
            ) == item_id.hex
            connection.execute(
                sa.text(
                    "INSERT INTO model_pf_pins (model_symbol, pf_item_id) "
                    "VALUES ('9-default', :item_id)"
                ),
                {"item_id": item_id.hex},
            )

        with sa.orm.Session(engine) as session:
            default_pin = session.get(ModelPfPin, "9-default")
            assert default_pin is not None
            assert default_pin.pf_item_id == item_id
            assert isinstance(default_pin.updated_at, datetime)
    finally:
        engine.dispose()


def test_empty_sqlite_upgrade_creates_current_schema_and_is_rerunnable(tmp_path):
    db_path = tmp_path / "empty.db"
    url = f"sqlite:///{db_path.as_posix()}"
    config = _config(url)

    command.upgrade(config, "head")
    command.upgrade(config, "head")

    engine = sa.create_engine(url)
    try:
        inspector = sa.inspect(engine)
        assert set(inspector.get_table_names()) == set(Base.metadata.tables) | {
            "alembic_version",
            "alembic_schema_state",
        }
        with engine.connect() as connection:
            assert connection.scalar(
                sa.text("SELECT version_num FROM alembic_version")
            ) == "20260720_0003"
            connection.execute(
                sa.text(
                    "INSERT INTO system_settings (setting_key, setting_value) "
                    "VALUES ('raw-default-check', 'ok')"
                )
            )
            assert connection.scalar(
                sa.text(
                    "SELECT updated_at FROM system_settings "
                    "WHERE setting_key='raw-default-check'"
                )
            ) is not None
    finally:
        engine.dispose()


def test_empty_sqlite_upgrade_accepts_supplied_connection(tmp_path):
    url = f"sqlite:///{(tmp_path / 'connection.db').as_posix()}"
    engine = sa.create_engine(url)
    try:
        with engine.begin() as connection:
            config = _config(url)
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
        assert "alembic_version" in sa.inspect(engine).get_table_names()
    finally:
        engine.dispose()


def test_head_revision_creates_empty_schema_state_table(tmp_path):
    path = tmp_path / "schema-state.db"
    command.upgrade(_config(f"sqlite:///{path.as_posix()}"), "head")

    with sqlite3.connect(path) as db:
        columns = {
            row[1]: row[2]
            for row in db.execute("PRAGMA table_info(alembic_schema_state)")
        }
        rows = db.execute("SELECT * FROM alembic_schema_state").fetchall()

    assert columns == {
        "id": "INTEGER",
        "profile_id": "VARCHAR(64)",
        "revision": "VARCHAR(32)",
        "schema_fingerprint": "VARCHAR(64)",
        "updated_at": "DATETIME",
    }
    assert rows == []


def test_baseline_schema_has_no_semantic_metadata_diff(tmp_path):
    url = f"sqlite:///{(tmp_path / 'diff.db').as_posix()}"
    command.upgrade(_config(url), "head")

    engine = sa.create_engine(url)
    try:
        with engine.connect() as connection:
            context = MigrationContext.configure(
                connection,
                opts={
                    "compare_type": compare_migration_type,
                    "include_object": lambda obj, name, type_, reflected, compare_to: (
                        name not in {"alembic_version", "alembic_schema_state"}
                    ),
                },
            )
            assert compare_metadata(context, Base.metadata) == []
    finally:
        engine.dispose()


def test_postgresql_offline_upgrade_compiles_without_sqlite_functions():
    output = io.StringIO()
    config = _config(
        "postgresql+psycopg2://migration-test:unused@invalid/migration-test",
        output_buffer=output,
    )

    command.upgrade(config, "head", sql=True)

    sql = output.getvalue().lower()
    assert "create table items" in sql
    assert "create table model_pf_pins" in sql
    assert "ck_items_serial_no_positive" not in sql
    assert "printf" not in sql
    assert "pragma" not in sql
    assert "now()" in sql or "current_timestamp" in sql


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행",
)
def test_postgresql_upgrade_opt_in_uses_outer_rollback():
    engine = sa.create_engine(os.environ["TEST_POSTGRES_URL"])
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                config = _config(os.environ["TEST_POSTGRES_URL"])
                config.attributes["connection"] = connection
                command.upgrade(config, "head")
                assert "alembic_version" in sa.inspect(connection).get_table_names()
            finally:
                transaction.rollback()
    finally:
        engine.dispose()


def test_baseline_revision_is_static_and_downgrade_is_fail_closed(tmp_path):
    source = BASELINE_REVISION.read_text(encoding="utf-8").lower()

    assert "op.create_table" in source
    assert "base.metadata" not in source
    assert "create_all" not in source
    assert "pragma" not in source

    config = _config(f"sqlite:///{(tmp_path / 'downgrade.db').as_posix()}")
    command.upgrade(config, "head")
    with pytest.raises(Exception, match="downgrade"):
        command.downgrade(config, "base")
