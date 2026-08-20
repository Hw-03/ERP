"""IO 제출 application service의 트랜잭션 경계 회귀 테스트."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models import (
    BoxSizeEnum,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    IoBatch,
    IoLine,
    Notification,
    StockRequest,
    StockRequestStatusEnum,
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
) -> Employee:
    requester = Employee(
        employee_code=f"IO-ACT-{uuid.uuid4().hex[:8]}",
        name="IO 원자성 작업자",
        role="창고/사원",
        department=department,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role=warehouse_role,
        department_role=department_role,
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


def test_submit_internal_use_splits_warehouse_and_each_source_department(
    db_session, make_item, make_location
):
    warehouse_item = make_item(
        name="창고 원본 사용품", process_type_code="AF", warehouse_qty=Decimal("5")
    )
    high_voltage_item = make_item(
        name="고압 원본 사용품", process_type_code="HF", warehouse_qty=Decimal("0")
    )
    tube_item = make_item(
        name="튜브 원본 사용품", process_type_code="TF", warehouse_qty=Decimal("0")
    )
    make_location(
        high_voltage_item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        quantity=Decimal("5"),
    )
    make_location(
        tube_item.item_id,
        department=DepartmentEnum.TUBE,
        quantity=Decimal("5"),
    )
    requester = _make_requester(
        db_session,
        department=DepartmentEnum.AS,
        warehouse_role="none",
    )
    payload = _internal_use_payload(
        requester,
        [warehouse_item, high_voltage_item, tube_item],
    )
    high_voltage_line = payload.bundles[1].lines[0]
    high_voltage_line.from_bucket = "production"
    high_voltage_line.from_department = DepartmentEnum.HIGH_VOLTAGE.value
    tube_line = payload.bundles[2].lines[0]
    tube_line.from_bucket = "production"
    tube_line.from_department = DepartmentEnum.TUBE.value

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
        ("production", "고압", "department", "reserved"),
        ("production", "튜브", "department", "reserved"),
    }

    requests_by_source = {
        (request.lines[0].from_bucket.value, request.lines[0].from_department): request
        for request in requests
    }
    warehouse_request = requests_by_source[("warehouse", None)]
    assert warehouse_request.requires_warehouse_approval is True
    assert warehouse_request.requires_department_approval is False
    assert warehouse_request.status == StockRequestStatusEnum.RESERVED
    for department in (DepartmentEnum.HIGH_VOLTAGE.value, DepartmentEnum.TUBE.value):
        request = requests_by_source[("production", department)]
        assert request.requires_warehouse_approval is False
        assert request.requires_department_approval is True
        assert request.status == StockRequestStatusEnum.RESERVED
    assert all(line.operation_line_id is not None for request in requests for line in request.lines)

    inventory = (
        db_session.query(Inventory)
        .filter(Inventory.item_id == warehouse_item.item_id)
        .one()
    )
    assert inventory.pending_quantity == Decimal("1")
    for item, department in (
        (high_voltage_item, DepartmentEnum.HIGH_VOLTAGE),
        (tube_item, DepartmentEnum.TUBE),
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


def test_internal_use_source_requests_approve_and_reject_independently(
    db_session, make_item, make_location
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
    assert batch.status == "partially_completed"
    assert (
        db_session.query(Inventory)
        .filter(Inventory.item_id == warehouse_item.item_id)
        .one()
        .warehouse_qty
        == Decimal("4")
    )
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

    sr_approval.reject_request_department(
        db_session,
        department_request,
        approver=department_approver,
        pin="0000",
        reason="부서 반려",
    )

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


def test_submit_rolls_back_first_line_box_batch_request_and_log_when_second_line_fails(
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
    original_execute_line = sr_execution._execute_line
    boom = RuntimeError("두 번째 IO 라인 후속 단계 실패")
    line_calls = 0

    def fail_on_second_line(*args, **kwargs):
        nonlocal line_calls
        line_calls += 1
        if line_calls == 2:
            raise boom
        return original_execute_line(*args, **kwargs)

    monkeypatch.setattr(sr_execution, "_execute_line", fail_on_second_line)

    with pytest.raises(RuntimeError) as raised:
        actions.submit(db_session, _internal_use_payload(requester, [first, second]))

    assert raised.value is boom
    assert line_calls == 2
    assert boundaries == {"commit": 0, "rollback": 1}
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
    assert db_session.query(IoBatch).count() == 0
    assert db_session.query(StockRequest).count() == 0
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


def test_submit_existing_draft_rolls_back_all_lines_and_restores_draft_on_failure(
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
    original_execute_line = sr_execution._execute_line
    boom = RuntimeError("두 번째 draft 라인 후속 단계 실패")
    line_calls = 0

    def fail_on_second_line(*args, **kwargs):
        nonlocal line_calls
        line_calls += 1
        if line_calls == 2:
            raise boom
        return original_execute_line(*args, **kwargs)

    monkeypatch.setattr(sr_execution, "_execute_line", fail_on_second_line)

    with pytest.raises(RuntimeError) as raised:
        actions.submit_existing_draft(
            db_session,
            batch_id=draft_id,
            requester_employee_id=requester.employee_id,
        )

    assert raised.value is boom
    assert line_calls == 2
    assert boundaries == {"commit": 0, "rollback": 1}
    db_session.expire_all()
    restored = db_session.query(IoBatch).filter(IoBatch.batch_id == draft_id).one()
    assert restored.status == "draft"
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
    assert db_session.query(StockRequest).count() == 0
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
