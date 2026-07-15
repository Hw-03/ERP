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
    IoBatch,
    Notification,
    StockRequest,
    TransactionLog,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
)
from app.schemas import IoSubmitRequest
from app.services import io_actions as actions
from app.services import io_dispatch, io_draft
from app.services import sr_execution
from app.services import warehouse_map as warehouse_map_svc
from app.services.pin_auth import DEFAULT_PIN_HASH

def _make_requester(
    db_session,
    *,
    department: DepartmentEnum = DepartmentEnum.WAREHOUSE,
    warehouse_role: str = "primary",
) -> Employee:
    requester = Employee(
        employee_code=f"IO-ACT-{uuid.uuid4().hex[:8]}",
        name="IO 원자성 작업자",
        role="창고/사원",
        department=department,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role=warehouse_role,
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
