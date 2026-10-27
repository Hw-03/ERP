"""Modern history pages must not materialize every matching transaction group."""

from datetime import datetime, timedelta
from collections.abc import Callable
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import InventoryOperation, Item
from app.services.transaction_display_groups import DisplayGroup, DisplayGroupRecord
from tests.routers.test_transaction_display_groups import _add_log


@pytest.mark.parametrize("search", [None, "page target"])
def test_grouping_input_is_bounded_by_complete_page_candidates(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    monkeypatch: pytest.MonkeyPatch, search: str | None,
) -> None:
    from app.routers.inventory import transactions

    target = make_item(name="page target")
    sibling = make_item(name="page sibling")
    base = datetime(2026, 10, 1)
    for index in range(8):
        submission_id = uuid4()
        for item in (target, sibling):
            operation = InventoryOperation(
                kind="BUSINESS", domain="inventory_io", action="receive",
                display_label="receive", actor_name="Tester", effective_at=base,
            )
            db_session.add(operation)
            db_session.flush()
            log = _add_log(db_session, item, created_at=base + timedelta(minutes=index))
            log.operation_id = operation.operation_id
            log.submission_id = submission_id
    db_session.commit()
    original = transactions.group_display_records
    grouped_counts = []

    def tracked(logs: list[DisplayGroupRecord], **kwargs: Any) -> list[DisplayGroup]:
        """Observe only the records materialized for the pure grouping stage."""
        grouped_counts.append(len(logs))
        return original(logs, **kwargs)

    monkeypatch.setattr(transactions, "group_display_records", tracked)
    params = {"limit": 2}
    if search:
        params["search"] = search
    seen = set()
    for page_index in range(4):
        grouped_counts.clear()
        response = client.get("/api/inventory/transactions/display-groups", params=params)
        assert response.status_code == 200, response.text
        page = response.json()
        assert len(page["groups"]) == 2
        assert all(len(group["logs"]) == 2 for group in page["groups"])
        assert all(group["type"] == "submission" for group in page["groups"])
        keys = {group["key"] for group in page["groups"]}
        assert not keys & seen
        seen.update(keys)
        # One lookahead group is sufficient to establish has_more.
        assert max(grouped_counts) <= 6
        assert page["has_more"] is (page_index < 3)
        params["cursor"] = page["next_cursor"]
    assert len(seen) == 8
