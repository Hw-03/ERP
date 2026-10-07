"""사유 마스터의 직원 관리·중복·예약 항목 계약."""
import uuid

from app.models import AdminAuditLog, Employee
from sqlalchemy.exc import IntegrityError


def _actor(db_session):
    employee = Employee(employee_code=f"REASON-{uuid.uuid4().hex[:8]}", name="사유 담당", role="사원", department="조립", warehouse_role="none", is_active=True)
    db_session.add(employee)
    db_session.flush()
    return {"requester_employee_id": str(employee.employee_id)}


def test_all_active_staff_manage_reasons_and_normalized_duplicates(client, db_session):
    actor = _actor(db_session)
    created = client.post("/api/defects/reason-categories", json={**actor, "name": "  Abc  "})
    assert created.status_code == 201
    category = created.json()
    assert category["name"] == "Abc"
    assert client.post("/api/defects/reason-categories", json={**actor, "name": "ＡＢＣ"}).status_code == 409
    url = f'/api/defects/reason-categories/{category["category_id"]}'
    assert client.patch(url, json={**actor, "name": "변경된 사유", "is_active": False}).status_code == 200
    active = client.get("/api/defects/reason-categories", params=actor).json()
    assert category["category_id"] not in {row["category_id"] for row in active}
    managed = client.get("/api/defects/reason-categories", params={**actor, "include_inactive": True}).json()
    assert category["category_id"] in {row["category_id"] for row in managed}
    assert client.patch(url, json={**actor, "is_active": True}).status_code == 200
    assert db_session.query(AdminAuditLog).filter_by(target_id=category["category_id"]).count() == 3


def test_reserved_other_cannot_rename_or_hide_and_name_length_is_validated(client, db_session):
    actor = _actor(db_session)
    listed = client.get("/api/defects/reason-categories", params=actor)
    assert listed.status_code == 200
    other = next(row for row in listed.json() if row["is_other"])
    url = f'/api/defects/reason-categories/{other["category_id"]}'
    assert client.patch(url, json={**actor, "name": "다름"}).status_code == 400
    assert client.patch(url, json={**actor, "is_active": False}).status_code == 400
    for name in [" ", "가" * 33]:
        assert client.post("/api/defects/reason-categories", json={**actor, "name": name}).status_code == 422
    assert client.delete(url).status_code == 405


def test_inactive_actor_missing_category_and_unique_race(client, db_session, monkeypatch):
    actor = _actor(db_session)
    assert client.patch(f"/api/defects/reason-categories/{uuid.uuid4()}", json={**actor, "name": "없음"}).status_code == 404
    employee = db_session.get(Employee, uuid.UUID(actor["requester_employee_id"]))
    employee.is_active = False
    db_session.flush()
    assert client.get("/api/defects/reason-categories", params=actor).status_code == 403
    assert client.post("/api/defects/reason-categories", json={**actor, "name": "거부"}).status_code == 403
    employee.is_active = True
    db_session.flush()

    def fail_commit():
        raise IntegrityError("unique", {}, Exception("race"))

    monkeypatch.setattr(db_session, "commit", fail_commit)
    assert client.post("/api/defects/reason-categories", json={**actor, "name": "경합"}).status_code == 409


def test_quarantine_accepts_id_and_rejects_unregistered_or_memo_only(client, db_session, make_item):
    from app.models.defect_reason_category import defect_reason_category_id
    from app.models import TransactionLog, DefectQuarantineRecord
    from decimal import Decimal
    actor = _actor(db_session)
    item = make_item(warehouse_qty=Decimal("5"))
    payload = {"item_id": str(item.item_id), "qty": 1, "source": "warehouse", "target_dept": "창고", "actor_employee_id": actor["requester_employee_id"]}
    for reason in [{"reason_memo": "메모만"}, {"reason_category": "임의 이름"}, {"reason_category_id": str(defect_reason_category_id("기타")), "reason_memo": " "}]:
        assert client.post("/api/defects/quarantine", json={**payload, **reason}).status_code == 422
    category_id = defect_reason_category_id("외관 불량")
    response = client.post("/api/defects/quarantine", json={**payload, "reason_category_id": str(category_id)})
    assert response.status_code == 200
    assert db_session.query(DefectQuarantineRecord).one().reason_category_id == category_id
    assert db_session.query(TransactionLog).one().reason_category_id == category_id


def test_bulk_quarantine_uses_one_submission_identity_and_retry_preserves_it(client, db_session, make_item):
    from app.models import TransactionLog
    from decimal import Decimal
    actor = _actor(db_session)
    items = [make_item(warehouse_qty=Decimal("3")) for _ in range(2)]
    submission_id = uuid.uuid4()
    payload = {"actor_employee_id": actor["requester_employee_id"], "client_request_id": "reason-submission-bulk", "submission_id": str(submission_id), "lines": [{"item_id": str(item.item_id), "qty": 1, "source": "warehouse", "target_dept": "창고", "reason_category": "외관 불량"} for item in items]}
    response = client.post("/api/defects/quarantine/bulk", json=payload)
    assert response.status_code == 200
    assert {log.submission_id for log in db_session.query(TransactionLog).all()} == {submission_id}
    assert client.post("/api/defects/quarantine/bulk", json=payload).status_code == 200
    assert db_session.query(TransactionLog).count() == 2


def test_failed_bulk_can_retry_with_same_submission_identity(client, db_session, make_item):
    from app.models import Inventory, TransactionLog
    from decimal import Decimal
    actor = _actor(db_session)
    enough = make_item(warehouse_qty=Decimal("3"))
    short = make_item(warehouse_qty=Decimal("0"))
    submission_id = uuid.uuid4()
    payload = {"actor_employee_id": actor["requester_employee_id"], "client_request_id": "reason-submission-retry", "submission_id": str(submission_id), "lines": [{"item_id": str(item.item_id), "qty": 2, "source": "warehouse", "target_dept": "창고", "reason_category": "외관 불량"} for item in [enough, short]]}
    enough_id, short_id = enough.item_id, short.item_id
    db_session.commit()
    assert client.post("/api/defects/quarantine/bulk", json=payload).status_code == 422
    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(Inventory).filter_by(item_id=enough_id).one().warehouse_qty == 3
    inv = db_session.query(Inventory).filter_by(item_id=short_id).one()
    inv.warehouse_qty = inv.quantity = Decimal("3")
    db_session.commit()
    assert client.post("/api/defects/quarantine/bulk", json=payload).status_code == 200
    assert {log.submission_id for log in db_session.query(TransactionLog).all()} == {submission_id}


def test_bulk_restore_stores_one_shared_submission_identity(client, db_session, make_item):
    from app.models import TransactionLog, TransactionTypeEnum, DefectQuarantineRecord
    from decimal import Decimal
    actor = _actor(db_session)
    item = make_item(warehouse_qty=Decimal("3"))
    for _ in range(2):
        assert client.post("/api/defects/quarantine", json={"actor_employee_id": actor["requester_employee_id"], "item_id": str(item.item_id), "qty": 1, "source": "warehouse", "target_dept": "창고", "reason_category": "외관 불량"}).status_code == 200
    records = db_session.query(DefectQuarantineRecord).all()
    submission_id = uuid.uuid4()
    payload = {"actor_employee_id": actor["requester_employee_id"], "submission_id": str(submission_id), "reason_category": "검사 통과", "lines": [{"record_id": str(record.record_id), "item_id": str(item.item_id), "quantity": 1, "department": "창고"} for record in records]}
    assert client.post("/api/defects/unquarantine/bulk", json=payload).status_code == 200
    assert {log.submission_id for log in db_session.query(TransactionLog).filter_by(transaction_type=TransactionTypeEnum.UNMARK_DEFECTIVE).all()} == {submission_id}


def test_registered_legacy_long_category_is_selectable_by_id(client, db_session, make_item):
    from app.models import DefectReasonCategory, TransactionLog
    from decimal import Decimal
    actor = _actor(db_session)
    item = make_item(warehouse_qty=Decimal("3"))
    name = "긴 기존 사유 " * 6
    category = DefectReasonCategory(name=name.strip(), normalized_name=name.strip().casefold(), is_active=True, is_other=False)
    db_session.add(category)
    db_session.commit()
    response = client.post("/api/stock-requests", json={**actor, "request_type": "scrap_normal", "reason_category_id": str(category.category_id), "reason_category": category.name, "lines": [{"item_id": str(item.item_id), "quantity": 1, "from_bucket": "warehouse", "to_bucket": "none"}]})
    assert response.status_code == 201
    log = db_session.query(TransactionLog).one()
    assert log.reason_category_id == category.category_id
    assert log.reason_category == category.name
