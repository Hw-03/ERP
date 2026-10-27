"""출하 목록의 응답 계약과 요청 범위 일괄 조회 회귀."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum,
    Employee,
    InventoryOperation,
    InventoryOperationKindEnum,
    LocationStatusEnum,
    ShippingAllocation,
    ShippingFinalizationModeEnum,
    ShippingRequest,
    ShippingRequestBomLine,
    ShippingRequestChecklistLine,
    ShippingRequestCompanionLine,
    ShippingRequestEvent,
    ShippingRequestRevision,
    ShippingRequestStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.routers import shipping as shipping_router
from app.services import shipping as shipping_svc


@contextmanager
def _select_statements(db: Session) -> Iterator[list[str]]:
    """실제 DB 쿼리를 세어 identity map에 가려진 N+1도 잡는다."""
    statements: list[str] = []
    bind = db.get_bind()

    def capture(
        _connection: Any,
        _cursor: Any,
        statement: str,
        _parameters: Any,
        _context: Any,
        _executemany: bool,
    ) -> None:
        assert not statement.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")), statement
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(bind, "before_cursor_execute", capture)
    try:
        yield statements
    finally:
        event.remove(bind, "before_cursor_execute", capture)


def _add_request(
    db: Session,
    make_item: Callable[..., Any],
    make_location: Callable[..., Any],
    actor: Employee,
    index: int,
    status: ShippingRequestStatusEnum = ShippingRequestStatusEnum.PREPARING,
) -> uuid.UUID:
    """서로 다른 품목·관계·예약을 가진 요청을 만들어 조회 수 증가를 드러낸다."""
    instant = datetime(2026, 10, 27, 1)
    pa = make_item(name=f"bulk-pa-{index}", process_type_code="PA")
    pf = make_item(name=f"bulk-pf-{index}", process_type_code="PF")
    child = make_item(name=f"bulk-child-{index}", process_type_code="PR")
    exempt = make_item(name=f"bulk-exempt-{index}", process_type_code="PR")
    excluded = make_item(name=f"bulk-excluded-{index}", process_type_code="PR")
    child.deleted_at = instant
    exempt.bom_stock_exempt = True
    request = ShippingRequest(
        request_id=uuid.UUID(int=index + 1),
        status=status,
        base_pf_item_id=pf.item_id,
        final_pa_item_id=pa.item_id,
        final_pf_item_id=pf.item_id,
        reuse_pf_item_id=pf.item_id,
        finalization_mode=ShippingFinalizationModeEnum.REUSE_CANDIDATE,
        request_quantity=3,
        requested_by_name="bulk-reader",
        invoice_number=f"BULK-{index}",
        created_at=instant,
        updated_at=instant,
    )
    db.add(request)
    db.flush()
    request.bom_lines = [
        ShippingRequestBomLine(parent_stage="PA", child_item_id=child.item_id, quantity=2, sort_order=30),
        ShippingRequestBomLine(parent_stage="PF", child_item_id=pa.item_id, quantity=1, sort_order=10),
        ShippingRequestBomLine(parent_stage="PA", child_item_id=exempt.item_id, quantity=9, origin="DEFAULT", sort_order=20),
        ShippingRequestBomLine(parent_stage="PF", child_item_id=exempt.item_id, quantity=1, origin="CUSTOM", sort_order=40),
        ShippingRequestBomLine(parent_stage="PA", child_item_id=excluded.item_id, quantity=5, included=False, sort_order=50),
    ]
    request.companion_lines = [
        ShippingRequestCompanionLine(item_id=child.item_id, quantity=2, sort_order=20),
        ShippingRequestCompanionLine(item_id=exempt.item_id, quantity=1, sort_order=10),
    ]
    request.checklist_lines = [
        ShippingRequestChecklistLine(item_id=child.item_id, label_snapshot="second", quantity=2, checked=True, sort_order=20),
        ShippingRequestChecklistLine(item_id=pa.item_id, label_snapshot="first", quantity=3, checked=False, sort_order=10),
    ]
    request.events = [
        ShippingRequestEvent(event_type="CHANGED", message="later", created_at=instant + timedelta(seconds=1)),
        ShippingRequestEvent(event_type="CREATED", message="first", created_at=instant),
    ]
    request.allocations = [
        ShippingAllocation(item_id=pa.item_id, quantity=1, department=DepartmentEnum.SHIPPING.value, status="RESERVED", created_at=instant),
        ShippingAllocation(item_id=child.item_id, quantity=2, department=DepartmentEnum.SHIPPING.value, status="RESERVED", created_at=instant + timedelta(seconds=1)),
        ShippingAllocation(item_id=child.item_id, quantity=30, department=DepartmentEnum.ASSEMBLY.value, status="RESERVED", created_at=instant + timedelta(seconds=2)),
        ShippingAllocation(item_id=child.item_id, quantity=50, department=None, status="RESERVED", created_at=instant + timedelta(seconds=3)),
        ShippingAllocation(item_id=child.item_id, quantity=40, department=DepartmentEnum.SHIPPING.value, status="RELEASED", created_at=instant + timedelta(seconds=4)),
    ]
    for item, quantity in ((pa, 3), (child, 4)):
        location = make_location(item.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal(quantity))
        location.pending_quantity = 1
    make_location(child.item_id, department=DepartmentEnum.SHIPPING, status=LocationStatusEnum.DEFECTIVE, quantity=Decimal("90"))
    operation = InventoryOperation(
        kind=InventoryOperationKindEnum.BUSINESS,
        domain="shipping",
        action="prepare",
        display_label="prepare",
        actor_name=actor.name,
        effective_at=instant,
    )
    db.add(operation)
    db.flush()
    db.add(InventoryOperation(
        kind=InventoryOperationKindEnum.CANCELLATION,
        domain="shipping",
        action="cancel",
        display_label="cancel",
        actor_name=actor.name,
        reason="reversed reason",
        reverses_operation_id=operation.operation_id,
        effective_at=instant + timedelta(seconds=2),
    ))
    db.add_all([
        TransactionLog(
            item_id=child.item_id,
            shipping_request_id=request.request_id,
            operation_id=operation.operation_id,
            transaction_type=TransactionTypeEnum.PRODUCE,
            quantity_change=3,
            shipping_phase="PREPARE",
            cancelled=False,
            created_at=instant,
        ),
        TransactionLog(
            item_id=pa.item_id,
            shipping_request_id=request.request_id,
            transaction_type=TransactionTypeEnum.SHIP,
            quantity_change=-2,
            cancelled=True,
            cancel_reason="legacy cancellation",
            cancelled_at=instant,
            created_at=instant + timedelta(seconds=1),
        ),
    ])
    for offset, affects_preparation in ((0, True), (1, True), (2, False)):
        db.add(ShippingRequestRevision(
            request_id=request.request_id,
            edited_by_employee_id=actor.employee_id,
            edited_by_name=actor.name,
            summary=f"revision-{offset}",
            affects_preparation=affects_preparation,
            changes=[],
            created_at=instant + timedelta(seconds=offset),
        ))
    db.flush()
    return request.request_id


def _actor(db: Session) -> Employee:
    """요청 수정 이력의 실제 외래키를 준비한다."""
    actor = Employee(employee_code="BULK-READER", name="Bulk reader", role="worker", department=DepartmentEnum.SHIPPING.value)
    db.add(actor)
    db.flush()
    return actor


def _list_dump(db: Session, status: ShippingRequestStatusEnum | None = None) -> list[dict[str, Any]]:
    """API 응답과 같은 직렬화 값을 비교한다."""
    return [row.model_dump(mode="json") for row in shipping_router.list_requests(status_filter=status, db=db)]


def test_shipping_list_batches_independent_requests_and_items(
    db_session: Session, make_item: Callable[..., Any], make_location: Callable[..., Any],
) -> None:
    actor = _actor(db_session)
    _add_request(db_session, make_item, make_location, actor, 0)
    db_session.expunge_all()
    with _select_statements(db_session) as small_queries:
        small = _list_dump(db_session)
    actor = db_session.query(Employee).filter(Employee.employee_code == "BULK-READER").one()
    for index in range(1, 7):
        _add_request(db_session, make_item, make_location, actor, index)
    db_session.expunge_all()
    with _select_statements(db_session) as large_queries:
        large = _list_dump(db_session)

    assert len(small) == 1
    assert len(large) == 7
    assert len(large_queries) <= len(small_queries) + 2, (len(small_queries), len(large_queries))
    assert len(large_queries) <= 15, len(large_queries)


def test_shipping_list_matches_single_response_and_preserves_filters_and_order(
    db_session: Session, make_item: Callable[..., Any], make_location: Callable[..., Any],
) -> None:
    actor = _actor(db_session)
    ids = [_add_request(db_session, make_item, make_location, actor, index, status)
           for index, status in enumerate(ShippingRequestStatusEnum)]
    db_session.expunge_all()
    expected: dict[str, dict[str, Any]] = {}
    for request_id in ids:
        request = db_session.get(ShippingRequest, request_id)
        expected[str(request_id)] = shipping_router._to_response(db_session, request).model_dump(mode="json")
    db_session.expunge_all()

    default_rows = _list_dump(db_session)
    assert [row["request_id"] for row in default_rows] == [str(ids[2]), str(ids[1]), str(ids[0])]
    assert default_rows == [expected[str(request_id)] for request_id in (ids[2], ids[1], ids[0])]
    for status, request_id in zip(ShippingRequestStatusEnum, ids, strict=True):
        db_session.expunge_all()
        assert _list_dump(db_session, status) == [expected[str(request_id)]]

    preparing = expected[str(ids[0])]
    assert [(line["item_name"], line["required_quantity"], line["available_quantity"], line["shortage_quantity"])
            for line in preparing["stock_shortages"]] == [
        ("bulk-pa-0", 3, 1, 2),
        ("bulk-child-0", 8, 1, 7),
        ("bulk-exempt-0", 4, 0, 4),
    ]
    assert [line["item_name"] for line in preparing["companion_lines"]] == ["bulk-exempt-0", "bulk-child-0"]
    assert [line["item_name"] for line in preparing["checklist_lines"]] == ["bulk-pa-0", "bulk-child-0"]
    assert [line["event_type"] for line in preparing["events"]] == ["CREATED", "CHANGED"]
    assert preparing["latest_preparation_revision"]["summary"] == "revision-1"
    assert preparing["transactions"][0]["cancel_reason"] == "reversed reason"
    assert preparing["transactions"][0]["cancelled"] is True
    assert preparing["transactions"][1]["cancel_reason"] == "legacy cancellation"
    assert all(expected[str(request_id)]["stock_shortages"] == [] for request_id in ids[1:])


def test_shipping_list_keeps_request_quantities_separate_for_shared_reserved_cells(
    db_session: Session, make_item: Callable[..., Any], make_location: Callable[..., Any],
) -> None:
    actor = _actor(db_session)
    first_id = _add_request(db_session, make_item, make_location, actor, 0)
    second_id = _add_request(db_session, make_item, make_location, actor, 1)
    first = db_session.get(ShippingRequest, first_id)
    second = db_session.get(ShippingRequest, second_id)
    second.final_pa_item_id = first.final_pa_item_id
    second.final_pf_item_id = first.final_pf_item_id
    second.reuse_pf_item_id = first.final_pf_item_id
    second.request_quantity = 1
    second.bom_lines = [ShippingRequestBomLine(
        parent_stage=line.parent_stage,
        child_item_id=line.child_item_id,
        quantity=line.quantity,
        unit=line.unit,
        included=line.included,
        origin=line.origin,
        sort_order=line.sort_order,
    ) for line in first.bom_lines]
    second.companion_lines = [ShippingRequestCompanionLine(
        item_id=line.item_id,
        quantity=line.quantity,
        sort_order=line.sort_order,
    ) for line in first.companion_lines]
    second.allocations.append(ShippingAllocation(
        item_id=first.final_pa_item_id,
        quantity=2,
        department=DepartmentEnum.SHIPPING.value,
        status="RESERVED",
    ))
    db_session.flush()
    db_session.expunge_all()

    with _select_statements(db_session):
        rows = {row["request_id"]: row for row in _list_dump(db_session)}
    first_shortages = rows[str(first_id)]["stock_shortages"]
    second_shortages = rows[str(second_id)]["stock_shortages"]
    assert [(line["required_quantity"], line["available_quantity"], line["shortage_quantity"])
            for line in first_shortages] == [(3, -1, 4), (8, 1, 7), (4, 0, 4)]
    assert [(line["required_quantity"], line["available_quantity"], line["shortage_quantity"])
            for line in second_shortages] == [(1, -1, 2), (4, 1, 3), (2, 0, 2)]


def test_shipping_list_preserves_legacy_missing_final_item_response_timing(
    db_session: Session, make_item: Callable[..., Any], make_bom: Callable[..., Any],
) -> None:
    """누락 final의 기존 복구는 직렬화 말미에서만 실행되던 순서를 유지한다."""
    child = make_item(name="missing-final-child", process_type_code="PR")
    pa = make_item(name="missing-final-pa", process_type_code="PA")
    pf = make_item(name="missing-final-pf", process_type_code="PF")
    make_bom(pa.item_id, child.item_id, Decimal(1))
    make_bom(pf.item_id, pa.item_id, Decimal(1))
    request = shipping_svc.create_request(db_session, {"base_pf_item_id": pf.item_id})
    request_id = request.request_id
    request.final_pa_item_id = None
    request.final_pf_item_id = None
    request.updated_at = datetime(2026, 10, 27, 1)
    db_session.flush()
    db_session.expunge_all()
    request = db_session.get(ShippingRequest, request_id)
    expected = shipping_router._to_response(db_session, request).model_dump(mode="json")
    assert expected["final_pa_item_id"] is None
    assert expected["final_pf_item_id"] is None
    assert expected["stock_shortages"]

    request.final_pa_item_id = None
    request.final_pf_item_id = None
    request.updated_at = datetime(2026, 10, 27, 1)
    db_session.flush()
    db_session.expunge_all()
    assert _list_dump(db_session) == [expected]
