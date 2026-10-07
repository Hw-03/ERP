"""The grade removal preserves every remaining employee value and reference."""
from __future__ import annotations

import sqlite3
import io
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

BACKEND = Path(__file__).resolve().parents[2]


def test_remove_employee_level_preserves_rows_and_foreign_keys(tmp_path: Path) -> None:
    path = tmp_path / "grade-removal.db"
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    command.upgrade(config, "20260928_0038")
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA foreign_keys=ON")
        for index, grade in enumerate(("ADMIN", "MANAGER", "STAFF"), 1):
            db.execute(
                "INSERT INTO employees (employee_id, employee_code, name, role, department, level, "
                "display_order, is_active, pin_hash, warehouse_role, department_role, "
                "as_research_approver, theme) VALUES (?, ?, 'Employee', 'worker', 'assembly', ?, "
                "?, 'true', 'existing-pin-hash', ?, ?, ?, 'dark')",
                (str(index) * 32, f"LEVEL-{index}", grade, index,
                 "primary" if index == 2 else "none", "deputy" if index == 3 else "none", index == 3),
            )
        db.execute("INSERT INTO product_symbols (slot, symbol, model_name, is_reserved, is_finished_good) VALUES (1, '3', 'Model', 0, 1)")
        db.execute("INSERT INTO employee_assigned_models (employee_id, slot, priority) VALUES (?, 1, 0)", ("1" * 32,))
        db.execute("INSERT INTO process_types (code, prefix, suffix, stage_order) VALUES ('AR', 'A', 'R', 1)")
        db.execute("INSERT INTO items (item_id, item_name, unit, model_symbol, process_type_code, serial_no) VALUES (?, 'Material', 'EA', '3', 'AR', 1)", ("a" * 32,))
        db.execute("INSERT INTO inventory (inventory_id, item_id, quantity, warehouse_qty, pending_quantity, last_reserver_employee_id) VALUES (?, ?, 9, 9, 3, ?)", ("b" * 32, "a" * 32, "1" * 32))
        db.execute("INSERT INTO stock_requests (request_id, requester_employee_id, requester_name, requester_department, request_type, status, requires_warehouse_approval) VALUES (?, ?, 'Employee', 'assembly', 'WAREHOUSE_TO_DEPT', 'RESERVED', 1)", ("c" * 32, "1" * 32))
        db.execute("INSERT INTO stock_request_lines (line_id, request_id, item_id, item_name_snapshot, quantity, from_bucket, to_bucket, status) VALUES (?, ?, ?, 'Material', 3, 'WAREHOUSE', 'PRODUCTION', 'RESERVED')", ("d" * 32, "c" * 32, "a" * 32))
        columns = tuple(row[1] for row in db.execute("PRAGMA table_info(employees)") if row[1] != "level")
        selection = ", ".join(f'"{column}"' for column in columns)
        before = db.execute(f"SELECT {selection} FROM employees ORDER BY employee_id").fetchall()
        assigned = db.execute("SELECT * FROM employee_assigned_models").fetchall()
        preserved = {table: db.execute(f"SELECT * FROM {table}").fetchall() for table in ("inventory", "stock_requests", "stock_request_lines")}

    command.upgrade(config, "20261007_0039")
    with sqlite3.connect(path) as db:
        assert tuple(row[1] for row in db.execute("PRAGMA table_info(employees)")) == columns
        assert db.execute(f"SELECT {selection} FROM employees ORDER BY employee_id").fetchall() == before
        assert db.execute("SELECT * FROM employee_assigned_models").fetchall() == assigned
        for table, rows in preserved.items():
            assert db.execute(f"SELECT * FROM {table}").fetchall() == rows
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
    with pytest.raises(RuntimeError, match="backup"):
        command.downgrade(config, "20260928_0038")


def test_current_employee_contract_has_no_grade() -> None:
    from app.models import Employee
    from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse

    assert "level" not in Employee.__table__.columns
    for schema in (EmployeeCreate, EmployeeUpdate, EmployeeResponse):
        assert "level" not in schema.model_fields


def test_postgres_grade_removal_uses_restrict_and_native_drop() -> None:
    output = io.StringIO()
    config = Config(str(BACKEND / "alembic.ini"), output_buffer=output)
    config.set_main_option("sqlalchemy.url", "postgresql://migration:unused@localhost/isolated")
    command.upgrade(config, "20260928_0038:20261007_0039", sql=True)
    sql = output.getvalue()
    assert "ALTER TABLE employees DROP COLUMN level" in sql
    assert "DROP TYPE IF EXISTS employee_level_enum RESTRICT" in sql
    assert "CASCADE" not in sql
