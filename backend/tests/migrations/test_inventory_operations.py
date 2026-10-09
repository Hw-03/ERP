"""공통 재고 작업 원장 마이그레이션 회귀 테스트."""

from __future__ import annotations

import io
import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
import sqlalchemy as sa

from app.models.inventory_operation import InventoryOperationRoleEnum


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
HEAD_REVISION = "20261008_0044"


def _config(database_path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path.as_posix()}")
    return config


def test_postgresql_operation_role_offline_creates_enum_before_column() -> None:
    """Standalone enum column additions need native CREATE TYPE in generated SQL."""
    output = io.StringIO()
    config = Config(str(ALEMBIC_INI), output_buffer=output)
    config.set_main_option("sqlalchemy.url", "postgresql://migration:unused@localhost/isolated")
    command.upgrade(config, "20260825_0028:20260826_0029", sql=True)
    sql = output.getvalue().lower()
    assert sql.index("create type inventory_operation_role_enum") < sql.index(
        "add column operation_role inventory_operation_role_enum"
    )


@pytest.mark.skipif(not os.getenv("TEST_POSTGRES_URL"), reason="Requires isolated TEST_POSTGRES_URL")
@pytest.mark.parametrize("enum_exists", [False, True])
def test_postgresql_operation_role_upgrade_creates_or_reuses_enum(
    enum_exists: bool,
    postgres_migration_schema_connection: tuple[sa.Connection, str],
) -> None:
    """Preserve a legacy transaction while creating or reusing the native role type."""
    connection, _schema = postgres_migration_schema_connection
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", os.environ["TEST_POSTGRES_URL"])
    config.attributes["connection"] = connection
    command.upgrade(config, "20260825_0028")
    if enum_exists:
        sa.Enum(InventoryOperationRoleEnum, name="inventory_operation_role_enum").create(connection)
    connection.execute(sa.text(
        "INSERT INTO process_types (code, prefix, suffix, stage_order) VALUES ('F', 'F', 'F', 1)"
    ))
    connection.execute(sa.text(
        "INSERT INTO items (item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
        "VALUES ('item', 'migration item', 'EA', 'T', 'F', 1)"
    ))
    connection.execute(sa.text(
        "INSERT INTO transaction_logs (log_id, item_id, transaction_type, quantity_change) "
        "VALUES ('log', 'item', 'UNMARK_DEFECTIVE', 0)"
    ))
    old_values = sa.text("SELECT log_id, item_id, transaction_type::text, quantity_change, created_at FROM transaction_logs")
    before = connection.execute(old_values).all()
    command.upgrade(config, "20260826_0029")
    assert connection.execute(old_values).all() == before
    assert connection.scalar(sa.text("SELECT operation_role FROM transaction_logs")) is None
    connection.execute(sa.text("UPDATE transaction_logs SET operation_role = 'PRIMARY'"))
    assert connection.scalar(sa.text("SELECT operation_role::text FROM transaction_logs")) == "PRIMARY"
    columns = {c["name"]: c for c in sa.inspect(connection).get_columns("transaction_logs")}
    assert columns["operation_role"]["nullable"] is True
    assert columns["operation_role"]["type"].enums == [role.value for role in InventoryOperationRoleEnum]


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
