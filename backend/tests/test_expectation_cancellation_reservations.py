"""완료된 창고 이동 취소는 다른 요청의 예약과 총재고를 보존한다."""

from decimal import Decimal

import pytest

from app.models import DepartmentEnum, Employee, Inventory, StockRequest, TransactionLog, TransactionTypeEnum
from app.services.pin_auth import DEFAULT_PIN_HASH


@pytest.mark.parametrize("self_approval", [False, True])
def test_warehouse_transfer_cancel_restores_both_cells_and_preserves_other_reservations(
    client, db_session, make_item, make_location, self_approval: bool,
):
    """수동 승인·자가승인 모두 정거래만 되돌리고 별도 대기 예약은 그대로 둔다."""
    item = make_item(name="cancel-reservation-transfer", process_type_code="TR", warehouse_qty=Decimal("20"))
    location = make_location(item.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("4"))
    location.pending_quantity = Decimal("1")
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    inventory.quantity = Decimal("24")
    requester = Employee(employee_code="CANCEL-RQ", name="요청자", role="staff", department="AS", warehouse_role="primary" if self_approval else "none", pin_hash=DEFAULT_PIN_HASH)
    approver = Employee(employee_code="CANCEL-WH", name="결재자", role="staff", department="창고", warehouse_role="primary", pin_hash=DEFAULT_PIN_HASH)
    other = Employee(employee_code="CANCEL-OTHER", name="다른 요청자", role="staff", department="AS", pin_hash=DEFAULT_PIN_HASH)
    db_session.add_all([requester, approver, other])
    db_session.commit()

    def submit(actor: Employee, quantity: int) -> dict:
        payload = {"requester_employee_id": str(actor.employee_id), "work_type": "warehouse_io", "sub_type": "warehouse_to_dept"}
        preview = client.post("/api/io/preview", json={**payload, "targets": [{"source_kind": "direct_item", "item_id": str(item.item_id), "quantity": quantity}]})
        assert preview.status_code == 200, preview.text
        result = client.post("/api/io/submit", json={**payload, "bundles": preview.json()["bundles"]})
        assert result.status_code == 201, result.text
        return result.json()

    other_result = submit(other, 2)
    other_request_id = other_result["stock_requests"][0]["stock_request_id"]
    result = submit(requester, 5)
    if not self_approval:
        approved = client.post(f'/api/stock-requests/{result["stock_requests"][0]["stock_request_id"]}/approve', json={"actor_employee_id": str(approver.employee_id), "pin": "0000"})
        assert approved.status_code == 200, approved.text
    db_session.refresh(inventory)
    db_session.refresh(location)
    assert (inventory.warehouse_qty, location.quantity, inventory.quantity) == (Decimal("15"), Decimal("9"), Decimal("24"))
    assert (inventory.pending_quantity, location.pending_quantity) == (Decimal("2"), Decimal("1"))
    log = db_session.query(TransactionLog).filter_by(item_id=item.item_id, transaction_type=TransactionTypeEnum.TRANSFER_TO_PROD).one()
    cancelled = client.post(f"/api/inventory/transactions/{log.log_id}/cancel", json={"employee_code": approver.employee_code, "pin": "0000", "reason": "예약 보존 확인"})
    assert cancelled.status_code == 200, cancelled.text
    db_session.refresh(inventory)
    db_session.refresh(location)
    assert (inventory.warehouse_qty, location.quantity, inventory.quantity) == (Decimal("20"), Decimal("4"), Decimal("24"))
    assert (inventory.pending_quantity, location.pending_quantity) == (Decimal("2"), Decimal("1"))
    assert db_session.get(StockRequest, other_request_id).status.value == "reserved"
