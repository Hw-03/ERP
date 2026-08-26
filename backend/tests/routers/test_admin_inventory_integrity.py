"""관리자 재고 정합성 진단 API 계약."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from app.models import (
    DefectInventoryMovement,
    DefectQuarantineRecord,
    DepartmentEnum,
    InventoryLocation,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum,
    InventoryOperationRoleEnum,
    InventoryOperationStatusEnum,
    LocationStatusEnum,
    ShippingAllocation,
    ShippingRequest,
    ShippingRequestStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)


ADMIN_HEADERS = {"X-Admin-Pin": "0000"}


def _operation(*, kind: InventoryOperationKindEnum, reverses=None) -> InventoryOperation:
    return InventoryOperation(
        operation_id=uuid.uuid4(),
        kind=kind,
        domain="department_io",
        action="ship",
        status=InventoryOperationStatusEnum.COMMITTED,
        display_label="부서 입출고" if kind == InventoryOperationKindEnum.BUSINESS else "부서 입출고 취소",
        actor_name="진단 테스트",
        department=DepartmentEnum.HIGH_VOLTAGE.value,
        effective_at=datetime(2026, 8, 25, 9, 0),
        contract_version=1,
        reverses_operation_id=reverses,
    )


def test_integrity_endpoint_requires_admin_pin(client):
    response = client.get("/api/admin/inventory-integrity")

    assert response.status_code == 400
    assert response.json()["detail"]["message"] == "관리자 PIN이 필요합니다."


def test_integrity_endpoint_is_read_only_and_problem_ids_are_stable(
    client,
    db_session,
    make_item,
):
    item = make_item(name="불량 원장 불일치", process_type_code="VF")
    location = InventoryLocation(
        item_id=item.item_id,
        department=DepartmentEnum.VACUUM,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=Decimal("3"),
    )
    record = DefectQuarantineRecord(
        item_id=item.item_id,
        department=DepartmentEnum.VACUUM.value,
        original_quantity=Decimal("2"),
        remaining_quantity=Decimal("2"),
        quarantined_by_name="진단 테스트",
    )
    db_session.add_all([location, record])
    db_session.commit()

    before_counts = {
        "operations": db_session.query(InventoryOperation).count(),
        "logs": db_session.query(TransactionLog).count(),
        "movements": db_session.query(DefectInventoryMovement).count(),
    }

    first = client.get("/api/admin/inventory-integrity", headers=ADMIN_HEADERS)
    second = client.get("/api/admin/inventory-integrity", headers=ADMIN_HEADERS)

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    first_body = first.json()
    second_body = second.json()
    assert first_body["is_consistent"] is False
    assert first_body["issue_count"] == 1
    assert first_body["category_counts"]["DEFECT_STOCK_MISMATCH"] == 1
    issue = first_body["issues"][0]
    assert issue["problem_id"] == second_body["issues"][0]["problem_id"]
    assert issue["category"] == "DEFECT_STOCK_MISMATCH"
    assert str(item.item_id) in issue["cause_ids"]
    assert issue["current_value"] == "불량 위치 3 EA / 활성 불량 원장 2 EA"
    assert issue["expected_value"] == "불량 위치와 활성 불량 원장을 같은 수량으로 정정"
    assert issue["repairable"] is False

    db_session.refresh(location)
    db_session.refresh(record)
    assert location.quantity == Decimal("3")
    assert record.remaining_quantity == Decimal("2")
    assert before_counts == {
        "operations": db_session.query(InventoryOperation).count(),
        "logs": db_session.query(TransactionLog).count(),
        "movements": db_session.query(DefectInventoryMovement).count(),
    }


def test_integrity_endpoint_reports_partial_cancel_and_unclassified_weekly_effect(
    client,
    db_session,
    make_item,
):
    item = make_item(name="미완료 역전", process_type_code="VF")
    original = _operation(kind=InventoryOperationKindEnum.BUSINESS)
    cancellation = _operation(
        kind=InventoryOperationKindEnum.CANCELLATION,
        reverses=original.operation_id,
    )
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("1"),
        quantity_before=Decimal("0"),
        quantity_after=Decimal("1"),
        produced_by="진단 테스트",
        operation_id=original.operation_id,
        operation_role=InventoryOperationRoleEnum.PRIMARY,
        inventory_effect=[{"scope": "warehouse", "delta": -1}],
        created_at=original.effective_at,
    )
    db_session.add_all([original, cancellation, log])
    db_session.commit()

    response = client.get("/api/admin/inventory-integrity", headers=ADMIN_HEADERS)

    assert response.status_code == 200, response.text
    categories = {issue["category"] for issue in response.json()["issues"]}
    assert "PARTIAL_CANCELLATION" in categories
    assert "WEEKLY_UNCLASSIFIED_EFFECT" in categories


def test_integrity_endpoint_returns_all_category_counters_when_clean(client):
    response = client.get("/api/admin/inventory-integrity", headers=ADMIN_HEADERS)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["is_consistent"] is True
    assert body["issue_count"] == 0
    assert body["category_counts"] == {
        "DEFECT_STOCK_MISMATCH": 0,
        "PARTIAL_CANCELLATION": 0,
        "WORKFLOW_STATE_RESIDUE": 0,
        "SHIPPING_ALLOCATION_MISMATCH": 0,
        "DUPLICATE_REVERSAL": 0,
        "WEEKLY_UNCLASSIFIED_EFFECT": 0,
    }


def test_integrity_endpoint_reports_cancelled_workflow_and_allocation_residue(
    client,
    db_session,
    make_item,
):
    item = make_item(name="출하 취소 상태 잔존", process_type_code="PF")
    request = ShippingRequest(
        base_pf_item_id=item.item_id,
        request_quantity=Decimal("1"),
        status=ShippingRequestStatusEnum.PICKED_UP,
    )
    db_session.add(request)
    db_session.flush()
    allocation = ShippingAllocation(
        request_id=request.request_id,
        item_id=item.item_id,
        quantity=Decimal("1"),
        status="CONSUMED",
    )
    original = _operation(kind=InventoryOperationKindEnum.BUSINESS)
    cancellation = _operation(
        kind=InventoryOperationKindEnum.CANCELLATION,
        reverses=original.operation_id,
    )
    db_session.add_all([allocation, original, cancellation])
    db_session.flush()
    original_workflow = InventoryOperationEffect(
        operation_id=original.operation_id,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="ShippingRequest",
        subject_id=str(request.request_id),
        role="shipping_request",
        before_state={"status": "PREPARED"},
        after_state={"status": "PICKED_UP"},
    )
    original_allocation = InventoryOperationEffect(
        operation_id=original.operation_id,
        effect_kind=InventoryOperationEffectKindEnum.ALLOCATION,
        subject_type="ShippingAllocation",
        subject_id=str(allocation.allocation_id),
        role="shipping_allocation",
        before_state={"status": "RESERVED"},
        after_state={"status": "CONSUMED"},
    )
    db_session.add_all([original_workflow, original_allocation])
    db_session.flush()
    db_session.add_all(
        [
            InventoryOperationEffect(
                operation_id=cancellation.operation_id,
                effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
                subject_type="ShippingRequest",
                subject_id=str(request.request_id),
                role="shipping_request",
                before_state={"status": "PICKED_UP"},
                after_state={"status": "CANCELLED"},
                reverses_effect_id=original_workflow.effect_id,
            ),
            InventoryOperationEffect(
                operation_id=cancellation.operation_id,
                effect_kind=InventoryOperationEffectKindEnum.ALLOCATION,
                subject_type="ShippingAllocation",
                subject_id=str(allocation.allocation_id),
                role="shipping_allocation",
                before_state={"status": "CONSUMED"},
                after_state={"status": "RELEASED"},
                reverses_effect_id=original_allocation.effect_id,
            ),
        ]
    )
    db_session.commit()

    response = client.get("/api/admin/inventory-integrity", headers=ADMIN_HEADERS)

    assert response.status_code == 200, response.text
    categories = {issue["category"] for issue in response.json()["issues"]}
    assert "WORKFLOW_STATE_RESIDUE" in categories
    assert "SHIPPING_ALLOCATION_MISMATCH" in categories
