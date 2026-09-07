"""불량 이동 원장 전환 기준선 데이터 마이그레이션 회귀 테스트."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
import sqlalchemy as sa


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_REVISION = "20260826_0029"
MIGRATION_REVISION = "20260903_0030"
CUTOVER = "2026-08-26T22:26:50.262415+00:00"

ITEM_ID = "1" * 32
NEGATIVE_ONLY_RECORD_ID = "2" * 32
PARTIAL_RECORD_ID = "3" * 32
POST_CUTOVER_RECORD_ID = "4" * 32
SOURCE_OPERATION_ID = "5" * 32
SOURCE_MOVEMENT_ID = "6" * 32
EXISTING_BASELINE_RECORD_ID = "7" * 32
BASELINE_OPERATION_ID = "8" * 32
BASELINE_MOVEMENT_ID = "9" * 32


def _config(database_path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path.as_posix()}")
    return config


def _seed_item(connection: sa.Connection) -> None:
    connection.execute(
        sa.text(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) "
            "VALUES ('VF', 'V', 'F', 1)"
        )
    )
    connection.execute(
        sa.text(
            "INSERT INTO items "
            "(item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
            "VALUES (:item_id, 'baseline item', 'EA', 'T', 'VF', 1)"
        ),
        {"item_id": ITEM_ID},
    )


def _seed_record(
    connection: sa.Connection,
    *,
    record_id: str,
    original: int,
    remaining: int,
    quarantined_at: str,
) -> None:
    connection.execute(
        sa.text(
            "INSERT INTO defect_quarantine_records "
            "(record_id, item_id, department, original_quantity, remaining_quantity, "
            "quarantined_at, quarantined_by_name, is_legacy) "
            "VALUES (:record_id, :item_id, '진공', :original, :remaining, "
            ":quarantined_at, 'migration test', 1)"
        ),
        {
            "record_id": record_id,
            "item_id": ITEM_ID,
            "original": original,
            "remaining": remaining,
            "quarantined_at": quarantined_at,
        },
    )


def _seed_negative_movement(connection: sa.Connection, *, quantity: int) -> None:
    connection.execute(
        sa.text(
            "INSERT INTO inventory_operations "
            "(operation_id, kind, domain, action, status, display_label, actor_name, "
            "effective_at, contract_version) "
            "VALUES (:operation_id, 'BUSINESS', 'stock_request', 'defect_disassemble', "
            "'COMMITTED', 'defect_disassemble', 'migration test', "
            "'2026-09-02 06:55:20', 1)"
        ),
        {"operation_id": SOURCE_OPERATION_ID},
    )
    connection.execute(
        sa.text(
            "INSERT INTO defect_inventory_movements "
            "(movement_id, operation_id, record_id, item_id, department, movement_type, "
            "quantity_delta, role, actor_name, effective_at) "
            "VALUES (:movement_id, :operation_id, :record_id, :item_id, '진공', "
            "'defect_disassemble', :quantity, 'DEFECTIVE_SOURCE', 'migration test', "
            "'2026-09-02 06:55:20')"
        ),
        {
            "movement_id": SOURCE_MOVEMENT_ID,
            "operation_id": SOURCE_OPERATION_ID,
            "record_id": NEGATIVE_ONLY_RECORD_ID,
            "item_id": ITEM_ID,
            "quantity": quantity,
        },
    )


def _seed_existing_baseline(connection: sa.Connection) -> None:
    connection.execute(
        sa.text(
            "INSERT INTO inventory_operations "
            "(operation_id, kind, domain, action, status, display_label, actor_name, "
            "idempotency_key, effective_at, contract_version) "
            "VALUES (:operation_id, 'BUSINESS', 'inventory_integrity', "
            "'defect_cutover_baseline', 'COMMITTED', 'baseline', 'migration test', "
            ":idempotency_key, '2026-08-26 22:26:50.262415', 1)"
        ),
        {
            "operation_id": BASELINE_OPERATION_ID,
            "idempotency_key": f"defect-cutover-baseline:{CUTOVER}",
        },
    )
    connection.execute(
        sa.text(
            "INSERT INTO defect_inventory_movements "
            "(movement_id, operation_id, record_id, item_id, department, movement_type, "
            "quantity_delta, role, actor_name, effective_at) "
            "VALUES (:movement_id, :operation_id, :record_id, :item_id, '진공', "
            "'CUTOVER_BASELINE', 4, 'OPENING_BALANCE', 'migration test', "
            "'2026-08-26 22:26:50.262415')"
        ),
        {
            "movement_id": BASELINE_MOVEMENT_ID,
            "operation_id": BASELINE_OPERATION_ID,
            "record_id": EXISTING_BASELINE_RECORD_ID,
            "item_id": ITEM_ID,
        },
    )


def _prepare(database_path: Path, *, with_cutover: bool = True) -> Config:
    config = _config(database_path)
    command.upgrade(config, PREVIOUS_REVISION)
    engine = sa.create_engine(f"sqlite:///{database_path.as_posix()}")
    with engine.begin() as connection:
        _seed_item(connection)
        if with_cutover:
            connection.execute(
                sa.text(
                    "INSERT INTO system_settings (setting_key, setting_value) "
                    "VALUES ('inventory_operation_cutover_at', :cutover)"
                ),
                {"cutover": CUTOVER},
            )
    return config


def test_migration_backfills_pre_cutover_opening_balances_without_business_changes(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "defect-baseline.db"
    config = _prepare(database_path)
    engine = sa.create_engine(f"sqlite:///{database_path.as_posix()}")
    with engine.begin() as connection:
        _seed_record(
            connection,
            record_id=NEGATIVE_ONLY_RECORD_ID,
            original=3,
            remaining=0,
            quarantined_at="2026-08-20 23:45:40",
        )
        _seed_record(
            connection,
            record_id=PARTIAL_RECORD_ID,
            original=5,
            remaining=2,
            quarantined_at="2026-08-24 05:44:46",
        )
        _seed_record(
            connection,
            record_id=POST_CUTOVER_RECORD_ID,
            original=2,
            remaining=2,
            quarantined_at="2026-08-27 23:45:40",
        )
        _seed_record(
            connection,
            record_id=EXISTING_BASELINE_RECORD_ID,
            original=4,
            remaining=4,
            quarantined_at="2026-08-22 23:45:40",
        )
        _seed_negative_movement(connection, quantity=-3)
        _seed_existing_baseline(connection)
        before_records = connection.execute(
            sa.text(
                "SELECT record_id, original_quantity, remaining_quantity, quarantined_at "
                "FROM defect_quarantine_records ORDER BY record_id"
            )
        ).all()
        before_transactions = connection.execute(
            sa.text("SELECT * FROM transaction_logs ORDER BY log_id")
        ).all()

    command.upgrade(config, MIGRATION_REVISION)

    with engine.connect() as connection:
        baselines = connection.execute(
            sa.text(
                "SELECT record_id, quantity_delta, movement_type, role "
                "FROM defect_inventory_movements "
                "WHERE movement_type = 'CUTOVER_BASELINE' ORDER BY record_id"
            )
        ).all()
        operation = connection.execute(
            sa.text(
                "SELECT domain, action, status, idempotency_key "
                "FROM inventory_operations "
                "WHERE action = 'defect_cutover_baseline'"
            )
        ).one()
        after_records = connection.execute(
            sa.text(
                "SELECT record_id, original_quantity, remaining_quantity, quarantined_at "
                "FROM defect_quarantine_records ORDER BY record_id"
            )
        ).all()
        after_transactions = connection.execute(
            sa.text("SELECT * FROM transaction_logs ORDER BY log_id")
        ).all()
        revision = connection.execute(
            sa.text("SELECT version_num FROM alembic_version")
        ).scalar_one()

    assert [tuple(row) for row in baselines] == [
        (NEGATIVE_ONLY_RECORD_ID, 3, "CUTOVER_BASELINE", "OPENING_BALANCE"),
        (PARTIAL_RECORD_ID, 2, "CUTOVER_BASELINE", "OPENING_BALANCE"),
        (EXISTING_BASELINE_RECORD_ID, 4, "CUTOVER_BASELINE", "OPENING_BALANCE"),
    ]
    assert tuple(operation) == (
        "inventory_integrity",
        "defect_cutover_baseline",
        "COMMITTED",
        f"defect-cutover-baseline:{CUTOVER}",
    )
    assert after_records == before_records
    assert after_transactions == before_transactions
    assert revision == MIGRATION_REVISION


def test_migration_is_noop_without_cutover_setting(tmp_path: Path) -> None:
    database_path = tmp_path / "defect-baseline-no-cutover.db"
    config = _prepare(database_path, with_cutover=False)
    engine = sa.create_engine(f"sqlite:///{database_path.as_posix()}")
    with engine.begin() as connection:
        _seed_record(
            connection,
            record_id=PARTIAL_RECORD_ID,
            original=5,
            remaining=2,
            quarantined_at="2026-08-24 05:44:46",
        )

    command.upgrade(config, MIGRATION_REVISION)

    with engine.connect() as connection:
        baseline_count = connection.execute(
            sa.text(
                "SELECT COUNT(*) FROM defect_inventory_movements "
                "WHERE movement_type = 'CUTOVER_BASELINE'"
            )
        ).scalar_one()
    assert baseline_count == 0


def test_migration_fails_closed_for_impossible_opening_balance(tmp_path: Path) -> None:
    database_path = tmp_path / "defect-baseline-invalid.db"
    config = _prepare(database_path)
    engine = sa.create_engine(f"sqlite:///{database_path.as_posix()}")
    with engine.begin() as connection:
        _seed_record(
            connection,
            record_id=NEGATIVE_ONLY_RECORD_ID,
            original=1,
            remaining=0,
            quarantined_at="2026-08-20 23:45:40",
        )
        _seed_negative_movement(connection, quantity=1)

    with pytest.raises(RuntimeError, match="opening balance"):
        command.upgrade(config, MIGRATION_REVISION)

    with engine.connect() as connection:
        baseline_count = connection.execute(
            sa.text(
                "SELECT COUNT(*) FROM defect_inventory_movements "
                "WHERE movement_type = 'CUTOVER_BASELINE'"
            )
        ).scalar_one()
    assert baseline_count == 0


def test_migration_downgrade_removes_only_generated_baselines(tmp_path: Path) -> None:
    database_path = tmp_path / "defect-baseline-downgrade.db"
    config = _prepare(database_path)
    engine = sa.create_engine(f"sqlite:///{database_path.as_posix()}")
    with engine.begin() as connection:
        _seed_record(
            connection,
            record_id=NEGATIVE_ONLY_RECORD_ID,
            original=3,
            remaining=0,
            quarantined_at="2026-08-20 23:45:40",
        )
        _seed_negative_movement(connection, quantity=-3)

    command.upgrade(config, MIGRATION_REVISION)
    command.downgrade(config, PREVIOUS_REVISION)

    with engine.connect() as connection:
        movements = connection.execute(
            sa.text(
                "SELECT movement_id, movement_type, quantity_delta "
                "FROM defect_inventory_movements ORDER BY movement_id"
            )
        ).all()
        generated_operation_count = connection.execute(
            sa.text(
                "SELECT COUNT(*) FROM inventory_operations "
                "WHERE action = 'defect_cutover_baseline'"
            )
        ).scalar_one()

    assert [tuple(row) for row in movements] == [
        (SOURCE_MOVEMENT_ID, "defect_disassemble", -3)
    ]
    assert generated_operation_count == 0
