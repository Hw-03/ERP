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
    IoBatch,
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
from app.services import stock_request_actions as action_svc
from app.services import stock_requests as stock_request_svc
from app.services import warehouse_map as warehouse_map_svc
from app.routers import stock_requests as stock_request_router


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


def _linked_batch(db_session, requester: Employee, *, status: str = "reserved") -> IoBatch:
    batch = IoBatch(
        work_type="warehouse_io",
        sub_type="warehouse_to_dept",
        status=status,
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=requester.department.value,
        requires_approval=True,
    )
    db_session.add(batch)
    db_session.flush()
    return batch


def _open_linked_request(client, db_session, *, requester: Employee, batch: IoBatch | None, item_id, quantity: str = "2") -> StockRequest:
    created = client.post(
        "/api/stock-requests",
        json={
            "requester_employee_id": str(requester.employee_id),
            "request_type": "warehouse_to_dept",
            "lines": [{
                "item_id": str(item_id),
                "quantity": quantity,
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            }],
        },
    )
    assert created.status_code == 201, created.text
    request = db_session.query(StockRequest).filter(
        StockRequest.request_id == created.json()["request_id"]
    ).one()
    if batch is not None:
        request.operation_batch_id = batch.batch_id
    db_session.commit()
    return request


def test_revert_to_draft_rejects_unlinked_request_without_mutation(
    client, db_session, make_item
) -> None:
    item = make_item(name="Unlinked revert", warehouse_qty=Decimal("5"))
    requester = _employee(db_session, code="SR-REV-UNLINKED", name="요청자")
    db_session.commit()
    request = _open_linked_request(
        client,
        db_session,
        requester=requester,
        batch=None,
        item_id=item.item_id,
    )

    response = client.post(
        f"/api/stock-requests/{request.request_id}/revert-to-draft",
        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"},
    )

    assert response.status_code == 422, response.text
    db_session.expire_all()
    persisted = db_session.query(StockRequest).filter(StockRequest.request_id == request.request_id).one()
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert persisted.status == StockRequestStatusEnum.RESERVED
    assert inventory.pending_quantity == Decimal("2")


def test_revert_to_draft_cancels_all_open_linked_requests_and_releases_reservations(
    client, db_session, make_item
) -> None:
    first = make_item(name="Multi revert first", warehouse_qty=Decimal("5"))
    second = make_item(name="Multi revert second", warehouse_qty=Decimal("5"))
    requester = _employee(db_session, code="SR-REV-MULTI", name="요청자")
    batch = _linked_batch(db_session, requester)
    db_session.commit()
    clicked = _open_linked_request(
        client, db_session, requester=requester, batch=batch, item_id=first.item_id
    )
    sibling = _open_linked_request(
        client, db_session, requester=requester, batch=batch, item_id=second.item_id
    )

    response = client.post(
        f"/api/stock-requests/{clicked.request_id}/revert-to-draft",
        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"},
    )

    assert response.status_code == 204, response.text
    db_session.expire_all()
    persisted_batch = db_session.query(IoBatch).filter(IoBatch.batch_id == batch.batch_id).one()
    requests = db_session.query(StockRequest).filter(
        StockRequest.operation_batch_id == batch.batch_id
    ).order_by(StockRequest.created_at, StockRequest.request_id).all()
    inventories = db_session.query(Inventory).filter(
        Inventory.item_id.in_([first.item_id, second.item_id])
    ).all()
    assert [request.status for request in requests] == [
        StockRequestStatusEnum.CANCELLED,
        StockRequestStatusEnum.CANCELLED,
    ]
    assert persisted_batch.status == "draft"
    assert all(inventory.pending_quantity == Decimal("0") for inventory in inventories)


def test_revert_to_draft_rejects_completed_sibling_without_mutation(
    client, db_session, make_item
) -> None:
    first = make_item(name="Completed sibling first", warehouse_qty=Decimal("5"))
    second = make_item(name="Completed sibling second", warehouse_qty=Decimal("5"))
    requester = _employee(db_session, code="SR-REV-COMPLETE", name="요청자")
    batch = _linked_batch(db_session, requester)
    db_session.commit()
    clicked = _open_linked_request(
        client, db_session, requester=requester, batch=batch, item_id=first.item_id
    )
    completed = _open_linked_request(
        client, db_session, requester=requester, batch=batch, item_id=second.item_id
    )
    completed.status = StockRequestStatusEnum.COMPLETED
    for line in completed.lines:
        line.status = StockRequestStatusEnum.COMPLETED
    db_session.commit()

    response = client.post(
        f"/api/stock-requests/{clicked.request_id}/revert-to-draft",
        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"},
    )

    assert response.status_code == 422, response.text
    db_session.expire_all()
    persisted_batch = db_session.query(IoBatch).filter(IoBatch.batch_id == batch.batch_id).one()
    requests = db_session.query(StockRequest).filter(
        StockRequest.operation_batch_id == batch.batch_id
    ).order_by(StockRequest.created_at, StockRequest.request_id).all()
    assert persisted_batch.status == "reserved"
    assert [request.status for request in requests] == [
        StockRequestStatusEnum.RESERVED,
        StockRequestStatusEnum.COMPLETED,
    ]


def test_revert_to_draft_rolls_back_all_cancellations_when_later_cancel_fails(
    client, db_session, make_item, monkeypatch
) -> None:
    first = make_item(name="Rollback revert first", warehouse_qty=Decimal("5"))
    second = make_item(name="Rollback revert second", warehouse_qty=Decimal("5"))
    requester = _employee(db_session, code="SR-REV-ROLLBACK", name="요청자")
    batch = _linked_batch(db_session, requester)
    db_session.commit()
    clicked = _open_linked_request(
        client, db_session, requester=requester, batch=batch, item_id=first.item_id
    )
    _open_linked_request(client, db_session, requester=requester, batch=batch, item_id=second.item_id)
    real_cancel = stock_request_svc.cancel_request
    calls = 0

    def fail_second_cancel(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("second cancellation failure")
        return real_cancel(*args, **kwargs)

    monkeypatch.setattr(stock_request_svc, "cancel_request", fail_second_cancel)

    with pytest.raises(RuntimeError, match="second cancellation failure"):
        action_svc.revert_to_draft(
            db_session,
            request=clicked,
            requester=requester,
            pin="0000",
        )

    db_session.expire_all()
    persisted_batch = db_session.query(IoBatch).filter(IoBatch.batch_id == batch.batch_id).one()
    requests = db_session.query(StockRequest).filter(
        StockRequest.operation_batch_id == batch.batch_id
    ).all()
    inventories = db_session.query(Inventory).filter(
        Inventory.item_id.in_([first.item_id, second.item_id])
    ).all()
    assert persisted_batch.status == "reserved"
    assert all(request.status == StockRequestStatusEnum.RESERVED for request in requests)
    assert all(inventory.pending_quantity == Decimal("2") for inventory in inventories)


def test_revert_to_draft_cancels_single_open_linked_request(
    client, db_session, make_item
) -> None:
    item = make_item(name="Single revert", warehouse_qty=Decimal("5"))
    requester = _employee(db_session, code="SR-REV-SINGLE", name="요청자")
    batch = _linked_batch(db_session, requester)
    db_session.commit()
    request = _open_linked_request(
        client, db_session, requester=requester, batch=batch, item_id=item.item_id
    )

    response = client.post(
        f"/api/stock-requests/{request.request_id}/revert-to-draft",
        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"},
    )

    assert response.status_code == 204, response.text
    db_session.expire_all()
    persisted_batch = db_session.query(IoBatch).filter(IoBatch.batch_id == batch.batch_id).one()
    persisted_request = db_session.query(StockRequest).filter(
        StockRequest.request_id == request.request_id
    ).one()
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert persisted_batch.status == "draft"
    assert persisted_request.status == StockRequestStatusEnum.CANCELLED
    assert inventory.pending_quantity == Decimal("0")


@pytest.mark.parametrize("batch_status", ["completed", "partially_completed"])
def test_revert_to_draft_rejects_completed_batch_without_mutation(
    client, db_session, make_item, batch_status
) -> None:
    item = make_item(name=f"Completed batch {batch_status}", warehouse_qty=Decimal("5"))
    requester = _employee(db_session, code=f"SR-REV-{batch_status}", name="요청자")
    batch = _linked_batch(db_session, requester, status=batch_status)
    db_session.commit()
    request = _open_linked_request(
        client, db_session, requester=requester, batch=batch, item_id=item.item_id
    )

    response = client.post(
        f"/api/stock-requests/{request.request_id}/revert-to-draft",
        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"},
    )

    assert response.status_code == 422, response.text
    db_session.expire_all()
    persisted_batch = db_session.query(IoBatch).filter(IoBatch.batch_id == batch.batch_id).one()
    persisted_request = db_session.query(StockRequest).filter(
        StockRequest.request_id == request.request_id
    ).one()
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert persisted_batch.status == batch_status
    assert persisted_request.status == StockRequestStatusEnum.RESERVED
    assert inventory.pending_quantity == Decimal("2")


def test_revert_to_draft_cancels_submitted_and_preserves_terminal_siblings(
    client, db_session, make_item
) -> None:
    submitted_item = make_item(name="Submitted revert", warehouse_qty=Decimal("5"))
    rejected_item = make_item(name="Rejected sibling", warehouse_qty=Decimal("5"))
    failed_item = make_item(name="Failed sibling", warehouse_qty=Decimal("5"))
    requester = _employee(db_session, code="SR-REV-PRESERVE", name="요청자")
    batch = _linked_batch(db_session, requester)
    db_session.commit()
    submitted = _open_linked_request(
        client, db_session, requester=requester, batch=batch, item_id=submitted_item.item_id
    )
    rejected = _open_linked_request(
        client, db_session, requester=requester, batch=batch, item_id=rejected_item.item_id
    )
    failed = _open_linked_request(
        client, db_session, requester=requester, batch=batch, item_id=failed_item.item_id
    )
    submitted.status = StockRequestStatusEnum.SUBMITTED
    for line in submitted.lines:
        line.status = StockRequestStatusEnum.SUBMITTED
    rejected.status = StockRequestStatusEnum.REJECTED
    failed.status = StockRequestStatusEnum.FAILED_APPROVAL
    db_session.commit()

    response = client.post(
        f"/api/stock-requests/{submitted.request_id}/revert-to-draft",
        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"},
    )

    assert response.status_code == 204, response.text
    db_session.expire_all()
    requests = db_session.query(StockRequest).filter(
        StockRequest.operation_batch_id == batch.batch_id
    ).order_by(StockRequest.created_at, StockRequest.request_id).all()
    assert [request.status for request in requests] == [
        StockRequestStatusEnum.CANCELLED,
        StockRequestStatusEnum.REJECTED,
        StockRequestStatusEnum.FAILED_APPROVAL,
    ]


def test_revert_to_draft_requires_matching_batch_requester(
    client, db_session, make_item
) -> None:
    item = make_item(name="Batch owner mismatch", warehouse_qty=Decimal("5"))
    requester = _employee(db_session, code="SR-REV-BATCH-REQUESTER", name="요청자")
    batch_owner = _employee(db_session, code="SR-REV-BATCH-OWNER", name="다른작성자")
    batch = _linked_batch(db_session, batch_owner)
    db_session.commit()
    request = _open_linked_request(
        client, db_session, requester=requester, batch=batch, item_id=item.item_id
    )

    response = client.post(
        f"/api/stock-requests/{request.request_id}/revert-to-draft",
        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"},
    )

    assert response.status_code == 403, response.text
    db_session.expire_all()
    persisted_batch = db_session.query(IoBatch).filter(IoBatch.batch_id == batch.batch_id).one()
    persisted_request = db_session.query(StockRequest).filter(
        StockRequest.request_id == request.request_id
    ).one()
    assert persisted_batch.status == "reserved"
    assert persisted_request.status == StockRequestStatusEnum.RESERVED


def test_revert_to_draft_does_not_take_clicked_request_lock_before_batch_lock(
    client, db_session, make_item, monkeypatch
) -> None:
    item = make_item(name="Revert lock order", warehouse_qty=Decimal("5"))
    requester = _employee(db_session, code="SR-REV-LOCK-ORDER", name="요청자")
    batch = _linked_batch(db_session, requester)
    db_session.commit()
    request = _open_linked_request(
        client, db_session, requester=requester, batch=batch, item_id=item.item_id
    )

    def clicked_lock_must_not_run(*_args, **_kwargs):
        raise AssertionError("revert must lock batch and linked requests in its service transaction")

    monkeypatch.setattr(stock_request_router, "_load_request_for_action", clicked_lock_must_not_run)

    response = client.post(
        f"/api/stock-requests/{request.request_id}/revert-to-draft",
        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"},
    )

    assert response.status_code == 204, response.text


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
        line.status == StockRequestStatusEnum.FAILED_APPROVAL
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

    original_capture_snapshot = sr_execution_svc.inv_effect.capture_log_stock_snapshot
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
        return original_capture_snapshot(db, item_id, cells_before)

    monkeypatch.setattr(
        sr_execution_svc.inv_effect,
        "capture_log_stock_snapshot",
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
