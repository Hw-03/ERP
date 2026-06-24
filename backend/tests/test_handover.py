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
    Notification,
    NotificationTypeEnum,
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
    """받는 부서(고압)도 아니고 결재권도 없는 직원(진공 일반)은 인수 불가."""
    item = make_item(name="8TF Perm", warehouse_qty=Decimal("0"))
    _seed_production(db_session, item.item_id, "튜브", Decimal("5"))
    author = _make_employee(db_session, code="TUBE4", department=DepartmentEnum.TUBE)
    outsider = _make_employee(db_session, code="VAC4", department=DepartmentEnum.VACUUM)  # 진공 일반
    db_session.commit()

    hid = _create_handover(client, author, "고압", item).json()["handover_id"]
    recv = client.post(
        f"/api/handovers/{hid}/receive",
        json={"actor_employee_id": str(outsider.employee_id), "pin": "0000"},
    )
    assert recv.status_code == 403, recv.json()


def test_handover_receive_by_receiving_dept_member(client, db_session, make_item):
    """받는 부서(고압) 소속 일반 직원은 결재권이 없어도 인수 확인 가능 + 대기함 노출."""
    item = make_item(name="8TF Member", warehouse_qty=Decimal("0"))
    _seed_production(db_session, item.item_id, "튜브", Decimal("5"))
    author = _make_employee(db_session, code="TUBE7", department=DepartmentEnum.TUBE)
    member = _make_employee(
        db_session, code="HP7", name="고압사원", department=DepartmentEnum.HIGH_VOLTAGE
    )  # department_role=none — 결재권 없음
    db_session.commit()

    hid = _create_handover(client, author, "고압", item, qty=3).json()["handover_id"]

    # 일반 부서원도 인수 대기함에서 자기 부서 인수인계를 본다.
    inbox = client.get(f"/api/handovers/inbox?actor_employee_id={member.employee_id}")
    assert inbox.status_code == 200, inbox.json()
    assert len(inbox.json()) == 1

    recv = client.post(
        f"/api/handovers/{hid}/receive",
        json={"actor_employee_id": str(member.employee_id), "pin": "0000"},
    )
    assert recv.status_code == 200, recv.json()
    assert recv.json()["status"] == "received"

    db_session.expire_all()
    assert _prod_qty(db_session, item.item_id, "튜브") == Decimal("2")
    assert _prod_qty(db_session, item.item_id, "고압") == Decimal("3")


def test_handover_receive_by_other_dept_approver_403(client, db_session, make_item):
    """받는 부서가 아닌 부서 결재권자(조립 부서장)는 인수 확인 불가(403). 상태 불변."""
    item = make_item(name="8TF Appr", warehouse_qty=Decimal("0"))
    _seed_production(db_session, item.item_id, "튜브", Decimal("5"))
    author = _make_employee(db_session, code="TUBE11", department=DepartmentEnum.TUBE)
    approver = _make_employee(
        db_session, code="ASMB11", name="이필욱",
        department=DepartmentEnum.ASSEMBLY, department_role="primary",
    )
    db_session.commit()

    hid = _create_handover(client, author, "고압", item).json()["handover_id"]
    recv = client.post(
        f"/api/handovers/{hid}/receive",
        json={"actor_employee_id": str(approver.employee_id), "pin": "0000"},
    )
    assert recv.status_code == 403, recv.json()

    db_session.expire_all()
    doc = db_session.query(HandoverDoc).filter(HandoverDoc.handover_id == hid).first()
    assert doc.status == HandoverStatusEnum.SUBMITTED  # 상태 불변
    assert _prod_qty(db_session, item.item_id, "튜브") == Decimal("5")  # 이동 없음


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


def test_handover_create_notifies_receiving_dept(client, db_session, make_item):
    """인수인계 제출 → 받는 부서(고압) 소속에게만 알림. 작성자/타부서/타부서 결재자 제외."""
    item = make_item(name="8TF Notify", warehouse_qty=Decimal("0"))
    _seed_production(db_session, item.item_id, "튜브", Decimal("5"))
    author = _make_employee(db_session, code="TUBE8", name="튜브작성", department=DepartmentEnum.TUBE)
    hp_member = _make_employee(db_session, code="HP8", name="고압사원", department=DepartmentEnum.HIGH_VOLTAGE)
    approver = _make_employee(
        db_session, code="APPR8", name="이필욱", department=DepartmentEnum.ASSEMBLY, department_role="primary"
    )
    vac_member = _make_employee(db_session, code="VAC8", name="진공사원", department=DepartmentEnum.VACUUM)
    db_session.commit()

    res = _create_handover(client, author, "고압", item, qty=1)
    assert res.status_code == 201, res.json()

    db_session.expire_all()
    notes = (
        db_session.query(Notification)
        .filter(Notification.type == NotificationTypeEnum.HANDOVER_ARRIVED.value)
        .all()
    )
    recipients = {n.recipient_employee_id for n in notes}
    assert hp_member.employee_id in recipients      # 받는 부서 소속
    assert approver.employee_id not in recipients    # 타부서 결재자 — 인수 권한 없으므로 제외
    assert author.employee_id not in recipients      # 작성자 제외
    assert vac_member.employee_id not in recipients  # 타 부서 제외
    assert all(n.target_section == "handover" for n in notes)


def test_handover_draft_save_resume_submit(client, db_session, make_item):
    """임시저장(draft) → 이어쓰기 → 제출 흐름. draft 는 인수대기함 미노출, 제출 후 노출."""
    item = make_item(name="8TF Draft", warehouse_qty=Decimal("0"))
    _seed_production(db_session, item.item_id, "튜브", Decimal("5"))
    author = _make_employee(db_session, code="TUBE9", name="튜브작성", department=DepartmentEnum.TUBE)
    receiver = _make_employee(
        db_session, code="HP9", department=DepartmentEnum.HIGH_VOLTAGE, department_role="primary"
    )
    db_session.commit()

    # 1) 품목 없이 임시저장 (작성 중)
    draft = client.put(
        "/api/handovers/draft",
        json={
            "author_employee_id": str(author.employee_id),
            "to_department": "고압",
            "title": "작성 중 문서",
            "lines": [],
        },
    )
    assert draft.status_code == 200, draft.json()
    assert draft.json()["status"] == "draft"
    hid = draft.json()["handover_id"]

    # draft 는 인수 대기함에 안 뜬다
    inbox = client.get(f"/api/handovers/inbox?actor_employee_id={receiver.employee_id}")
    assert inbox.status_code == 200
    assert len(inbox.json()) == 0

    # 2) 같은 draft 에 품목 추가하며 이어쓰기 (handover_id 전달 → 갱신)
    draft2 = client.put(
        "/api/handovers/draft",
        json={
            "handover_id": hid,
            "author_employee_id": str(author.employee_id),
            "to_department": "고압",
            "title": "완성된 제목",
            "lines": [{"item_id": str(item.item_id), "quantity": 2}],
        },
    )
    assert draft2.status_code == 200, draft2.json()
    assert draft2.json()["handover_id"] == hid  # 새로 만들지 않고 갱신
    assert draft2.json()["status"] == "draft"
    assert len(draft2.json()["lines"]) == 1

    # 3) 제출
    sub = client.post(
        f"/api/handovers/{hid}/submit",
        json={"author_employee_id": str(author.employee_id)},
    )
    assert sub.status_code == 200, sub.json()
    assert sub.json()["status"] == "submitted"

    # 제출 후 인수 대기함 노출
    inbox2 = client.get(f"/api/handovers/inbox?actor_employee_id={receiver.employee_id}")
    assert len(inbox2.json()) == 1


def test_handover_submit_empty_draft_422(client, db_session, make_item):
    """품목 없는 draft 는 제출 불가(422)."""
    author = _make_employee(db_session, code="TUBE10", department=DepartmentEnum.TUBE)
    db_session.commit()
    hid = client.put(
        "/api/handovers/draft",
        json={
            "author_employee_id": str(author.employee_id),
            "to_department": "고압",
            "title": "빈 문서",
            "lines": [],
        },
    ).json()["handover_id"]
    sub = client.post(
        f"/api/handovers/{hid}/submit",
        json={"author_employee_id": str(author.employee_id)},
    )
    assert sub.status_code == 422, sub.json()


def test_handover_inbox_only_receiving_dept_member(client, db_session, make_item):
    """인수 대기함은 받는 부서(고압) 소속에게만 — 타부서 결재권자는 못 본다."""
    item = make_item(name="8TF Inbox", warehouse_qty=Decimal("0"))
    _seed_production(db_session, item.item_id, "튜브", Decimal("5"))
    author = _make_employee(db_session, code="TUBE6", department=DepartmentEnum.TUBE)
    receiver = _make_employee(
        db_session, code="HP6", department=DepartmentEnum.HIGH_VOLTAGE
    )  # 고압 소속 (결재권 없음)
    approver = _make_employee(
        db_session, code="ASMB6", department=DepartmentEnum.ASSEMBLY, department_role="primary"
    )  # 조립 결재권자 — 받는 부서 아님
    db_session.commit()

    _create_handover(client, author, "고압", item, qty=1)

    # 받는 부서(고압) 소속은 본다
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

    # 타부서 결재권자는 못 본다
    appr_inbox = client.get(
        f"/api/handovers/inbox?actor_employee_id={approver.employee_id}"
    )
    assert appr_inbox.status_code == 200
    assert len(appr_inbox.json()) == 0
    appr_count = client.get(
        f"/api/handovers/inbox/count?actor_employee_id={approver.employee_id}"
    )
    assert appr_count.json()["count"] == 0
