"""Public work forecasts require no administrator credential and never alter stock."""
import uuid

from app.models import Inventory, InventoryLocation
from tests.services.test_work_reservation_queries import make_work


def test_public_work_status_and_item_list_include_zero_stock_output(client, db_session, make_item):
    item = make_item(process_type_code="AR", warehouse_qty=0)
    make_work(db_session, item, kind="in", reservation_status="not_required")
    response = client.get("/api/inventory/work-status", params={"item_id": str(item.item_id)})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"]["expected_in_quantity"] == 3
    assert body["summary"]["forecast_by_location"][0]["location"] == {"bucket": "production", "department": "조립"}
    assert "history" not in body["works"][0] and "notes" not in body["works"][0]
    listed = client.get("/api/items", params={"search": item.item_name}).json()
    row = next(row for row in listed if row["item_id"] == str(item.item_id))
    assert row["work_reservations"] == body["summary"]
    assert row["locations"] == []
    assert row["available_quantity"] == 0
    assert db_session.query(InventoryLocation).filter_by(item_id=item.item_id).count() == 0


def test_item_pending_keeps_warehouse_semantics_without_double_subtraction(client, db_session, make_item):
    item = make_item(process_type_code="AR", warehouse_qty=10)
    make_work(db_session, item)
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    inventory.pending_quantity = 3
    db_session.flush()
    response = client.get(f"/api/items/{item.item_id}")
    assert response.status_code == 200, response.text
    row = response.json()
    assert row["work_reservations"]["work_reserved_quantity"] == 3
    assert row["pending_quantity"] == 3 and row["available_quantity"] == 7


def test_unknown_item_and_invalid_uuid_are_not_empty_success(client):
    assert client.get("/api/inventory/work-status", params={"item_id": str(uuid.uuid4())}).status_code == 404
    assert client.get("/api/inventory/work-status", params={"item_id": "invalid"}).status_code == 422
