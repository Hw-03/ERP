"""Cancellation is a separate work event with the original business classification."""

from datetime import datetime
from decimal import Decimal

import pytest

from app.models import InventoryOperation, InventoryOperationKindEnum, TransactionLog, TransactionTypeEnum


def _work(db_session, items, *, kind, action, effective_at, original=None):
    operation = InventoryOperation(
        kind=kind, domain="inventory_io", action=action, display_label=action,
        actor_name="history actor", department="창고", effective_at=effective_at,
        reverses_operation_id=original.operation_id if original else None,
    )
    db_session.add(operation)
    db_session.flush()
    for item in items:
        db_session.add(TransactionLog(
            item_id=item.item_id, operation_id=operation.operation_id,
            transaction_type=TransactionTypeEnum.ADJUST if "adjust" in action else TransactionTypeEnum.RECEIVE,
            quantity_change=Decimal("-2") if original else Decimal("2"),
            quantity_before=Decimal("2") if original else Decimal("0"),
            quantity_after=Decimal("0") if original else Decimal("2"),
            department="창고", created_at=effective_at,
        ))
    db_session.flush()
    return operation


@pytest.mark.parametrize("action,adjust_count", [("warehouse_adjust_in", 2), ("receive_supplier", 0)])
def test_original_and_cancel_are_two_works_in_same_business_category(client, db_session, make_item, action, adjust_count):
    items = [make_item(name=f"cancel-policy-{action}-{index}") for index in range(2)]
    original = _work(db_session, items, kind=InventoryOperationKindEnum.BUSINESS,
                     action=action, effective_at=datetime(2026, 9, 10))
    _work(db_session, items, kind=InventoryOperationKindEnum.CANCELLATION,
          action=action, effective_at=datetime(2026, 9, 11), original=original)
    db_session.commit()
    response = client.get("/api/inventory/transactions/summary")
    assert response.status_code == 200, response.text
    assert response.json() == {
        "total": 2, "warehouse_count": 2, "dept_count": 0,
        "adjust_count": adjust_count, "department_counts": {"창고": 2},
    }
    assert sum(log.quantity_change for log in db_session.query(TransactionLog)) == 0


def test_cancel_in_next_month_uses_its_own_period_and_counts_once(client, db_session, make_item):
    items = [make_item(name=f"cancel-month-{index}") for index in range(3)]
    original = _work(db_session, items, kind=InventoryOperationKindEnum.BUSINESS,
                     action="receive_supplier", effective_at=datetime(2026, 9, 30, 14, 59))
    _work(db_session, items, kind=InventoryOperationKindEnum.CANCELLATION,
          action="receive_supplier", effective_at=datetime(2026, 9, 30, 15), original=original)
    db_session.commit()
    september = client.get("/api/inventory/transactions/summary?date_from=2026-09-01&date_to=2026-09-30")
    october = client.get("/api/inventory/transactions/summary?date_from=2026-10-01&date_to=2026-10-31")
    assert september.json()["total"] == 1
    assert october.json()["total"] == 1
    calendar = client.get("/api/inventory/transactions/monthly-counts?year=2026")
    assert calendar.json()["2026-09"] == 1
    assert calendar.json()["2026-10"] == 1
