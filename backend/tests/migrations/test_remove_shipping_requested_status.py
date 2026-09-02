"""출하 REQUESTED 상태 제거 마이그레이션 회귀 테스트."""

from __future__ import annotations

import importlib.util
import io
import os
import sqlite3
from pathlib import Path
from types import SimpleNamespace

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from bootstrap.schema import ensure_schema


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
MIGRATION_PATH = (
    BACKEND_DIR
    / "alembic"
    / "versions"
    / "20260821_0024_remove_shipping_requested_status.py"
)
PREVIOUS_REVISION = "20260820_0023"
MIGRATION_REVISION = "20260821_0024"
HEAD_REVISION = "20260831_0033"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def _load_migration():
    spec = importlib.util.spec_from_file_location(
        "remove_shipping_requested_status",
        MIGRATION_PATH,
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _prepare_postgresql_0023_shipping_schema(
    connection: sa.Connection,
    config: Config,
) -> None:
    """Create the exact shipping-status contract consumed by revision 0024."""
    connection.exec_driver_sql(
        "CREATE TYPE shipping_request_status_enum AS ENUM "
        "('REQUESTED', 'PREPARING', 'PREPARED', 'PICKED_UP', 'CANCELLED')"
    )
    connection.exec_driver_sql(
        "CREATE TABLE shipping_requests ("
        "request_id TEXT PRIMARY KEY, "
        "status shipping_request_status_enum NOT NULL DEFAULT 'REQUESTED'"
        ")"
    )
    connection.exec_driver_sql(
        "CREATE INDEX ix_shipping_requests_status ON shipping_requests (status)"
    )
    command.stamp(config, PREVIOUS_REVISION)


def _seed_shipping_dependents(db: sqlite3.Connection) -> None:
    db.execute("PRAGMA foreign_keys = ON")
    db.execute(
        "INSERT INTO process_types (code, prefix, suffix, stage_order) "
        "VALUES ('PF', 'P', 'F', 1)"
    )
    db.executemany(
        "INSERT INTO items "
        "(item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
        "VALUES (?, ?, 'EA', '9', 'PF', ?)",
        [
            ("pf-item", "PF 품목", 1),
            ("child-item", "자식 품목", 2),
        ],
    )
    db.executemany(
        "INSERT INTO inventory "
        "(inventory_id, item_id, quantity, warehouse_qty, pending_quantity) "
        "VALUES (?, ?, 0, 0, 0)",
        [
            ("pf-inventory", "pf-item"),
            ("child-inventory", "child-item"),
        ],
    )
    db.execute(
        "INSERT INTO employees "
        "(employee_id, employee_code, name, role, department, level, "
        "display_order, is_active) "
        "VALUES ('actor-id', 'ACTOR-01', '작업자', 'worker', '출하', "
        "'STAFF', 0, TRUE)"
    )
    db.executemany(
        "INSERT INTO shipping_requests "
        "(request_id, status, base_pf_item_id) VALUES (?, ?, 'pf-item')",
        [
            ("requested-row", "REQUESTED"),
            ("preparing-row", "PREPARING"),
            ("prepared-row", "PREPARED"),
            ("picked-up-row", "PICKED_UP"),
            ("cancelled-row", "CANCELLED"),
        ],
    )
    db.execute(
        "INSERT INTO shipping_request_bom_lines "
        "(line_id, request_id, parent_stage, child_item_id, quantity, unit, "
        "included, origin, sort_order) "
        "VALUES ('bom-line', 'requested-row', 'PF', 'child-item', 1, 'EA', 1, 'CUSTOM', 0)"
    )
    db.execute(
        "INSERT INTO shipping_request_companion_lines "
        "(line_id, request_id, item_id, quantity, unit, sort_order) "
        "VALUES ('companion-line', 'requested-row', 'child-item', 1, 'EA', 0)"
    )
    db.execute(
        "INSERT INTO shipping_allocations "
        "(allocation_id, request_id, item_id, quantity, unit, status) "
        "VALUES ('allocation', 'requested-row', 'child-item', 1, 'EA', 'RESERVED')"
    )
    db.execute(
        "INSERT INTO shipping_request_checklist_lines "
        "(line_id, request_id, item_id, label_snapshot, quantity, checked, sort_order) "
        "VALUES ('checklist-line', 'requested-row', 'child-item', '자식 품목', 1, 1, 0)"
    )
    db.execute(
        "INSERT INTO shipping_request_events "
        "(event_id, request_id, event_type, message) "
        "VALUES ('event', 'requested-row', 'REQUEST_CREATED', '기존 이벤트')"
    )
    db.execute(
        "INSERT INTO shipping_request_revisions "
        "(revision_id, request_id, edited_by_employee_id, edited_by_name, "
        "summary, affects_preparation, changes) "
        "VALUES ('revision', 'requested-row', 'actor-id', '작업자', "
        "'기존 수정', 1, '[]')"
    )
    db.execute(
        "INSERT INTO io_batches "
        "(batch_id, work_type, sub_type, status, requester_employee_id, "
        "requester_name, requester_department, requires_approval, shipping_request_id) "
        "VALUES ('io-batch', 'process', 'produce', 'completed', 'actor-id', "
        "'작업자', '출하', 0, 'requested-row')"
    )
    db.execute(
        "INSERT INTO transaction_logs "
        "(log_id, item_id, transaction_type, quantity_change, shipping_request_id) "
        "VALUES ('transaction-log', 'child-item', 'PRODUCE', 1, 'requested-row')"
    )
    db.execute(
        "INSERT INTO io_bundles "
        "(bundle_id, batch_id, source_kind, source_item_id, title_snapshot, "
        "quantity, expanded_level) "
        "VALUES ('io-bundle', 'io-batch', 'item', 'child-item', '기존 묶음', 1, 1)"
    )
    db.execute(
        "INSERT INTO io_lines "
        "(line_id, bundle_id, item_id, item_name_snapshot, unit, direction, "
        "from_bucket, to_bucket, quantity, bom_stock_exempt, included, selected, "
        "origin, edited, has_children_snapshot, shortage) "
        "VALUES ('io-line', 'io-bundle', 'child-item', '자식 품목', 'EA', 'out', "
        "'production', 'none', 1, 0, 1, 1, 'manual', 0, 0, 0)"
    )
    db.execute(
        "INSERT INTO transaction_edit_logs "
        "(edit_id, original_log_id, edited_by_employee_id, edited_by_name, "
        "reason, before_payload, after_payload) "
        "VALUES ('transaction-edit', 'transaction-log', 'actor-id', '작업자', "
        "'기존 수정', '{}', '{}')"
    )


def test_upgrade_converts_requested_rows_and_changes_status_default(tmp_path: Path) -> None:
    path = tmp_path / "remove-shipping-requested.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) "
            "VALUES ('PF', 'P', 'F', 1)"
        )
        db.execute(
            "INSERT INTO items "
            "(item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
            "VALUES ('pf-item', 'PF 품목', 'EA', '9', 'PF', 1)"
        )
        db.executemany(
            "INSERT INTO shipping_requests "
            "(request_id, status, base_pf_item_id) VALUES (?, ?, 'pf-item')",
            [
                ("requested-row", "REQUESTED"),
                ("preparing-row", "PREPARING"),
                ("prepared-row", "PREPARED"),
                ("picked-up-row", "PICKED_UP"),
                ("cancelled-row", "CANCELLED"),
            ],
        )

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        statuses = db.execute(
            "SELECT status FROM shipping_requests ORDER BY request_id"
        ).fetchall()
        status_column = next(
            row for row in db.execute("PRAGMA table_info(shipping_requests)")
            if row[1] == "status"
        )
        db.execute(
            "INSERT INTO shipping_requests (request_id, base_pf_item_id) "
            "VALUES ('default-row', 'pf-item')"
        )
        default_status = db.execute(
            "SELECT status FROM shipping_requests WHERE request_id = 'default-row'"
        ).fetchone()
        requested_count = db.execute(
            "SELECT COUNT(*) FROM shipping_requests WHERE status = 'REQUESTED'"
        ).fetchone()
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()

    assert statuses == [
        ("CANCELLED",),
        ("PICKED_UP",),
        ("PREPARED",),
        ("PREPARING",),
        ("PREPARING",),
    ]
    assert str(status_column[4]).strip("'\"") == "PREPARING"
    assert default_status == ("PREPARING",)
    assert requested_count == (0,)
    assert revision == (MIGRATION_REVISION,)


def test_ensure_schema_with_foreign_keys_preserves_all_shipping_dependents(
    tmp_path: Path,
) -> None:
    path = tmp_path / "shipping-dependents.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)
    with sqlite3.connect(path) as db:
        _seed_shipping_dependents(db)
        dependent_tables = (
            "shipping_request_bom_lines",
            "shipping_request_companion_lines",
            "shipping_allocations",
            "shipping_request_checklist_lines",
            "shipping_request_events",
            "shipping_request_revisions",
            "io_batches",
            "io_bundles",
            "io_lines",
            "transaction_logs",
            "transaction_edit_logs",
        )
        dependent_columns = {
            table_name: tuple(
                row[1] for row in db.execute(f"PRAGMA table_info({table_name})")
            )
            for table_name in dependent_tables
        }
        before_dependents = {
            table_name: db.execute(
                f'SELECT {", ".join(dependent_columns[table_name])} '
                f"FROM {table_name} ORDER BY 1"
            ).fetchall()
            for table_name in dependent_tables
        }

    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys = ON")
            connection.commit()
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
            connection.commit()

            result = ensure_schema(connection=connection)

            assert result.revision == HEAD_REVISION
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
    finally:
        engine.dispose()

    with sqlite3.connect(path) as db:
        statuses = dict(
            db.execute("SELECT request_id, status FROM shipping_requests").fetchall()
        )
        after_dependents = {
            table_name: db.execute(
                f'SELECT {", ".join(dependent_columns[table_name])} '
                f"FROM {table_name} ORDER BY 1"
            ).fetchall()
            for table_name in dependent_tables
        }
        io_link = db.execute(
            "SELECT shipping_request_id FROM io_batches WHERE batch_id = 'io-batch'"
        ).fetchone()
        transaction_link = db.execute(
            "SELECT shipping_request_id FROM transaction_logs "
            "WHERE log_id = 'transaction-log'"
        ).fetchone()
        foreign_key_errors = db.execute("PRAGMA foreign_key_check").fetchall()

    assert statuses == {
        "requested-row": "PREPARING",
        "preparing-row": "PREPARING",
        "prepared-row": "PREPARED",
        "picked-up-row": "PICKED_UP",
        "cancelled-row": "CANCELLED",
    }
    assert after_dependents == before_dependents
    assert io_link == ("requested-row",)
    assert transaction_link == ("requested-row",)
    assert foreign_key_errors == []


def test_migration_declares_valid_employee_auto_deploy_policy(tmp_path: Path) -> None:
    migration = _load_migration()
    policy = migration.EMPLOYEE_AUTO_DEPLOY_POLICY
    path = tmp_path / "policy.db"

    with sqlite3.connect(path) as db:
        db.execute(
            "CREATE TABLE shipping_requests "
            "(request_id TEXT PRIMARY KEY, status TEXT NOT NULL)"
        )
        db.execute(
            "INSERT INTO shipping_requests VALUES ('preparing-row', 'PREPARING')"
        )
        actual = db.execute(policy["validator_sql"]).fetchone()[0]

    assert policy["kind"] == "data-change"
    assert policy["allowed_tables"] == ["shipping_requests"]
    assert actual == policy["validator_expected"] == 0


def test_postgresql_offline_sql_changes_shipping_status_default() -> None:
    output = io.StringIO()
    config = Config(str(ALEMBIC_INI), output_buffer=output)
    config.set_main_option(
        "sqlalchemy.url",
        "postgresql+psycopg2://migration-test:unused@invalid/migration-test",
    )

    command.upgrade(
        config,
        f"{PREVIOUS_REVISION}:{MIGRATION_REVISION}",
        sql=True,
    )

    sql = " ".join(output.getvalue().lower().split())
    ordered_markers = (
        "do $$ declare expected_columns integer",
        "update shipping_requests set status = 'preparing'",
        "alter table shipping_requests alter column status drop default",
        "create type shipping_request_status_enum_0024 as enum",
        "alter table shipping_requests alter column status type shipping_request_status_enum_0024",
        "using status::text::shipping_request_status_enum_0024",
        "drop type shipping_request_status_enum",
        "alter type shipping_request_status_enum_0024 rename to shipping_request_status_enum",
        "alter table shipping_requests alter column status set default 'preparing'::shipping_request_status_enum",
    )
    positions = [sql.index(marker) for marker in ordered_markers]
    assert positions == sorted(positions)
    for label in ("preparing", "prepared", "picked_up", "cancelled"):
        assert f"'{label}'" in sql
    assert "'requested'" not in sql[positions[3] : positions[4]]
    assert "pg_attribute" in sql
    assert "dependent_columns" in sql


def test_postgresql_online_branch_uses_the_complete_enum_replacement_sequence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    migration = _load_migration()
    statements = migration._postgresql_enum_replacement_statements()
    executed: list[str] = []

    monkeypatch.setattr(
        migration.context,
        "get_context",
        lambda: SimpleNamespace(dialect=SimpleNamespace(name="postgresql")),
    )
    monkeypatch.setattr(migration.context, "is_offline_mode", lambda: False)
    monkeypatch.setattr(migration.op, "execute", executed.append)

    migration.upgrade()

    assert executed == list(statements)


def test_postgresql_enum_dependency_queries_only_scan_tables() -> None:
    migration = _load_migration()
    dependency_guard = " ".join(
        migration._postgresql_enum_replacement_statements()[0].lower().split()
    )

    assert dependency_guard.count("relation.relkind in ('r', 'p')") == 2


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행",
)
def test_postgresql_online_upgrade_ignores_status_index_attributes() -> None:
    engine = sa.create_engine(os.environ["TEST_POSTGRES_URL"])
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                config = Config(str(ALEMBIC_INI))
                config.set_main_option("sqlalchemy.url", os.environ["TEST_POSTGRES_URL"])
                config.attributes["connection"] = connection
                _prepare_postgresql_0023_shipping_schema(connection, config)

                status_index_kind = connection.execute(
                    sa.text(
                        "SELECT relation.relkind "
                        "FROM pg_attribute AS attribute "
                        "JOIN pg_class AS relation ON relation.oid = attribute.attrelid "
                        "WHERE relation.relname = 'ix_shipping_requests_status' "
                        "AND attribute.attname = 'status'"
                    )
                ).scalar_one()
                assert status_index_kind == "i"

                command.upgrade(config, MIGRATION_REVISION)
                revision = connection.execute(
                    sa.text("SELECT version_num FROM alembic_version")
                ).scalar_one()
                assert revision == MIGRATION_REVISION
            finally:
                transaction.rollback()
    finally:
        engine.dispose()


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행",
)
@pytest.mark.parametrize(
    ("relation_sql", "expected_relation"),
    [
        (
            "CREATE TABLE unexpected_shipping_status_table "
            "(status shipping_request_status_enum NOT NULL)",
            "public.unexpected_shipping_status_table.status",
        ),
        (
            "CREATE TABLE unexpected_shipping_status_partitioned "
            "(status shipping_request_status_enum NOT NULL) "
            "PARTITION BY LIST (status)",
            "public.unexpected_shipping_status_partitioned.status",
        ),
    ],
    ids=("table", "partitioned-table"),
)
def test_postgresql_dependency_guard_rejects_unexpected_enum_table_columns(
    relation_sql: str,
    expected_relation: str,
) -> None:
    engine = sa.create_engine(os.environ["TEST_POSTGRES_URL"])
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                config = Config(str(ALEMBIC_INI))
                config.set_main_option("sqlalchemy.url", os.environ["TEST_POSTGRES_URL"])
                config.attributes["connection"] = connection
                _prepare_postgresql_0023_shipping_schema(connection, config)
                connection.execute(sa.text(relation_sql))

                with pytest.raises(sa.exc.DBAPIError) as exc_info:
                    command.upgrade(config, MIGRATION_REVISION)

                error_message = str(exc_info.value)
                assert expected_relation in error_message
                assert "ix_shipping_requests_status" not in error_message
            finally:
                transaction.rollback()
    finally:
        engine.dispose()


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행",
)
def test_postgresql_online_upgrade_has_only_supported_shipping_status_labels() -> None:
    engine = sa.create_engine(os.environ["TEST_POSTGRES_URL"])
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                config = Config(str(ALEMBIC_INI))
                config.set_main_option("sqlalchemy.url", os.environ["TEST_POSTGRES_URL"])
                config.attributes["connection"] = connection
                command.upgrade(config, "head")
                labels = connection.execute(
                    sa.text(
                        "SELECT enumlabel FROM pg_enum "
                        "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                        "WHERE pg_type.typname = 'shipping_request_status_enum' "
                        "ORDER BY enumsortorder"
                    )
                ).scalars().all()
                assert labels == [
                    "PREPARING",
                    "PREPARED",
                    "PICKED_UP",
                    "CANCELLED",
                ]
            finally:
                transaction.rollback()
    finally:
        engine.dispose()


def test_sqlite_offline_migration_fails_before_emitting_partial_upgrade() -> None:
    output = io.StringIO()
    config = Config(str(ALEMBIC_INI), output_buffer=output)
    config.set_main_option("sqlalchemy.url", "sqlite:///offline-not-used.db")

    with pytest.raises(RuntimeError, match="online"):
        command.upgrade(
            config,
            f"{PREVIOUS_REVISION}:{MIGRATION_REVISION}",
            sql=True,
        )

    sql = output.getvalue().lower()
    assert "update shipping_requests" not in sql
    assert "update alembic_version" not in sql


def test_downgrade_is_rejected_because_requested_meaning_cannot_be_restored() -> None:
    migration = _load_migration()

    with pytest.raises(RuntimeError, match="복원"):
        migration.downgrade()
