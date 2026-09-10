"""실제 요청 승인 생명주기와 요청순 재고 투영의 통합 계약."""

from datetime import datetime, timedelta
from decimal import Decimal
import uuid

from app.models import (
    DepartmentEnum,
    Employee,
    IoBatch,
    StockRequest,
    RequestBucketEnum,
    TransactionLog,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.schemas import IoSubmitRequest
from app.routers.inventory._tx_filters import _history_request_date_expr
from app.services import io_actions, sr_approval, stock_requests
from app.services.pin_auth import DEFAULT_PIN_HASH
from app.services.request_order_stock import load_request_order_stock
from app.services.sr_validation import LineInput


def _employee(
    db_session,
    *,
    code: str,
    department: DepartmentEnum = DepartmentEnum.ASSEMBLY,
    warehouse_role: str = "none",
    department_role: str = "none",
) -> Employee:
    employee = Employee(
        employee_code=code,
        name=code,
        role="조립/사원",
        department=department,
        warehouse_role=warehouse_role,
        department_role=department_role,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def _warehouse_to_department_request(db_session, *, requester: Employee, item_id, quantity: int):
    return stock_requests.create_request(
        db_session,
        requester=requester,
        request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        lines_input=[
            LineInput(
                item_id=item_id,
                quantity=Decimal(quantity),
                from_bucket=RequestBucketEnum.WAREHOUSE,
                from_department=None,
                to_bucket=RequestBucketEnum.PRODUCTION,
                to_department=DepartmentEnum.ASSEMBLY.value,
            )
        ],
        reference_no=None,
        notes=None,
    )


def _internal_use_payload(requester: Employee, warehouse_item, department_item) -> IoSubmitRequest:
    bundles = []
    for item, bucket, department in (
        (warehouse_item, "warehouse", None),
        (department_item, "production", DepartmentEnum.HIGH_VOLTAGE.value),
    ):
        bundles.append({
            "bundle_id": str(uuid.uuid4()),
            "source_kind": "direct_item",
            "title": item.item_name,
            "source_item_id": str(item.item_id),
            "source_mes_code": item.mes_code,
            "quantity": 1,
            "lines": [{
                "line_id": str(uuid.uuid4()),
                "item_id": str(item.item_id),
                "item_name": item.item_name,
                "mes_code": item.mes_code,
                "unit": item.unit,
                "direction": "out",
                "from_bucket": bucket,
                "from_department": department,
                "to_bucket": "none",
                "to_department": DepartmentEnum.AS.value,
                "quantity": 1,
                "included": True,
                "origin": "direct",
            }],
        })
    return IoSubmitRequest(
        requester_employee_id=requester.employee_id,
        work_type="internal_use",
        sub_type="internal_use_out",
        to_department=DepartmentEnum.AS.value,
        bundles=bundles,
    )


def _approved_requests_in_reverse_order(db_session, make_item):
    item = make_item(name="요청순 승인 역전", process_type_code="AR", warehouse_qty=10)
    requester = _employee(db_session, code="ORDER-LIFECYCLE-REQ")
    approver = _employee(
        db_session,
        code="ORDER-LIFECYCLE-WH",
        warehouse_role="primary",
    )
    requested_at = datetime(2026, 9, 5, 3)
    older = _warehouse_to_department_request(
        db_session,
        requester=requester,
        item_id=item.item_id,
        quantity=3,
    )
    newer = _warehouse_to_department_request(
        db_session,
        requester=requester,
        item_id=item.item_id,
        quantity=2,
    )
    older.submitted_at = requested_at
    newer.submitted_at = requested_at + timedelta(days=1)
    db_session.flush()

    sr_approval.approve_request(db_session, newer, approver=approver, pin="0000")
    sr_approval.approve_request(db_session, older, approver=approver, pin="0000")
    db_session.flush()

    logs = db_session.query(TransactionLog).order_by(TransactionLog.created_at).all()
    assert [log.reference_no for log in logs] == [newer.request_code, older.request_code]
    return item, older, newer, logs


def test_reversed_next_day_approvals_project_in_original_request_order(
    db_session, make_item
) -> None:
    item, older, newer, logs = _approved_requests_in_reverse_order(
        db_session, make_item
    )
    projected = load_request_order_stock(
        db_session,
        {item.item_id},
        request_date_expr=_history_request_date_expr(),
    )
    older_stock = projected[next(log.log_id for log in logs if log.reference_no == older.request_code)]
    newer_stock = projected[next(log.log_id for log in logs if log.reference_no == newer.request_code)]

    assert (
        older_stock.warehouse_qty_before,
        older_stock.warehouse_qty_after,
        older_stock.department_qty_before,
        older_stock.department_qty_after,
    ) == (10, 7, 0, 3)
    assert (
        newer_stock.warehouse_qty_before,
        newer_stock.warehouse_qty_after,
        newer_stock.department_qty_before,
        newer_stock.department_qty_after,
    ) == (7, 5, 3, 5)


def test_batchless_requests_use_request_time_for_api_order_and_date_filter(
    client, db_session, make_item
) -> None:
    item, older, newer, logs = _approved_requests_in_reverse_order(
        db_session, make_item
    )
    log_by_reference = {log.reference_no: log for log in logs}

    response = client.get(
        "/api/inventory/transactions/display-groups",
        params={"item_id": str(item.item_id)},
    )
    assert response.status_code == 200, response.text
    rows = [log for group in response.json()["groups"] for log in group["logs"]]
    assert [row["log_id"] for row in rows] == [
        str(log_by_reference[newer.request_code].log_id),
        str(log_by_reference[older.request_code].log_id),
    ]

    filtered = client.get(
        "/api/inventory/transactions/display-groups",
        params={
            "item_id": str(item.item_id),
            "date_from": "2026-09-06",
            "date_to": "2026-09-06",
        },
    )
    assert filtered.status_code == 200, filtered.text
    filtered_rows = [
        log for group in filtered.json()["groups"] for log in group["logs"]
    ]
    assert [row["log_id"] for row in filtered_rows] == [
        str(log_by_reference[newer.request_code].log_id)
    ]


def test_partial_batch_projects_only_the_approved_source(
    db_session, make_item, make_location
) -> None:
    warehouse_item = make_item(
        name="부분 승인 창고 원본", process_type_code="AF", warehouse_qty=5
    )
    department_item = make_item(
        name="부분 반려 부서 원본", process_type_code="HF", warehouse_qty=0
    )
    make_location(
        department_item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        quantity=5,
    )
    requester = _employee(
        db_session,
        code="PARTIAL-LIFECYCLE-REQ",
        department=DepartmentEnum.AS,
    )
    warehouse_approver = _employee(
        db_session,
        code="PARTIAL-LIFECYCLE-WH",
        department=DepartmentEnum.WAREHOUSE,
        warehouse_role="primary",
    )
    department_approver = _employee(
        db_session,
        code="PARTIAL-LIFECYCLE-DEPT",
        department_role="primary",
    )
    submitted = io_actions.submit(
        db_session,
        _internal_use_payload(requester, warehouse_item, department_item),
        requester=requester,
    )
    batch = db_session.get(IoBatch, submitted["batch"]["batch_id"])
    requests = (
        db_session.query(StockRequest)
        .filter(StockRequest.operation_batch_id == batch.batch_id)
        .all()
    )
    warehouse_request = next(
        request for request in requests if request.requires_warehouse_approval
    )
    department_request = next(
        request for request in requests if request.requires_department_approval
    )
    expression = _history_request_date_expr()

    assert load_request_order_stock(
        db_session,
        {warehouse_item.item_id, department_item.item_id},
        request_date_expr=expression,
    ) == {}
    sr_approval.approve_request(
        db_session,
        warehouse_request,
        approver=warehouse_approver,
        pin="0000",
    )
    db_session.flush()

    assert batch.status == "partially_completed"
    logs = db_session.query(TransactionLog).all()
    assert [log.item_id for log in logs] == [warehouse_item.item_id]
    projected = load_request_order_stock(
        db_session,
        {warehouse_item.item_id, department_item.item_id},
        request_date_expr=expression,
    )
    assert set(projected) == {logs[0].log_id}
    assert (
        projected[logs[0].log_id].warehouse_qty_before,
        projected[logs[0].log_id].warehouse_qty_after,
    ) == (5, 4)

    sr_approval.reject_request_department(
        db_session,
        department_request,
        approver=department_approver,
        pin="0000",
        reason="부분 반려 검증",
    )
    db_session.flush()

    assert warehouse_request.status == StockRequestStatusEnum.COMPLETED
    assert department_request.status == StockRequestStatusEnum.REJECTED
    assert db_session.query(TransactionLog).count() == 1
    assert set(load_request_order_stock(
        db_session,
        {warehouse_item.item_id, department_item.item_id},
        request_date_expr=expression,
    )) == {logs[0].log_id}
