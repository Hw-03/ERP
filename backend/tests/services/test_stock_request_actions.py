"""StockRequest HTTP command의 application-service 트랜잭션 계약."""

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models import (
    BoxSizeEnum,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    Notification,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    TransactionLog,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
)
from app.services.pin_auth import DEFAULT_PIN_HASH
from app.services import sr_execution as sr_execution_svc
from app.services import warehouse_map as warehouse_map_svc


def _employee(
    db_session,
    *,
    code: str,
    name: str,
    warehouse_role: str = "none",
    department_role: str = "none",
) -> Employee:
    employee = Employee(
        employee_code=code,
        name=name,
        role=f"{DepartmentEnum.ASSEMBLY.value}/사원",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role=warehouse_role,
        department_role=department_role,
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def _warehouse_box(db_session, *, item_id, quantity: int) -> WarehouseBox:
    angle = WarehouseAngle(label="StockRequest action", rows=1, layers=1, jaris_per_cell=1)
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
    return box


def _box_quantity(db_session, box_id) -> int:
    content = (
        db_session.query(WarehouseBoxItem)
        .filter(WarehouseBoxItem.box_id == box_id)
        .one()
    )
    return int(content.quantity)


def test_create_rolls_back_request_lines_and_pending_when_notification_fails(
    db_session,
    client,
    make_item,
    monkeypatch,
) -> None:
    item = make_item(name="StockRequest create rollback", warehouse_qty=Decimal("5"))
    requester = _employee(db_session, code="SR-ACT-CREATE", name="요청자")
    db_session.commit()

    def fail_notification(*_args, **_kwargs) -> None:
        raise RuntimeError("notification failure")

    monkeypatch.setattr(
        "app.routers.stock_requests.notif_svc.notify_request_arrived",
        fail_notification,
    )

    with pytest.raises(RuntimeError, match="notification failure"):
        client.post(
            "/api/stock-requests",
            json={
                "requester_employee_id": str(requester.employee_id),
                "request_type": "warehouse_to_dept",
                "lines": [
                    {
                        "item_id": str(item.item_id),
                        "quantity": "2",
                        "from_bucket": "warehouse",
                        "to_bucket": "production",
                        "to_department": DepartmentEnum.ASSEMBLY.value,
                    }
                ],
            },
        )

    db_session.expire_all()
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert db_session.query(StockRequest).count() == 0
    assert db_session.query(StockRequestLine).count() == 0
    assert db_session.query(Notification).count() == 0
    assert inventory.pending_quantity == Decimal("0")


def test_warehouse_approve_rolls_back_inventory_box_log_and_status_when_notification_fails(
    db_session,
    client,
    make_item,
    monkeypatch,
) -> None:
    warehouse_map_svc.set_box_tracking_enabled(db_session, True)
    item = make_item(name="StockRequest approve rollback", warehouse_qty=Decimal("10"))
    box = _warehouse_box(db_session, item_id=item.item_id, quantity=10)
    requester = _employee(db_session, code="SR-ACT-APP-RQ", name="요청자")
    approver = _employee(
        db_session,
        code="SR-ACT-APP-WH",
        name="창고 승인자",
        warehouse_role="primary",
    )
    db_session.commit()

    created = client.post(
        "/api/stock-requests",
        json={
            "requester_employee_id": str(requester.employee_id),
            "request_type": "warehouse_to_dept",
            "lines": [
                {
                    "item_id": str(item.item_id),
                    "quantity": "3",
                    "from_bucket": "warehouse",
                    "to_bucket": "production",
                    "to_department": DepartmentEnum.ASSEMBLY.value,
                }
            ],
        },
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["request_id"]

    notifications_before = db_session.query(Notification).count()

    def fail_notification(*_args, **_kwargs) -> None:
        raise RuntimeError("approval notification failure")

    monkeypatch.setattr(
        "app.routers.stock_requests.notif_svc.notify_request_decided",
        fail_notification,
    )

    with pytest.raises(RuntimeError, match="approval notification failure"):
        client.post(
            f"/api/stock-requests/{request_id}/approve",
            json={"actor_employee_id": str(approver.employee_id), "pin": "0000"},
        )

    db_session.expire_all()
    request = db_session.query(StockRequest).filter(StockRequest.request_id == request_id).one()
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert request.status == StockRequestStatusEnum.RESERVED
    assert request.approved_by_employee_id is None
    assert inventory.warehouse_qty == Decimal("10")
    assert inventory.pending_quantity == Decimal("3")
    assert _box_quantity(db_session, box.box_id) == 10
    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(Notification).count() == notifications_before


def test_department_approve_rolls_back_execution_when_notification_fails(
    db_session,
    client,
    make_item,
    monkeypatch,
) -> None:
    warehouse_map_svc.set_box_tracking_enabled(db_session, True)
    item = make_item(name="Department approve rollback", warehouse_qty=Decimal("10"))
    box = _warehouse_box(db_session, item_id=item.item_id, quantity=10)
    requester = _employee(db_session, code="SR-ACT-DEPT-RQ", name="요청자")
    warehouse_approver = _employee(
        db_session,
        code="SR-ACT-DEPT-WH",
        name="창고 승인자",
        warehouse_role="primary",
    )
    department_approver = _employee(
        db_session,
        code="SR-ACT-DEPT-AP",
        name="부서 승인자",
        department_role="primary",
    )
    db_session.commit()

    created = client.post(
        "/api/stock-requests",
        json={
            "requester_employee_id": str(requester.employee_id),
            "request_type": "warehouse_to_dept",
            "lines": [
                {
                    "item_id": str(item.item_id),
                    "quantity": "3",
                    "from_bucket": "warehouse",
                    "to_bucket": "production",
                    "to_department": DepartmentEnum.ASSEMBLY.value,
                }
            ],
        },
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["request_id"]
    request = db_session.query(StockRequest).filter(StockRequest.request_id == request_id).one()
    request.requires_department_approval = True
    db_session.commit()

    warehouse_approved = client.post(
        f"/api/stock-requests/{request_id}/approve",
        json={"actor_employee_id": str(warehouse_approver.employee_id), "pin": "0000"},
    )
    assert warehouse_approved.status_code == 200, warehouse_approved.text
    assert warehouse_approved.json()["status"] == "reserved"
    notifications_before = db_session.query(Notification).count()

    def fail_notification(*_args, **_kwargs) -> None:
        raise RuntimeError("department approval notification failure")

    monkeypatch.setattr(
        "app.routers.stock_requests.notif_svc.notify_request_decided",
        fail_notification,
    )

    with pytest.raises(RuntimeError, match="department approval notification failure"):
        client.post(
            f"/api/stock-requests/{request_id}/department-approve",
            json={"actor_employee_id": str(department_approver.employee_id), "pin": "0000"},
        )

    db_session.expire_all()
    request = db_session.query(StockRequest).filter(StockRequest.request_id == request_id).one()
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert request.status == StockRequestStatusEnum.RESERVED
    assert request.approved_by_employee_id == warehouse_approver.employee_id
    assert request.department_approved_by_employee_id is None
    assert inventory.warehouse_qty == Decimal("10")
    assert inventory.pending_quantity == Decimal("3")
    assert _box_quantity(db_session, box.box_id) == 10
    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(Notification).count() == notifications_before


def test_cancel_rolls_back_pending_and_status_when_batch_sync_fails(
    db_session,
    client,
    make_item,
    monkeypatch,
) -> None:
    item = make_item(name="StockRequest cancel rollback", warehouse_qty=Decimal("5"))
    requester = _employee(db_session, code="SR-ACT-CANCEL", name="요청자")
    db_session.commit()

    created = client.post(
        "/api/stock-requests",
        json={
            "requester_employee_id": str(requester.employee_id),
            "request_type": "warehouse_to_dept",
            "lines": [
                {
                    "item_id": str(item.item_id),
                    "quantity": "2",
                    "from_bucket": "warehouse",
                    "to_bucket": "production",
                    "to_department": DepartmentEnum.ASSEMBLY.value,
                }
            ],
        },
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["request_id"]

    boundaries = {"commit": 0, "rollback": 0}
    original_commit = db_session.commit
    original_rollback = db_session.rollback

    def counted_commit() -> None:
        boundaries["commit"] += 1
        original_commit()

    def counted_rollback() -> None:
        boundaries["rollback"] += 1
        original_rollback()

    monkeypatch.setattr(db_session, "commit", counted_commit)
    monkeypatch.setattr(db_session, "rollback", counted_rollback)

    def fail_batch_sync(*_args, **_kwargs) -> None:
        raise RuntimeError("batch sync failure")

    monkeypatch.setattr(
        "app.services.sr_approval.sync_batch_from_stock_request",
        fail_batch_sync,
    )

    with pytest.raises(RuntimeError, match="batch sync failure"):
        client.post(
            f"/api/stock-requests/{request_id}/cancel",
            json={"actor_employee_id": str(requester.employee_id), "pin": "0000"},
        )

    db_session.expire_all()
    request = db_session.query(StockRequest).filter(StockRequest.request_id == request_id).one()
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert request.status == StockRequestStatusEnum.RESERVED
    assert request.cancelled_at is None
    assert all(line.status == StockRequestStatusEnum.RESERVED for line in request.lines)
    assert inventory.pending_quantity == Decimal("2")
    assert boundaries == {"commit": 0, "rollback": 1}


def test_failed_approval_rolls_back_execution_then_commits_only_failure_state(
    db_session,
    client,
    make_item,
    monkeypatch,
) -> None:
    item = make_item(name="Failed approval two UoW", warehouse_qty=Decimal("10"))
    requester = _employee(db_session, code="SR-ACT-FAIL-RQ", name="요청자")
    approver = _employee(
        db_session,
        code="SR-ACT-FAIL-WH",
        name="창고 승인자",
        warehouse_role="primary",
    )
    db_session.commit()

    created = client.post(
        "/api/stock-requests",
        json={
            "requester_employee_id": str(requester.employee_id),
            "request_type": "warehouse_to_dept",
            "lines": [
                {
                    "item_id": str(item.item_id),
                    "quantity": "3",
                    "from_bucket": "warehouse",
                    "to_bucket": "production",
                    "to_department": DepartmentEnum.ASSEMBLY.value,
                }
            ],
        },
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["request_id"]

    warehouse_map_svc.set_box_tracking_enabled(db_session, True)
    box = _warehouse_box(db_session, item_id=item.item_id, quantity=1)
    db_session.commit()

    boundaries = {"commit": 0, "rollback": 0}
    original_commit = db_session.commit
    original_rollback = db_session.rollback

    def counted_commit() -> None:
        boundaries["commit"] += 1
        original_commit()

    def counted_rollback() -> None:
        boundaries["rollback"] += 1
        original_rollback()

    monkeypatch.setattr(db_session, "commit", counted_commit)
    monkeypatch.setattr(db_session, "rollback", counted_rollback)

    response = client.post(
        f"/api/stock-requests/{request_id}/approve",
        json={"actor_employee_id": str(approver.employee_id), "pin": "0000"},
    )

    assert response.status_code == 409, response.text
    db_session.expire_all()
    request = db_session.query(StockRequest).filter(StockRequest.request_id == request_id).one()
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert request.status == StockRequestStatusEnum.FAILED_APPROVAL
    assert request.approved_by_employee_id is None
    assert request.rejected_by_employee_id == approver.employee_id
    assert request.rejected_reason and request.rejected_reason.startswith("승인 실패:")
    assert all(
        line.status == StockRequestStatusEnum.RESERVED
        for line in request.lines
    )
    assert inventory.warehouse_qty == Decimal("10")
    assert inventory.pending_quantity == Decimal("0")
    assert _box_quantity(db_session, box.box_id) == 1
    assert db_session.query(TransactionLog).count() == 0
    assert boundaries == {"commit": 1, "rollback": 1}


def test_multiline_approval_rolls_back_first_line_after_second_line_late_failure(
    db_session,
    client,
    make_item,
    monkeypatch,
) -> None:
    warehouse_map_svc.set_box_tracking_enabled(db_session, True)
    first_item = make_item(
        name="StockRequest multiline first",
        warehouse_qty=Decimal("10"),
    )
    second_item = make_item(
        name="StockRequest multiline second",
        warehouse_qty=Decimal("10"),
    )
    first_box = _warehouse_box(db_session, item_id=first_item.item_id, quantity=10)
    _warehouse_box(db_session, item_id=second_item.item_id, quantity=10)
    requester = _employee(db_session, code="SR-MULTI-RQ", name="다라인 요청자")
    approver = _employee(
        db_session,
        code="SR-MULTI-WH",
        name="다라인 승인자",
        warehouse_role="primary",
    )
    db_session.commit()

    created = client.post(
        "/api/stock-requests",
        json={
            "requester_employee_id": str(requester.employee_id),
            "request_type": "warehouse_to_dept",
            "lines": [
                {
                    "item_id": str(first_item.item_id),
                    "quantity": "3",
                    "from_bucket": "warehouse",
                    "to_bucket": "production",
                    "to_department": DepartmentEnum.ASSEMBLY.value,
                },
                {
                    "item_id": str(second_item.item_id),
                    "quantity": "4",
                    "from_bucket": "warehouse",
                    "to_bucket": "production",
                    "to_department": DepartmentEnum.ASSEMBLY.value,
                },
            ],
        },
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["request_id"]

    original_capture_effect = sr_execution_svc.inv_effect.capture_effect
    capture_calls = 0
    observed_first_line: dict[str, object] = {}

    def fail_during_second_line_capture(db, item_id, cells_before):
        nonlocal capture_calls
        capture_calls += 1
        if capture_calls == 2:
            first_inventory = (
                db.query(Inventory)
                .filter(Inventory.item_id == first_item.item_id)
                .one()
            )
            first_box_content = (
                db.query(WarehouseBoxItem)
                .filter(WarehouseBoxItem.box_id == first_box.box_id)
                .one()
            )
            observed_first_line.update(
                warehouse_qty=first_inventory.warehouse_qty,
                box_quantity=int(first_box_content.quantity),
                log_count=(
                    db.query(TransactionLog)
                    .filter(TransactionLog.item_id == first_item.item_id)
                    .count()
                ),
            )
            raise RuntimeError("second line capture failure")
        return original_capture_effect(db, item_id, cells_before)

    monkeypatch.setattr(
        sr_execution_svc.inv_effect,
        "capture_effect",
        fail_during_second_line_capture,
    )

    with pytest.raises(RuntimeError, match="second line capture failure"):
        client.post(
            f"/api/stock-requests/{request_id}/approve",
            json={"actor_employee_id": str(approver.employee_id), "pin": "0000"},
        )

    assert observed_first_line == {
        "warehouse_qty": Decimal("7"),
        "box_quantity": 7,
        "log_count": 1,
    }

    with Session(bind=db_session.get_bind()) as verify_db:
        request = (
            verify_db.query(StockRequest)
            .filter(StockRequest.request_id == request_id)
            .one()
        )
        first_inventory = (
            verify_db.query(Inventory)
            .filter(Inventory.item_id == first_item.item_id)
            .one()
        )
        first_box_total = sum(
            int(content.quantity)
            for content in verify_db.query(WarehouseBoxItem)
            .filter(WarehouseBoxItem.item_id == first_item.item_id)
            .all()
        )
        first_log_count = (
            verify_db.query(TransactionLog)
            .filter(TransactionLog.item_id == first_item.item_id)
            .count()
        )

        assert request.status == StockRequestStatusEnum.RESERVED
        assert all(
            line.status == StockRequestStatusEnum.RESERVED for line in request.lines
        )
        assert first_inventory.warehouse_qty == Decimal("10")
        assert first_inventory.pending_quantity == Decimal("3")
        assert first_box_total == 10
        assert first_log_count == 0
