"""불량 반품 공급업체 스냅샷 마이그레이션 회귀 테스트."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import event
from sqlalchemy.engine import Engine


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
REVISION = "20260922_0037"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def _upgrade_with_sqlite_foreign_keys(config: Config, revision: str) -> None:
    """FK가 켜진 실제 SQLite 배포 조건으로 revision을 실행한다."""
    def enable_foreign_keys(
        dbapi_connection: sqlite3.Connection,
        _connection_record: object,
    ) -> None:
        dbapi_connection.execute("PRAGMA foreign_keys = ON")

    event.listen(Engine, "connect", enable_foreign_keys)
    try:
        command.upgrade(config, revision)
    finally:
        event.remove(Engine, "connect", enable_foreign_keys)


def test_revision_adds_nullable_supplier_snapshots_without_changing_existing_rows(tmp_path: Path):
    path = tmp_path / "defect-return-suppliers.db"
    config = _config(path)
    command.upgrade(config, "20260921_0036")
    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) VALUES ('TR', 'T', 'R', 1)"
        )
        db.execute(
            "INSERT INTO items (item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
            "VALUES ('return-item', '기존 반품 품목', 'EA', '9', 'TR', 1)"
        )
        db.execute(
            "INSERT INTO employees (employee_id, employee_code, name, role, department, level, display_order, is_active) "
            "VALUES ('return-actor', 'RET-01', '반품 작업자', 'worker', '창고', 'STAFF', 0, TRUE)"
        )
        db.execute(
            "INSERT INTO stock_requests (request_id, requester_employee_id, requester_name, requester_department, "
            "request_type, status, requires_warehouse_approval) "
            "VALUES ('return-request', 'return-actor', '반품 작업자', '창고', 'DEFECT_RETURN', 'COMPLETED', 0)"
        )
        db.execute(
            "INSERT INTO stock_request_lines (line_id, request_id, item_id, item_name_snapshot, quantity, "
            "from_bucket, to_bucket, status) "
            "VALUES ('return-line', 'return-request', 'return-item', '기존 반품 품목', 1, "
            "'DEFECTIVE', 'NONE', 'COMPLETED')"
        )
        db.execute(
            "INSERT INTO io_batches (batch_id, work_type, sub_type, status, requester_employee_id, "
            "requester_name, requester_department, requires_approval, stock_request_id) "
            "VALUES ('return-batch', 'RECEIVE', 'RECEIVE_SUPPLIER', 'COMPLETED', 'return-actor', "
            "'반품 작업자', '창고', FALSE, 'return-request')"
        )
        db.execute(
            "INSERT INTO io_bundles (bundle_id, batch_id, source_kind, title_snapshot, quantity, expanded_level) "
            "VALUES ('return-bundle', 'return-batch', 'SINGLE', '기존 반품 품목', 1, 1)"
        )
        db.execute(
            "INSERT INTO io_lines (line_id, bundle_id, item_id, item_name_snapshot, unit, direction, "
            "from_bucket, to_bucket, quantity, included, origin, edited, has_children_snapshot, shortage) "
            "VALUES ('return-io-line', 'return-bundle', 'return-item', '기존 반품 품목', 'EA', 'OUT', "
            "'WAREHOUSE', 'NONE', 1, TRUE, 'MANUAL', FALSE, FALSE, 0)"
        )
        db.execute(
            "INSERT INTO transaction_logs (log_id, item_id, transaction_type, quantity_change, created_at, operation_line_id) "
            "VALUES ('return-log-parent', 'return-item', 'SUPPLIER_RETURN', -1, CURRENT_TIMESTAMP, 'return-io-line')"
        )
        db.execute(
            "INSERT INTO transaction_logs (log_id, item_id, transaction_type, quantity_change, created_at, reverses_log_id) "
            "VALUES ('return-log', 'return-item', 'SUPPLIER_RETURN', 1, CURRENT_TIMESTAMP, 'return-log-parent')"
        )
        db.execute(
            "INSERT INTO transaction_edit_logs (edit_id, original_log_id, edited_by_employee_id, edited_by_name, "
            "reason, before_payload, after_payload) "
            "VALUES ('return-edit', 'return-log', 'return-actor', '반품 작업자', '검증', '{}', '{}')"
        )

    _upgrade_with_sqlite_foreign_keys(config, REVISION)

    with sqlite3.connect(path) as db:
        request_columns = {row[1] for row in db.execute("PRAGMA table_info(stock_requests)")}
        log_columns = {row[1] for row in db.execute("PRAGMA table_info(transaction_logs)")}
        request = db.execute(
            "SELECT request_id, supplier_id, supplier_name_snapshot FROM stock_requests"
        ).fetchone()
        log = db.execute(
            "SELECT log_id, supplier_id, supplier_name_snapshot FROM transaction_logs"
            " WHERE log_id = 'return-log'"
        ).fetchone()
        reversal = db.execute(
            "SELECT log_id, reverses_log_id FROM transaction_logs WHERE log_id = 'return-log'"
        ).fetchone()
        line = db.execute(
            "SELECT line_id, request_id FROM stock_request_lines WHERE line_id = 'return-line'"
        ).fetchone()
        edit = db.execute(
            "SELECT edit_id, original_log_id FROM transaction_edit_logs WHERE edit_id = 'return-edit'"
        ).fetchone()
        foreign_key_errors = db.execute("PRAGMA foreign_key_check").fetchall()

    assert {"supplier_id", "supplier_name_snapshot"} <= request_columns
    assert {"supplier_id", "supplier_name_snapshot"} <= log_columns
    assert request == ("return-request", None, None)
    assert log == ("return-log", None, None)
    assert reversal == ("return-log", "return-log-parent")
    assert line == ("return-line", "return-request")
    assert edit == ("return-edit", "return-log")
    assert foreign_key_errors == []
