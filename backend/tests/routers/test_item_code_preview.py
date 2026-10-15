"""An exact code preview is checked again atomically when the employee submits it."""
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Inventory, Item, ProductSymbol, TransactionLog
from app.utils.mes_code import refresh_symbol_cache

ADMIN = {"X-Admin-Pin": "0000"}


@pytest.fixture
def symbols(db_session: Session) -> None:
    db_session.add_all([
        ProductSymbol(slot=1, symbol="3", model_name="Preview A", is_finished_good=False, is_reserved=False),
        ProductSymbol(slot=2, symbol="7", model_name="Preview B", is_finished_good=False, is_reserved=False),
    ])
    db_session.commit()
    refresh_symbol_cache(db_session)


def test_code_preview_read_only_and_create_matches_reviewed_code(
    client: TestClient, db_session: Session, symbols: None,
) -> None:
    """Preview reads allocate nothing; a matching submission creates one item and one stock log."""
    preview = client.get("/api/items/code-preview", headers=ADMIN, params={"process_type_code": "TR", "model_slots": [1, 2]})
    assert preview.status_code == 200, preview.text
    assert preview.json() == {"mes_code": "37-TR-0001"}
    assert db_session.query(Item).count() == 0
    assert db_session.query(TransactionLog).count() == 0
    created = client.post("/api/items", headers=ADMIN, json={
        "item_name": "reviewed", "process_type_code": "TR", "model_slots": [1, 2],
        "initial_quantity": 5, "expected_mes_code": preview.json()["mes_code"],
    })
    assert created.status_code == 201, created.text
    assert created.json()["mes_code"] == preview.json()["mes_code"]
    assert db_session.query(Item).count() == 1
    assert db_session.query(TransactionLog).one().quantity_change == 5


def test_stale_create_preview_is_conflict_without_half_item_and_retry_uses_new_preview(
    client: TestClient, db_session: Session, symbols: None,
) -> None:
    """Two tabs can review the same code; the later write must review the next code before retry."""
    payload = {"item_name": "first", "process_type_code": "TR", "model_slots": [1], "initial_quantity": 5}
    preview = client.get("/api/items/code-preview", headers=ADMIN, params={"process_type_code": "TR", "model_slots": [1]}).json()
    first = client.post("/api/items", headers=ADMIN, json={**payload, "expected_mes_code": preview["mes_code"]})
    assert first.status_code == 201, first.text
    before = client.get("/api/items?limit=2000").json()
    stale = client.post("/api/items", headers=ADMIN, json={**payload, "item_name": "second", "expected_mes_code": preview["mes_code"]})
    assert stale.status_code == 409, stale.text
    assert client.get("/api/items?limit=2000").json() == before
    assert db_session.query(TransactionLog).count() == 1
    latest = client.get("/api/items/code-preview", headers=ADMIN, params={"process_type_code": "TR", "model_slots": [1]}).json()
    assert latest["mes_code"] == "3-TR-0002"
    second = client.post("/api/items", headers=ADMIN, json={**payload, "item_name": "second", "expected_mes_code": latest["mes_code"]})
    assert second.status_code == 201, second.text
    assert second.json()["mes_code"] == latest["mes_code"]
    assert db_session.query(Item).count() == 2
    assert db_session.query(TransactionLog).count() == 2


def test_unreviewed_create_code_rejects_without_item_inventory_or_log(
    client: TestClient, db_session: Session, symbols: None,
) -> None:
    """The write guard is independently required, not only the preview read endpoint."""
    rejected = client.post("/api/items", headers=ADMIN, json={
        "item_name": "unreviewed", "process_type_code": "TR", "model_slots": [1],
        "initial_quantity": 5, "expected_mes_code": "3-TR-9999",
    })
    assert rejected.status_code == 409, rejected.text
    assert db_session.query(Item).count() == 0
    assert db_session.query(Inventory).count() == 0
    assert db_session.query(TransactionLog).count() == 0


def test_edit_preview_preserves_serial_for_model_and_checks_new_category_before_other_fields(
    client: TestClient, symbols: None, make_item: Callable[..., Item],
) -> None:
    """A rejected category preview cannot partially rename or change purchase fields."""
    item = make_item(name="original", process_type_code="TR", model_symbol="3", serial_no=7)
    preview = client.get("/api/items/code-preview", headers=ADMIN, params={"item_id": str(item.item_id), "process_type_code": "TR", "model_slots": [2]})
    assert preview.status_code == 200, preview.text
    assert preview.json()["mes_code"] == "7-TR-0007"
    updated = client.put(f"/api/items/{item.item_id}", headers=ADMIN, json={"model_slots": [2], "expected_mes_code": preview.json()["mes_code"]})
    assert updated.status_code == 200, updated.text
    assert updated.json()["mes_code"] == preview.json()["mes_code"]
    before = client.get(f"/api/items/{item.item_id}").json()
    rejected = client.put(f"/api/items/{item.item_id}", headers=ADMIN, json={
        "process_type_code": "HR", "item_name": "must not change", "supplier": "must not change",
        "expected_mes_code": "7-HR-9999",
    })
    assert rejected.status_code == 409, rejected.text
    assert client.get(f"/api/items/{item.item_id}").json() == before
    latest = client.get("/api/items/code-preview", headers=ADMIN, params={"item_id": str(item.item_id), "process_type_code": "HR", "model_slots": [2]})
    assert latest.json()["mes_code"] == "7-HR-0001"
    accepted = client.put(f"/api/items/{item.item_id}", headers=ADMIN, json={"process_type_code": "HR", "expected_mes_code": latest.json()["mes_code"]})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["mes_code"] == latest.json()["mes_code"]
