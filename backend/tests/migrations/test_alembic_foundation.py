from __future__ import annotations

import io
import logging
import os
import sqlite3
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.schema import CreateTable

from app.models import Base, InventoryLocation, Item
from bootstrap.schema import (
    _normalize_check_sql,
    _normalize_computed_sql,
    schema_differences,
)
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


def test_head_schema_removes_manual_pf_pin_table(tmp_path):
    """자동 기준 전환 뒤 최신 스키마에는 수동 PF 지정 테이블이 없다."""
    db_path = tmp_path / "without-pf-pins.db"
    url = f"sqlite:///{db_path.as_posix()}"
    command.upgrade(_config(url), "head")

    engine = sa.create_engine(url)
    try:
        assert "model_pf_pins" not in sa.inspect(engine).get_table_names()
    finally:
        engine.dispose()


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
            ) == "20260827_0030"
            location_columns = {
                column["name"]: column
                for column in inspector.get_columns("inventory_locations")
            }
            assert location_columns["pending_quantity"]["nullable"] is False
            assert str(location_columns["pending_quantity"]["default"]) in {"0", "'0'"}
            check_names = {
                constraint["name"]
                for constraint in inspector.get_check_constraints("inventory_locations")
            }
            assert "ck_invloc_pending_nonneg" in check_names
            assert "ck_invloc_pending_le_quantity" in check_names
            shipping_columns = {
                column["name"]: column
                for column in inspector.get_columns("shipping_requests")
            }
            assert shipping_columns["serial_numbers"]["nullable"] is True
            assert shipping_columns["finalization_mode"]["nullable"] is False
            assert shipping_columns["reuse_pf_item_id"]["nullable"] is True
            assert any(
                foreign_key["constrained_columns"] == ["reuse_pf_item_id"]
                and foreign_key["referred_table"] == "items"
                and foreign_key["options"].get("ondelete") == "SET NULL"
                for foreign_key in inspector.get_foreign_keys("shipping_requests")
            )
            assert "uq_shipping_requests_invoice_number" not in {
                index["name"] for index in inspector.get_indexes("shipping_requests")
            }
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


def test_shipping_sales_upgrade_keeps_existing_child_rows_on_sqlite(tmp_path):
    """SQLite parent-table rebuild must not cascade-delete shipping snapshots."""
    path = tmp_path / "shipping-children.db"
    with sqlite3.connect(path) as db:
        db.executescript(
            """
            PRAGMA foreign_keys = ON;
            CREATE TABLE employees (employee_id TEXT PRIMARY KEY);
            CREATE TABLE items (item_id TEXT PRIMARY KEY);
            CREATE TABLE shipping_requests (
                request_id TEXT PRIMARY KEY,
                base_pf_item_id TEXT NOT NULL,
                FOREIGN KEY (base_pf_item_id) REFERENCES items(item_id)
            );
            CREATE TABLE shipping_request_bom_lines (
                line_id TEXT PRIMARY KEY,
                request_id TEXT NOT NULL,
                FOREIGN KEY (request_id) REFERENCES shipping_requests(request_id) ON DELETE CASCADE
            );
            CREATE TABLE transaction_logs (
                log_id TEXT PRIMARY KEY,
                shipping_request_id TEXT,
                FOREIGN KEY (shipping_request_id) REFERENCES shipping_requests(request_id) ON DELETE SET NULL
            );
            CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
            INSERT INTO items (item_id) VALUES ('pf-1');
            INSERT INTO shipping_requests (request_id, base_pf_item_id) VALUES ('request-1', 'pf-1');
            INSERT INTO shipping_request_bom_lines (line_id, request_id) VALUES ('bom-1', 'request-1');
            INSERT INTO transaction_logs (log_id, shipping_request_id) VALUES ('log-1', 'request-1');
            INSERT INTO alembic_version (version_num) VALUES ('20260724_0004');
            """
        )

    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")

    @sa.event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record):
        dbapi_connection.execute("PRAGMA foreign_keys = ON")

    try:
        with engine.begin() as connection:
            config = _config(f"sqlite:///{path.as_posix()}")
            config.attributes["connection"] = connection
            command.upgrade(config, "20260724_0005")
    finally:
        engine.dispose()

    with sqlite3.connect(path) as db:
        assert db.execute("SELECT COUNT(*) FROM shipping_request_bom_lines").fetchone()[0] == 1
        assert db.execute("SELECT shipping_request_id FROM transaction_logs WHERE log_id = 'log-1'").fetchone()[0] == "request-1"


def test_shipping_io_context_upgrade_keeps_existing_io_dependents_on_sqlite(tmp_path):
    """Adding the shipping FK must not lose draft bundles during SQLite rebuild."""
    path = tmp_path / "shipping-io-context.db"
    with sqlite3.connect(path) as db:
        db.executescript(
            """
            PRAGMA foreign_keys = ON;
            CREATE TABLE shipping_requests (request_id UUID PRIMARY KEY);
            CREATE TABLE io_batches (
                batch_id UUID PRIMARY KEY,
                reference_no TEXT
            );
            CREATE TABLE io_bundles (
                bundle_id UUID PRIMARY KEY,
                batch_id UUID NOT NULL,
                FOREIGN KEY (batch_id) REFERENCES io_batches(batch_id) ON DELETE CASCADE
            );
            CREATE TABLE io_lines (
                line_id UUID PRIMARY KEY,
                bundle_id UUID NOT NULL,
                FOREIGN KEY (bundle_id) REFERENCES io_bundles(bundle_id) ON DELETE CASCADE
            );
            CREATE TABLE transaction_logs (
                log_id UUID PRIMARY KEY,
                operation_batch_id UUID,
                FOREIGN KEY (operation_batch_id) REFERENCES io_batches(batch_id) ON DELETE SET NULL
            );
            CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL);
            INSERT INTO shipping_requests (request_id) VALUES ('request-1');
            INSERT INTO io_batches (batch_id, reference_no) VALUES ('batch-1', 'IO-1');
            INSERT INTO io_bundles (bundle_id, batch_id) VALUES ('bundle-1', 'batch-1');
            INSERT INTO io_lines (line_id, bundle_id) VALUES ('line-1', 'bundle-1');
            INSERT INTO transaction_logs (log_id, operation_batch_id) VALUES ('log-1', 'batch-1');
            INSERT INTO alembic_version (version_num) VALUES ('20260724_0005');
            """
        )

    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")

    @sa.event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record):
        dbapi_connection.execute("PRAGMA foreign_keys = ON")

    try:
        with engine.begin() as connection:
            config = _config(f"sqlite:///{path.as_posix()}")
            config.attributes["connection"] = connection
            command.upgrade(config, "20260727_0006")
    finally:
        engine.dispose()

    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys = ON")
        assert db.execute("SELECT COUNT(*) FROM io_bundles").fetchone()[0] == 1
        assert db.execute(
            "SELECT batch_id FROM io_bundles WHERE bundle_id = 'bundle-1'"
        ).fetchone() == ("batch-1",)
        assert db.execute(
            "SELECT bundle_id FROM io_lines WHERE line_id = 'line-1'"
        ).fetchone() == ("bundle-1",)
        assert db.execute(
            "SELECT operation_batch_id FROM transaction_logs WHERE log_id = 'log-1'"
        ).fetchone() == ("batch-1",)
        db.execute(
            "UPDATE io_batches SET shipping_request_id = 'request-1' "
            "WHERE batch_id = 'batch-1'"
        )
        db.execute("DELETE FROM shipping_requests WHERE request_id = 'request-1'")
        assert db.execute(
            "SELECT shipping_request_id FROM io_batches WHERE batch_id = 'batch-1'"
        ).fetchone() == (None,)
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []


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


def test_inventory_location_model_tracks_reserved_quantity():
    table = InventoryLocation.__table__

    assert table.c.pending_quantity.nullable is False
    assert table.c.pending_quantity.default.arg == 0
    assert {
        constraint.name for constraint in table.constraints
    }.issuperset({"ck_invloc_pending_nonneg", "ck_invloc_pending_le_quantity"})


def test_inventory_location_pending_migration_backfills_and_enforces_constraints(
    tmp_path,
):
    path = tmp_path / "location-pending.db"
    url = f"sqlite:///{path.as_posix()}"
    command.upgrade(_config(url), "20260812_0018")
    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO items "
            "(item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
            "VALUES ('item-1', 'item', 'EA', '9', 'TR', 1)"
        )
        db.execute(
            "INSERT INTO inventory_locations "
            "(location_id, item_id, department, status, quantity) "
            "VALUES ('loc-1', 'item-1', 'assembly', 'PRODUCTION', 5)"
        )
        db.commit()

    command.upgrade(_config(url), "head")

    with sqlite3.connect(path) as db:
        assert db.execute(
            "SELECT pending_quantity FROM inventory_locations WHERE location_id='loc-1'"
        ).fetchone() == (0,)
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(
                "UPDATE inventory_locations SET pending_quantity=-1 WHERE location_id='loc-1'"
            )
        with pytest.raises(sqlite3.IntegrityError):
            db.execute(
                "UPDATE inventory_locations SET pending_quantity=6 WHERE location_id='loc-1'"
            )


@pytest.mark.parametrize(
    "existing_constraint",
    [
        None,
        "ck_invloc_pending_nonneg",
        "ck_invloc_pending_le_quantity",
    ],
)
def test_inventory_location_pending_migration_repairs_partial_schema(
    tmp_path, existing_constraint
):
    path = tmp_path / f"location-pending-partial-{existing_constraint or 'none'}.db"
    url = f"sqlite:///{path.as_posix()}"
    command.upgrade(_config(url), "20260812_0018")
    engine = sa.create_engine(url)
    try:
        with engine.begin() as connection:
            migration_context = MigrationContext.configure(connection)
            operations = Operations(migration_context)
            with operations.batch_alter_table("inventory_locations") as batch_op:
                batch_op.add_column(
                    sa.Column(
                        "pending_quantity",
                        sa.Integer(),
                        nullable=False,
                        server_default="0",
                    )
                )
                if existing_constraint:
                    batch_op.create_check_constraint(
                        existing_constraint,
                        (
                            "pending_quantity >= 0"
                            if existing_constraint == "ck_invloc_pending_nonneg"
                            else "quantity >= pending_quantity"
                        ),
                    )
    finally:
        engine.dispose()

    command.upgrade(_config(url), "head")

    engine = sa.create_engine(url)
    try:
        inspector = sa.inspect(engine)
        assert "pending_quantity" in {
            column["name"]
            for column in inspector.get_columns("inventory_locations")
        }
        assert {
            constraint["name"]
            for constraint in inspector.get_check_constraints("inventory_locations")
        }.issuperset(
            {
                "ck_invloc_pending_nonneg",
                "ck_invloc_pending_le_quantity",
            }
        )
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
    assert "drop table model_pf_pins" in sql
    assert "ck_items_serial_no_positive" not in sql
    assert "printf" not in sql
    assert "pragma" not in sql
    assert "now()" in sql or "current_timestamp" in sql


def test_postgresql_shipping_enum_repair_replaces_default_around_type_change():
    output = io.StringIO()
    config = _config(
        "postgresql+psycopg2://migration-test:unused@invalid/migration-test",
        output_buffer=output,
    )

    command.upgrade(config, "20260807_0016", sql=True)

    sql = " ".join(output.getvalue().lower().split())
    drop_default = sql.index(
        "alter table shipping_requests alter column finalization_mode drop default"
    )
    change_type = sql.index(
        "alter table shipping_requests alter column finalization_mode type "
        "shipping_finalization_mode_enum"
    )
    restore_default = sql.index(
        "alter table shipping_requests alter column finalization_mode set default "
        "'keep_base'::shipping_finalization_mode_enum"
    )

    assert drop_default < change_type < restore_default


def test_postgresql_computed_normalization_preserves_semantic_grouping():
    left_grouped = _normalize_computed_sql(
        "(a + b) * c",
        "postgresql",
        discard_grouping_artifacts=True,
    )
    right_grouped = _normalize_computed_sql(
        "a + (b * c)",
        "postgresql",
        discard_grouping_artifacts=True,
    )

    assert left_grouped != right_grouped


def test_postgresql_mes_code_normalization_accepts_only_reflection_artifacts():
    expected = (
        "model_symbol || '-' || process_type_code || '-' || CASE "
        "WHEN serial_no < 10 THEN '000' || CAST(serial_no AS VARCHAR) "
        "WHEN serial_no < 100 THEN '00' || CAST(serial_no AS VARCHAR) "
        "WHEN serial_no < 1000 THEN '0' || CAST(serial_no AS VARCHAR) "
        "ELSE CAST(serial_no AS VARCHAR) END"
    )
    reflected = (
        "((((model_symbol)::text || '-'::text) || (process_type_code)::text) "
        "|| '-'::text) || (CASE WHEN (serial_no < 10) THEN "
        "(('000'::text || ((serial_no)::character varying)::text))::character varying "
        "WHEN (serial_no < 100) THEN "
        "(('00'::text || ((serial_no)::character varying)::text))::character varying "
        "WHEN (serial_no < 1000) THEN "
        "(('0'::text || ((serial_no)::character varying)::text))::character varying "
        "ELSE (serial_no)::character varying END)::text)"
    )
    changed = reflected.replace("'000'::text", "'999'::text")

    expected_normalized = _normalize_computed_sql(
        expected,
        "postgresql",
        discard_grouping_artifacts=True,
    )

    assert expected_normalized == _normalize_computed_sql(
        reflected,
        "postgresql",
        discard_grouping_artifacts=True,
    )
    assert expected_normalized != _normalize_computed_sql(
        changed,
        "postgresql",
        discard_grouping_artifacts=True,
    )


def test_postgresql_check_normalization_preserves_allowed_values():
    expected = "outcome IN ('success', 'failed', 'cancelled')"
    reflected = (
        "outcome::text = ANY (ARRAY['success'::character varying, "
        "'failed'::character varying, 'cancelled'::character varying]::text[])"
    )
    changed = reflected.replace("'cancelled'", "'ignored'")

    expected_normalized = _normalize_check_sql(expected, "postgresql")

    assert expected_normalized == _normalize_check_sql(reflected, "postgresql")
    assert expected_normalized != _normalize_check_sql(changed, "postgresql")


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
                assert schema_differences(connection) == ()

                connection.exec_driver_sql(
                    "ALTER TABLE notifications "
                    "ALTER COLUMN is_read SET DEFAULT TRUE"
                )
                default_differences = schema_differences(connection)
                assert any(
                    "modify_default" in difference
                    and "notifications" in difference
                    and "is_read" in difference
                    for difference in default_differences
                )
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
