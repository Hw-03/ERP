"""System health smoke tests."""

from __future__ import annotations

from decimal import Decimal

from app.models import Inventory


def test_health_and_detailed_health_are_ok(client, make_item):
    make_item(name="헬스 스모크", warehouse_qty=Decimal("4"))

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    detailed = client.get("/health/detailed")
    assert detailed.status_code == 200, detailed.text
    body = detailed.json()
    assert body["status"] == "ok"
    assert body["db"]["ok"] is True
    assert body["rows"]["items"] == 1
    assert body["rows"]["inventory"] == 1
    assert body["inventory_mismatch_count"] == 0
    assert "open_queue_batches" in body
    assert "last_transaction_at" in body


def test_detailed_health_reports_degraded_on_inventory_mismatch(client, db_session, make_item):
    item = make_item(name="헬스 미스매치", warehouse_qty=Decimal("4"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = Decimal("99")
    db_session.commit()

    detailed = client.get("/health/detailed")
    assert detailed.status_code == 200, detailed.text
    body = detailed.json()
    assert body["status"] == "degraded"
    assert body["inventory_mismatch_count"] == 1
