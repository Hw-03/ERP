"""불량 반품 공급업체 선택·스냅샷 계약 테스트."""

from __future__ import annotations

import uuid
from decimal import Decimal

from app.models import (
    DepartmentEnum,
    DefectQuarantineRecord,
    Employee,
    Supplier,
    SystemSetting,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import inventory_operation_cancellation as cancellation_svc


def _employee(db_session, *, warehouse_role: str = "none") -> Employee:
    employee = Employee(
        employee_code=f"RET-{uuid.uuid4().hex[:8]}",
        name="반품 작업자",
        role="창고 담당",
        department=DepartmentEnum.WAREHOUSE.value,
        warehouse_role=warehouse_role,
        is_active=True,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def _supplier(db_session, *, name: str = "HLP", is_active: bool = True) -> Supplier:
    supplier = Supplier(
        name=name,
        normalized_name=f"{name.casefold()}-{uuid.uuid4().hex[:8]}",
        is_active=is_active,
    )
    db_session.add(supplier)
    db_session.flush()
    return supplier


def _quarantine(client, db_session, *, employee: Employee, item_id: uuid.UUID, quantity: int = 3) -> str:
    response = client.post(
        "/api/defects/quarantine",
        json={
            "item_id": str(item_id),
            "qty": str(quantity),
            "source": "warehouse",
            "target_dept": DepartmentEnum.WAREHOUSE.value,
            "reason_category": "외관불량",
            "actor_employee_id": str(employee.employee_id),
        },
    )
    assert response.status_code == 200, response.json()
    return str(
        db_session.query(DefectQuarantineRecord.record_id)
        .filter(DefectQuarantineRecord.item_id == item_id)
        .order_by(DefectQuarantineRecord.created_at.desc())
        .scalar()
    )


def _return_payload(
    *,
    employee: Employee,
    item_id: uuid.UUID,
    record_id: str,
    supplier_id=None,
    client_request_id: str | None = None,
):
    payload = {
        "requester_employee_id": str(employee.employee_id),
        "request_type": "defect_return",
        "supplier_id": str(supplier_id) if supplier_id else None,
        "reason_category": "외관불량",
        "lines": [
            {
                "record_id": record_id,
                "item_id": str(item_id),
                "quantity": 1,
                "from_bucket": "defective",
                "from_department": DepartmentEnum.WAREHOUSE.value,
                "to_bucket": "none",
            }
        ],
    }
    if client_request_id is not None:
        payload["client_request_id"] = client_request_id
    return payload


def test_defect_return_requires_active_supplier_and_preserves_snapshot(
    client, db_session, make_item
):
    item = make_item(name="업체 반품 자재", process_type_code="TR", warehouse_qty=Decimal("5"))
    employee = _employee(db_session)
    supplier = _supplier(db_session, name="반품 당시 업체")
    db_session.add(
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        )
    )
    db_session.commit()
    record_id = _quarantine(client, db_session, employee=employee, item_id=item.item_id)

    missing = client.post(
        "/api/stock-requests",
        json=_return_payload(employee=employee, item_id=item.item_id, record_id=record_id),
    )
    assert missing.status_code == 422

    created = client.post(
        "/api/stock-requests",
        json=_return_payload(
            employee=employee,
            item_id=item.item_id,
            record_id=record_id,
            supplier_id=supplier.supplier_id,
            client_request_id="defect-return-supplier-retry",
        ),
    )
    assert created.status_code == 201, created.json()
    assert created.json()["supplier_id"] == str(supplier.supplier_id)
    assert created.json()["supplier_name_snapshot"] == "반품 당시 업체"

    log = db_session.query(TransactionLog).filter(
        TransactionLog.item_id == item.item_id,
        TransactionLog.transaction_type == TransactionTypeEnum.SUPPLIER_RETURN,
    ).one()
    assert log.supplier_id == supplier.supplier_id
    assert log.supplier_name_snapshot == "반품 당시 업체"

    other_supplier = _supplier(db_session, name="재시도 변경 업체")
    db_session.commit()
    retried = client.post(
        "/api/stock-requests",
        json=_return_payload(
            employee=employee,
            item_id=item.item_id,
            record_id=record_id,
            supplier_id=other_supplier.supplier_id,
            client_request_id="defect-return-supplier-retry",
        ),
    )
    assert retried.status_code == 201, retried.json()
    assert retried.json()["request_id"] == created.json()["request_id"]
    assert retried.json()["supplier_id"] == str(supplier.supplier_id)
    assert db_session.query(TransactionLog).filter(
        TransactionLog.item_id == item.item_id,
        TransactionLog.transaction_type == TransactionTypeEnum.SUPPLIER_RETURN,
    ).count() == 1

    supplier.name = "변경된 현재 업체명"
    db_session.commit()
    db_session.expire_all()
    preserved = db_session.get(TransactionLog, log.log_id)
    assert preserved.supplier_name_snapshot == "반품 당시 업체"

    plan = cancellation_svc.preview_cancellation(db_session, log.operation_id)
    cancellation_svc.cancel_operation(
        db_session,
        operation_id=log.operation_id,
        canceller=employee,
        reason="반품 취소 검증",
        plan_hash=plan.plan_hash,
    )
    reversal = db_session.query(TransactionLog).filter(
        TransactionLog.reverses_log_id == log.log_id,
    ).one()
    assert reversal.supplier_id == supplier.supplier_id
    assert reversal.supplier_name_snapshot == "반품 당시 업체"


def test_hidden_supplier_and_non_return_supplier_id_are_rejected(
    client, db_session, make_item
):
    item = make_item(name="숨김 업체 반품", process_type_code="TR", warehouse_qty=Decimal("5"))
    employee = _employee(db_session)
    supplier = _supplier(db_session, name="숨김 업체", is_active=False)
    record_id = _quarantine(client, db_session, employee=employee, item_id=item.item_id)

    hidden = client.post(
        "/api/stock-requests",
        json=_return_payload(
            employee=employee,
            item_id=item.item_id,
            record_id=record_id,
            supplier_id=supplier.supplier_id,
        ),
    )
    assert hidden.status_code == 422

    wrong_type = _return_payload(
        employee=employee,
        item_id=item.item_id,
        record_id=record_id,
        supplier_id=supplier.supplier_id,
    )
    wrong_type["request_type"] = "defect_scrap"
    assert client.post("/api/stock-requests", json=wrong_type).status_code == 422


def test_active_employee_can_list_active_suppliers_but_not_hidden_suppliers(
    client, db_session
):
    employee = _employee(db_session)
    active = _supplier(db_session, name="활성 업체")
    _supplier(db_session, name="숨김 업체", is_active=False)
    db_session.commit()

    response = client.get(f"/api/suppliers?requester_employee_id={employee.employee_id}")
    assert response.status_code == 200
    assert [row["supplier_id"] for row in response.json()] == [str(active.supplier_id)]
    assert client.get(
        f"/api/suppliers?requester_employee_id={employee.employee_id}&include_inactive=true"
    ).status_code == 403


def test_hidden_supplier_blocks_defect_return_draft_submit_without_inventory_change(
    client, db_session, make_item
):
    item = make_item(name="초안 숨김 업체 반품", process_type_code="TR", warehouse_qty=Decimal("5"))
    employee = _employee(db_session)
    supplier = _supplier(db_session, name="제출 전 숨김 업체")
    db_session.commit()
    record_id = _quarantine(client, db_session, employee=employee, item_id=item.item_id)

    draft = client.put(
        "/api/stock-requests/draft",
        json=_return_payload(
            employee=employee,
            item_id=item.item_id,
            record_id=record_id,
            supplier_id=supplier.supplier_id,
        ),
    )
    assert draft.status_code == 200, draft.json()
    supplier.is_active = False
    db_session.commit()

    submitted = client.post(
        f"/api/stock-requests/{draft.json()['request_id']}/submit",
        json={"requester_employee_id": str(employee.employee_id)},
    )
    assert submitted.status_code == 422
    assert db_session.query(TransactionLog).filter(
        TransactionLog.item_id == item.item_id,
        TransactionLog.transaction_type == TransactionTypeEnum.SUPPLIER_RETURN,
    ).count() == 0
    record = db_session.get(DefectQuarantineRecord, uuid.UUID(record_id))
    assert record.remaining_quantity == Decimal("3")
