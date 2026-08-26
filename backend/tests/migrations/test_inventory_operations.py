"""공통 재고 작업 원장 마이그레이션 회귀 테스트."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
import sqlalchemy as sa


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
MIGRATION_REVISION = "20260826_0029"


def _config(database_path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path.as_posix()}")
    return config


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
    assert revision == MIGRATION_REVISION


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
    assert revision == MIGRATION_REVISION
