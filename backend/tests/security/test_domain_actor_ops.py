"""VerifiedActor가 재고 변경 도메인의 유일한 작업자 정본인지 검증한다."""

from __future__ import annotations

import pytest

from contextlib import contextmanager
from decimal import Decimal
from typing import Iterator

from app.dependencies.verified_actor import require_verified_actor
from app.main import app
from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    SystemSetting,
    TransactionEditLog,
    DefectQuarantineMemoRevision,
    DefectQuarantineRecord,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services.pin_auth import hash_pin


@pytest.fixture()
def client(auth_client):
    return auth_client


PIN = "2468"


def _make_actor(db_session, *, code: str, name: str) -> Employee:
    actor = Employee(
        employee_code=code,
        name=name,
        role=f"{DepartmentEnum.ASSEMBLY.value}/staff",
        department=DepartmentEnum.ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active=True,
        pin_hash=hash_pin(PIN),
        pin_requires_change=False,
    )
    db_session.add(actor)
    db_session.flush()
    return actor


@contextmanager
def _authenticated_as(actor: Employee) -> Iterator[None]:
    """HTTP 경계만 검사할 수 있도록 실제 session resolver 결과를 고정한다."""
    app.dependency_overrides[require_verified_actor] = lambda: actor
    try:
        yield
    finally:
        app.dependency_overrides.pop(require_verified_actor, None)


def _warehouse_qty(db_session, item_id) -> Decimal:
    db_session.expire_all()
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item_id).one()
    return inventory.warehouse_qty


def _production_qty(db_session, item_id, department: DepartmentEnum) -> Decimal:
    db_session.expire_all()
    location = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == department,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    return location.quantity if location else Decimal("0")


def test_defect_mutation_uses_session_actor_and_rejects_spoof_without_writes(
    client, db_session, make_item
):
    actor = _make_actor(db_session, code="SEC-D01", name="격리 작업자")
    imposter = _make_actor(db_session, code="SEC-D02", name="위조 작업자")
    item = make_item(name="actor-defect", warehouse_qty=Decimal("10"))
    db_session.commit()

    payload = {
        "item_id": str(item.item_id),
        "qty": "2",
        "source": "warehouse",
        "target_dept": DepartmentEnum.ASSEMBLY.value,
        "reason_category": "외관불량",
        "reason_memo": "actor contract",
        "actor_employee_id": str(imposter.employee_id),
    }
    with _authenticated_as(actor):
        rejected = client.post("/api/defects/quarantine", json=payload)

    assert rejected.status_code == 403
    assert rejected.json()["detail"]["code"] == "ACTOR_MISMATCH"
    assert _warehouse_qty(db_session, item.item_id) == Decimal("10")
    assert _production_qty(
        db_session, item.item_id, DepartmentEnum.ASSEMBLY
    ) == Decimal("0")
    assert db_session.query(TransactionLog).count() == 0

    payload["actor_employee_id"] = str(actor.employee_id)
    with _authenticated_as(actor):
        accepted = client.post("/api/defects/quarantine", json=payload)

    assert accepted.status_code == 200, accepted.text
    log = db_session.query(TransactionLog).one()
    assert log.producer_employee_id == actor.employee_id
    assert log.produced_by == actor.name
    assert _warehouse_qty(db_session, item.item_id) == Decimal("8")

    unquarantine = {
        "item_id": str(item.item_id),
        "qty": "2",
        "dept": DepartmentEnum.ASSEMBLY.value,
        "reason_category": "정상 판정",
        "reason_memo": "actor contract",
        "actor_employee_id": str(imposter.employee_id),
    }
    with _authenticated_as(actor):
        rejected_restore = client.post("/api/defects/unquarantine", json=unquarantine)

    assert rejected_restore.status_code == 403
    assert rejected_restore.json()["detail"]["code"] == "ACTOR_MISMATCH"
    assert db_session.query(TransactionLog).count() == 1

    unquarantine["actor_employee_id"] = str(actor.employee_id)
    with _authenticated_as(actor):
        accepted_restore = client.post("/api/defects/unquarantine", json=unquarantine)

    assert accepted_restore.status_code == 200, accepted_restore.text
    logs = db_session.query(TransactionLog).order_by(TransactionLog.created_at).all()
    assert len(logs) == 2
    assert all(row.producer_employee_id == actor.employee_id for row in logs)
    assert all(row.produced_by == actor.name for row in logs)
    assert _warehouse_qty(db_session, item.item_id) == Decimal("8")
    assert _production_qty(
        db_session, item.item_id, DepartmentEnum.ASSEMBLY
    ) == Decimal("2")


def test_defect_memo_edit_rejects_body_actor_different_from_session_actor(
    client, db_session, make_item
):
    actor = _make_actor(db_session, code="SEC-M01", name="메모 작업자")
    imposter = _make_actor(db_session, code="SEC-M02", name="메모 위조자")
    item = make_item(name="actor-defect-memo", warehouse_qty=Decimal("10"))
    db_session.commit()

    with _authenticated_as(actor):
        quarantine = client.post(
            "/api/defects/quarantine",
            json={
                "item_id": str(item.item_id),
                "qty": "2",
                "source": "warehouse",
                "target_dept": DepartmentEnum.ASSEMBLY.value,
                "reason_category": "외관불량",
                "reason_memo": "원본 메모",
                "actor_employee_id": str(actor.employee_id),
            },
        )
    assert quarantine.status_code == 200, quarantine.text
    record = db_session.query(DefectQuarantineRecord).one()
    revision_count = db_session.query(DefectQuarantineMemoRevision).count()

    with _authenticated_as(actor):
        rejected = client.put(
            f"/api/defects/records/{record.record_id}/memo",
            json={
                "memo": "위조 메모",
                "actor_employee_id": str(imposter.employee_id),
                "pin": PIN,
            },
        )

    assert rejected.status_code == 403
    assert rejected.json()["detail"]["code"] == "ACTOR_MISMATCH"
    db_session.expire_all()
    assert db_session.get(DefectQuarantineRecord, record.record_id).current_memo == "원본 메모"
    assert db_session.query(DefectQuarantineMemoRevision).count() == revision_count


def test_production_mutation_uses_session_actor_and_rejects_spoof_without_writes(
    client, db_session, make_item, make_bom, make_location
):
    actor = _make_actor(db_session, code="SEC-P01", name="생산 작업자")
    imposter = _make_actor(db_session, code="SEC-P02", name="위조 생산자")
    component = make_item(name="actor-component", process_type_code="TR")
    produced = make_item(name="actor-product", process_type_code="PF")
    make_bom(produced.item_id, component.item_id, Decimal("1"))
    make_location(component.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("2"))
    db_session.commit()

    payload = {
        "item_id": str(produced.item_id),
        "quantity": 1,
        "produced_by": imposter.name,
        "producer_employee_code": imposter.employee_code,
    }
    with _authenticated_as(actor):
        rejected = client.post("/api/production/receipt", json=payload)

    assert rejected.status_code == 403
    assert rejected.json()["detail"]["code"] == "ACTOR_MISMATCH"
    assert _production_qty(db_session, component.item_id, DepartmentEnum.TUBE) == Decimal("2")
    assert db_session.query(TransactionLog).count() == 0

    payload.update(produced_by=actor.name, producer_employee_code=actor.employee_code)
    with _authenticated_as(actor):
        accepted = client.post("/api/production/receipt", json=payload)

    assert accepted.status_code == 201, accepted.text
    logs = db_session.query(TransactionLog).all()
    assert len(logs) == 2
    assert all(log.producer_employee_id == actor.employee_id for log in logs)
    assert all(log.produced_by == actor.name for log in logs)


def test_dept_adjustment_uses_session_actor_and_rejects_spoof_without_writes(
    client, db_session, make_item, make_location
):
    actor = _make_actor(db_session, code="SEC-A01", name="조정 작업자")
    imposter = _make_actor(db_session, code="SEC-A02", name="위조 조정자")
    item = make_item(name="actor-adjustment", process_type_code="AR")
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("5"))
    db_session.commit()

    payload = {
        "sub_type": "correction",
        "operator_name": imposter.name,
        "operator_employee_code": imposter.employee_code,
        "lines": [
            {
                "item_id": str(item.item_id),
                "direction": "out",
                "quantity": 1,
                "department": DepartmentEnum.ASSEMBLY.value,
                "reason": "actor contract",
            }
        ],
    }
    with _authenticated_as(actor):
        rejected = client.post("/api/dept-adjustment/submit", json=payload)

    assert rejected.status_code == 403
    assert rejected.json()["detail"]["code"] == "ACTOR_MISMATCH"
    assert _production_qty(db_session, item.item_id, DepartmentEnum.ASSEMBLY) == Decimal("5")
    assert db_session.query(TransactionLog).count() == 0

    payload.update(operator_name=actor.name, operator_employee_code=actor.employee_code)
    with _authenticated_as(actor):
        accepted = client.post("/api/dept-adjustment/submit", json=payload)

    assert accepted.status_code == 201, accepted.text
    log = db_session.query(TransactionLog).one()
    assert log.producer_employee_id == actor.employee_id
    assert log.produced_by == actor.name


def test_transaction_correction_and_cancel_use_session_actor_and_rollback_spoof(
    client, db_session, make_item
):
    actor = _make_actor(db_session, code="SEC-T01", name="거래 정정자")
    imposter = _make_actor(db_session, code="SEC-T02", name="위조 정정자")
    item = make_item(name="actor-transaction", warehouse_qty=Decimal("100"))
    original = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("100"),
        quantity_before=Decimal("0"),
        quantity_after=Decimal("100"),
        produced_by=actor.name,
        producer_employee_id=actor.employee_id,
        inventory_effect=[{"scope": "warehouse", "delta": 100}],
    )
    db_session.add_all(
        (
            original,
            SystemSetting(
                setting_key="inventory_operation_cutover_at",
                setting_value="2026-01-01T00:00:00",
            ),
        )
    )
    db_session.commit()

    spoof_correction = {
        "quantity_change": 80,
        "reason": "spoof must rollback",
        "edited_by_employee_id": str(imposter.employee_id),
        "edited_by_pin": PIN,
    }
    with _authenticated_as(actor):
        rejected = client.post(
            f"/api/inventory/transactions/{original.log_id}/quantity-correction",
            json=spoof_correction,
        )

    assert rejected.status_code == 403
    assert rejected.json()["detail"]["code"] == "ACTOR_MISMATCH"
    assert _warehouse_qty(db_session, item.item_id) == Decimal("100")
    assert db_session.query(TransactionEditLog).count() == 0
    assert db_session.query(TransactionLog).count() == 1

    spoof_correction["edited_by_employee_id"] = str(actor.employee_id)
    with _authenticated_as(actor):
        corrected = client.post(
            f"/api/inventory/transactions/{original.log_id}/quantity-correction",
            json=spoof_correction,
        )

    assert corrected.status_code == 200, corrected.text
    correction_id = corrected.json()["correction"]["log_id"]
    correction = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.log_id == correction_id)
        .one()
    )
    assert correction.producer_employee_id == actor.employee_id
    assert _warehouse_qty(db_session, item.item_id) == Decimal("80")

    with _authenticated_as(actor):
        rejected_cancel = client.post(
            f"/api/inventory/transactions/{correction.log_id}/cancel",
            json={"reason": "spoof cancel", "employee_code": imposter.employee_code, "pin": PIN},
        )

    assert rejected_cancel.status_code == 403
    assert rejected_cancel.json()["detail"]["code"] == "ACTOR_MISMATCH"
    db_session.refresh(correction)
    assert correction.cancelled is False
    assert _warehouse_qty(db_session, item.item_id) == Decimal("80")

    with _authenticated_as(actor):
        accepted_cancel = client.post(
            f"/api/inventory/transactions/{correction.log_id}/cancel",
            json={"reason": "server actor cancel", "employee_code": actor.employee_code, "pin": PIN},
        )

    assert accepted_cancel.status_code == 200, accepted_cancel.text
    assert _warehouse_qty(db_session, item.item_id) == Decimal("100")


def test_transaction_meta_edit_uses_session_actor_and_rejects_spoof_without_history(
    client, db_session, make_item
):
    actor = _make_actor(db_session, code="SEC-M01", name="메타 정정자")
    imposter = _make_actor(db_session, code="SEC-M02", name="위조 메타 정정자")
    item = make_item(name="actor-meta", warehouse_qty=Decimal("1"))
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("1"),
        notes="before",
    )
    db_session.add(log)
    db_session.commit()

    payload = {
        "notes": "after",
        "reason": "actor contract",
        "edited_by_employee_id": str(imposter.employee_id),
        "edited_by_pin": PIN,
    }
    with _authenticated_as(actor):
        rejected = client.post(
            f"/api/inventory/transactions/{log.log_id}/meta-edit",
            json=payload,
        )

    assert rejected.status_code == 403
    assert rejected.json()["detail"]["code"] == "ACTOR_MISMATCH"
    db_session.refresh(log)
    assert log.notes == "before"
    assert db_session.query(TransactionEditLog).count() == 0

    payload["edited_by_employee_id"] = str(actor.employee_id)
    with _authenticated_as(actor):
        accepted = client.post(
            f"/api/inventory/transactions/{log.log_id}/meta-edit",
            json=payload,
        )

    assert accepted.status_code == 200, accepted.text
    edit = db_session.query(TransactionEditLog).one()
    assert edit.edited_by_employee_id == actor.employee_id
    assert edit.edited_by_name == actor.name
