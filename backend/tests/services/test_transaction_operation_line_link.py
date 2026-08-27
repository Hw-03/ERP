"""TransactionLog 와 IoLine 영구 연결 회귀 테스트."""

from __future__ import annotations

import uuid
from decimal import Decimal

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    IoBatch,
    IoBundle,
    IoLine,
    RequestBucketEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import io_dispatch, sr_execution
from app.services.pin_auth import DEFAULT_PIN_HASH


def _employee(db_session) -> Employee:
    employee = Employee(
        employee_code="OP-LINK",
        name="연결테스터",
        role="조립/사원",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def _operation_line(db_session, *, employee: Employee, item_id: uuid.UUID) -> IoLine:
    batch = IoBatch(
        work_type="receive",
        sub_type="receive_supplier",
        status="submitted",
        requester_employee_id=employee.employee_id,
        requester_name=employee.name,
        requester_department=employee.department.value,
        requires_approval=False,
    )
    db_session.add(batch)
    db_session.flush()
    bundle = IoBundle(
        batch_id=batch.batch_id,
        source_kind="bom_parent",
        source_item_id=item_id,
        title_snapshot="연결 대상",
        quantity=Decimal("1"),
        expanded_level=1,
    )
    db_session.add(bundle)
    db_session.flush()
    line = IoLine(
        bundle_id=bundle.bundle_id,
        item_id=item_id,
        item_name_snapshot="연결 대상",
        unit="EA",
        direction="in",
        from_bucket="none",
        to_bucket="warehouse",
        quantity=Decimal("2"),
        included=True,
        origin="direct",
        edited=False,
        has_children_snapshot=False,
        shortage=0,
    )
    db_session.add(line)
    db_session.flush()
    return line


def test_immediate_dispatch_log_keeps_operation_line_id(db_session, make_item):
    item = make_item(name="즉시연결")
    employee = _employee(db_session)
    line = _operation_line(db_session, employee=employee, item_id=item.item_id)

    io_dispatch._apply_line(
        db_session,
        batch=line.bundle.batch,
        line=line,
        requester=employee,
    )
    db_session.flush()

    log = db_session.query(TransactionLog).filter_by(item_id=item.item_id).one()
    assert log.operation_line_id == line.line_id


def test_approved_request_log_keeps_operation_line_id(db_session, make_item):
    item = make_item(name="결재연결")
    employee = _employee(db_session)
    operation_line = _operation_line(db_session, employee=employee, item_id=item.item_id)
    request = StockRequest(
        request_code="SR-LINK",
        requester_employee_id=employee.employee_id,
        requester_name=employee.name,
        requester_department=employee.department.value,
        request_type=StockRequestTypeEnum.RAW_RECEIVE,
        status=StockRequestStatusEnum.SUBMITTED,
        requires_warehouse_approval=True,
        requires_department_approval=False,
    )
    db_session.add(request)
    db_session.flush()
    request_line = StockRequestLine(
        request_id=request.request_id,
        item_id=item.item_id,
        item_name_snapshot=item.item_name,
        quantity=Decimal("3"),
        from_bucket=RequestBucketEnum.NONE,
        to_bucket=RequestBucketEnum.WAREHOUSE,
        status=StockRequestStatusEnum.SUBMITTED,
        operation_line_id=operation_line.line_id,
    )
    db_session.add(request_line)
    db_session.flush()

    sr_execution._execute_line(
        db_session,
        request,
        request_line,
        approver=employee,
        is_approval=True,
    )
    db_session.flush()

    log = db_session.query(TransactionLog).filter_by(item_id=item.item_id).one()
    assert log.operation_line_id == operation_line.line_id


def test_transaction_list_exposes_operation_line_id(client, db_session, make_item):
    item = make_item(name="응답연결")
    employee = _employee(db_session)
    operation_line = _operation_line(db_session, employee=employee, item_id=item.item_id)
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("1"),
        operation_line_id=operation_line.line_id,
    )
    db_session.add(log)
    db_session.flush()

    response = client.get("/api/inventory/transactions")

    assert response.status_code == 200
    row = next(entry for entry in response.json() if entry["log_id"] == str(log.log_id))
    assert row["operation_line_id"] == str(operation_line.line_id)
