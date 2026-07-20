from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config

from bootstrap.schema import BackupReceipt, ensure_schema


BACKEND_DIR = Path(__file__).resolve().parents[2]
MIGRATION_PATH = (
    BACKEND_DIR
    / "alembic"
    / "versions"
    / "20260720_0003_backfill_transaction_departments.py"
)
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def _load_migration():
    spec = importlib.util.spec_from_file_location("department_backfill", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _create_transaction_logs(connection: sa.Connection) -> None:
    connection.execute(
        sa.text(
            "CREATE TABLE transaction_logs ("
            "log_id TEXT PRIMARY KEY, transaction_type TEXT NOT NULL, "
            "department TEXT, operation_batch_id TEXT, "
            "inventory_effect JSON, notes TEXT)"
        )
    )


def _insert_log(
    connection: sa.Connection,
    *,
    log_id: str,
    transaction_type: str,
    effects: list[dict] | None,
    notes: str | None = None,
) -> None:
    connection.execute(
        sa.text(
            "INSERT INTO transaction_logs "
            "(log_id, transaction_type, department, operation_batch_id, "
            "inventory_effect, notes) "
            "VALUES (:log_id, :transaction_type, NULL, NULL, :effects, :notes)"
        ),
        {
            "log_id": log_id,
            "transaction_type": transaction_type,
            "effects": json.dumps(effects, ensure_ascii=False) if effects is not None else None,
            "notes": notes,
        },
    )


def test_upgrade_backfills_all_53_legacy_rows_from_evidence(tmp_path, monkeypatch):
    migration = _load_migration()
    monkeypatch.setattr(migration.context, "is_offline_mode", lambda: False)
    engine = sa.create_engine(f"sqlite:///{(tmp_path / 'legacy.db').as_posix()}")
    try:
        with engine.begin() as connection:
            _create_transaction_logs(connection)
            for index in range(2):
                _insert_log(
                    connection,
                    log_id=f"location-{index}",
                    transaction_type="PRODUCE",
                    effects=[
                        {
                            "scope": "location",
                            "department": "출하",
                            "delta": 1,
                        }
                    ],
                )
            for index in range(43):
                scopes = [{"scope": "warehouse", "delta": -1}]
                if index % 2:
                    scopes.append({"scope": "warehouse_box", "delta": 1})
                _insert_log(
                    connection,
                    log_id=f"warehouse-{index}",
                    transaction_type="BACKFLUSH",
                    effects=scopes,
                )
            for index in range(8):
                _insert_log(
                    connection,
                    log_id=f"external-{index}",
                    transaction_type="SUPPLIER_RETURN",
                    effects=None,
                    notes="요청 즉시 처리: SR / 창고 → 외부 / 1개",
                )

            monkeypatch.setattr(migration.op, "get_bind", lambda: connection)
            migration.upgrade()

            counts = dict(
                connection.execute(
                    sa.text(
                        "SELECT department, COUNT(*) FROM transaction_logs "
                        "GROUP BY department"
                    )
                ).all()
            )
            assert counts == {"창고": 51, "출하": 2}
    finally:
        engine.dispose()


def test_upgrade_fails_before_writing_when_any_row_has_no_evidence(
    tmp_path, monkeypatch
):
    migration = _load_migration()
    monkeypatch.setattr(migration.context, "is_offline_mode", lambda: False)
    engine = sa.create_engine(f"sqlite:///{(tmp_path / 'unresolved.db').as_posix()}")
    try:
        with engine.begin() as connection:
            _create_transaction_logs(connection)
            _insert_log(
                connection,
                log_id="resolvable",
                transaction_type="BACKFLUSH",
                effects=[{"scope": "warehouse", "delta": -1}],
            )
            _insert_log(
                connection,
                log_id="unresolved",
                transaction_type="DISASSEMBLE",
                effects=[
                    {"scope": "location", "department": "조립", "delta": -1},
                    {"scope": "location", "department": "진공", "delta": 1},
                ],
            )
            monkeypatch.setattr(migration.op, "get_bind", lambda: connection)

            with pytest.raises(RuntimeError, match="unresolved"):
                migration.upgrade()

            rows = connection.execute(
                sa.text("SELECT department FROM transaction_logs ORDER BY log_id")
            ).scalars().all()
            assert rows == [None, None]
    finally:
        engine.dispose()


def test_unversioned_onboarding_stamps_0002_then_runs_department_backfill(
    tmp_path,
):
    path = tmp_path / "unversioned.db"
    command.upgrade(_config(path), "20260720_0002")
    with sa.create_engine(f"sqlite:///{path.as_posix()}").begin() as connection:
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
                "VALUES ('item-1', 'legacy', 'EA', '9', 'TR', 1)"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO transaction_logs "
                "(log_id, item_id, transaction_type, quantity_change, inventory_effect) "
                "VALUES ('log-1', 'item-1', 'BACKFLUSH', -1, :effects)"
            ),
            {"effects": json.dumps([{"scope": "warehouse", "delta": -1}])},
        )
        connection.execute(sa.text("DROP TABLE alembic_version"))
        connection.execute(sa.text("DROP TABLE alembic_schema_state"))

    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    backup_path = tmp_path / "verified-backup.db"
    backup_path.touch()
    try:
        result = ensure_schema(
            engine=engine,
            backup_provider=lambda _connection: BackupReceipt(
                path=backup_path,
                verified=True,
            ),
        )
        with engine.connect() as connection:
            assert connection.scalar(
                sa.text(
                    "SELECT department FROM transaction_logs WHERE log_id='log-1'"
                )
            ) == "창고"
            assert connection.scalar(
                sa.text("SELECT version_num FROM alembic_version")
            ) == "20260720_0003"
        assert result.business_data_unchanged is True
    finally:
        engine.dispose()
