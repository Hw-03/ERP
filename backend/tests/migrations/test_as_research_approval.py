"""AS·연구 사용출고 승인 필드 마이그레이션 회귀 테스트."""

from __future__ import annotations

import sqlite3
import uuid
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.orm import Session

from app.database import Base
from app.models import Employee
from bootstrap import seed as seed_module
from bootstrap.schema import ensure_schema


BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
PREVIOUS_REVISION = "20260910_0033"
MIGRATION_REVISION = "20260915_0034"


def _config(path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path.as_posix()}")
    return config


def test_migration_adds_fields_backfills_employee_codes_and_preserves_history(
    tmp_path: Path,
) -> None:
    path = tmp_path / "as-research-approval.db"
    config = _config(path)
    command.upgrade(config, PREVIOUS_REVISION)

    employee_ids = {code: uuid.uuid4().hex for code in ("E02", "E03", "E04")}
    request_id = uuid.uuid4().hex
    partial_batch_id = uuid.uuid4().hex
    partial_request_id = uuid.uuid4().hex
    item_id = uuid.uuid4().hex
    line_id = uuid.uuid4().hex
    notification_id = uuid.uuid4().hex
    with sqlite3.connect(path) as db:
        db.executemany(
            "INSERT INTO employees "
            "(employee_id, employee_code, name, role, department, level, display_order, is_active) "
            "VALUES (?, ?, ?, '직원', 'AS', 'STAFF', 0, 'true')",
            [
                (employee_id, code, f"동명이인-{code}")
                for code, employee_id in employee_ids.items()
            ],
        )
        db.execute(
            "INSERT INTO stock_requests "
            "(request_id, requester_employee_id, requester_name, requester_department, "
            "request_type, status, requires_warehouse_approval, requires_department_approval, "
            "approved_by_name, approved_at) "
            "VALUES (?, ?, '기존 요청자', 'AS', 'INTERNAL_USE', 'COMPLETED', 1, 0, "
            "'기존 창고 승인자', '2026-09-01 01:02:03')",
            (request_id, employee_ids["E04"]),
        )
        db.execute(
            "INSERT INTO io_batches "
            "(batch_id, work_type, sub_type, status, requester_employee_id, "
            "requester_name, requester_department, requires_approval) "
            "VALUES (?, 'internal_use', 'internal_use_out', 'partially_completed', ?, "
            "'기존 요청자', 'AS', 1)",
            (partial_batch_id, employee_ids["E04"]),
        )
        db.execute(
            "INSERT INTO stock_requests "
            "(request_id, requester_employee_id, requester_name, requester_department, "
            "request_type, status, requires_warehouse_approval, requires_department_approval, "
            "department_approved_by_name, department_approved_at, rejected_by_name, "
            "rejected_at, rejected_reason, operation_batch_id) "
            "VALUES (?, ?, '기존 요청자', 'AS', 'INTERNAL_USE', 'REJECTED', 0, 1, "
            "'기존 부서 승인자', '2026-09-02 01:02:03', '기존 반려자', "
            "'2026-09-02 02:03:04', '기존 반려', ?)",
            (partial_request_id, employee_ids["E04"], partial_batch_id),
        )
        db.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order) "
            "VALUES ('AR', 'A', 'R', 1)"
        )
        db.execute(
            "INSERT INTO items "
            "(item_id, item_name, unit, model_symbol, process_type_code, serial_no) "
            "VALUES (?, '기존 품목', 'EA', '3', 'AR', 1)",
            (item_id,),
        )
        db.execute(
            "INSERT INTO stock_request_lines "
            "(line_id, request_id, item_id, item_name_snapshot, quantity, "
            "from_bucket, to_bucket, status) "
            "VALUES (?, ?, ?, '기존 품목', 2, 'WAREHOUSE', 'PRODUCTION', 'COMPLETED')",
            (line_id, request_id, item_id),
        )
        db.execute(
            "UPDATE io_batches SET stock_request_id = ? WHERE batch_id = ?",
            (partial_request_id, partial_batch_id),
        )
        db.execute(
            "INSERT INTO notifications "
            "(notification_id, recipient_employee_id, type, title, related_request_id) "
            "VALUES (?, ?, 'approval_approved', '기존 알림', ?)",
            (notification_id, employee_ids["E04"], request_id),
        )
        line_before = db.execute(
            "SELECT * FROM stock_request_lines WHERE line_id = ?",
            (line_id,),
        ).fetchone()

    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys = ON")
            connection.commit()
            result = ensure_schema(connection=connection)
    finally:
        engine.dispose()

    with sqlite3.connect(path) as db:
        employee_columns = {row[1] for row in db.execute("PRAGMA table_info(employees)")}
        request_columns = {row[1] for row in db.execute("PRAGMA table_info(stock_requests)")}
        approvers = dict(
            db.execute(
                "SELECT employee_code, as_research_approver FROM employees ORDER BY employee_code"
            )
        )
        history = db.execute(
            "SELECT requires_as_research_approval, as_research_approved_by_employee_id, "
            "as_research_approved_by_name, as_research_approved_at, approved_by_name, approved_at "
            "FROM stock_requests WHERE request_id = ?",
            (request_id,),
        ).fetchone()
        partial_history = db.execute(
            "SELECT b.status, r.status, r.requires_as_research_approval, "
            "r.as_research_approved_at, r.department_approved_by_name, "
            "r.department_approved_at, r.rejected_by_name, r.rejected_at, r.rejected_reason "
            "FROM io_batches b JOIN stock_requests r ON r.operation_batch_id = b.batch_id "
            "WHERE b.batch_id = ?",
            (partial_batch_id,),
        ).fetchone()
        line_after = db.execute(
            "SELECT * FROM stock_request_lines WHERE line_id = ?",
            (line_id,),
        ).fetchone()
        batch_request_id = db.execute(
            "SELECT stock_request_id FROM io_batches WHERE batch_id = ?",
            (partial_batch_id,),
        ).fetchone()[0]
        notification_request_id = db.execute(
            "SELECT related_request_id FROM notifications WHERE notification_id = ?",
            (notification_id,),
        ).fetchone()[0]
        request_foreign_keys = {
            (row[3], row[2], row[4], row[6])
            for row in db.execute("PRAGMA foreign_key_list(stock_requests)")
        }
        foreign_key_violations = db.execute("PRAGMA foreign_key_check").fetchall()
        revision = db.execute("SELECT version_num FROM alembic_version").fetchone()[0]

    assert "as_research_approver" in employee_columns
    assert {
        "requires_as_research_approval",
        "as_research_approved_by_employee_id",
        "as_research_approved_by_name",
        "as_research_approved_at",
    } <= request_columns
    assert approvers == {"E02": 1, "E03": 1, "E04": 0}
    assert history == (0, None, None, None, "기존 창고 승인자", "2026-09-01 01:02:03")
    assert partial_history == (
        "partially_completed",
        "REJECTED",
        0,
        None,
        "기존 부서 승인자",
        "2026-09-02 01:02:03",
        "기존 반려자",
        "2026-09-02 02:03:04",
        "기존 반려",
    )
    assert line_after == line_before
    assert batch_request_id == partial_request_id
    assert notification_request_id == request_id
    assert (
        "as_research_approved_by_employee_id",
        "employees",
        "employee_id",
        "SET NULL",
    ) in request_foreign_keys
    assert foreign_key_violations == []
    assert result.revision == MIGRATION_REVISION
    assert revision == MIGRATION_REVISION


def test_fresh_bootstrap_seed_grants_special_permission_only_to_employee_codes(
    tmp_path: Path,
    monkeypatch,
) -> None:
    path = tmp_path / "fresh-seed.db"
    engine = sa.create_engine(f"sqlite:///{path.as_posix()}")
    Base.metadata.create_all(engine)
    monkeypatch.setattr(seed_module, "SessionLocal", lambda: Session(engine))

    seed_module.seed_reference_data()

    with Session(engine) as db:
        approvals = {
            employee.employee_code: employee.as_research_approver
            for employee in db.query(Employee).all()
        }
    assert approvals["E02"] is True
    assert approvals["E03"] is True
    assert all(
        enabled is False
        for code, enabled in approvals.items()
        if code not in {"E02", "E03"}
    )

    with Session(engine) as db:
        db.query(Employee).filter(Employee.employee_code == "E02").one().as_research_approver = False
        db.commit()
    seed_module.seed_reference_data()
    with Session(engine) as db:
        assert (
            db.query(Employee)
            .filter(Employee.employee_code == "E02")
            .one()
            .as_research_approver
            is False
        )
    engine.dispose()
