"""IO 제출 application service의 트랜잭션 경계 회귀 테스트."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.models import (
    BoxSizeEnum,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    InventoryOperation,
    IoBatch,
    IoLine,
    Notification,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
)
from app.schemas import IoSubmitRequest
from app.services import io_actions as actions
from app.services import io_dispatch, io_draft, io_persist
from app.services import sr_execution
from app.services import warehouse_map as warehouse_map_svc
from app.services.pin_auth import DEFAULT_PIN_HASH

def _make_requester(
    db_session,
    *,
    department: DepartmentEnum = DepartmentEnum.WAREHOUSE,
    warehouse_role: str = "primary",
    department_role: str = "none",
    as_research_approver: bool = False,
    level: EmployeeLevelEnum = EmployeeLevelEnum.STAFF,
) -> Employee:
    requester = Employee(
        employee_code=f"IO-ACT-{uuid.uuid4().hex[:8]}",
        name="IO 원자성 작업자",
        role="창고/사원",
        department=department,
        level=level,
        warehouse_role=warehouse_role,
        department_role=department_role,
        as_research_approver=as_research_approver,
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(requester)
    db_session.flush()
    return requester


def _add_tracked_box(db_session, item_id: uuid.UUID, quantity: int) -> None:
    angle = WarehouseAngle(
        label=f"IO 원자성 {uuid.uuid4().hex[:6]}",
        rows=1,
        layers=1,
        jaris_per_cell=1,
        display_order=0,
        is_active=True,
    )
    db_session.add(angle)
    db_session.flush()
    box = WarehouseBox(
        angle_id=angle.id,
        row_no=1,
        layer_no=1,
        jari_index=0,
        size=BoxSizeEnum.SMALL,
        stack_order=0,
    )
    db_session.add(box)
    db_session.flush()
    db_session.add(
        WarehouseBoxItem(box_id=box.box_id, item_id=item_id, quantity=quantity)
    )
    db_session.flush()


def _internal_use_payload(requester: Employee, items: list) -> IoSubmitRequest:
    bundles = []
    for item in items:
        bundles.append(
            {
                "bundle_id": str(uuid.uuid4()),
                "source_kind": "direct_item",
                "title": item.item_name,
                "source_item_id": str(item.item_id),
                "source_mes_code": item.mes_code,
                "quantity": 1,
                "lines": [
                    {
                        "line_id": str(uuid.uuid4()),
                        "item_id": str(item.item_id),
                        "item_name": item.item_name,
                        "mes_code": item.mes_code,
                        "unit": item.unit,
                        "direction": "out",
                        "from_bucket": "warehouse",
                        "to_bucket": "none",
                        "to_department": DepartmentEnum.AS.value,
                        "quantity": 1,
                        "included": True,
                        "origin": "direct",
                    }
                ],
            }
        )
    return IoSubmitRequest(
        requester_employee_id=requester.employee_id,
        work_type="internal_use",
        sub_type="internal_use_out",
        to_department=DepartmentEnum.AS.value,
        bundles=bundles,
    )


def _use_department_source(payload: IoSubmitRequest, department: str) -> None:
    for bundle in payload.bundles:
        for line in bundle.lines:
            line.from_bucket = "production"
            line.from_department = department


def _count_session_boundaries(db_session, monkeypatch):
    calls = {"commit": 0, "rollback": 0}
    original_commit = db_session.commit
    original_rollback = db_session.rollback

    def counted_commit():
        calls["commit"] += 1
        return original_commit()

    def counted_rollback():
        calls["rollback"] += 1
        return original_rollback()

    monkeypatch.setattr(db_session, "commit", counted_commit)
    monkeypatch.setattr(db_session, "rollback", counted_rollback)
    return calls


def test_save_internal_use_draft_accepts_server_derived_department_source(
    db_session, make_item
):
    item = make_item(name="고압 부서 원본", process_type_code="HF")
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    payload = _internal_use_payload(requester, [item])
    _use_department_source(payload, DepartmentEnum.HIGH_VOLTAGE.value)

    draft = io_draft.save_draft(db_session, payload)

    assert draft["status"] == "draft"
    assert draft["bundles"][0]["lines"][0]["from_bucket"] == "production"
    assert draft["bundles"][0]["lines"][0]["from_department"] == "고압"


def test_save_internal_use_draft_rejects_tampered_department_source(
    db_session, make_item
):
    item = make_item(name="고압 부서 원본 변조", process_type_code="HF")
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    payload = _internal_use_payload(requester, [item])
    _use_department_source(payload, DepartmentEnum.TUBE.value)

    with pytest.raises(ValueError, match="라인 구성이 올바르지"):
        io_draft.save_draft(db_session, payload)


def test_submit_existing_internal_use_draft_revalidates_department_source(
    db_session, make_item
):
    item = make_item(name="고압 최종 제출 검증", process_type_code="HF")
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    payload = _internal_use_payload(requester, [item])
    _use_department_source(payload, DepartmentEnum.HIGH_VOLTAGE.value)
    draft = io_draft.save_draft(db_session, payload)
    db_session.commit()

    line = db_session.query(IoLine).one()
    line.from_department = DepartmentEnum.TUBE.value
    db_session.commit()

    with pytest.raises(ValueError, match="라인 구성이 올바르지"):
        actions.submit_existing_draft(
            db_session,
            batch_id=draft["batch_id"],
            requester_employee_id=requester.employee_id,
        )


def test_save_internal_use_draft_rejects_duplicate_parent_sources(
    db_session, make_item
):
    item = make_item(name="중복 원본 금지", process_type_code="HF")
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    payload = _internal_use_payload(requester, [item, item])
    duplicate_line = payload.bundles[1].lines[0]
    duplicate_line.from_bucket = "production"
    duplicate_line.from_department = DepartmentEnum.HIGH_VOLTAGE.value

    with pytest.raises(ValueError, match="한 원본과 한 방식"):
        io_draft.save_draft(db_session, payload)


def test_submit_internal_use_groups_lines_by_single_approval_kind(
    db_session, make_item, make_location
):
    warehouse_item = make_item(
        name="창고 원본 사용품", process_type_code="AF", warehouse_qty=Decimal("5")
    )
    special_item = make_item(
        name="AS 연구 승인 사용품", process_type_code="AR", warehouse_qty=Decimal("0")
    )
    department_item = make_item(
        name="부서 승인 사용품", process_type_code="HF", warehouse_qty=Decimal("0")
    )
    make_location(
        special_item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        quantity=Decimal("5"),
    )
    make_location(
        department_item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        quantity=Decimal("5"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    _make_requester(
        db_session,
        department=DepartmentEnum.RESEARCH,
        warehouse_role="none",
        as_research_approver=True,
    )
    payload = _internal_use_payload(
        requester,
        [warehouse_item, special_item, department_item],
    )
    special_line = payload.bundles[1].lines[0]
    special_line.from_bucket = "production"
    special_line.from_department = DepartmentEnum.ASSEMBLY.value
    department_line = payload.bundles[2].lines[0]
    department_line.from_bucket = "production"
    department_line.from_department = DepartmentEnum.HIGH_VOLTAGE.value

    result = actions.submit(db_session, payload)

    requests = (
        db_session.query(StockRequest)
        .filter(StockRequest.operation_batch_id == result["batch"]["batch_id"])
        .all()
    )
    assert len(requests) == 3
    assert result["status"] == "reserved"
    assert result["stock_request_id"] is None
    assert result["batch"]["stock_request_id"] is None
    assert len(result["stock_requests"]) == 3
    assert result["stock_requests"] == result["batch"]["stock_requests"]
    assert {
        (
            summary["from_bucket"],
            summary["from_department"],
            summary["approval_kind"],
            summary["status"],
        )
        for summary in result["stock_requests"]
    } == {
        ("warehouse", None, "warehouse", "reserved"),
        ("production", "조립", "as_research", "reserved"),
        ("production", "고압", "department", "reserved"),
    }

    requests_by_source = {
        (request.lines[0].from_bucket.value, request.lines[0].from_department): request
        for request in requests
    }
    warehouse_request = requests_by_source[("warehouse", None)]
    assert warehouse_request.requires_warehouse_approval is True
    assert warehouse_request.requires_department_approval is False
    assert warehouse_request.status == StockRequestStatusEnum.RESERVED
    special_request = requests_by_source[("production", DepartmentEnum.ASSEMBLY.value)]
    assert special_request.requires_warehouse_approval is False
    assert special_request.requires_department_approval is False
    assert special_request.requires_as_research_approval is True
    department_request = requests_by_source[("production", DepartmentEnum.HIGH_VOLTAGE.value)]
    assert department_request.requires_warehouse_approval is False
    assert department_request.requires_department_approval is True
    assert department_request.requires_as_research_approval is False
    assert all(line.operation_line_id is not None for request in requests for line in request.lines)

    inventory = (
        db_session.query(Inventory)
        .filter(Inventory.item_id == warehouse_item.item_id)
        .one()
    )
    assert inventory.pending_quantity == Decimal("1")
    for item, department in (
        (special_item, DepartmentEnum.ASSEMBLY),
        (department_item, DepartmentEnum.HIGH_VOLTAGE),
    ):
        location = (
            db_session.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == item.item_id,
                InventoryLocation.department == department,
            )
            .one()
        )
        assert location.pending_quantity == Decimal("1")


@pytest.mark.parametrize("process_type_code", ["AR", "AA"])
def test_internal_use_warehouse_source_takes_priority_over_as_research_kind(
    db_session, make_item, process_type_code
):
    item = make_item(
        name=f"창고 우선 {process_type_code}",
        process_type_code=process_type_code,
        warehouse_qty=Decimal("5"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.WAREHOUSE,
        warehouse_role="primary",
    )
    _make_requester(
        db_session,
        department=DepartmentEnum.RESEARCH,
        warehouse_role="none",
        as_research_approver=True,
    )

    result = actions.submit(db_session, _internal_use_payload(requester, [item]))

    request = (
        db_session.query(StockRequest)
        .filter(StockRequest.operation_batch_id == result["batch"]["batch_id"])
        .one()
    )
    assert request.requires_warehouse_approval is True
    assert request.requires_department_approval is False
    assert request.requires_as_research_approval is False


def test_internal_use_waits_for_all_decisions_then_executes_approved_lines_atomically(
    db_session, make_item, make_location, monkeypatch
):
    warehouse_item = make_item(
        name="독립 창고 승인", process_type_code="AF", warehouse_qty=Decimal("5")
    )
    department_item = make_item(
        name="독립 부서 반려", process_type_code="HF", warehouse_qty=Decimal("0")
    )
    make_location(
        department_item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        quantity=Decimal("5"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    warehouse_approver = _make_requester(db_session)
    department_approver = _make_requester(
        db_session,
        department=DepartmentEnum.ASSEMBLY,
        warehouse_role="none",
        department_role="primary",
    )
    payload = _internal_use_payload(requester, [warehouse_item, department_item])
    department_line = payload.bundles[1].lines[0]
    department_line.from_bucket = "production"
    department_line.from_department = DepartmentEnum.HIGH_VOLTAGE.value
    submitted = actions.submit(db_session, payload)
    batch_id = submitted["batch"]["batch_id"]
    requests = (
        db_session.query(StockRequest)
        .filter(StockRequest.operation_batch_id == batch_id)
        .all()
    )
    warehouse_request = next(
        request for request in requests if request.requires_warehouse_approval
    )
    department_request = next(
        request for request in requests if request.requires_department_approval
    )

    from app.services import sr_approval

    sr_approval.approve_request(
        db_session,
        warehouse_request,
        approver=warehouse_approver,
        pin="0000",
    )
    batch = db_session.query(IoBatch).filter(IoBatch.batch_id == batch_id).one()
    assert batch.status == "reserved"
    assert (
        db_session.query(Inventory)
        .filter(Inventory.item_id == warehouse_item.item_id)
        .one()
        .warehouse_qty
        == Decimal("5")
    )
    assert db_session.query(TransactionLog).count() == 0
    department_location = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == department_item.item_id,
            InventoryLocation.department == DepartmentEnum.HIGH_VOLTAGE,
        )
        .one()
    )
    assert department_location.quantity == Decimal("5")
    assert department_location.pending_quantity == Decimal("1")

    from app.services import internal_use_approval

    lock_events = []
    original_prelock_inventories = io_dispatch._prelock_line_inventories
    original_prelock_locations = internal_use_approval._prelock_locations
    original_release_reservation = internal_use_approval.release_reservation

    def track_inventory_prelock(*args, **kwargs):
        lock_events.append("inventory")
        return original_prelock_inventories(*args, **kwargs)

    def track_location_prelock(*args, **kwargs):
        lock_events.append("location")
        return original_prelock_locations(*args, **kwargs)

    def track_reservation_release(*args, **kwargs):
        lock_events.append("release")
        return original_release_reservation(*args, **kwargs)

    monkeypatch.setattr(io_dispatch, "_prelock_line_inventories", track_inventory_prelock)
    monkeypatch.setattr(internal_use_approval, "_prelock_locations", track_location_prelock)
    monkeypatch.setattr(internal_use_approval, "release_reservation", track_reservation_release)

    sr_approval.reject_request_department(
        db_session,
        department_request,
        approver=department_approver,
        pin="0000",
        reason="부서 반려",
    )
    assert lock_events[:3] == ["inventory", "location", "release"]

    assert batch.status == "partially_completed"
    assert warehouse_request.status == StockRequestStatusEnum.COMPLETED
    assert department_request.status == StockRequestStatusEnum.REJECTED
    assert department_location.quantity == Decimal("5")
    assert department_location.pending_quantity == Decimal("0")
    assert (
        db_session.query(Inventory)
        .filter(Inventory.item_id == warehouse_item.item_id)
        .one()
        .warehouse_qty
        == Decimal("4")
    )
    warehouse_log = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.item_id == warehouse_item.item_id)
        .one()
    )
    assert warehouse_log.reference_no == warehouse_request.request_code
    assert warehouse_log.operation_batch_id == batch_id
    batch_payload = io_persist.get_batch(db_session, batch_id=batch_id)
    assert batch_payload is not None
    assert batch_payload["approver_employee_id"] is None
    assert batch_payload["approver_name"] is None
    summaries = {
        (summary["from_bucket"], summary["from_department"]): summary
        for summary in batch_payload["stock_requests"]
    }
    assert summaries[("warehouse", None)]["status"] == "completed"
    assert set(summaries[("warehouse", None)]["operation_line_ids"]) == {
        line.operation_line_id
        for line in warehouse_request.lines
        if line.operation_line_id is not None
    }
    assert (
        summaries[("warehouse", None)]["approver_employee_id"]
        == warehouse_approver.employee_id
    )
    assert summaries[("warehouse", None)]["approver_name"] == warehouse_approver.name
    assert summaries[("production", "고압")]["status"] == "rejected"
    assert summaries[("warehouse", None)]["approval_outcome"] == "approved"
    assert summaries[("production", "고압")]["approval_outcome"] == "rejected"
    line_outcomes = {
        line["item_id"]: (line["approval_kind"], line["approval_outcome"])
        for bundle in batch_payload["bundles"]
        for line in bundle["lines"]
    }
    assert line_outcomes[warehouse_item.item_id] == ("warehouse", "approved")
    assert line_outcomes[department_item.item_id] == ("department", "rejected")


def test_internal_use_ar_aa_falls_back_to_department_when_no_active_special_approver(
    db_session, make_item, make_location
):
    item = make_item(name="특수 승인자 없음", process_type_code="AR", warehouse_qty=Decimal("0"))
    make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        quantity=Decimal("5"),
    )

    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    payload = _internal_use_payload(requester, [item])
    _use_department_source(payload, DepartmentEnum.ASSEMBLY.value)

    result = actions.submit(db_session, payload)

    assert len(result["stock_requests"]) == 1
    summary = result["stock_requests"][0]
    assert summary["approval_kind"] == "department"
    request = db_session.query(StockRequest).one()
    assert request.requires_department_approval is True
    assert request.requires_as_research_approval is False
    assert request.approval_department == requester.department


def test_internal_use_department_group_targets_batch_department_for_queue_notification_and_approval(
    db_session, client, make_item, make_location
):
    item = make_item(
        name="창고 요청자 부서 승인",
        process_type_code="HF",
        warehouse_qty=Decimal("0"),
    )
    make_location(
        item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        quantity=Decimal("5"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.WAREHOUSE,
        warehouse_role="primary",
    )
    warehouse_only = _make_requester(
        db_session,
        department=DepartmentEnum.WAREHOUSE,
        warehouse_role="deputy",
    )
    department_approver = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
        department_role="primary",
    )
    payload = _internal_use_payload(requester, [item])
    _use_department_source(payload, DepartmentEnum.HIGH_VOLTAGE.value)

    submitted = actions.submit(db_session, payload)
    request = db_session.query(StockRequest).filter_by(
        operation_batch_id=submitted["batch"]["batch_id"]
    ).one()

    assert request.approval_department == DepartmentEnum.AS.value
    assert db_session.query(Notification).filter_by(
        recipient_employee_id=department_approver.employee_id,
        related_request_id=request.request_id,
        target_section="dept-queue",
    ).count() == 1
    assert db_session.query(Notification).filter_by(
        recipient_employee_id=warehouse_only.employee_id,
        related_request_id=request.request_id,
    ).count() == 0
    department_queue = client.get(
        "/api/stock-requests/department-queue",
        params={"actor_employee_id": str(department_approver.employee_id)},
    )
    department_count = client.get(
        "/api/stock-requests/department-queue/count",
        params={"actor_employee_id": str(department_approver.employee_id)},
    )
    assert department_queue.status_code == 200
    assert str(request.request_id) in {row["request_id"] for row in department_queue.json()}
    assert department_count.json() == {"count": 1}
    warehouse_queue = client.get(
        "/api/stock-requests/department-queue",
        params={"actor_employee_id": str(warehouse_only.employee_id)},
    )
    warehouse_count = client.get(
        "/api/stock-requests/department-queue/count",
        params={"actor_employee_id": str(warehouse_only.employee_id)},
    )
    assert warehouse_queue.status_code == 200
    assert str(request.request_id) not in {row["request_id"] for row in warehouse_queue.json()}
    assert warehouse_count.json() == {"count": 0}

    forbidden = client.post(
        f"/api/stock-requests/{request.request_id}/department-approve",
        json={
            "actor_employee_id": str(warehouse_only.employee_id),
            "pin": "0000",
        },
    )
    assert forbidden.status_code == 403

    approved = client.post(
        f"/api/stock-requests/{request.request_id}/department-approve",
        json={
            "actor_employee_id": str(department_approver.employee_id),
            "pin": "0000",
        },
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "completed"
    db_session.expire_all()
    department_notification = db_session.query(Notification).filter_by(
        recipient_employee_id=department_approver.employee_id,
        related_request_id=request.request_id,
        target_section="dept-queue",
    ).one()
    assert department_notification.is_read is True


def test_internal_use_department_self_approval_uses_actual_approval_department(
    db_session,
):
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.WAREHOUSE,
        warehouse_role="none",
        department_role="primary",
    )
    request = StockRequest(
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=DepartmentEnum.WAREHOUSE,
        approval_department=DepartmentEnum.AS.value,
        request_type=StockRequestTypeEnum.INTERNAL_USE,
        status=StockRequestStatusEnum.SUBMITTED,
        requires_warehouse_approval=False,
        requires_department_approval=True,
        requires_as_research_approval=False,
    )
    db_session.add(request)
    db_session.flush()

    sr_execution._finalize_submission(
        db_session,
        request=request,
        requester=requester,
        now=datetime.utcnow(),
        defer_execution=True,
    )

    assert request.department_approved_by_employee_id == requester.employee_id
    assert request.department_approved_at is not None


def test_internal_use_self_approval_is_recorded_but_waits_for_other_kind(
    db_session, make_item, make_location
):
    warehouse_item = make_item(
        name="자가승인 창고 라인", process_type_code="AF", warehouse_qty=Decimal("5")
    )
    special_item = make_item(
        name="대기 특수 라인", process_type_code="AR", warehouse_qty=Decimal("0")
    )
    make_location(
        special_item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        quantity=Decimal("5"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="primary",
    )
    _make_requester(
        db_session,
        department=DepartmentEnum.RESEARCH,
        warehouse_role="none",
        as_research_approver=True,
    )
    payload = _internal_use_payload(requester, [warehouse_item, special_item])
    special_line = payload.bundles[1].lines[0]
    special_line.from_bucket = "production"
    special_line.from_department = DepartmentEnum.ASSEMBLY.value

    result = actions.submit(db_session, payload)

    warehouse_request = next(
        request
        for request in db_session.query(StockRequest).all()
        if request.requires_warehouse_approval
    )
    assert warehouse_request.approved_by_employee_id == requester.employee_id
    assert warehouse_request.status == StockRequestStatusEnum.RESERVED
    assert result["status"] == "reserved"
    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(Inventory).filter_by(item_id=warehouse_item.item_id).one().warehouse_qty == Decimal("5")


def test_as_research_queue_and_pin_approval_are_isolated_from_warehouse_role(
    db_session, client, make_item, make_location
):
    item = make_item(name="AS 연구 큐 품목", process_type_code="AR", warehouse_qty=Decimal("0"))
    make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        quantity=Decimal("3"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    special_approver = _make_requester(
        db_session,
        department=DepartmentEnum.RESEARCH,
        warehouse_role="none",
        as_research_approver=True,
    )
    warehouse_approver = _make_requester(db_session, warehouse_role="primary")
    department_approver = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
        department_role="primary",
    )
    admin_only = _make_requester(
        db_session,
        warehouse_role="none",
        level=EmployeeLevelEnum.ADMIN,
    )
    payload = _internal_use_payload(requester, [item])
    _use_department_source(payload, DepartmentEnum.ASSEMBLY.value)
    submitted = actions.submit(db_session, payload)
    request_id = submitted["stock_requests"][0]["stock_request_id"]

    queue = client.get(
        "/api/stock-requests/as-research-queue",
        params={"actor_employee_id": str(special_approver.employee_id)},
    )
    assert queue.status_code == 200, queue.text
    assert [row["request_id"] for row in queue.json()] == [str(request_id)]
    assert client.get(
        "/api/stock-requests/as-research-queue/count",
        params={"actor_employee_id": str(special_approver.employee_id)},
    ).json() == {"count": 1}
    for forbidden_actor in (warehouse_approver, department_approver, admin_only):
        forbidden_queue = client.get(
            "/api/stock-requests/as-research-queue",
            params={"actor_employee_id": str(forbidden_actor.employee_id)},
        )
        assert forbidden_queue.status_code == 403
        forbidden_count = client.get(
            "/api/stock-requests/as-research-queue/count",
            params={"actor_employee_id": str(forbidden_actor.employee_id)},
        )
        assert forbidden_count.status_code == 403
    assert client.get("/api/stock-requests/as-research-queue").status_code == 422
    assert client.get("/api/stock-requests/as-research-queue/count").status_code == 422

    wrong_kind = client.post(
        f"/api/stock-requests/{request_id}/approve",
        json={"actor_employee_id": str(warehouse_approver.employee_id), "pin": "0000"},
    )
    assert wrong_kind.status_code == 422
    special_cannot_approve_warehouse = client.post(
        f"/api/stock-requests/{request_id}/approve",
        json={"actor_employee_id": str(special_approver.employee_id), "pin": "0000"},
    )
    assert special_cannot_approve_warehouse.status_code == 403

    approved = client.post(
        f"/api/stock-requests/{request_id}/as-research-approve",
        json={"actor_employee_id": str(special_approver.employee_id), "pin": "0000"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "completed"
    assert approved.json()["as_research_approved_by_employee_id"] == str(special_approver.employee_id)
    db_session.expire_all()
    as_research_notification = db_session.query(Notification).filter_by(
        recipient_employee_id=special_approver.employee_id,
        related_request_id=request_id,
        target_section="as-research-queue",
    ).one()
    assert as_research_notification.is_read is True
    assert client.get(
        "/api/stock-requests/as-research-queue/count",
        params={"actor_employee_id": str(special_approver.employee_id)},
    ).json() == {"count": 0}


def test_internal_use_self_approval_uses_requester_permission_refreshed_after_roster_lock(
    db_session, make_item, make_location, monkeypatch
):
    item = make_item(
        name="최신 권한 자가승인",
        process_type_code="AR",
        warehouse_qty=Decimal("0"),
    )
    make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        quantity=Decimal("3"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
        as_research_approver=True,
    )
    _make_requester(
        db_session,
        department=DepartmentEnum.RESEARCH,
        warehouse_role="none",
        as_research_approver=True,
    )
    payload = _internal_use_payload(requester, [item])
    _use_department_source(payload, DepartmentEnum.ASSEMBLY.value)
    from app.services import internal_use_approval

    def revoke_requester_after_lock(session):
        session.query(Employee).filter(
            Employee.employee_id == requester.employee_id
        ).update(
            {Employee.as_research_approver: False},
            synchronize_session=False,
        )

    monkeypatch.setattr(
        internal_use_approval,
        "lock_approver_roster",
        revoke_requester_after_lock,
    )

    result = actions.submit(db_session, payload)

    request = db_session.query(StockRequest).filter_by(
        operation_batch_id=result["batch"]["batch_id"]
    ).one()
    assert request.requires_as_research_approval is True
    assert request.as_research_approved_at is None
    assert request.status == StockRequestStatusEnum.RESERVED


def test_internal_use_submit_rejects_requester_deactivated_after_roster_lock(
    db_session, make_item, monkeypatch
):
    item = make_item(
        name="roster 잠금 뒤 비활성 요청자",
        process_type_code="AF",
        warehouse_qty=Decimal("3"),
    )
    requester = _make_requester(db_session)
    payload = _internal_use_payload(requester, [item])
    from app.services import internal_use_approval

    def deactivate_requester_after_lock(session):
        session.query(Employee).filter(
            Employee.employee_id == requester.employee_id
        ).update(
            {Employee.is_active: False},
            synchronize_session=False,
        )

    monkeypatch.setattr(
        internal_use_approval,
        "lock_approver_roster",
        deactivate_requester_after_lock,
    )

    with pytest.raises(
        PermissionError,
        match="비활성 직원은 입출고 작업을 제출할 수 없습니다",
    ):
        actions.submit(db_session, payload)

    assert db_session.query(IoBatch).count() == 0
    assert db_session.query(StockRequest).count() == 0


@pytest.mark.parametrize("decision", ["approve", "reject"])
def test_as_research_action_rechecks_latest_permission_after_roster_lock(
    db_session, client, make_item, make_location, monkeypatch, decision
):
    item = make_item(
        name=f"최신 권한 특수 {decision}",
        process_type_code="AR",
        warehouse_qty=Decimal("0"),
    )
    make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        quantity=Decimal("3"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    stale_approver = _make_requester(
        db_session,
        department=DepartmentEnum.RESEARCH,
        warehouse_role="none",
        as_research_approver=True,
    )
    _make_requester(
        db_session,
        department=DepartmentEnum.RESEARCH,
        warehouse_role="none",
        as_research_approver=True,
    )
    payload = _internal_use_payload(requester, [item])
    _use_department_source(payload, DepartmentEnum.ASSEMBLY.value)
    submitted = actions.submit(db_session, payload)
    request_id = submitted["stock_requests"][0]["stock_request_id"]
    from app.services import internal_use_approval

    lock_calls = []

    def revoke_approver_after_lock(session):
        lock_calls.append(True)
        session.query(Employee).filter(
            Employee.employee_id == stale_approver.employee_id
        ).update(
            {Employee.as_research_approver: False},
            synchronize_session=False,
        )

    monkeypatch.setattr(
        internal_use_approval,
        "lock_approver_roster",
        revoke_approver_after_lock,
    )
    body = {
        "actor_employee_id": str(stale_approver.employee_id),
        "pin": "0000",
    }
    if decision == "reject":
        body["reason"] = "권한 해제 뒤 반려 차단"

    response = client.post(
        f"/api/stock-requests/{request_id}/as-research-{decision}",
        json=body,
    )

    assert response.status_code == 403, response.text
    assert lock_calls == [True]
    db_session.expire_all()
    request = db_session.get(StockRequest, request_id)
    assert request.as_research_approved_at is None
    assert request.rejected_at is None


def test_internal_use_all_rejected_in_reverse_order_has_no_inventory_history(
    db_session, client, make_item, make_location
):
    warehouse_item = make_item(
        name="전체 반려 창고",
        process_type_code="AF",
        warehouse_qty=Decimal("5"),
    )
    department_item = make_item(
        name="전체 반려 부서",
        process_type_code="HF",
        warehouse_qty=Decimal("0"),
    )
    make_location(
        department_item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        quantity=Decimal("5"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    warehouse_approver = _make_requester(db_session, warehouse_role="primary")
    department_approver = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
        department_role="primary",
    )
    payload = _internal_use_payload(requester, [warehouse_item, department_item])
    department_line = payload.bundles[1].lines[0]
    department_line.from_bucket = "production"
    department_line.from_department = DepartmentEnum.HIGH_VOLTAGE.value
    submitted = actions.submit(db_session, payload)
    batch_id = submitted["batch"]["batch_id"]
    requests = db_session.query(StockRequest).filter_by(operation_batch_id=batch_id).all()
    warehouse_request = next(row for row in requests if row.requires_warehouse_approval)
    department_request = next(row for row in requests if row.requires_department_approval)

    department_rejected = client.post(
        f"/api/stock-requests/{department_request.request_id}/department-reject",
        json={
            "actor_employee_id": str(department_approver.employee_id),
            "pin": "0000",
            "reason": "부서 반려",
        },
    )
    assert department_rejected.status_code == 200, department_rejected.text
    assert db_session.query(TransactionLog).count() == 0
    warehouse_rejected = client.post(
        f"/api/stock-requests/{warehouse_request.request_id}/reject",
        json={
            "actor_employee_id": str(warehouse_approver.employee_id),
            "pin": "0000",
            "reason": "창고 반려",
        },
    )
    assert warehouse_rejected.status_code == 200, warehouse_rejected.text

    db_session.expire_all()
    assert db_session.get(IoBatch, batch_id).status == "rejected"
    assert db_session.query(TransactionLog).count() == 0
    warehouse_inventory = db_session.query(Inventory).filter_by(item_id=warehouse_item.item_id).one()
    department_location = db_session.query(InventoryLocation).filter_by(item_id=department_item.item_id).one()
    assert warehouse_inventory.warehouse_qty == Decimal("5")
    assert warehouse_inventory.pending_quantity == Decimal("0")
    assert department_location.quantity == Decimal("5")
    assert department_location.pending_quantity == Decimal("0")


def test_requester_cancel_cancels_entire_internal_use_batch_even_after_sibling_approval(
    db_session, client, make_item, make_location, monkeypatch
):
    warehouse_item = make_item(name="취소 창고", process_type_code="AF", warehouse_qty=Decimal("5"))
    department_item = make_item(name="취소 부서", process_type_code="HF", warehouse_qty=Decimal("0"))
    make_location(
        department_item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        quantity=Decimal("5"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    warehouse_approver = _make_requester(db_session, warehouse_role="primary")
    payload = _internal_use_payload(requester, [warehouse_item, department_item])
    department_line = payload.bundles[1].lines[0]
    department_line.from_bucket = "production"
    department_line.from_department = DepartmentEnum.HIGH_VOLTAGE.value
    submitted = actions.submit(db_session, payload)
    requests = db_session.query(StockRequest).filter_by(operation_batch_id=submitted["batch"]["batch_id"]).all()
    warehouse_request = next(row for row in requests if row.requires_warehouse_approval)
    department_request = next(row for row in requests if row.requires_department_approval)

    blocked_edit_before_decision = client.post(
        f"/api/stock-requests/{department_request.request_id}/revert-to-draft",
        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"},
    )
    assert blocked_edit_before_decision.status_code == 422
    assert "사용출고" in blocked_edit_before_decision.text

    approved = client.post(
        f"/api/stock-requests/{warehouse_request.request_id}/approve",
        json={"actor_employee_id": str(warehouse_approver.employee_id), "pin": "0000"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "reserved"

    blocked_edit = client.post(
        f"/api/stock-requests/{department_request.request_id}/revert-to-draft",
        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"},
    )
    assert blocked_edit.status_code == 422
    assert "사용출고" in blocked_edit.text

    from app.services import internal_use_approval, stock_request_actions

    lock_events = []
    original_prelock_sources = internal_use_approval.prelock_reservation_sources
    original_release_reservation = stock_request_actions.stock_request_svc.release_reservation

    def track_source_prelock(*args, **kwargs):
        lock_events.append("prelock")
        return original_prelock_sources(*args, **kwargs)

    def track_reservation_release(*args, **kwargs):
        lock_events.append("release")
        return original_release_reservation(*args, **kwargs)

    monkeypatch.setattr(
        internal_use_approval,
        "prelock_reservation_sources",
        track_source_prelock,
    )
    monkeypatch.setattr(
        stock_request_actions.stock_request_svc,
        "release_reservation",
        track_reservation_release,
    )

    cancelled = client.post(
        f"/api/stock-requests/{department_request.request_id}/cancel",
        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"},
    )
    assert cancelled.status_code == 200, cancelled.text
    assert lock_events[0] == "prelock"
    assert "release" in lock_events[1:]
    db_session.expire_all()
    requests = db_session.query(StockRequest).filter_by(operation_batch_id=submitted["batch"]["batch_id"]).all()
    assert {row.status for row in requests} == {StockRequestStatusEnum.CANCELLED}
    assert db_session.query(IoBatch).filter_by(batch_id=submitted["batch"]["batch_id"]).one().status == "cancelled"
    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(Inventory).filter_by(item_id=warehouse_item.item_id).one().pending_quantity == Decimal("0")
    assert db_session.query(InventoryLocation).filter_by(item_id=department_item.item_id).one().pending_quantity == Decimal("0")


def test_disabling_last_special_approver_reclassifies_only_undecided_requests(
    db_session, client, make_item, make_location
):
    special_item = make_item(name="권한 폴백", process_type_code="AR", warehouse_qty=Decimal("0"))
    warehouse_item = make_item(name="권한 폴백 대기", process_type_code="AF", warehouse_qty=Decimal("5"))
    make_location(
        special_item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        quantity=Decimal("5"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.WAREHOUSE,
        warehouse_role="primary",
    )
    special_approver = _make_requester(
        db_session,
        department=DepartmentEnum.RESEARCH,
        warehouse_role="none",
        as_research_approver=True,
    )
    department_approver = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
        department_role="primary",
    )
    payload = _internal_use_payload(requester, [special_item, warehouse_item])
    special_line = payload.bundles[0].lines[0]
    special_line.from_bucket = "production"
    special_line.from_department = DepartmentEnum.ASSEMBLY.value
    submitted = actions.submit(db_session, payload)
    special_request = next(
        row
        for row in db_session.query(StockRequest).filter_by(operation_batch_id=submitted["batch"]["batch_id"]).all()
        if row.requires_as_research_approval
    )

    response = client.put(
        f"/api/employees/{special_approver.employee_id}",
        headers={"X-Admin-Pin": "0000"},
        json={"as_research_approver": False},
    )
    assert response.status_code == 200, response.text
    db_session.expire_all()
    db_session.refresh(special_request)
    assert special_request.requires_as_research_approval is False
    assert special_request.requires_department_approval is True
    assert special_request.approval_department == DepartmentEnum.AS.value
    assert db_session.query(Notification).filter_by(
        recipient_employee_id=department_approver.employee_id,
        related_request_id=special_request.request_id,
        target_section="dept-queue",
    ).count() == 1


@pytest.mark.parametrize(
    "settle_error",
    [
        pytest.param(ValueError("주입된 최종 실행 실패"), id="validation-error"),
        pytest.param(RuntimeError("주입된 최종 실행 오류"), id="runtime-error"),
    ],
)
def test_internal_use_final_settle_rolls_back_all_inventory_and_marks_batch_failed(
    db_session, client, make_item, make_location, monkeypatch, settle_error
):
    warehouse_item = make_item(name="실행 실패 창고", process_type_code="AF", warehouse_qty=Decimal("5"))
    department_item = make_item(name="실행 실패 부서", process_type_code="HF", warehouse_qty=Decimal("0"))
    make_location(
        department_item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        quantity=Decimal("5"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    warehouse_approver = _make_requester(db_session, warehouse_role="primary")
    department_approver = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
        department_role="primary",
    )
    payload = _internal_use_payload(requester, [warehouse_item, department_item])
    department_line = payload.bundles[1].lines[0]
    department_line.from_bucket = "production"
    department_line.from_department = DepartmentEnum.HIGH_VOLTAGE.value
    submitted = actions.submit(db_session, payload)
    batch_id = submitted["batch"]["batch_id"]
    requests = db_session.query(StockRequest).filter_by(operation_batch_id=batch_id).all()
    warehouse_request = next(row for row in requests if row.requires_warehouse_approval)
    department_request = next(row for row in requests if row.requires_department_approval)
    first = client.post(
        f"/api/stock-requests/{warehouse_request.request_id}/approve",
        json={"actor_employee_id": str(warehouse_approver.employee_id), "pin": "0000"},
    )
    assert first.status_code == 200, first.text

    original_apply_line = io_dispatch._apply_line
    call_count = 0

    def fail_second_line(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise settle_error
        return original_apply_line(*args, **kwargs)

    monkeypatch.setattr(io_dispatch, "_apply_line", fail_second_line)
    from app.services import internal_use_approval, sr_approval

    failure_cleanup_events = []
    original_prelock_sources = internal_use_approval.prelock_reservation_sources
    original_release_pending = sr_approval._release_pending_best_effort

    def track_failure_prelock(*args, **kwargs):
        failure_cleanup_events.append("prelock")
        return original_prelock_sources(*args, **kwargs)

    def track_failed_release(*args, **kwargs):
        failure_cleanup_events.append("release")
        return original_release_pending(*args, **kwargs)

    monkeypatch.setattr(
        internal_use_approval,
        "prelock_reservation_sources",
        track_failure_prelock,
    )
    monkeypatch.setattr(sr_approval, "_release_pending_best_effort", track_failed_release)
    boundaries = _count_session_boundaries(db_session, monkeypatch)
    failed = client.post(
        f"/api/stock-requests/{department_request.request_id}/department-approve",
        json={"actor_employee_id": str(department_approver.employee_id), "pin": "0000"},
    )

    assert failed.status_code == 409, failed.text
    assert boundaries == {"commit": 1, "rollback": 0}
    assert failure_cleanup_events[0] == "prelock"
    assert "release" in failure_cleanup_events[1:]
    db_session.expire_all()
    assert db_session.query(IoBatch).filter_by(batch_id=batch_id).one().status == "failed"
    assert {
        row.status
        for row in db_session.query(StockRequest).filter_by(operation_batch_id=batch_id).all()
    } == {StockRequestStatusEnum.FAILED_APPROVAL}
    assert db_session.query(TransactionLog).count() == 0
    warehouse_inventory = db_session.query(Inventory).filter_by(item_id=warehouse_item.item_id).one()
    department_location = db_session.query(InventoryLocation).filter_by(item_id=department_item.item_id).one()
    assert warehouse_inventory.warehouse_qty == Decimal("5")
    assert warehouse_inventory.pending_quantity == Decimal("0")
    assert department_location.quantity == Decimal("5")
    assert department_location.pending_quantity == Decimal("0")


@pytest.mark.parametrize(
    "settle_error",
    [
        pytest.param(ValueError("자가승인 최종 검증 실패"), id="value-error"),
        pytest.param(RuntimeError("자가승인 최종 실행 오류"), id="runtime-error"),
    ],
)
def test_internal_use_fully_self_approved_submit_failure_persists_failed_batch(
    db_session,
    make_item,
    make_location,
    monkeypatch,
    settle_error,
):
    warehouse_item = make_item(
        name="자가승인 실패 창고",
        process_type_code="AF",
        warehouse_qty=Decimal("5"),
    )
    special_item = make_item(
        name="자가승인 실패 특수",
        process_type_code="AR",
        warehouse_qty=Decimal("0"),
    )
    department_item = make_item(
        name="자가승인 실패 부서",
        process_type_code="HF",
        warehouse_qty=Decimal("0"),
    )
    make_location(
        special_item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        quantity=Decimal("5"),
    )
    make_location(
        department_item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        quantity=Decimal("5"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="primary",
        department_role="primary",
        as_research_approver=True,
    )
    payload = _internal_use_payload(
        requester,
        [warehouse_item, special_item, department_item],
    )
    special_line = payload.bundles[1].lines[0]
    special_line.from_bucket = "production"
    special_line.from_department = DepartmentEnum.ASSEMBLY.value
    department_line = payload.bundles[2].lines[0]
    department_line.from_bucket = "production"
    department_line.from_department = DepartmentEnum.HIGH_VOLTAGE.value
    original_apply_line = io_dispatch._apply_line
    call_count = 0

    def fail_second_line(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise settle_error
        return original_apply_line(*args, **kwargs)

    monkeypatch.setattr(io_dispatch, "_apply_line", fail_second_line)

    with pytest.raises(type(settle_error), match=str(settle_error)):
        actions.submit(db_session, payload)

    batch = db_session.query(IoBatch).one()
    requests = db_session.query(StockRequest).filter_by(
        operation_batch_id=batch.batch_id
    ).all()
    assert batch.status == "failed"
    assert len(requests) == 3
    assert {request.status for request in requests} == {
        StockRequestStatusEnum.FAILED_APPROVAL
    }
    assert all(
        request.approved_at is not None
        or request.department_approved_at is not None
        or request.as_research_approved_at is not None
        for request in requests
    )
    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(InventoryOperation).count() == 0
    warehouse_inventory = db_session.query(Inventory).filter_by(
        item_id=warehouse_item.item_id
    ).one()
    special_location = db_session.query(InventoryLocation).filter_by(
        item_id=special_item.item_id,
        department=DepartmentEnum.ASSEMBLY,
    ).one()
    department_location = db_session.query(InventoryLocation).filter_by(
        item_id=department_item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
    ).one()
    assert warehouse_inventory.warehouse_qty == Decimal("5")
    assert warehouse_inventory.pending_quantity == Decimal("0")
    assert special_location.quantity == Decimal("5")
    assert special_location.pending_quantity == Decimal("0")
    assert department_location.quantity == Decimal("5")
    assert department_location.pending_quantity == Decimal("0")


def test_internal_use_submission_preflight_failure_does_not_persist_failed_batch(
    db_session,
    make_item,
):
    item = make_item(
        name="사용출고 사전검증 실패",
        process_type_code="AF",
        warehouse_qty=Decimal("0"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )

    with pytest.raises(ValueError):
        actions.submit(db_session, _internal_use_payload(requester, [item]))

    assert db_session.query(IoBatch).count() == 0
    assert db_session.query(StockRequest).count() == 0


@pytest.mark.parametrize("final_reject_kind", ["warehouse", "department", "as_research"])
def test_internal_use_final_reject_execution_failure_preserves_rejected_request(
    db_session,
    client,
    make_item,
    make_location,
    monkeypatch,
    final_reject_kind,
):
    warehouse_item = make_item(
        name=f"최종 반려 실패 창고 {final_reject_kind}",
        process_type_code="AF",
        warehouse_qty=Decimal("5"),
    )
    production_item = make_item(
        name=f"최종 반려 실패 생산 {final_reject_kind}",
        process_type_code="AR" if final_reject_kind == "as_research" else "HF",
        warehouse_qty=Decimal("0"),
    )
    production_department = (
        DepartmentEnum.ASSEMBLY
        if final_reject_kind == "as_research"
        else DepartmentEnum.HIGH_VOLTAGE
    )
    make_location(
        production_item.item_id,
        department=production_department,
        quantity=Decimal("5"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    warehouse_approver = _make_requester(db_session, warehouse_role="primary")
    department_approver = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
        department_role="primary",
    )
    special_approver = _make_requester(
        db_session,
        department=DepartmentEnum.RESEARCH,
        warehouse_role="none",
        as_research_approver=True,
    )
    payload = _internal_use_payload(requester, [warehouse_item, production_item])
    production_line = payload.bundles[1].lines[0]
    production_line.from_bucket = "production"
    production_line.from_department = production_department.value
    submitted = actions.submit(db_session, payload)
    batch_id = submitted["batch"]["batch_id"]
    requests = db_session.query(StockRequest).filter_by(operation_batch_id=batch_id).all()
    warehouse_request = next(row for row in requests if row.requires_warehouse_approval)
    production_request = next(row for row in requests if not row.requires_warehouse_approval)

    if final_reject_kind == "warehouse":
        approved_request = production_request
        rejected_request = warehouse_request
        first_path = f"{approved_request.request_id}/department-approve"
        first_actor = department_approver
        reject_path = f"{rejected_request.request_id}/reject"
        reject_actor = warehouse_approver
    elif final_reject_kind == "department":
        approved_request = warehouse_request
        rejected_request = production_request
        first_path = f"{approved_request.request_id}/approve"
        first_actor = warehouse_approver
        reject_path = f"{rejected_request.request_id}/department-reject"
        reject_actor = department_approver
    else:
        approved_request = warehouse_request
        rejected_request = production_request
        first_path = f"{approved_request.request_id}/approve"
        first_actor = warehouse_approver
        reject_path = f"{rejected_request.request_id}/as-research-reject"
        reject_actor = special_approver

    first = client.post(
        f"/api/stock-requests/{first_path}",
        json={"actor_employee_id": str(first_actor.employee_id), "pin": "0000"},
    )
    assert first.status_code == 200, first.text

    def fail_execution(*args, **kwargs):
        raise RuntimeError("최종 반려 후 실행 실패")

    monkeypatch.setattr(io_dispatch, "_apply_line", fail_execution)
    boundaries = _count_session_boundaries(db_session, monkeypatch)
    rejection_reason = f"{final_reject_kind} 최종 반려"
    rejected = client.post(
        f"/api/stock-requests/{reject_path}",
        json={
            "actor_employee_id": str(reject_actor.employee_id),
            "pin": "0000",
            "reason": rejection_reason,
        },
    )

    assert rejected.status_code == 409, rejected.text
    assert boundaries == {"commit": 1, "rollback": 0}
    db_session.expire_all()
    assert db_session.get(IoBatch, batch_id).status == "failed"
    assert db_session.get(StockRequest, approved_request.request_id).status == (
        StockRequestStatusEnum.FAILED_APPROVAL
    )
    persisted_rejection = db_session.get(StockRequest, rejected_request.request_id)
    assert persisted_rejection.status == StockRequestStatusEnum.REJECTED
    assert persisted_rejection.rejected_by_employee_id == reject_actor.employee_id
    assert persisted_rejection.rejected_by_name == reject_actor.name
    assert persisted_rejection.rejected_reason == rejection_reason
    rejection_target_section = {
        "warehouse": "queue",
        "department": "dept-queue",
        "as_research": "as-research-queue",
    }[final_reject_kind]
    rejection_notifications = db_session.query(Notification).filter_by(
        related_request_id=rejected_request.request_id,
        target_section=rejection_target_section,
        type="approval_request",
    ).all()
    assert rejection_notifications
    assert all(note.is_read is True for note in rejection_notifications)
    assert db_session.query(TransactionLog).count() == 0
    warehouse_inventory = db_session.query(Inventory).filter_by(item_id=warehouse_item.item_id).one()
    production_location = (
        db_session.query(InventoryLocation)
        .filter_by(item_id=production_item.item_id, department=production_department)
        .one()
    )
    assert warehouse_inventory.warehouse_qty == Decimal("5")
    assert warehouse_inventory.pending_quantity == Decimal("0")
    assert production_location.quantity == Decimal("5")
    assert production_location.pending_quantity == Decimal("0")


def test_mark_batch_failed_does_not_overwrite_completed_internal_use_history(
    db_session,
    make_item,
):
    item = make_item(
        name="완료 이력 실패 덮기 방지",
        process_type_code="AF",
        warehouse_qty=Decimal("3"),
    )
    requester = _make_requester(db_session, warehouse_role="primary")
    submitted = actions.submit(db_session, _internal_use_payload(requester, [item]))
    batch_id = submitted["batch"]["batch_id"]
    request = db_session.query(StockRequest).filter_by(
        operation_batch_id=batch_id
    ).one()
    from app.services import internal_use_approval

    internal_use_approval.mark_batch_failed(
        db_session,
        batch_id=batch_id,
        approver=requester,
        reason="뒤늦은 실패 기록",
    )

    assert db_session.get(IoBatch, batch_id).status == "completed"
    assert db_session.get(StockRequest, request.request_id).status == (
        StockRequestStatusEnum.COMPLETED
    )


def test_mark_batch_failed_does_not_overwrite_completed_request_in_open_batch(
    db_session,
    make_item,
):
    item = make_item(
        name="완료 요청 실패 덮기 방지",
        process_type_code="AF",
        warehouse_qty=Decimal("3"),
    )
    requester = _make_requester(db_session, warehouse_role="primary")
    submitted = actions.submit(db_session, _internal_use_payload(requester, [item]))
    batch_id = submitted["batch"]["batch_id"]
    batch = db_session.get(IoBatch, batch_id)
    request = db_session.query(StockRequest).filter_by(
        operation_batch_id=batch_id
    ).one()
    batch.status = "reserved"
    db_session.flush()
    from app.services import internal_use_approval

    internal_use_approval.mark_batch_failed(
        db_session,
        batch_id=batch_id,
        approver=requester,
        reason="불일치 이력 실패 기록",
    )

    assert batch.status == "reserved"
    assert request.status == StockRequestStatusEnum.COMPLETED


@pytest.mark.parametrize("approval_kind", ["warehouse", "department", "as_research"])
def test_internal_use_reject_cannot_reverse_recorded_approval(
    db_session,
    client,
    make_item,
    make_location,
    approval_kind,
):
    warehouse_item = make_item(
        name=f"승인 뒤 반려 금지 창고 {approval_kind}",
        process_type_code="AF",
        warehouse_qty=Decimal("5"),
    )
    production_item = make_item(
        name=f"승인 뒤 반려 금지 생산 {approval_kind}",
        process_type_code="AR" if approval_kind == "as_research" else "HF",
        warehouse_qty=Decimal("0"),
    )
    production_department = (
        DepartmentEnum.ASSEMBLY
        if approval_kind == "as_research"
        else DepartmentEnum.HIGH_VOLTAGE
    )
    make_location(
        production_item.item_id,
        department=production_department,
        quantity=Decimal("5"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    warehouse_approver = _make_requester(db_session, warehouse_role="primary")
    department_approver = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
        department_role="primary",
    )
    special_approver = _make_requester(
        db_session,
        department=DepartmentEnum.RESEARCH,
        warehouse_role="none",
        as_research_approver=True,
    )
    payload = _internal_use_payload(requester, [warehouse_item, production_item])
    production_line = payload.bundles[1].lines[0]
    production_line.from_bucket = "production"
    production_line.from_department = production_department.value
    submitted = actions.submit(db_session, payload)
    requests = db_session.query(StockRequest).filter_by(
        operation_batch_id=submitted["batch"]["batch_id"]
    ).all()
    request = next(
        row
        for row in requests
        if (
            row.requires_warehouse_approval
            if approval_kind == "warehouse"
            else row.requires_department_approval
            if approval_kind == "department"
            else row.requires_as_research_approval
        )
    )
    if approval_kind == "warehouse":
        actor = warehouse_approver
        approve_suffix = "approve"
        reject_suffix = "reject"
    elif approval_kind == "department":
        actor = department_approver
        approve_suffix = "department-approve"
        reject_suffix = "department-reject"
    else:
        actor = special_approver
        approve_suffix = "as-research-approve"
        reject_suffix = "as-research-reject"

    approved = client.post(
        f"/api/stock-requests/{request.request_id}/{approve_suffix}",
        json={"actor_employee_id": str(actor.employee_id), "pin": "0000"},
    )
    assert approved.status_code == 200, approved.text
    rejected = client.post(
        f"/api/stock-requests/{request.request_id}/{reject_suffix}",
        json={
            "actor_employee_id": str(actor.employee_id),
            "pin": "0000",
            "reason": "승인 뒤 반려 시도",
        },
    )

    assert rejected.status_code == 422, rejected.text
    db_session.expire_all()
    persisted = db_session.get(StockRequest, request.request_id)
    assert persisted.status in {
        StockRequestStatusEnum.RESERVED,
        StockRequestStatusEnum.SUBMITTED,
    }
    assert persisted.rejected_at is None


def test_submit_settlement_failure_rolls_back_inventory_and_persists_failed_batch(
    db_session, make_item, monkeypatch
):
    first = make_item(name="IO rollback A", warehouse_qty=Decimal("3"))
    second = make_item(name="IO rollback B", warehouse_qty=Decimal("3"))
    requester = _make_requester(db_session)
    for item in (first, second):
        _add_tracked_box(db_session, item.item_id, 3)
    warehouse_map_svc.set_box_tracking_enabled(db_session, True)
    first_id, second_id = first.item_id, second.item_id
    db_session.commit()

    boundaries = _count_session_boundaries(db_session, monkeypatch)
    original_execute_line = io_dispatch._apply_line
    boom = RuntimeError("두 번째 IO 라인 후속 단계 실패")
    line_calls = 0

    def fail_on_second_line(*args, **kwargs):
        nonlocal line_calls
        line_calls += 1
        if line_calls == 2:
            raise boom
        return original_execute_line(*args, **kwargs)

    monkeypatch.setattr(io_dispatch, "_apply_line", fail_on_second_line)

    with pytest.raises(RuntimeError) as raised:
        actions.submit(db_session, _internal_use_payload(requester, [first, second]))

    assert raised.value is boom
    assert line_calls == 2
    assert boundaries == {"commit": 1, "rollback": 0}
    db_session.expire_all()
    for item_id in (first_id, second_id):
        inventory = db_session.query(Inventory).filter_by(item_id=item_id).one()
        assert inventory.warehouse_qty == Decimal("3")
        assert (
            db_session.query(WarehouseBoxItem)
            .filter(WarehouseBoxItem.item_id == item_id)
            .one()
            .quantity
            == 3
        )
    batch = db_session.query(IoBatch).one()
    assert batch.status == "failed"
    requests = db_session.query(StockRequest).filter_by(
        operation_batch_id=batch.batch_id
    ).all()
    assert len(requests) == 1
    assert requests[0].status == StockRequestStatusEnum.FAILED_APPROVAL
    assert db_session.query(TransactionLog).count() == 0


def test_submit_commits_once_with_inventory_box_batch_request_and_log(
    db_session, make_item, monkeypatch
):
    item = make_item(name="IO commit", warehouse_qty=Decimal("3"))
    requester = _make_requester(db_session)
    _add_tracked_box(db_session, item.item_id, 3)
    warehouse_map_svc.set_box_tracking_enabled(db_session, True)
    item_id = item.item_id
    db_session.commit()

    boundaries = _count_session_boundaries(db_session, monkeypatch)
    result = actions.submit(db_session, _internal_use_payload(requester, [item]))

    assert result["status"] == "completed"
    assert boundaries == {"commit": 1, "rollback": 0}
    db_session.expire_all()
    inventory = db_session.query(Inventory).filter_by(item_id=item_id).one()
    assert inventory.warehouse_qty == Decimal("2")
    assert (
        db_session.query(WarehouseBoxItem)
        .filter(WarehouseBoxItem.item_id == item_id)
        .one()
        .quantity
        == 2
    )
    assert db_session.query(IoBatch).count() == 1
    assert db_session.query(StockRequest).count() == 1
    assert db_session.query(TransactionLog).count() == 1


def test_submit_rolls_back_batch_request_pending_and_notification_when_notify_fails(
    db_session, make_item, monkeypatch
):
    item = make_item(name="IO notify rollback", warehouse_qty=Decimal("3"))
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    _make_requester(db_session)
    _add_tracked_box(db_session, item.item_id, 3)
    warehouse_map_svc.set_box_tracking_enabled(db_session, True)
    item_id = item.item_id
    db_session.commit()

    boundaries = _count_session_boundaries(db_session, monkeypatch)
    original_notify = io_dispatch.notif_svc.notify_request_arrived
    boom = RuntimeError("IO 알림 저장 후 실패")

    def notify_then_fail(db, request):
        original_notify(db, request)
        db.flush()
        assert db.query(Notification).count() == 1
        raise boom

    monkeypatch.setattr(
        io_dispatch.notif_svc,
        "notify_request_arrived",
        notify_then_fail,
    )

    with pytest.raises(RuntimeError) as raised:
        actions.submit(db_session, _internal_use_payload(requester, [item]))

    assert raised.value is boom
    assert boundaries == {"commit": 0, "rollback": 1}
    db_session.expire_all()
    inventory = db_session.query(Inventory).filter_by(item_id=item_id).one()
    assert inventory.warehouse_qty == Decimal("3")
    assert inventory.pending_quantity == Decimal("0")
    assert (
        db_session.query(WarehouseBoxItem)
        .filter(WarehouseBoxItem.item_id == item_id)
        .one()
        .quantity
        == 3
    )
    assert db_session.query(IoBatch).count() == 0
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(Notification).count() == 0


def test_submit_existing_draft_settlement_failure_persists_failed_batch(
    db_session, make_item, monkeypatch
):
    first = make_item(name="IO draft rollback A", warehouse_qty=Decimal("3"))
    second = make_item(name="IO draft rollback B", warehouse_qty=Decimal("3"))
    requester = _make_requester(db_session)
    for item in (first, second):
        _add_tracked_box(db_session, item.item_id, 3)
    warehouse_map_svc.set_box_tracking_enabled(db_session, True)
    payload = _internal_use_payload(requester, [first, second])
    draft = io_draft.save_draft(db_session, payload)
    draft_id = draft["batch_id"]
    first_id, second_id = first.item_id, second.item_id
    db_session.commit()

    boundaries = _count_session_boundaries(db_session, monkeypatch)
    original_execute_line = io_dispatch._apply_line
    boom = RuntimeError("두 번째 draft 라인 후속 단계 실패")
    line_calls = 0
    status_during_failure = []

    def fail_on_second_line(*args, **kwargs):
        nonlocal line_calls
        line_calls += 1
        if line_calls == 2:
            status_during_failure.append(
                db_session.query(IoBatch).filter(IoBatch.batch_id == draft_id).one().status
            )
            raise boom
        return original_execute_line(*args, **kwargs)

    monkeypatch.setattr(io_dispatch, "_apply_line", fail_on_second_line)

    with pytest.raises(RuntimeError) as raised:
        actions.submit_existing_draft(
            db_session,
            batch_id=draft_id,
            requester_employee_id=requester.employee_id,
        )

    assert raised.value is boom
    assert line_calls == 2
    assert status_during_failure == ["submitted"]
    assert boundaries == {"commit": 1, "rollback": 0}
    db_session.expire_all()
    restored = db_session.query(IoBatch).filter(IoBatch.batch_id == draft_id).one()
    assert restored.status == "failed"
    for item_id in (first_id, second_id):
        inventory = db_session.query(Inventory).filter_by(item_id=item_id).one()
        assert inventory.warehouse_qty == Decimal("3")
        assert (
            db_session.query(WarehouseBoxItem)
            .filter(WarehouseBoxItem.item_id == item_id)
            .one()
            .quantity
            == 3
        )
    requests = db_session.query(StockRequest).filter_by(operation_batch_id=draft_id).all()
    assert len(requests) == 1
    assert requests[0].status == StockRequestStatusEnum.FAILED_APPROVAL
    assert db_session.query(TransactionLog).count() == 0


def test_submit_existing_draft_commits_once(
    db_session, make_item, monkeypatch
):
    item = make_item(name="IO draft commit", warehouse_qty=Decimal("3"))
    requester = _make_requester(db_session)
    _add_tracked_box(db_session, item.item_id, 3)
    warehouse_map_svc.set_box_tracking_enabled(db_session, True)
    draft = io_draft.save_draft(
        db_session,
        _internal_use_payload(requester, [item]),
    )
    draft_id = draft["batch_id"]
    db_session.commit()

    boundaries = _count_session_boundaries(db_session, monkeypatch)
    result = actions.submit_existing_draft(
        db_session,
        batch_id=draft_id,
        requester_employee_id=requester.employee_id,
    )

    assert result["status"] == "completed"
    assert boundaries == {"commit": 1, "rollback": 0}


def test_submit_existing_draft_rejects_when_conditional_draft_transition_loses_race(
    db_session, make_item, monkeypatch
):
    item = make_item(name="IO draft conditional transition", warehouse_qty=Decimal("0"))
    requester = _make_requester(db_session)
    from app.models import Supplier

    supplier = Supplier(name="Draft race supplier", normalized_name="draft race supplier")
    db_session.add(supplier)
    db_session.flush()
    draft = io_draft.save_draft(
        db_session,
        IoSubmitRequest(
            requester_employee_id=requester.employee_id,
                work_type="receive",
                sub_type="receive_supplier",
                supplier_id=supplier.supplier_id,
            bundles=[{
                "bundle_id": str(uuid.uuid4()),
                "source_kind": "direct_item",
                "title": item.item_name,
                "source_item_id": str(item.item_id),
                "quantity": 1,
                "lines": [{
                    "line_id": str(uuid.uuid4()),
                    "item_id": str(item.item_id),
                    "item_name": item.item_name,
                    "mes_code": item.mes_code,
                    "direction": "in",
                    "from_bucket": "none",
                    "to_bucket": "warehouse",
                    "quantity": 1,
                    "origin": "direct",
                }],
            }],
        ),
    )
    db_session.commit()
    real_execute = db_session.execute

    def lose_draft_transition(statement, *args, **kwargs):
        if str(statement).startswith("UPDATE io_batches SET status"):
            return SimpleNamespace(rowcount=0)
        return real_execute(statement, *args, **kwargs)

    monkeypatch.setattr(db_session, "execute", lose_draft_transition)

    with pytest.raises(ValueError, match="임시저장 상태가 아닙니다"):
        actions.submit_existing_draft(
            db_session,
            batch_id=draft["batch_id"],
            requester_employee_id=requester.employee_id,
        )

    db_session.expire_all()
    batch = db_session.query(IoBatch).filter(IoBatch.batch_id == draft["batch_id"]).one()
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert batch.status == "draft"
    assert inventory.warehouse_qty == Decimal("0")
    assert db_session.query(TransactionLog).count() == 0
