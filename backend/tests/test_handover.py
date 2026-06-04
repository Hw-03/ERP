"""인수인계서 통합 테스트 — 작성/인수확인/재고이동/권한."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    HandoverDoc,
    HandoverStatusEnum,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin


def _make_employee(
    db_session,
    *,
    code: str,
    name: str = "직원",
    department: DepartmentEnum = DepartmentEnum.TUBE,
    department_role: str = "none",
    warehouse_role: str = "none",
    pin: str = "0000",
) -> Employee:
    emp = Employee(
        employee_code=code,
        name=name,
        role=f"{department.value}/staff",
        department=department.value,
        level=EmployeeLevelEnum.STAFF,
        warehouse_role=warehouse_role,
        department_role=department_role,
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH if pin == "0000" else hash_pin(pin),
    )
    db_session.add(emp)
    db_session.flush()
    return emp


def _seed_production(db_session, item_id, dept_value: str, qty: Decimal) -> None:
    inv = db_session.query(Inventory).filter(Inventory.item_id == item_id).first()
    db_session.add(
        InventoryLocation(
            item_id=item_id,
            department=dept_value,
            status=LocationStatusEnum.PRODUCTION,
            quantity=qty,
        )
    )
    db_session.flush()
    loc_sum = (
        db_session.query(func.coalesce(func.sum(InventoryLocation.quantity), 0))
        .filter(InventoryLocation.item_id == item_id)
        .scalar()
    ) or 0
    inv.quantity = (inv.warehouse_qty or Decimal("0")) + Decimal(str(loc_sum))
    db_session.flush()


def _prod_qty(db_session, item_id, dept_value: str) -> Decimal:
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept_value,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    return loc.quantity if loc else Decimal("0")


def _create_handover(client, author, to_dept, item, qty=3, title="튜브 인수인계서"):
    return client.post(
        "/api/handovers",
        json={
            "author_employee_id": str(author.employee_id),
            "to_department": to_dept,
            "title": title,
            "process_content": "튜브 인수인계",
            "product_name": "70 KV Filament Tube",
            "analysis_text": "26D021, 26D022, 26D023",
            "lines": [{"item_id": str(item.item_id), "quantity": qty}],
        },
    )


def test_handover_create_and_receive_moves_stock(client, db_session, make_item):
    item = make_item(name="8TF Tube", warehouse_qty=Decimal("0"))
    _seed_production(db_session, item.item_id, "튜브", Decimal("5"))
    author = _make_employee(db_session, code="TUBE1", name="권동환", department=DepartmentEnum.TUBE)
    receiver = _make_employee(
        db_session, code="HP1", name="고압인수",
        department=DepartmentEnum.HIGH_VOLTAGE, department_role="primary",
    )
    db_session.commit()

    res = _create_handover(client, author, "고압", item, qty=3)
    assert res.status_code == 201, res.json()
    assert res.json()["status"] == "submitted"
    hid = res.json()["handover_id"]

    recv = client.post(
        f"/api/handovers/{hid}/receive",
        json={"actor_employee_id": str(receiver.employee_id), "pin": "0000"},
    )
    assert recv.status_code == 200, recv.json()
    assert recv.json()["status"] == "received"
    assert recv.json()["received_by_name"] == "고압인수"

    db_session.expire_all()
    assert _prod_qty(db_session, item.item_id, "튜브") == Decimal("2")
    assert _prod_qty(db_session, item.item_id, "고압") == Decimal("3")

    logs = (
        db_session.query(TransactionLog)
        .filter(
            TransactionLog.item_id == item.item_id,
            TransactionLog.transaction_type == TransactionTypeEnum.TRANSFER_DEPT,
        )
        .all()
    )
    assert len(logs) == 1
    assert logs[0].transfer_qty == Decimal("3")


def test_handover_receive_insufficient_stock_422(client, db_session, make_item):
    item = make_item(name="8TF Short", warehouse_qty=Decimal("0"))
    _seed_production(db_session, item.item_id, "튜브", Decimal("1"))
    author = _make_employee(db_session, code="TUBE2", department=DepartmentEnum.TUBE)
    receiver = _make_employee(
        db_session, code="HP2", department=DepartmentEnum.HIGH_VOLTAGE, department_role="primary"
    )
    db_session.commit()

    hid = _create_handover(client, author, "고압", item, qty=3).json()["handover_id"]
    recv = client.post(
        f"/api/handovers/{hid}/receive",
        json={"actor_employee_id": str(receiver.employee_id), "pin": "0000"},
    )
    assert recv.status_code == 422, recv.json()

    db_session.expire_all()
    doc = db_session.query(HandoverDoc).filter(HandoverDoc.handover_id == hid).first()
    assert doc.status == HandoverStatusEnum.SUBMITTED  # 상태 불변
    assert _prod_qty(db_session, item.item_id, "튜브") == Decimal("1")  # 이동 없음


def test_handover_receive_wrong_pin_403(client, db_session, make_item):
    item = make_item(name="8TF Pin", warehouse_qty=Decimal("0"))
    _seed_production(db_session, item.item_id, "튜브", Decimal("5"))
    author = _make_employee(db_session, code="TUBE3", department=DepartmentEnum.TUBE)
    receiver = _make_employee(
        db_session, code="HP3", department=DepartmentEnum.HIGH_VOLTAGE,
        department_role="primary", pin="1234",
    )
    db_session.commit()

    hid = _create_handover(client, author, "고압", item).json()["handover_id"]
    recv = client.post(
        f"/api/handovers/{hid}/receive",
        json={"actor_employee_id": str(receiver.employee_id), "pin": "0000"},
    )
    assert recv.status_code == 403, recv.json()


def test_handover_receive_no_permission_403(client, db_session, make_item):
    item = make_item(name="8TF Perm", warehouse_qty=Decimal("0"))
    _seed_production(db_session, item.item_id, "튜브", Decimal("5"))
    author = _make_employee(db_session, code="TUBE4", department=DepartmentEnum.TUBE)
    plain = _make_employee(db_session, code="HP4", department=DepartmentEnum.HIGH_VOLTAGE)  # 결재권 없음
    db_session.commit()

    hid = _create_handover(client, author, "고압", item).json()["handover_id"]
    recv = client.post(
        f"/api/handovers/{hid}/receive",
        json={"actor_employee_id": str(plain.employee_id), "pin": "0000"},
    )
    assert recv.status_code == 403, recv.json()


def test_handover_receive_idempotent(client, db_session, make_item):
    item = make_item(name="8TF Idem", warehouse_qty=Decimal("0"))
    _seed_production(db_session, item.item_id, "튜브", Decimal("5"))
    author = _make_employee(db_session, code="TUBE5", department=DepartmentEnum.TUBE)
    receiver = _make_employee(
        db_session, code="HP5", department=DepartmentEnum.HIGH_VOLTAGE, department_role="primary"
    )
    db_session.commit()

    hid = _create_handover(client, author, "고압", item, qty=2).json()["handover_id"]
    first = client.post(
        f"/api/handovers/{hid}/receive",
        json={"actor_employee_id": str(receiver.employee_id), "pin": "0000"},
    )
    assert first.status_code == 200
    second = client.post(
        f"/api/handovers/{hid}/receive",
        json={"actor_employee_id": str(receiver.employee_id), "pin": "0000"},
    )
    assert second.status_code == 200  # 멱등 — 이미 received

    db_session.expire_all()
    # 이중 이동 없음 — 고압 3 이 아니라 2
    assert _prod_qty(db_session, item.item_id, "고압") == Decimal("2")
    assert (
        db_session.query(TransactionLog)
        .filter(
            TransactionLog.item_id == item.item_id,
            TransactionLog.transaction_type == TransactionTypeEnum.TRANSFER_DEPT,
        )
        .count()
        == 1
    )


def test_handover_inbox_filters_submitted_to_approvable(client, db_session, make_item):
    item = make_item(name="8TF Inbox", warehouse_qty=Decimal("0"))
    _seed_production(db_session, item.item_id, "튜브", Decimal("5"))
    author = _make_employee(db_session, code="TUBE6", department=DepartmentEnum.TUBE)
    receiver = _make_employee(
        db_session, code="HP6", department=DepartmentEnum.HIGH_VOLTAGE, department_role="primary"
    )
    db_session.commit()

    _create_handover(client, author, "고압", item, qty=1)

    inbox = client.get(
        f"/api/handovers/inbox?actor_employee_id={receiver.employee_id}"
    )
    assert inbox.status_code == 200, inbox.json()
    assert len(inbox.json()) == 1
    assert inbox.json()[0]["to_department"] == "고압"

    count = client.get(
        f"/api/handovers/inbox/count?actor_employee_id={receiver.employee_id}"
    )
    assert count.json()["count"] == 1
