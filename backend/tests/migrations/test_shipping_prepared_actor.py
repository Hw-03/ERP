"""Shipping prepared-actor migration tests."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_HEAD = "20260727_0007"
MIGRATION_REVISION = "20260728_0009"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def test_prepared_actor_columns_start_null_and_preserve_shipping_dependents(tmp_path: Path) -> None:
    path = tmp_path / "shipping-prepared-actor.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_HEAD)

    with sqlite3.connect(path) as db:
        db.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) VALUES ('PF', 'P', 'F', 80)"
        )
        db.execute(
            """
            INSERT INTO items (
                item_id, item_name, unit, model_symbol, process_type_code, serial_no,
                sales_review_required
            ) VALUES ('pf-item', 'Prepared actor PF', 'EA', '4', 'PF', 1, FALSE)
            """
        )
        db.execute(
            """
            INSERT INTO employees (
                employee_id, employee_code, name, role, department, level,
                display_order, is_active
            ) VALUES ('actor-id', 'ACTOR-01', 'Prepared Actor', 'worker', '출하', 'STAFF', 0, 'true')
            """
        )
        db.execute(
            """
            INSERT INTO shipping_requests (
                request_id, status, base_pf_item_id, request_quantity, requested_by_name
            ) VALUES ('shipping-request', 'PREPARED', 'pf-item', 1, 'Original Requester')
            """
        )
        db.execute(
            """
            INSERT INTO shipping_request_events (event_id, request_id, event_type)
            VALUES ('shipping-event', 'shipping-request', 'PREPARED')
            """
        )
        db.execute(
            """
            INSERT INTO io_batches (
                batch_id, work_type, sub_type, status, requester_employee_id,
                requester_name, requester_department, requires_approval, shipping_request_id
            ) VALUES (
                'linked-batch', 'process', 'produce', 'completed', 'actor-id',
                'Prepared Actor', '출하', FALSE, 'shipping-request'
            )
            """
        )
        db.execute(
            """
            INSERT INTO transaction_logs (
                log_id, item_id, transaction_type, quantity_change,
                shipping_request_id, shipping_phase, inventory_effect
            ) VALUES (
                'shipping-log', 'pf-item', 'PRODUCE', 1,
                'shipping-request', 'PREPARE', '[]'
            )
            """
        )
        db.commit()

    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        columns = {row[1] for row in db.execute("PRAGMA table_info(shipping_requests)")}
        foreign_keys = list(db.execute("PRAGMA foreign_key_list(shipping_requests)"))
        prepared_actor = db.execute(
            """
            SELECT prepared_by_employee_id, prepared_by_name
            FROM shipping_requests WHERE request_id = 'shipping-request'
            """
        ).fetchone()
        event_request_id = db.execute(
            "SELECT request_id FROM shipping_request_events WHERE event_id = 'shipping-event'"
        ).fetchone()[0]
        batch_request_id = db.execute(
            "SELECT shipping_request_id FROM io_batches WHERE batch_id = 'linked-batch'"
        ).fetchone()[0]
        log_shipping_context = db.execute(
            """
            SELECT shipping_request_id, shipping_phase
            FROM transaction_logs WHERE log_id = 'shipping-log'
            """
        ).fetchone()

    assert {"prepared_by_employee_id", "prepared_by_name"} <= columns
    assert any(
        row[2] == "employees"
        and row[3] == "prepared_by_employee_id"
        and row[4] == "employee_id"
        and row[6].upper() == "SET NULL"
        for row in foreign_keys
    )
    assert prepared_actor == (None, None)
    assert event_request_id == "shipping-request"
    assert batch_request_id == "shipping-request"
    assert log_shipping_context == ("shipping-request", "PREPARE")


def test_prepared_actor_employee_delete_keeps_name_snapshot(tmp_path: Path) -> None:
    path = tmp_path / "shipping-prepared-actor-delete.db"
    config = _config(path)
    command.upgrade(config, MIGRATION_REVISION)

    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys = ON")
        db.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) VALUES ('PF', 'P', 'F', 80)"
        )
        db.execute(
            """
            INSERT INTO items (
                item_id, item_name, unit, model_symbol, process_type_code, serial_no,
                sales_review_required
            ) VALUES ('pf-item', 'Prepared actor PF', 'EA', '4', 'PF', 1, FALSE)
            """
        )
        db.execute(
            """
            INSERT INTO employees (
                employee_id, employee_code, name, role, department, level,
                display_order, is_active
            ) VALUES ('actor-id', 'ACTOR-01', 'Prepared Actor', 'worker', '출하', 'STAFF', 0, 'true')
            """
        )
        db.execute(
            """
            INSERT INTO shipping_requests (
                request_id, status, base_pf_item_id, prepared_by_employee_id, prepared_by_name
            ) VALUES ('shipping-request', 'PREPARED', 'pf-item', 'actor-id', 'Prepared Actor')
            """
        )
        db.execute("DELETE FROM employees WHERE employee_id = 'actor-id'")
        prepared_actor = db.execute(
            """
            SELECT prepared_by_employee_id, prepared_by_name
            FROM shipping_requests WHERE request_id = 'shipping-request'
            """
        ).fetchone()

    assert prepared_actor == (None, "Prepared Actor")
