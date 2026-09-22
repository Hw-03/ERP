"""원자재 입고 공급업체 연결 계약 테스트."""

from __future__ import annotations

import uuid

import pytest

from app.models import Employee, IoBatch, Supplier
from app.schemas import IoSubmitRequest
from app.services import io_actions, io_draft


def _requester(db_session) -> Employee:
    """원자재 입고 권한을 가진 창고 정 담당자를 만든다."""
    employee = Employee(
        employee_code=f"SUP-IO-{uuid.uuid4().hex[:8]}",
        name="원자재 입고 담당자",
        role="창고 담당",
        department="창고",
        warehouse_role="primary",
        is_active=True,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def _receive_payload(requester: Employee, item_id: uuid.UUID, item_name: str) -> IoSubmitRequest:
    """공급처 원자재 입고 한 줄을 만든다."""
    return IoSubmitRequest(
        requester_employee_id=requester.employee_id,
        work_type="receive",
        sub_type="receive_supplier",
        bundles=[{
            "bundle_id": str(uuid.uuid4()),
            "source_kind": "direct_item",
            "title": item_name,
            "source_item_id": str(item_id),
            "quantity": 1,
            "lines": [{
                "line_id": str(uuid.uuid4()),
                "item_id": str(item_id),
                "item_name": item_name,
                "direction": "in",
                "from_bucket": "none",
                "to_bucket": "warehouse",
                "quantity": 1,
                "origin": "direct",
            }],
        }],
    )


def test_supplier_receipt_requires_an_active_supplier(db_session, make_item):
    """신규 공급처 원자재 입고는 공급업체 선택 없이는 제출할 수 없다."""
    requester = _requester(db_session)
    item = make_item(name="공급업체 필수 원자재")

    with pytest.raises(ValueError, match="공급업체"):
        io_actions.submit(db_session, _receive_payload(requester, item.item_id, item.item_name))


def test_supplier_receipt_draft_also_requires_supplier(db_session, make_item):
    """공급처 원자재 입고 draft도 업체 선택 없이 저장할 수 없다."""
    requester = _requester(db_session)
    item = make_item(name="공급업체 필수 초안 원자재")

    with pytest.raises(ValueError, match="공급업체"):
        io_draft.save_draft(
            db_session,
            _receive_payload(requester, item.item_id, item.item_name),
        )


def test_non_supplier_receipt_rejects_supplier_id(db_session, make_item):
    """공급처 원자재 입고가 아닌 작업에는 supplier_id를 넘길 수 없다."""
    requester = _requester(db_session)
    item = make_item(name="공급업체 비대상 품목")
    values = _receive_payload(requester, item.item_id, item.item_name).model_dump()
    values.update(work_type="process", sub_type="produce", supplier_id=uuid.uuid4())
    payload = IoSubmitRequest(**values)

    with pytest.raises(ValueError, match="supplier_id"):
        io_actions.submit(db_session, payload)


def test_completed_supplier_receipt_keeps_original_name_snapshot_after_master_rename(
    db_session, make_item
):
    """완료 입고는 이후 업체명 수정에도 당시 업체명 스냅샷을 유지한다."""
    requester = _requester(db_session)
    item = make_item(name="스냅샷 원자재")
    supplier = Supplier(name="기존 공급업체", normalized_name="기존 공급업체", is_active=True)
    db_session.add(supplier)
    db_session.flush()
    payload = _receive_payload(requester, item.item_id, item.item_name)
    payload.supplier_id = supplier.supplier_id

    result = io_actions.submit(db_session, payload)
    batch = db_session.get(IoBatch, result["batch"]["batch_id"])
    supplier.name = "변경 공급업체"
    db_session.flush()

    assert result["batch"]["supplier_name_snapshot"] == "기존 공급업체"
    assert batch.supplier_name_snapshot == "기존 공급업체"


def test_new_supplier_receipt_uses_name_changed_before_submission(db_session, make_item):
    """마스터 이름 변경 뒤 신규 제출은 새 이름을 스냅샷으로 확정한다."""
    requester = _requester(db_session)
    item = make_item(name="변경명 신규 입고 원자재")
    supplier = Supplier(name="변경 전", normalized_name="변경 전", is_active=True)
    db_session.add(supplier)
    db_session.flush()
    supplier.name = "변경 후"
    payload = _receive_payload(requester, item.item_id, item.item_name)
    payload.supplier_id = supplier.supplier_id

    result = io_actions.submit(db_session, payload)

    assert result["batch"]["supplier_name_snapshot"] == "변경 후"


def test_legacy_null_supplier_batch_response_remains_readable(db_session):
    """기존 완료 배치의 null 공급업체 필드는 응답 호환성을 깨지 않는다."""
    requester = _requester(db_session)
    batch = IoBatch(
        work_type="receive",
        sub_type="receive_supplier",
        status="completed",
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department="창고",
        requires_approval=False,
    )
    db_session.add(batch)
    db_session.flush()

    from app.services.io_persist import _batch_to_payload

    response = _batch_to_payload(batch, db_session)
    assert response["supplier_id"] is None
    assert response["supplier_name_snapshot"] is None


def test_hidden_supplier_draft_cannot_be_submitted_until_supplier_is_changed(
    db_session, make_item
):
    """저장 뒤 숨김 처리된 업체는 기존 draft 제출을 차단한다."""
    requester = _requester(db_session)
    item = make_item(name="숨김 업체 초안 원자재")
    supplier = Supplier(name="숨김 대상", normalized_name="숨김 대상", is_active=True)
    db_session.add(supplier)
    db_session.flush()
    payload = _receive_payload(requester, item.item_id, item.item_name)
    payload.supplier_id = supplier.supplier_id
    draft = io_draft.save_draft(db_session, payload)
    supplier.is_active = False
    db_session.flush()

    with pytest.raises(ValueError, match="숨김"):
        io_actions.submit_existing_draft(
            db_session,
            batch_id=draft["batch_id"],
            requester_employee_id=requester.employee_id,
        )
