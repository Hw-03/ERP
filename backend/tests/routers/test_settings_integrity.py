"""Settings integrity endpoint smoke tests."""

from __future__ import annotations

from decimal import Decimal


def test_integrity_inventory_post_uses_body_pin(client, make_item):
    make_item(name="정합성 POST", warehouse_qty=Decimal("3"))

    resp = client.post(
        "/api/settings/integrity/inventory",
        json={"pin": "0000", "limit": 50},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["checked"] == 1
    assert body["mismatched_count"] == 0
    assert body["samples"] == []


def test_integrity_inventory_post_rejects_wrong_pin(client):
    resp = client.post(
        "/api/settings/integrity/inventory",
        json={"pin": "9999", "limit": 50},
    )
    assert resp.status_code == 403


def test_integrity_inventory_get_compatibility_is_kept(client, make_item):
    make_item(name="정합성 GET 호환", warehouse_qty=Decimal("2"))

    resp = client.get("/api/settings/integrity/inventory", params={"pin": "0000", "limit": 10})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["checked"] == 1
    assert body["mismatched_count"] == 0
