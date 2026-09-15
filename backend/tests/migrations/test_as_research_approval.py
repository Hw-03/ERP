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

    command.upgrade(config, MIGRATION_REVISION)

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
