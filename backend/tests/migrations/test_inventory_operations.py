"""공통 재고 작업 원장 마이그레이션 회귀 테스트."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
import io
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
import pytest
import sqlalchemy as sa

from app.models.inventory_operation import InventoryOperationRoleEnum


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
POSTGRES_PREREQUISITE_REVISION = "20260807_0015"
PREVIOUS_REVISION = "20260825_0028"
MIGRATION_REVISION = "20260826_0029"
HEAD_REVISION = "20260827_0030"
ROLE_ENUM_NAME = "inventory_operation_role_enum"
ROLE_ENUM_LABELS = tuple(member.value for member in InventoryOperationRoleEnum)


def _config(database_path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path.as_posix()}")
    return config


def _upgrade_postgresql_to_0028(
    connection: sa.Connection,
    config: Config,
) -> None:
    """Apply the already-approved 0016 PostgreSQL prerequisite in test setup."""
    command.upgrade(config, POSTGRES_PREREQUISITE_REVISION)
    connection.exec_driver_sql(
        "ALTER TABLE shipping_requests ALTER COLUMN finalization_mode DROP DEFAULT"
    )
    command.upgrade(config, PREVIOUS_REVISION)
    connection.exec_driver_sql(
        "ALTER TABLE shipping_requests ALTER COLUMN finalization_mode "
        "SET DEFAULT 'KEEP_BASE'::shipping_finalization_mode_enum"
    )


@contextmanager
def _postgresql_migration() -> Iterator[tuple[sa.Connection, Config]]:
    database_url = os.environ["TEST_POSTGRES_URL"]
    engine = sa.create_engine(database_url)
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                config = Config(str(ALEMBIC_INI))
                config.set_main_option("sqlalchemy.url", database_url)
                config.attributes["connection"] = connection
                yield connection, config
            finally:
                transaction.rollback()
    finally:
        engine.dispose()


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행",
)
def test_postgresql_0028_to_0029_creates_operation_role_enum() -> None:
    with _postgresql_migration() as (connection, config):
        _upgrade_postgresql_to_0028(connection, config)

        command.upgrade(config, MIGRATION_REVISION)

        labels = connection.execute(
            sa.text(
                "SELECT enumlabel FROM pg_enum "
                "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                "JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace "
                f"WHERE pg_type.typname = '{ROLE_ENUM_NAME}' "
                "AND pg_namespace.nspname = current_schema() "
                "ORDER BY enumsortorder"
            )
        ).scalars().all()
        operation_role_type = connection.execute(
            sa.text(
                "SELECT udt_schema, udt_name FROM information_schema.columns "
                "WHERE table_schema = current_schema() "
                "AND table_name = 'transaction_logs' "
                "AND column_name = 'operation_role'"
            )
        ).one()
        revision = connection.execute(
            sa.text("SELECT version_num FROM alembic_version")
        ).scalar_one()
        expected_schema = connection.execute(
            sa.text("SELECT current_schema()")
        ).scalar_one()

        assert labels == list(ROLE_ENUM_LABELS)
        assert tuple(operation_role_type) == (
            expected_schema,
            ROLE_ENUM_NAME,
        )
        assert revision == MIGRATION_REVISION


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행",
)
def test_postgresql_rejects_preexisting_role_enum_with_wrong_labels() -> None:
    with _postgresql_migration() as (connection, config):
        _upgrade_postgresql_to_0028(connection, config)
        connection.exec_driver_sql(
            f"CREATE TYPE {ROLE_ENUM_NAME} AS ENUM ('PRIMARY')"
        )

        with pytest.raises(
            RuntimeError,
            match="does not match expected schema and labels",
        ):
            command.upgrade(config, MIGRATION_REVISION)


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행",
)
def test_postgresql_rejects_preexisting_role_enum_in_wrong_namespace() -> None:
    with _postgresql_migration() as (connection, config):
        _upgrade_postgresql_to_0028(connection, config)
        connection.exec_driver_sql("CREATE SCHEMA unexpected_operation_role")
        label_sql = ", ".join(f"'{label}'" for label in ROLE_ENUM_LABELS)
        connection.exec_driver_sql(
            f"CREATE TYPE unexpected_operation_role.{ROLE_ENUM_NAME} "
            f"AS ENUM ({label_sql})"
        )

        with pytest.raises(
            RuntimeError,
            match="does not match expected schema and labels",
        ):
            command.upgrade(config, MIGRATION_REVISION)


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행",
)
@pytest.mark.parametrize(
    "drift_sql",
    [
        f"ALTER TYPE {ROLE_ENUM_NAME} RENAME VALUE 'PRIMARY' TO 'UNEXPECTED'",
        (
            "CREATE SCHEMA unexpected_complete_role; "
            f"ALTER TYPE {ROLE_ENUM_NAME} SET SCHEMA unexpected_complete_role"
        ),
    ],
    ids=("labels", "namespace"),
)
def test_postgresql_complete_schema_revalidation_rejects_role_enum_drift(
    drift_sql: str,
) -> None:
    with _postgresql_migration() as (connection, config):
        _upgrade_postgresql_to_0028(connection, config)
        command.upgrade(config, MIGRATION_REVISION)
        command.stamp(config, PREVIOUS_REVISION)
        for statement in drift_sql.split("; "):
            connection.exec_driver_sql(statement)

        with pytest.raises(
            RuntimeError,
            match="does not match expected schema and labels",
        ):
            command.upgrade(config, MIGRATION_REVISION)


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행",
)
def test_postgresql_complete_schema_revalidation_rejects_role_column_type_drift() -> None:
    with _postgresql_migration() as (connection, config):
        _upgrade_postgresql_to_0028(connection, config)
        command.upgrade(config, MIGRATION_REVISION)
        command.stamp(config, PREVIOUS_REVISION)
        connection.exec_driver_sql(
            "ALTER TABLE transaction_logs ALTER COLUMN operation_role "
            "TYPE TEXT USING operation_role::text"
        )

        with pytest.raises(
            RuntimeError,
            match="transaction_logs.operation_role does not use",
        ):
            command.upgrade(config, MIGRATION_REVISION)


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행",
)
def test_postgresql_0028_to_0029_preserves_transaction_data_and_foreign_keys() -> None:
    with _postgresql_migration() as (connection, config):
        _upgrade_postgresql_to_0028(connection, config)
        item_id = "1" * 32
        log_id = "2" * 32
        connection.execute(
            sa.text(
                "INSERT INTO process_types (code, prefix, suffix, stage_order) "
                "VALUES ('PG', 'P', 'G', 1)"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO items "
                "(item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
                "VALUES (:item_id, 'postgres migration item', 'EA', 'P', 'PG', 1)"
            ),
            {"item_id": item_id},
        )
        connection.execute(
            sa.text(
                "INSERT INTO transaction_logs "
                "(log_id, item_id, transaction_type, quantity_change) "
                "VALUES (:log_id, :item_id, 'RECEIVE', 3)"
            ),
            {"log_id": log_id, "item_id": item_id},
        )
        before_foreign_keys = {
            (
                tuple(foreign_key["constrained_columns"]),
                foreign_key["referred_table"],
                tuple(foreign_key["referred_columns"]),
            )
            for foreign_key in sa.inspect(connection).get_foreign_keys(
                "transaction_logs"
            )
        }

        command.upgrade(config, MIGRATION_REVISION)

        row = connection.execute(
            sa.text(
                "SELECT log_id, item_id, transaction_type, quantity_change, "
                "operation_id, operation_role, reverses_log_id "
                "FROM transaction_logs WHERE log_id = :log_id"
            ),
            {"log_id": log_id},
        ).one()
        after_foreign_keys = {
            (
                tuple(foreign_key["constrained_columns"]),
                foreign_key["referred_table"],
                tuple(foreign_key["referred_columns"]),
            )
            for foreign_key in sa.inspect(connection).get_foreign_keys(
                "transaction_logs"
            )
        }

        assert tuple(row) == (log_id, item_id, "RECEIVE", 3, None, None, None)
        assert before_foreign_keys <= after_foreign_keys
        assert (
            ("operation_id",),
            "inventory_operations",
            ("operation_id",),
        ) in after_foreign_keys


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행",
)
def test_postgresql_0029_reuses_matching_preexisting_role_enum() -> None:
    with _postgresql_migration() as (connection, config):
        _upgrade_postgresql_to_0028(connection, config)
        label_sql = ", ".join(f"'{label}'" for label in ROLE_ENUM_LABELS)
        connection.exec_driver_sql(
            f"CREATE TYPE {ROLE_ENUM_NAME} AS ENUM ({label_sql})"
        )
        before_oid = connection.execute(
            sa.text(
                "SELECT pg_type.oid FROM pg_type "
                "JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace "
                f"WHERE pg_type.typname = '{ROLE_ENUM_NAME}' "
                "AND pg_namespace.nspname = current_schema()"
            )
        ).scalar_one()

        command.upgrade(config, MIGRATION_REVISION)

        after_oid = connection.execute(
            sa.text(
                "SELECT pg_type.oid FROM pg_type "
                "JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace "
                f"WHERE pg_type.typname = '{ROLE_ENUM_NAME}' "
                "AND pg_namespace.nspname = current_schema()"
            )
        ).scalar_one()
        assert after_oid == before_oid
        assert connection.execute(
            sa.text("SELECT version_num FROM alembic_version")
        ).scalar_one() == MIGRATION_REVISION


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL이 설정된 전용 PostgreSQL에서만 실행",
)
def test_postgresql_0029_failure_rolls_back_and_retry_succeeds() -> None:
    blocker_name = "ck_weekly_inventory_snapshots_normal_total_nonneg"
    with _postgresql_migration() as (connection, config):
        _upgrade_postgresql_to_0028(connection, config)
        schema_name = connection.execute(
            sa.text("SELECT current_schema()")
        ).scalar_one()
        qualified_enum_name = f"{schema_name}.{ROLE_ENUM_NAME}"
        qualified_operations_table = f"{schema_name}.inventory_operations"
        connection.exec_driver_sql(
            "ALTER TABLE weekly_inventory_snapshots "
            f"ADD CONSTRAINT {blocker_name} "
            "CHECK (total_quantity IS NULL OR total_quantity >= 0)"
        )

        savepoint = connection.begin_nested()
        with pytest.raises(sa.exc.DBAPIError) as exc_info:
            command.upgrade(config, MIGRATION_REVISION)
        savepoint.rollback()

        assert blocker_name in str(exc_info.value)
        assert connection.execute(
            sa.text("SELECT to_regtype(:qualified_enum_name)"),
            {"qualified_enum_name": qualified_enum_name},
        ).scalar_one_or_none() is None
        assert connection.execute(
            sa.text("SELECT to_regclass(:qualified_operations_table)"),
            {"qualified_operations_table": qualified_operations_table},
        ).scalar_one_or_none() is None
        assert connection.execute(
            sa.text(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_schema = current_schema() "
                "AND table_name = 'transaction_logs' "
                "AND column_name = 'operation_role'"
            )
        ).scalar_one() == 0
        assert connection.execute(
            sa.text("SELECT version_num FROM alembic_version")
        ).scalar_one() == PREVIOUS_REVISION

        connection.exec_driver_sql(
            "ALTER TABLE weekly_inventory_snapshots "
            f"DROP CONSTRAINT {blocker_name}"
        )
        command.upgrade(config, MIGRATION_REVISION)

        assert connection.execute(
            sa.text("SELECT to_regtype(:qualified_enum_name)"),
            {"qualified_enum_name": qualified_enum_name},
        ).scalar_one() == ROLE_ENUM_NAME
        assert connection.execute(
            sa.text("SELECT version_num FROM alembic_version")
        ).scalar_one() == MIGRATION_REVISION


def test_postgresql_offline_sql_preserves_inventory_operation_contract() -> None:
    output = io.StringIO()
    config = Config(str(ALEMBIC_INI), output_buffer=output)
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
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
    assert (
        "alter table transaction_logs add column operation_role "
        "inventory_operation_role_enum"
    ) in sql
    assert "select current_schema()" not in sql
    assert f"update alembic_version set version_num='{MIGRATION_REVISION.lower()}'" in sql


def test_alembic_has_single_head() -> None:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))

    assert len(ScriptDirectory.from_config(config).get_heads()) == 1


def test_inventory_operation_migration_adds_append_only_ledger_contract(tmp_path: Path) -> None:
    database_path = tmp_path / "operation-ledger.db"
    command.upgrade(_config(database_path), "head")

    engine = sa.create_engine(f"sqlite:///{database_path.as_posix()}")
    inspector = sa.inspect(engine)
    tables = set(inspector.get_table_names())
    assert {
        "inventory_operations",
        "inventory_operation_effects",
        "defect_inventory_movements",
    } <= tables

    transaction_columns = {
        column["name"]: column for column in inspector.get_columns("transaction_logs")
    }
    assert transaction_columns["operation_id"]["nullable"] is True
    assert transaction_columns["operation_role"]["nullable"] is True
    assert transaction_columns["reverses_log_id"]["nullable"] is True

    snapshot_columns = {
        column["name"] for column in inspector.get_columns("weekly_inventory_snapshots")
    }
    snapshot_item_columns = {
        column["name"] for column in inspector.get_columns("weekly_inventory_snapshot_items")
    }
    assert {"basis_version", "normal_total_quantity", "defective_total_quantity"} <= snapshot_columns
    assert {"normal_quantity", "defective_quantity"} <= snapshot_item_columns

    operation_uniques = {
        tuple(constraint["column_names"])
        for constraint in inspector.get_unique_constraints("inventory_operations")
    }
    assert ("idempotency_key",) in operation_uniques
    assert ("reverses_operation_id",) in operation_uniques

    with engine.connect() as connection:
        revision = connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one()
    assert revision == HEAD_REVISION


def test_inventory_operation_migration_preserves_0028_defect_dependents(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "operation-ledger-with-defect-dependents.db"
    config = _config(database_path)
    command.upgrade(config, "20260825_0028")

    engine = sa.create_engine(f"sqlite:///{database_path.as_posix()}")
    item_id = "1" * 32
    log_id = "2" * 32
    record_id = "3" * 32
    allocation_id = "4" * 32
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        connection.commit()
        with connection.begin():
            connection.execute(
                sa.text(
                    "INSERT INTO process_types (code, prefix, suffix, stage_order) "
                    "VALUES ('F', 'F', 'F', 1)"
                )
            )
            connection.execute(
                sa.text(
                    "INSERT INTO items "
                    "(item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
                    "VALUES (:item_id, 'migration item', 'EA', 'T', 'F', 1)"
                ),
                {"item_id": item_id},
            )
            connection.execute(
                sa.text(
                    "INSERT INTO transaction_logs "
                    "(log_id, item_id, transaction_type, quantity_change) "
                    "VALUES (:log_id, :item_id, 'UNMARK_DEFECTIVE', 0)"
                ),
                {"log_id": log_id, "item_id": item_id},
            )
            connection.execute(
                sa.text(
                    "INSERT INTO defect_quarantine_records "
                    "(record_id, item_id, department, original_quantity, remaining_quantity) "
                    "VALUES (:record_id, :item_id, '고압', 1, 0)"
                ),
                {"record_id": record_id, "item_id": item_id},
            )
            connection.execute(
                sa.text(
                    "INSERT INTO defect_quarantine_reconstruction_allocations "
                    "(allocation_id, transaction_log_id, record_id, quantity) "
                    "VALUES (:allocation_id, :log_id, :record_id, 1)"
                ),
                {
                    "allocation_id": allocation_id,
                    "log_id": log_id,
                    "record_id": record_id,
                },
            )

        config.attributes["connection"] = connection
        command.upgrade(config, "head")

        allocation = connection.execute(
            sa.text(
                "SELECT transaction_log_id, record_id, quantity "
                "FROM defect_quarantine_reconstruction_allocations "
                "WHERE allocation_id = :allocation_id"
            ),
            {"allocation_id": allocation_id},
        ).one()
        violations = connection.exec_driver_sql("PRAGMA foreign_key_check").all()
        revision = connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one()

    assert tuple(allocation) == (log_id, record_id, 1)
    assert violations == []
    assert revision == HEAD_REVISION


def test_inventory_operation_migration_preserves_handover_lines(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "operation-ledger-with-handover-lines.db"
    config = _config(database_path)
    command.upgrade(config, "20260825_0028")

    engine = sa.create_engine(f"sqlite:///{database_path.as_posix()}")
    employee_id = "1" * 32
    item_id = "2" * 32
    handover_id = "3" * 32
    line_id = "4" * 32
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        connection.commit()
        with connection.begin():
            connection.execute(
                sa.text(
                    "INSERT INTO employees "
                    "(employee_id, employee_code, name, role, department, level, "
                    "warehouse_role, display_order, is_active) "
                    "VALUES (:employee_id, 'E-MIGRATION', 'migration employee', "
                    "'test', 'test', 'member', 'none', 1, 'true')"
                ),
                {"employee_id": employee_id},
            )
            connection.execute(
                sa.text(
                    "INSERT INTO process_types (code, prefix, suffix, stage_order) "
                    "VALUES ('F', 'F', 'F', 1)"
                )
            )
            connection.execute(
                sa.text(
                    "INSERT INTO items "
                    "(item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
                    "VALUES (:item_id, 'migration item', 'EA', 'T', 'F', 1)"
                ),
                {"item_id": item_id},
            )
            connection.execute(
                sa.text(
                    "INSERT INTO handovers "
                    "(handover_id, status, author_employee_id, author_name, "
                    "from_department, to_department, title) "
                    "VALUES (:handover_id, 'DRAFT', :employee_id, "
                    "'migration employee', 'test', 'warehouse', 'migration handover')"
                ),
                {"handover_id": handover_id, "employee_id": employee_id},
            )
            connection.execute(
                sa.text(
                    "INSERT INTO handover_lines "
                    "(line_id, handover_id, item_id, item_name_snapshot, "
                    "mes_code_snapshot, quantity) "
                    "VALUES (:line_id, :handover_id, :item_id, "
                    "'migration item', '1-F-0001', 7)"
                ),
                {"line_id": line_id, "handover_id": handover_id, "item_id": item_id},
            )
        before = connection.execute(
            sa.text(
                "SELECT line_id, handover_id, item_id, item_name_snapshot, "
                "mes_code_snapshot, quantity FROM handover_lines"
            )
        ).all()

        config.attributes["connection"] = connection
        command.upgrade(config, "head")

        after = connection.execute(
            sa.text(
                "SELECT line_id, handover_id, item_id, item_name_snapshot, "
                "mes_code_snapshot, quantity FROM handover_lines"
            )
        ).all()
        cancellation = connection.execute(
            sa.text(
                "SELECT cancelled_by_employee_id, cancelled_by_name, cancelled_at "
                "FROM handovers WHERE handover_id = :handover_id"
            ),
            {"handover_id": handover_id},
        ).one()
        violations = connection.exec_driver_sql("PRAGMA foreign_key_check").all()

    assert after == before
    assert tuple(cancellation) == (None, None, None)
    assert violations == []


def test_inventory_operation_migration_preserves_weekly_snapshot_items(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "operation-ledger-with-weekly-snapshot-items.db"
    config = _config(database_path)
    command.upgrade(config, "20260825_0028")

    engine = sa.create_engine(f"sqlite:///{database_path.as_posix()}")
    snapshot_id = "5" * 32
    snapshot_item_id = "6" * 32
    item_id = "7" * 32
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        connection.commit()
        with connection.begin():
            connection.execute(
                sa.text(
                    "INSERT INTO weekly_inventory_snapshots "
                    "(snapshot_id, week_end, as_of_utc, capture_source, item_count, total_quantity) "
                    "VALUES (:snapshot_id, '2026-08-23', '2026-08-23 23:59:59', "
                    "'migration-test', 1, 11)"
                ),
                {"snapshot_id": snapshot_id},
            )
            connection.execute(
                sa.text(
                    "INSERT INTO weekly_inventory_snapshot_items "
                    "(snapshot_item_id, snapshot_id, item_id, mes_code, item_name, "
                    "process_type_code, quantity) "
                    "VALUES (:snapshot_item_id, :snapshot_id, :item_id, "
                    "'1-F-0001', 'migration item', 'F', 11)"
                ),
                {
                    "snapshot_item_id": snapshot_item_id,
                    "snapshot_id": snapshot_id,
                    "item_id": item_id,
                },
            )
        before = connection.execute(
            sa.text(
                "SELECT snapshot_item_id, snapshot_id, item_id, mes_code, "
                "item_name, process_type_code, quantity "
                "FROM weekly_inventory_snapshot_items"
            )
        ).all()

        config.attributes["connection"] = connection
        command.upgrade(config, "head")

        after = connection.execute(
            sa.text(
                "SELECT snapshot_item_id, snapshot_id, item_id, mes_code, "
                "item_name, process_type_code, quantity "
                "FROM weekly_inventory_snapshot_items"
            )
        ).all()
        parent_values = connection.execute(
            sa.text(
                "SELECT basis_version, normal_total_quantity, defective_total_quantity "
                "FROM weekly_inventory_snapshots WHERE snapshot_id = :snapshot_id"
            ),
            {"snapshot_id": snapshot_id},
        ).one()
        child_values = connection.execute(
            sa.text(
                "SELECT normal_quantity, defective_quantity "
                "FROM weekly_inventory_snapshot_items "
                "WHERE snapshot_item_id = :snapshot_item_id"
            ),
            {"snapshot_item_id": snapshot_item_id},
        ).one()
        violations = connection.exec_driver_sql("PRAGMA foreign_key_check").all()

    assert after == before
    assert tuple(parent_values) == (1, None, None)
    assert tuple(child_values) == (None, None)
    assert violations == []
