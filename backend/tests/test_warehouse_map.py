"""routers/warehouse_map/* + services/warehouse_map.py 통합 테스트.

공개 GET(query.py): /structure /map /reconcile /jari
admin PIN(boxes.py/angles.py): 박스·앵글 CRUD + 좌표/용량/삭제가드.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

D = Decimal
ADMIN = {"X-Admin-Pin": "0000"}
BASE = "/api/warehouse-map"


def _make_angle(client, *, label="A열", rows=2, layers=2, jaris=3):
    resp = client.post(
        f"{BASE}/angles",
        json={"label": label, "rows": rows, "layers": layers, "jaris_per_cell": jaris},
        headers=ADMIN,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _put_box(client, angle_id, *, row=1, layer=1, jari=0, size="SMALL", items=None):
    return client.post(
        f"{BASE}/boxes",
        json={
            "angle_id": angle_id, "row_no": row, "layer_no": layer,
            "jari_index": jari, "size": size, "items": items or [],
        },
        headers=ADMIN,
    )


# ──────────────────────────── 앵글 CRUD ────────────────────────────

def test_create_angle(client):
    angle = _make_angle(client)
    assert angle["label"] == "A열"
    assert angle["rows"] == 2 and angle["jaris_per_cell"] == 3
    assert angle["display_order"] >= 1


def test_create_angle_requires_admin_pin(client):
    resp = client.post(f"{BASE}/angles", json={"label": "X"})
    assert resp.status_code == 400  # PIN 없음 → 거부


def test_structure_lists_angles_in_order(client):
    _make_angle(client, label="A")
    _make_angle(client, label="B")
    resp = client.get(f"{BASE}/structure")
    assert resp.status_code == 200
    assert [a["label"] for a in resp.json()] == ["A", "B"]


def test_delete_angle_blocked_when_boxes_present(client, make_item):
    angle = _make_angle(client)
    item = make_item(warehouse_qty=D("5"))
    assert _put_box(client, angle["id"],
                    items=[{"item_id": str(item.item_id), "quantity": 5}]).status_code == 201
    resp = client.delete(f"{BASE}/angles/{angle['id']}", headers=ADMIN)
    assert resp.status_code == 409


# ──────────────────────────── 박스 좌표/용량 검증 ────────────────────────────

def test_create_box_out_of_range_coords(client):
    angle = _make_angle(client, rows=2, layers=2, jaris=3)
    assert _put_box(client, angle["id"], row=99).status_code == 422


def test_jari_capacity_exceeded(client):
    angle = _make_angle(client)
    # 대(3) 박스 하나로 자리(용량3) 꽉 참 → 추가 소(1) 거부
    assert _put_box(client, angle["id"], size="LARGE").status_code == 201
    assert _put_box(client, angle["id"], size="SMALL").status_code == 422


def test_create_box_unknown_item(client):
    angle = _make_angle(client)
    resp = _put_box(client, angle["id"],
                    items=[{"item_id": str(uuid.uuid4()), "quantity": 1}])
    assert resp.status_code == 404


def test_update_box_replaces_items(client, make_item):
    angle = _make_angle(client)
    a = make_item(name="품A", warehouse_qty=D("3"))
    b = make_item(name="품B", warehouse_qty=D("3"))
    box = _put_box(client, angle["id"],
                   items=[{"item_id": str(a.item_id), "quantity": 1}]).json()
    resp = client.put(
        f"{BASE}/boxes/{box['box_id']}",
        json={"items": [{"item_id": str(b.item_id), "quantity": 2}]},
        headers=ADMIN,
    )
    assert resp.status_code == 200
    names = {it["item_name"] for it in resp.json()["items"]}
    assert names == {"품B"}


def test_delete_box(client, make_item):
    angle = _make_angle(client)
    item = make_item(warehouse_qty=D("1"))
    box = _put_box(client, angle["id"],
                   items=[{"item_id": str(item.item_id), "quantity": 1}]).json()
    assert client.delete(f"{BASE}/boxes/{box['box_id']}", headers=ADMIN).status_code == 204
    assert len(client.get(f"{BASE}/map").json()["boxes"]) == 0


# ──────────────────────────── 지도/대조 ────────────────────────────

def test_map_includes_angle_and_box(client, make_item):
    angle = _make_angle(client)
    item = make_item(name="튜브품목", process_type_code="TR", warehouse_qty=D("3"))
    _put_box(client, angle["id"], size="MEDIUM",
             items=[{"item_id": str(item.item_id), "quantity": 3}])
    data = client.get(f"{BASE}/map").json()
    assert len(data["angles"]) == 1 and len(data["boxes"]) == 1
    box = data["boxes"][0]
    assert box["items"][0]["item_name"] == "튜브품목"
    assert box["items"][0]["quantity"] == 3
    assert box["items"][0]["department"] == "튜브"  # T prefix → 튜브


def test_reconcile_detects_under(client, make_item):
    angle = _make_angle(client)
    item = make_item(warehouse_qty=D("10"))
    _put_box(client, angle["id"],
             items=[{"item_id": str(item.item_id), "quantity": 7}])
    data = client.get(f"{BASE}/reconcile").json()
    assert data["mismatch_count"] == 1
    row = data["rows"][0]
    assert row["placed_total"] == 7 and row["warehouse_qty"] == 10
    assert row["diff"] == -3 and row["status"] == "under"


def test_reconcile_ok_when_match(client, make_item):
    angle = _make_angle(client)
    item = make_item(warehouse_qty=D("4"))
    _put_box(client, angle["id"],
             items=[{"item_id": str(item.item_id), "quantity": 4}])
    data = client.get(f"{BASE}/reconcile").json()
    assert data["mismatch_count"] == 0
    assert data["rows"][0]["status"] == "ok"


def test_jari_returns_stack(client, make_item):
    angle = _make_angle(client)
    item = make_item(warehouse_qty=D("2"))
    _put_box(client, angle["id"], size="SMALL",
             items=[{"item_id": str(item.item_id), "quantity": 2}])
    resp = client.get(f"{BASE}/jari",
                      params={"angle_id": angle["id"], "row": 1, "layer": 1, "jari": 0})
    assert resp.status_code == 200
    assert len(resp.json()) == 1
