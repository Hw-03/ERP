"""routers/warehouse_map/* + services/warehouse_map.py 통합 테스트.

공개 GET(query.py): /structure /map /reconcile /jari
admin PIN(boxes.py/angles.py): 박스·앵글 CRUD + 좌표/용량/삭제가드.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    WarehouseBox,
    WarehouseBoxItem,
)
from app.services import warehouse_map as warehouse_map_service
from app.services.pin_auth import DEFAULT_PIN_HASH

D = Decimal
# 편집(박스·앵글 CRUD)은 창고 정/부 관리자(warehouse_role) + 본인 PIN 으로 보호.
MGR = {"X-Employee-Code": "WM001", "X-Operator-Pin": "0000"}
BASE = "/api/warehouse-map"


@pytest.fixture(autouse=True)
def _seed_warehouse_manager(db_session):
    """창고 편집 권한자(warehouse_role=primary, PIN 0000) 1명 시드."""
    db_session.add(
        Employee(
            employee_code="WM001",
            name="창고장",
            role="조립/창고장",
            department=DepartmentEnum.ASSEMBLY.value,
            level=EmployeeLevelEnum.STAFF,
            warehouse_role="primary",
            department_role="none",
            display_order=0,
            is_active="true",
            pin_hash=DEFAULT_PIN_HASH,
        )
    )
    db_session.flush()


def _make_angle(client, *, label="A열", rows=2, layers=2, jaris=3):
    resp = client.post(
        f"{BASE}/angles",
        json={"label": label, "rows": rows, "layers": layers, "jaris_per_cell": jaris},
        headers=MGR,
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
        headers=MGR,
    )

def _make_zone(client, *, label="PL-1", zone_type="pallet", items=None):
    resp = client.post(
        f"{BASE}/zones",
        json={
            "label": label,
            "zone_type": zone_type,
            "pos_x": 12,
            "pos_y": 34,
            "width": 80,
            "height": 40,
            "items": items or [],
        },
        headers=MGR,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ──────────────────────────── 앵글 CRUD ────────────────────────────

def test_create_angle(client):
    angle = _make_angle(client)
    assert angle["label"] == "A열"
    assert angle["rows"] == 2 and angle["jaris_per_cell"] == 3
    assert angle["display_order"] >= 1


def test_create_angle_requires_warehouse_manager(client):
    # 자격증명 없음 → 403
    assert client.post(f"{BASE}/angles", json={"label": "X"}).status_code == 403


def test_create_angle_rejects_non_manager(client, db_session):
    # warehouse_role=none 직원 → 403
    db_session.add(
        Employee(
            employee_code="ST001", name="일반사원", role="조립/사원",
            department=DepartmentEnum.ASSEMBLY.value, level=EmployeeLevelEnum.STAFF,
            warehouse_role="none", department_role="none", display_order=0,
            is_active="true", pin_hash=DEFAULT_PIN_HASH,
        )
    )
    db_session.flush()
    resp = client.post(
        f"{BASE}/angles", json={"label": "X"},
        headers={"X-Employee-Code": "ST001", "X-Operator-Pin": "0000"},
    )
    assert resp.status_code == 403


def test_create_angle_rejects_wrong_pin(client):
    resp = client.post(
        f"{BASE}/angles", json={"label": "X"},
        headers={"X-Employee-Code": "WM001", "X-Operator-Pin": "9999"},
    )
    assert resp.status_code == 403


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
    resp = client.delete(f"{BASE}/angles/{angle['id']}", headers=MGR)
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
        headers=MGR,
    )
    assert resp.status_code == 200
    names = {it["item_name"] for it in resp.json()["items"]}
    assert names == {"품B"}


def test_delete_box(client, make_item):
    angle = _make_angle(client)
    item = make_item(warehouse_qty=D("1"))
    box = _put_box(client, angle["id"],
                   items=[{"item_id": str(item.item_id), "quantity": 1}]).json()
    assert client.delete(f"{BASE}/boxes/{box['box_id']}", headers=MGR).status_code == 204
    assert len(client.get(f"{BASE}/map").json()["boxes"]) == 0


def test_box_mutations_lock_affected_rows_before_writes(
    client,
    db_session,
    make_item,
    monkeypatch,
):
    angle = _make_angle(client)
    target_angle = _make_angle(client, label="Lock target")
    old_item = make_item(name="Lock old", warehouse_qty=D("2"))
    new_item = make_item(name="Lock new", warehouse_qty=D("2"))
    calls = []

    def record_lock(
        db,
        *,
        item_ids=(),
        angle_ids=(),
        box_ids=(),
        include_boxes_for_item_ids=False,
    ):
        selected_box_ids = {str(value) for value in box_ids}
        boxes = db.query(WarehouseBox).all()
        contents = db.query(WarehouseBoxItem).all()
        calls.append(
            {
                "item_ids": {str(value) for value in item_ids},
                "angle_ids": set(angle_ids),
                "box_ids": selected_box_ids,
                "include_boxes_for_item_ids": include_boxes_for_item_ids,
                "boxes": {
                    str(box.box_id): (
                        box.angle_id,
                        box.row_no,
                        box.layer_no,
                        box.jari_index,
                        box.stack_order,
                    )
                    for box in boxes
                },
                "contents": {
                    str(content.box_id): str(content.item_id)
                    for content in contents
                },
            }
        )

    monkeypatch.setattr(
        warehouse_map_service,
        "lock_warehouse_map_rows",
        record_lock,
        raising=False,
    )

    created = _put_box(
        client,
        angle["id"],
        items=[{"item_id": str(old_item.item_id), "quantity": 1}],
    )
    assert created.status_code == 201, created.text
    first_box = created.json()
    assert calls[-1]["item_ids"] == {str(old_item.item_id)}
    assert calls[-1]["angle_ids"] == {angle["id"]}
    assert calls[-1]["box_ids"] == set()
    assert calls[-1]["boxes"] == {}

    calls.clear()
    updated = client.put(
        f"{BASE}/boxes/{first_box['box_id']}",
        json={"items": [{"item_id": str(new_item.item_id), "quantity": 1}]},
        headers=MGR,
    )
    assert updated.status_code == 200, updated.text
    assert calls[0]["item_ids"] == {
        str(old_item.item_id),
        str(new_item.item_id),
    }
    assert calls[0]["box_ids"] == {first_box["box_id"]}
    assert calls[0]["angle_ids"] == {angle["id"]}
    assert calls[0]["contents"] == {first_box["box_id"]: str(old_item.item_id)}

    second_box = _put_box(
        client,
        angle["id"],
        jari=1,
        items=[{"item_id": str(old_item.item_id), "quantity": 1}],
    ).json()

    calls.clear()
    moved = client.patch(
        f"{BASE}/boxes/{first_box['box_id']}/move",
        json={
            "angle_id": target_angle["id"],
            "row_no": 2,
            "layer_no": 1,
            "jari_index": 2,
        },
        headers=MGR,
    )
    assert moved.status_code == 200, moved.text
    assert calls[0]["item_ids"] == {str(new_item.item_id)}
    assert calls[0]["angle_ids"] == {angle["id"], target_angle["id"]}
    assert calls[0]["box_ids"] == {first_box["box_id"]}
    assert calls[0]["boxes"][first_box["box_id"]][:4] == (angle["id"], 1, 1, 0)

    calls.clear()
    restacked = client.patch(
        f"{BASE}/boxes/restack",
        json={
            "angle_id": target_angle["id"],
            "row_no": 1,
            "layer_no": 1,
            "jari_index": 2,
            "box_ids": [first_box["box_id"], second_box["box_id"]],
        },
        headers=MGR,
    )
    assert restacked.status_code == 200, restacked.text
    assert calls[0]["item_ids"] == {
        str(old_item.item_id),
        str(new_item.item_id),
    }
    assert calls[0]["box_ids"] == {
        first_box["box_id"],
        second_box["box_id"],
    }
    assert calls[0]["angle_ids"] == {angle["id"], target_angle["id"]}
    assert calls[0]["boxes"][first_box["box_id"]][:4] == (
        target_angle["id"],
        2,
        1,
        2,
    )

    calls.clear()
    deleted = client.delete(f"{BASE}/boxes/{first_box['box_id']}", headers=MGR)
    assert deleted.status_code == 204, deleted.text
    assert calls[0]["item_ids"] == {str(new_item.item_id)}
    assert calls[0]["angle_ids"] == {target_angle["id"]}
    assert calls[0]["box_ids"] == {first_box["box_id"]}
    assert first_box["box_id"] in calls[0]["boxes"]


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


def test_create_special_zone_requires_warehouse_manager(client):
    resp = client.post(
        f"{BASE}/zones",
        json={
            "label": "AISLE-1",
            "zone_type": "aisle",
            "pos_x": 1,
            "pos_y": 2,
            "width": 30,
            "height": 20,
            "items": [],
        },
    )
    assert resp.status_code == 403


def test_create_special_zone_and_map_includes_items(client, make_item):
    item = make_item(name="Pallet Item", process_type_code="TR", warehouse_qty=D("3"))
    zone = _make_zone(
        client,
        label="PL-1",
        zone_type="pallet",
        items=[{"item_id": str(item.item_id), "quantity": 3}],
    )

    assert zone["label"] == "PL-1"
    assert zone["zone_type"] == "pallet"
    assert zone["items"][0]["item_name"] == "Pallet Item"

    data = client.get(f"{BASE}/map").json()
    assert len(data["special_zones"]) == 1
    mapped = data["special_zones"][0]
    assert mapped["label"] == "PL-1"
    assert mapped["items"][0]["quantity"] == 3


def test_reconcile_counts_boxes_and_special_zones(client, make_item):
    angle = _make_angle(client)
    item = make_item(warehouse_qty=D("10"))
    _put_box(client, angle["id"],
             items=[{"item_id": str(item.item_id), "quantity": 7}])
    _make_zone(
        client,
        label="AISLE-1",
        zone_type="aisle",
        items=[{"item_id": str(item.item_id), "quantity": 3}],
    )

    data = client.get(f"{BASE}/reconcile").json()
    assert data["mismatch_count"] == 0
    assert data["rows"][0]["placed_total"] == 10
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


# ──────────────────────────── 박스 이동(드래그) ────────────────────────────

def test_move_box_changes_position(client, make_item):
    angle = _make_angle(client)
    item = make_item(warehouse_qty=D("1"))
    box = _put_box(client, angle["id"], row=1, layer=1, jari=0, size="SMALL",
                   items=[{"item_id": str(item.item_id), "quantity": 1}]).json()
    resp = client.patch(
        f"{BASE}/boxes/{box['box_id']}/move",
        json={"angle_id": angle["id"], "row_no": 2, "layer_no": 1, "jari_index": 1},
        headers=MGR,
    )
    assert resp.status_code == 200, resp.text
    moved = resp.json()
    assert (moved["row_no"], moved["layer_no"], moved["jari_index"]) == (2, 1, 1)


def test_move_box_capacity_exceeded(client):
    angle = _make_angle(client)
    # jari0 을 대(3) 박스로 가득, jari1 에 소(1) 박스 → 소를 jari0 으로 이동 시 초과
    _put_box(client, angle["id"], jari=0, size="LARGE")
    small = _put_box(client, angle["id"], jari=1, size="SMALL").json()
    resp = client.patch(
        f"{BASE}/boxes/{small['box_id']}/move",
        json={"angle_id": angle["id"], "row_no": 1, "layer_no": 1, "jari_index": 0},
        headers=MGR,
    )
    assert resp.status_code == 422


def test_move_box_requires_manager(client):
    angle = _make_angle(client)
    box = _put_box(client, angle["id"], jari=0, size="SMALL").json()
    resp = client.patch(
        f"{BASE}/boxes/{box['box_id']}/move",
        json={"angle_id": angle["id"], "row_no": 1, "layer_no": 1, "jari_index": 2},
    )
    assert resp.status_code == 403


def test_move_box_same_jari_brings_to_top(client):
    # 같은 자리 안에서 아래 박스를 드롭 → 맨 위로 (스택 순서 변경)
    angle = _make_angle(client)
    bottom = _put_box(client, angle["id"], jari=0, size="SMALL").json()
    top = _put_box(client, angle["id"], jari=0, size="SMALL").json()
    assert bottom["stack_order"] < top["stack_order"]
    resp = client.patch(
        f"{BASE}/boxes/{bottom['box_id']}/move",
        json={"angle_id": angle["id"], "row_no": 1, "layer_no": 1, "jari_index": 0},
        headers=MGR,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["stack_order"] > top["stack_order"]  # 이제 맨 위


def test_restack_jari_reorders_middle(client):
    # 자리 스택 순서를 통째로 재배치(중간 삽입)
    angle = _make_angle(client)
    a = _put_box(client, angle["id"], jari=0, size="SMALL").json()
    b = _put_box(client, angle["id"], jari=0, size="SMALL").json()
    c = _put_box(client, angle["id"], jari=0, size="SMALL").json()
    resp = client.patch(
        f"{BASE}/boxes/restack",
        json={
            "angle_id": angle["id"], "row_no": 1, "layer_no": 1, "jari_index": 0,
            "box_ids": [c["box_id"], a["box_id"], b["box_id"]],  # 아래→위
        },
        headers=MGR,
    )
    assert resp.status_code == 200, resp.text
    order = {x["box_id"]: x["stack_order"] for x in resp.json()}
    assert order[c["box_id"]] == 0 and order[a["box_id"]] == 1 and order[b["box_id"]] == 2


def test_restack_jari_requires_manager(client):
    angle = _make_angle(client)
    box = _put_box(client, angle["id"], jari=0, size="SMALL").json()
    resp = client.patch(
        f"{BASE}/boxes/restack",
        json={"angle_id": angle["id"], "row_no": 1, "layer_no": 1, "jari_index": 0,
              "box_ids": [box["box_id"]]},
    )
    assert resp.status_code == 403


def test_create_pallet_structure_accepts_box_list_storage(client, make_item):
    """PL/pallet structures are map structures that can hold warehouse boxes."""
    item = make_item(name="Pallet Box Item", process_type_code="TR", warehouse_qty=D("4"))
    resp = client.post(
        f"{BASE}/angles",
        json={
            "label": "PL-1",
            "angle_type": "pallet",
            "pos_x": 100,
            "pos_y": 180,
            "width": 120,
            "height": 60,
        },
        headers=MGR,
    )
    assert resp.status_code == 201, resp.text
    pallet = resp.json()
    assert pallet["angle_type"] == "pallet"

    box_resp = _put_box(
        client,
        pallet["id"],
        row=1,
        layer=1,
        jari=0,
        size="LARGE",
        items=[{"item_id": str(item.item_id), "quantity": 4}],
    )
    assert box_resp.status_code == 201, box_resp.text

    data = client.get(f"{BASE}/map").json()
    mapped = next(a for a in data["angles"] if a["id"] == pallet["id"])
    assert mapped["angle_type"] == "pallet"
    boxes = [b for b in data["boxes"] if b["angle_id"] == pallet["id"]]
    assert len(boxes) == 1
    assert boxes[0]["items"][0]["item_name"] == "Pallet Box Item"
