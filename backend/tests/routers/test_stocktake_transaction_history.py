"""Stocktake history classification uses operation provenance, never memo text."""

from decimal import Decimal
from typing import Callable
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from app.models import InventoryOperation, InventoryOperationKindEnum, Item, TransactionLog, TransactionTypeEnum


def test_stocktake_history_source_filter_and_search(client: TestClient, db_session: Session, make_item: Callable[..., Item]) -> None:
    """All history reads classify existing stocktake corrections before pagination."""
    item = make_item(name="History source item", warehouse_qty=Decimal("0"))
    operation = InventoryOperation(kind=InventoryOperationKindEnum.BUSINESS,
        domain="stocktake", action="apply", display_label="부서 전수조사", actor_name="History actor")
    db_session.add(operation)
    db_session.flush()
    logs = [TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.ADJUST,
        quantity_change=Decimal("-1"), quantity_before=Decimal("1"), quantity_after=Decimal("0"),
        department=department, operation_id=operation.operation_id if linked else None,
        notes="부서 전수조사") for department, linked in (("튜브", True), ("창고", True), ("튜브", False))]
    db_session.add_all(logs)
    db_session.commit()
    stocktake_ids = {str(log.log_id) for log in logs[:2]}
    response = client.get("/api/inventory/transactions", params={"operation_keys": "stocktake"})
    assert response.status_code == 200, response.text
    assert {row["log_id"] for row in response.json()} == stocktake_ids
    assert all((row["operation_domain"], row["operation_action"]) == ("stocktake", "apply") for row in response.json())
    response = client.get("/api/inventory/transactions", params={"operation_keys": "process"})
    assert {row["log_id"] for row in response.json()} == {str(logs[2].log_id)}
    for endpoint in ("transactions", "transactions/display-groups"):
        response = client.get(f"/api/inventory/{endpoint}", params={"search": "재고 전수조사"})
        assert response.status_code == 200, response.text
        rows = response.json() if endpoint == "transactions" else [row for group in response.json()["groups"] for row in group["logs"]]
        assert {row["log_id"] for row in rows} == stocktake_ids
    summary = client.get("/api/inventory/transactions/summary", params={"operation_keys": "stocktake"})
    assert summary.status_code == 200, summary.text
    assert summary.json()["total"] == 1  # One operation, with two location correction rows.
