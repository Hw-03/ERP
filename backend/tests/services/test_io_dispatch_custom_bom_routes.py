"""커스텀 BOM 신규 방향과 기존 결재 요청의 의미 보존 회귀 테스트."""

from __future__ import annotations

from decimal import Decimal

from app.models import (
    DepartmentEnum,
    RequestBucketEnum,
    StockRequest,
    StockRequestStatusEnum,
    TransactionLog,
)
from app.services import io_dispatch as svc
from app.services.sr_execution import release_reservation
from tests.services.test_io_dispatch import (
    _build_batch,
    _issue_bom_auto_token,
    _loc_pending,
    _make_employee,
    _prod_qty,
)


def _request_endpoints(line) -> tuple[str, str | None, str, str | None]:
    return (
        line.from_bucket,
        line.from_department,
        line.to_bucket,
        line.to_department,
    )


def test_new_custom_produce_child_is_preserved_as_department_in(
    db_session, make_bom, make_item, make_location,
):
    parent = make_item(name="CUSTOM-PRODUCE-PARENT", process_type_code="AF")
    child = make_item(name="CUSTOM-PRODUCE-CHILD", process_type_code="AR")
    make_bom(parent.item_id, child.item_id, Decimal("1"))
    make_location(parent.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("0"))
    make_location(child.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("0"))
    requester = _make_employee(db_session, code="CUSTOM-PRODUCE-REQUESTER")
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="produce",
        to_department=DepartmentEnum.ASSEMBLY.value,
        source_item_id=parent.item_id,
        lines=[
            {
                "item_id": parent.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
                "quantity": Decimal("1"),
                "origin": "direct",
            },
            {
                "item_id": child.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": DepartmentEnum.ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": Decimal("2"),
                "origin": "bom_auto",
            },
        ],
    )
    child_line = next(line for line in batch.bundles[0].lines if line.origin == "bom_auto")
    _issue_bom_auto_token(db_session, batch, child_line)
    batch.notes = "custom produce child inbound"

    result = svc._execute_submission(db_session, requester=requester, batch=batch)

    request = db_session.query(StockRequest).one()
    assert result["requires_approval"] is True
    assert batch.status == "submitted"
    assert _request_endpoints(request.lines[0]) == (
        RequestBucketEnum.NONE,
        None,
        RequestBucketEnum.PRODUCTION,
        DepartmentEnum.ASSEMBLY.value,
    )
    assert _loc_pending(db_session, child.item_id) == Decimal("0")

    approver = _make_employee(
        db_session,
        code="CUSTOM-PRODUCE-APPROVER-NEW",
        department_role="primary",
    )
    request.department_approved_by_employee_id = approver.employee_id
    request.department_approved_by_name = approver.name
    release_reservation(db_session, request)
    svc.execute_batch_after_dept_approval(db_session, request=request, approver=approver)

    assert _prod_qty(db_session, child.item_id) == Decimal("2")
    assert [log.quantity_change for log in db_session.query(TransactionLog).all()] == [
        Decimal("2")
    ]


def test_new_custom_disassemble_child_is_preserved_as_department_out(
    db_session, make_bom, make_item, make_location,
):
    parent = make_item(name="CUSTOM-DISASSEMBLE-PARENT", process_type_code="AF")
    child = make_item(name="CUSTOM-DISASSEMBLE-CHILD", process_type_code="AR")
    make_bom(parent.item_id, child.item_id, Decimal("1"))
    make_location(parent.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("7"))
    make_location(child.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("5"))
    requester = _make_employee(db_session, code="CUSTOM-DISASSEMBLE-REQUESTER")
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="disassemble",
        to_department=DepartmentEnum.ASSEMBLY.value,
        source_item_id=parent.item_id,
        lines=[
            {
                "item_id": parent.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": DepartmentEnum.ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": Decimal("1"),
                "origin": "direct",
            },
            {
                "item_id": child.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
                "quantity": Decimal("2"),
                "origin": "bom_auto",
            },
        ],
    )
    child_line = next(line for line in batch.bundles[0].lines if line.origin == "bom_auto")
    _issue_bom_auto_token(db_session, batch, child_line)
    batch.notes = "custom disassemble child outbound"

    result = svc._execute_submission(db_session, requester=requester, batch=batch)

    request = db_session.query(StockRequest).one()
    assert result["requires_approval"] is True
    assert batch.status == "reserved"
    assert _request_endpoints(request.lines[0]) == (
        RequestBucketEnum.PRODUCTION,
        DepartmentEnum.ASSEMBLY.value,
        RequestBucketEnum.NONE,
        None,
    )
    assert _loc_pending(db_session, child.item_id) == Decimal("2")

    approver = _make_employee(
        db_session,
        code="CUSTOM-DISASSEMBLE-APPROVER-NEW",
        department_role="primary",
    )
    request.department_approved_by_employee_id = approver.employee_id
    request.department_approved_by_name = approver.name
    release_reservation(db_session, request)
    svc.execute_batch_after_dept_approval(db_session, request=request, approver=approver)

    assert _prod_qty(db_session, child.item_id) == Decimal("3")
    assert [log.quantity_change for log in db_session.query(TransactionLog).all()] == [
        Decimal("-2")
    ]


def test_legacy_submitted_disassemble_inbound_keeps_accepted_meaning(
    db_session, make_bom, make_item, make_location,
):
    parent = make_item(name="LEGACY-DISASSEMBLE-PARENT", process_type_code="AF")
    child = make_item(name="LEGACY-DISASSEMBLE-CHILD", process_type_code="AR")
    make_bom(parent.item_id, child.item_id, Decimal("1"))
    make_location(parent.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("7"))
    make_location(child.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("5"))
    requester = _make_employee(db_session, code="LEGACY-DISASSEMBLE-REQUESTER")
    batch = _build_batch(
        db_session,
        requester=requester,
        sub_type="disassemble",
        to_department=DepartmentEnum.ASSEMBLY.value,
        source_item_id=parent.item_id,
        lines=[
            {
                "item_id": parent.item_id,
                "direction": "out",
                "from_bucket": "production",
                "from_department": DepartmentEnum.ASSEMBLY.value,
                "to_bucket": "none",
                "quantity": Decimal("1"),
                "origin": "direct",
            },
            {
                "item_id": child.item_id,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
                "quantity": Decimal("2"),
                "origin": "bom_auto",
            },
        ],
    )
    child_line = next(line for line in batch.bundles[0].lines if line.origin == "bom_auto")
    _issue_bom_auto_token(db_session, batch, child_line)
    batch.notes = "legacy disassemble child inbound"
    svc._execute_submission(db_session, requester=requester, batch=batch)
    request = db_session.query(StockRequest).one()
    release_reservation(db_session, request)
    svc._normalize_automatic_batch_routes(db_session, batch)
    for request_line in request.lines:
        request_line.to_bucket = RequestBucketEnum.PRODUCTION
        request_line.to_department = request_line.from_department
        request_line.from_bucket = RequestBucketEnum.NONE
        request_line.from_department = None
    request.status = StockRequestStatusEnum.SUBMITTED

    svc.normalize_department_approval_routes(db_session, batch, [request])

    assert request.status == StockRequestStatusEnum.SUBMITTED
    assert _request_endpoints(request.lines[0]) == (
        RequestBucketEnum.NONE,
        None,
        RequestBucketEnum.PRODUCTION,
        DepartmentEnum.ASSEMBLY.value,
    )
    approver = _make_employee(
        db_session,
        code="LEGACY-DISASSEMBLE-APPROVER",
        department_role="primary",
    )
    request.department_approved_by_employee_id = approver.employee_id
    request.department_approved_by_name = approver.name
    svc.execute_batch_after_dept_approval(
        db_session,
        request=request,
        approver=approver,
    )

    assert batch.status == "completed"
    assert _prod_qty(db_session, child.item_id) == Decimal("7")
    assert [log.quantity_change for log in db_session.query(TransactionLog).all()] == [
        Decimal("2")
    ]
