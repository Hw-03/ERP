"""Initial-stock history searches use operation provenance, not receipt type."""

from decimal import Decimal
from typing import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import InventoryOperation, Item, TransactionLog, TransactionTypeEnum


@pytest.mark.parametrize("kind", ["BUSINESS", "CANCELLATION"])
def test_initial_stock_history_search(
    client: TestClient, db_session: Session, make_item: Callable[..., Item], kind: str,
) -> None:
    """List, groups and summary agree even when no memo contains the label."""
    item = make_item(name="Initial inventory search fixture")
    operation = InventoryOperation(kind=kind, domain="item", action="initial_stock",
        display_label="초기 재고 등록", actor_name="History actor")
    db_session.add(operation)
    db_session.flush()
    initial = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("2"), quantity_before=Decimal("0"), quantity_after=Decimal("2"),
        department="진공", operation_id=operation.operation_id, notes="현장 확인")
    receipt = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("1"), quantity_before=Decimal("0"), quantity_after=Decimal("1"),
        department="창고")
    db_session.add_all([initial, receipt])
    db_session.commit()
    label = "초기 재고 등록 취소" if kind == "CANCELLATION" else "초기 재고 등록"
    for search, expected_id in ((label, initial.log_id), ("원자재 입고", receipt.log_id)):
        for endpoint in ("transactions", "transactions/display-groups"):
            response = client.get(f"/api/inventory/{endpoint}", params={"search": search})
            assert response.status_code == 200, response.text
            data = response.json()
            rows = data if endpoint == "transactions" else [row for group in data["groups"] for row in group["logs"]]
            assert {row["log_id"] for row in rows} == {str(expected_id)}
        summary = client.get("/api/inventory/transactions/summary", params={"search": search})
        assert summary.status_code == 200, summary.text
        assert summary.json()["total"] == 1
