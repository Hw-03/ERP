"""원자재 입고 공급업체 연결 계약 테스트."""

from __future__ import annotations

import uuid

import pytest

from app.models import Employee, Inventory, IoBatch, Supplier, TransactionLog
from app.schemas import IoSubmitRequest
from app.services import io_actions, io_draft
from app.services import io_preview, inventory_operation_cancellation
from app.schemas.io import IoPreviewTarget


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


def _outbound_payload(db_session, make_item, *, quantity=3):
    requester = _requester(db_session)
    item = make_item(name="사급 샘플 자재")
    supplier = Supplier(name="샘플 수령 업체", normalized_name="샘플 수령 업체", is_active=True)
    db_session.add(supplier)
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    inventory.quantity = inventory.warehouse_qty = 10
    db_session.flush()
    payload = _receive_payload(requester, item.item_id, item.item_name)
    payload.sub_type = "outbound_supplier"
    payload.supplier_id = supplier.supplier_id
    payload.notes = "샘플 발송"
    payload.bundles[0].quantity = quantity
    line = payload.bundles[0].lines[0]
    line.direction = "out"
    line.from_bucket = "warehouse"
    line.to_bucket = "none"
    line.quantity = quantity
    db_session.commit()
    return requester, item, supplier, payload


def test_material_outbound_completes_and_records_supplier(db_session, make_item):
    requester, item, supplier, payload = _outbound_payload(db_session, make_item)
    result = io_actions.submit(db_session, payload)
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    log = db_session.query(TransactionLog).filter_by(item_id=item.item_id).one()
    assert result["batch"]["status"] == "completed"
    assert not result["batch"]["requires_approval"]
    assert result["batch"]["supplier_name_snapshot"] == supplier.name
    assert result["batch"]["notes"] == "샘플 발송"
    assert inventory.warehouse_qty == inventory.quantity == 7
    assert log.transaction_type.value == "MATERIAL_OUT"
    assert log.quantity_change == -3
    assert log.supplier_name_snapshot == supplier.name


@pytest.mark.parametrize("invalid", ["missing_supplier", "hidden_supplier", "missing_reason", "permission", "route", "combination", "bom_source", "extra_line"])
def test_material_outbound_rejects_invalid_request(db_session, make_item, invalid):
    requester, item, supplier, payload = _outbound_payload(db_session, make_item)
    if invalid == "missing_supplier":
        payload.supplier_id = None
    elif invalid == "hidden_supplier":
        supplier.is_active = False
    elif invalid == "missing_reason":
        payload.notes = "  "
    elif invalid == "permission":
        requester.warehouse_role = "none"
    elif invalid == "route":
        payload.bundles[0].lines[0].from_bucket = "none"
    elif invalid == "bom_source":
        payload.bundles[0].source_kind = "bom_parent"
    elif invalid == "extra_line":
        payload.bundles[0].lines.append(payload.bundles[0].lines[0].model_copy(deep=True))
    else:
        payload.work_type = "process"
    db_session.flush()
    with pytest.raises((ValueError, PermissionError)):
        io_actions.submit(db_session, payload)
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert inventory.warehouse_qty == 10
    assert db_session.query(TransactionLog).filter_by(item_id=item.item_id).count() == 0


def test_material_outbound_respects_reserved_stock(db_session, make_item):
    _, item, _, payload = _outbound_payload(db_session, make_item, quantity=4)
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    inventory.pending_quantity = 7
    db_session.flush()
    with pytest.raises(ValueError, match="재고 부족"):
        io_actions.submit(db_session, payload)
    assert inventory.warehouse_qty == 10


def test_material_outbound_draft_requires_permission_and_restores(db_session, make_item):
    requester, _, supplier, payload = _outbound_payload(db_session, make_item)
    draft = io_draft.save_draft(db_session, payload)
    assert draft["sub_type"] == "outbound_supplier"
    assert draft["supplier_id"] == supplier.supplier_id
    assert draft["notes"] == "샘플 발송"
    requester.warehouse_role = "none"
    db_session.flush()
    payload.batch_id = draft["batch_id"]
    with pytest.raises(PermissionError):
        io_draft.save_draft(db_session, payload)


def test_material_outbound_draft_allows_empty_reason_without_stock_change(db_session, make_item):
    """미완성 사유는 초안에서 허용하되 확정에서는 거부한다."""
    _, item, _, payload = _outbound_payload(db_session, make_item)
    payload.notes = ""
    draft = io_draft.save_draft(db_session, payload)
    payload.batch_id = draft["batch_id"]
    payload.notes = "  "
    updated = io_draft.save_draft(db_session, payload)
    assert updated["batch_id"] == draft["batch_id"]
    assert updated["status"] == "draft"
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert inventory.quantity == inventory.warehouse_qty == 10
    assert db_session.query(TransactionLog).filter_by(item_id=item.item_id).count() == 0
    with pytest.raises(ValueError, match="사유"):
        io_actions.submit(db_session, payload)


def test_material_outbound_preview_is_single_item(db_session, make_item, make_bom):
    _, item, _, _ = _outbound_payload(db_session, make_item)
    child = make_item(name="자동 출고하지 않는 하위 자재")
    make_bom(item.item_id, child.item_id, 2)
    preview = io_preview.preview(db_session, work_type="receive", sub_type="outbound_supplier",
                                targets=[IoPreviewTarget(item_id=item.item_id, quantity=3)])
    assert not preview["requires_approval"]
    assert len(preview["bundles"][0]["lines"]) == 1
    line = preview["bundles"][0]["lines"][0]
    assert (line["direction"], line["from_bucket"], line["to_bucket"]) == ("out", "warehouse", "none")


def test_material_outbound_aggregates_duplicate_items(db_session, make_item):
    _, item, _, payload = _outbound_payload(db_session, make_item, quantity=6)
    second = payload.bundles[0].model_copy(deep=True)
    second.bundle_id = uuid.uuid4()
    second.lines[0].line_id = uuid.uuid4()
    payload.bundles.append(second)
    with pytest.raises(ValueError, match="재고 부족"):
        io_actions.submit(db_session, payload)
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert inventory.warehouse_qty == 10


def test_material_outbound_cancellation_restores_stock(db_session, make_item):
    requester, item, _, payload = _outbound_payload(db_session, make_item)
    from app.models import SystemSetting
    db_session.add(SystemSetting(setting_key="inventory_operation_cutover_at", setting_value="2026-01-01T00:00:00"))
    db_session.commit()
    io_actions.submit(db_session, payload)
    log = db_session.query(TransactionLog).filter_by(item_id=item.item_id).one()
    plan = inventory_operation_cancellation.preview_cancellation(db_session, log.operation_id)
    assert plan.can_cancel, plan.blockers
    inventory_operation_cancellation.cancel_operation(db_session, operation_id=log.operation_id,
        canceller=requester, reason="샘플 출고 취소", plan_hash=plan.plan_hash)
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert inventory.quantity == inventory.warehouse_qty == 10


def test_material_outbound_duplicate_submission_is_idempotent(client, db_session, make_item):
    _, item, _, payload = _outbound_payload(db_session, make_item)
    payload.client_request_id = "material-outbound-retry"
    first = client.post("/api/io/submit", json=payload.model_dump(mode="json"))
    second = client.post("/api/io/submit", json=payload.model_dump(mode="json"))
    assert first.status_code == second.status_code == 201
    assert second.json()["batch"]["batch_id"] == first.json()["batch"]["batch_id"]
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    assert inventory.quantity == inventory.warehouse_qty == 7
    assert db_session.query(TransactionLog).filter_by(item_id=item.item_id).count() == 1


def test_material_outbound_preview_rejects_unauthorized_requester(client, db_session, make_item):
    requester, item, _, _ = _outbound_payload(db_session, make_item)
    requester.warehouse_role = "none"
    db_session.commit()
    response = client.post("/api/io/preview", json={"requester_employee_id": str(requester.employee_id),
        "work_type": "receive", "sub_type": "outbound_supplier",
        "targets": [{"item_id": str(item.item_id), "quantity": 1}]})
    assert response.status_code == 403
