from __future__ import annotations

import uuid

from app.models import ProductSymbol


def _model(db_session, *, slot: int, name: str, symbol: str) -> ProductSymbol:
    model = ProductSymbol(
        slot=slot,
        symbol=symbol,
        model_name=name,
        is_reserved=False,
        display_order=slot,
    )
    db_session.add(model)
    db_session.commit()
    return model


def test_assembly_checklist_management_flow_uses_existing_models_and_section_scoped_ordering(client, db_session):
    _model(db_session, slot=1, name="DX3000", symbol="3")
    _model(db_session, slot=2, name="ADX4000W", symbol="4")

    assert client.get("/api/assembly-checklists").json() == []

    created = client.post("/api/assembly-checklists", json={"model_slot": 1})
    assert created.status_code == 201
    assert created.json() == {
        "checklist_id": created.json()["checklist_id"],
        "model_slot": 1,
        "model_name": "DX3000",
        "sections": [],
    }

    assert client.post("/api/assembly-checklists", json={"model_slot": 1}).status_code == 409
    assert client.get("/api/assembly-checklists").json() == [created.json()]

    section = client.post("/api/assembly-checklists/1/sections", json={"title": "전원 ON"})
    assert section.status_code == 201
    power_on = section.json()["sections"][0]

    first_item = client.post(
        f"/api/assembly-checklists/sections/{power_on['section_id']}/items",
        json={"content": "전원 LED 점등 확인"},
    )
    assert first_item.status_code == 201
    second_item = client.post(
        f"/api/assembly-checklists/sections/{power_on['section_id']}/items",
        json={"content": "터치 반응 확인"},
    )
    assert second_item.status_code == 201

    reordered = client.put(
        f"/api/assembly-checklists/sections/{power_on['section_id']}/items/reorder",
        json={
            "item_ids": [
                second_item.json()["sections"][0]["items"][1]["item_id"],
                first_item.json()["sections"][0]["items"][0]["item_id"],
            ],
        },
    )
    assert reordered.status_code == 200
    assert [item["content"] for item in reordered.json()["sections"][0]["items"]] == [
        "터치 반응 확인",
        "전원 LED 점등 확인",
    ]

    second_section = client.post("/api/assembly-checklists/1/sections", json={"title": "전원 OFF"})
    power_off = second_section.json()["sections"][1]
    other_item = client.post(
        f"/api/assembly-checklists/sections/{power_off['section_id']}/items",
        json={"content": "전원 차단 확인"},
    )

    mixed_section_items = client.put(
        f"/api/assembly-checklists/sections/{power_on['section_id']}/items/reorder",
        json={
            "item_ids": [
                reordered.json()["sections"][0]["items"][0]["item_id"],
                other_item.json()["sections"][1]["items"][0]["item_id"],
            ],
        },
    )
    assert mixed_section_items.status_code == 422


def test_reference_seed_adds_the_four_existing_checklists_after_models(client, db_session, monkeypatch):
    from bootstrap import seed

    _model(db_session, slot=1, name="DX3000", symbol="3")
    _model(db_session, slot=2, name="COCOON", symbol="7")
    _model(db_session, slot=3, name="SOLO", symbol="8")
    _model(db_session, slot=5, name="ADX6000FB", symbol="6")
    monkeypatch.setattr(seed, "SessionLocal", lambda: db_session)

    counts = seed.seed_reference_data()

    assert counts["assembly_checklists"] == 4
    response = client.get("/api/assembly-checklists")
    assert [checklist["model_name"] for checklist in response.json()] == [
        "DX3000",
        "COCOON",
        "SOLO",
        "ADX6000FB",
    ]
    dx3000 = response.json()[0]
    assert [section["title"] for section in dx3000["sections"]] == ["전원 OFF", "전원 ON"]
    assert dx3000["sections"][0]["items"][0]["content"] == "손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인"
    assert response.json()[-1]["sections"][0]["items"][-1]["content"] == "POWER BUTTON이 정상적으로 눌리는지 확인"


def test_assembly_checklist_management_rejects_missing_resources_and_blank_text(client, db_session):
    _model(db_session, slot=1, name="DX3000", symbol="3")

    assert client.post("/api/assembly-checklists", json={"model_slot": 2}).status_code == 404
    assert client.post("/api/assembly-checklists", json={"model_slot": 1}).status_code == 201
    assert client.post("/api/assembly-checklists/1/sections", json={"title": "   "}).status_code == 422
    assert client.post(
        f"/api/assembly-checklists/sections/{uuid.uuid4()}/items",
        json={"content": "확인"},
    ).status_code == 404

    section = client.post("/api/assembly-checklists/1/sections", json={"title": "전원 ON"}).json()["sections"][0]
    assert client.post(
        f"/api/assembly-checklists/sections/{section['section_id']}/items",
        json={"content": "   "},
    ).status_code == 422
    item = client.post(
        f"/api/assembly-checklists/sections/{section['section_id']}/items",
        json={"content": "전원 LED 확인"},
    ).json()["sections"][0]["items"][0]
    assert client.put(
        f"/api/assembly-checklists/sections/{section['section_id']}/items/reorder",
        json={"item_ids": [str(uuid.uuid4())]},
    ).status_code == 422
    assert client.put(
        f"/api/assembly-checklists/sections/{uuid.uuid4()}/items/reorder",
        json={"item_ids": [item["item_id"]]},
    ).status_code == 404


def test_assembly_checklist_item_delete_returns_the_latest_section_items(client, db_session):
    _model(db_session, slot=1, name="DX3000", symbol="3")
    assert client.post("/api/assembly-checklists", json={"model_slot": 1}).status_code == 201
    section = client.post(
        "/api/assembly-checklists/1/sections", json={"title": "전원 ON"}
    ).json()["sections"][0]
    first = client.post(
        f"/api/assembly-checklists/sections/{section['section_id']}/items",
        json={"content": "첫 번째 항목"},
    ).json()["sections"][0]["items"][0]
    client.post(
        f"/api/assembly-checklists/sections/{section['section_id']}/items",
        json={"content": "두 번째 항목"},
    )

    deleted = client.delete(f"/api/assembly-checklists/items/{first['item_id']}")

    assert deleted.status_code == 200
    assert deleted.json()["sections"][0]["items"] == [
        {"item_id": deleted.json()["sections"][0]["items"][0]["item_id"], "content": "두 번째 항목", "sort_order": 0}
    ]
    assert client.delete(f"/api/assembly-checklists/items/{uuid.uuid4()}").status_code == 404


def test_assembly_checklist_item_update_persists_trimmed_content(client, db_session):
    _model(db_session, slot=1, name="DX3000", symbol="3")
    assert client.post("/api/assembly-checklists", json={"model_slot": 1}).status_code == 201
    section = client.post(
        "/api/assembly-checklists/1/sections", json={"title": "Power"}
    ).json()["sections"][0]
    item = client.post(
        f"/api/assembly-checklists/sections/{section['section_id']}/items",
        json={"content": "Original instruction"},
    ).json()["sections"][0]["items"][0]

    updated = client.put(
        f"/api/assembly-checklists/items/{item['item_id']}",
        json={"content": "  Updated instruction  "},
    )

    assert updated.status_code == 200
    assert updated.json()["sections"][0]["items"] == [
        {"item_id": item["item_id"], "content": "Updated instruction", "sort_order": 0}
    ]
    assert client.get("/api/assembly-checklists").json()[0]["sections"][0]["items"] == [
        {"item_id": item["item_id"], "content": "Updated instruction", "sort_order": 0}
    ]


def test_assembly_checklist_item_update_rejects_blank_content_and_missing_item(client, db_session):
    _model(db_session, slot=1, name="DX3000", symbol="3")
    assert client.post("/api/assembly-checklists", json={"model_slot": 1}).status_code == 201
    section = client.post(
        "/api/assembly-checklists/1/sections", json={"title": "Power"}
    ).json()["sections"][0]
    item = client.post(
        f"/api/assembly-checklists/sections/{section['section_id']}/items",
        json={"content": "Original instruction"},
    ).json()["sections"][0]["items"][0]

    blank_update = client.put(
        f"/api/assembly-checklists/items/{item['item_id']}", json={"content": "   "}
    )
    assert blank_update.status_code == 422
    assert client.get("/api/assembly-checklists").json()[0]["sections"][0]["items"] == [
        {"item_id": item["item_id"], "content": "Original instruction", "sort_order": 0}
    ]
    assert client.put(
        f"/api/assembly-checklists/items/{uuid.uuid4()}", json={"content": "Updated"}
    ).status_code == 404


def test_assembly_checklist_item_move_between_sections_persists_order_and_content(client, db_session):
    _model(db_session, slot=1, name="DX3000", symbol="3")
    assert client.post("/api/assembly-checklists", json={"model_slot": 1}).status_code == 201
    response = client.post("/api/assembly-checklists/1/sections", json={"title": "A"}).json()
    source = response["sections"][0]
    response = client.post("/api/assembly-checklists/1/sections", json={"title": "B"}).json()
    target = response["sections"][1]
    first_source = client.post(
        f"/api/assembly-checklists/sections/{source['section_id']}/items", json={"content": "A1"}
    ).json()["sections"][0]["items"][0]
    moved_item = client.post(
        f"/api/assembly-checklists/sections/{source['section_id']}/items", json={"content": "A2"}
    ).json()["sections"][0]["items"][1]
    first_target = client.post(
        f"/api/assembly-checklists/sections/{target['section_id']}/items", json={"content": "B1"}
    ).json()["sections"][1]["items"][0]
    second_target = client.post(
        f"/api/assembly-checklists/sections/{target['section_id']}/items", json={"content": "B2"}
    ).json()["sections"][1]["items"][1]

    moved = client.put(
        f"/api/assembly-checklists/items/{moved_item['item_id']}/move",
        json={"target_section_id": target["section_id"], "target_index": 1},
    )

    assert moved.status_code == 200
    assert moved.json()["sections"][0]["items"] == [
        {"item_id": first_source["item_id"], "content": "A1", "sort_order": 0}
    ]
    assert moved.json()["sections"][1]["items"] == [
        {"item_id": first_target["item_id"], "content": "B1", "sort_order": 0},
        {"item_id": moved_item["item_id"], "content": "A2", "sort_order": 1},
        {"item_id": second_target["item_id"], "content": "B2", "sort_order": 2},
    ]
    assert client.get("/api/assembly-checklists").json()[0] == moved.json()

    moved_to_front = client.put(
        f"/api/assembly-checklists/items/{first_source['item_id']}/move",
        json={"target_section_id": target["section_id"], "target_index": 0},
    )

    assert moved_to_front.status_code == 200
    assert moved_to_front.json()["sections"][0]["items"] == []
    assert moved_to_front.json()["sections"][1]["items"] == [
        {"item_id": first_source["item_id"], "content": "A1", "sort_order": 0},
        {"item_id": first_target["item_id"], "content": "B1", "sort_order": 1},
        {"item_id": moved_item["item_id"], "content": "A2", "sort_order": 2},
        {"item_id": second_target["item_id"], "content": "B2", "sort_order": 3},
    ]
    assert client.get("/api/assembly-checklists").json()[0] == moved_to_front.json()


def test_assembly_checklist_item_move_into_empty_section(client, db_session):
    _model(db_session, slot=1, name="DX3000", symbol="3")
    assert client.post("/api/assembly-checklists", json={"model_slot": 1}).status_code == 201
    source = client.post("/api/assembly-checklists/1/sections", json={"title": "A"}).json()["sections"][0]
    target = client.post("/api/assembly-checklists/1/sections", json={"title": "B"}).json()["sections"][1]
    item = client.post(
        f"/api/assembly-checklists/sections/{source['section_id']}/items", json={"content": "A1"}
    ).json()["sections"][0]["items"][0]

    moved = client.put(
        f"/api/assembly-checklists/items/{item['item_id']}/move",
        json={"target_section_id": target["section_id"], "target_index": 0},
    )

    assert moved.status_code == 200
    assert moved.json()["sections"][0]["items"] == []
    assert moved.json()["sections"][1]["items"] == [
        {"item_id": item["item_id"], "content": "A1", "sort_order": 0}
    ]


def test_assembly_checklist_item_move_within_section_reorders_after_removal(client, db_session):
    _model(db_session, slot=1, name="DX3000", symbol="3")
    assert client.post("/api/assembly-checklists", json={"model_slot": 1}).status_code == 201
    section = client.post("/api/assembly-checklists/1/sections", json={"title": "A"}).json()["sections"][0]
    items = [
        client.post(
            f"/api/assembly-checklists/sections/{section['section_id']}/items", json={"content": content}
        ).json()["sections"][0]["items"][-1]
        for content in ("A1", "A2", "A3")
    ]

    moved = client.put(
        f"/api/assembly-checklists/items/{items[0]['item_id']}/move",
        json={"target_section_id": section["section_id"], "target_index": 2},
    )

    assert moved.status_code == 200
    assert moved.json()["sections"][0]["items"] == [
        {"item_id": items[1]["item_id"], "content": "A2", "sort_order": 0},
        {"item_id": items[2]["item_id"], "content": "A3", "sort_order": 1},
        {"item_id": items[0]["item_id"], "content": "A1", "sort_order": 2},
    ]
    assert client.get("/api/assembly-checklists").json()[0] == moved.json()


def test_assembly_checklist_item_move_rejects_invalid_target_sections_and_indices(client, db_session):
    _model(db_session, slot=1, name="DX3000", symbol="3")
    _model(db_session, slot=2, name="ADX4000W", symbol="4")
    assert client.post("/api/assembly-checklists", json={"model_slot": 1}).status_code == 201
    assert client.post("/api/assembly-checklists", json={"model_slot": 2}).status_code == 201
    source = client.post("/api/assembly-checklists/1/sections", json={"title": "A"}).json()["sections"][0]
    target = client.post("/api/assembly-checklists/1/sections", json={"title": "B"}).json()["sections"][1]
    other = client.post("/api/assembly-checklists/2/sections", json={"title": "C"}).json()["sections"][0]
    item = client.post(
        f"/api/assembly-checklists/sections/{source['section_id']}/items", json={"content": "A1"}
    ).json()["sections"][0]["items"][0]
    client.post(
        f"/api/assembly-checklists/sections/{target['section_id']}/items", json={"content": "B1"}
    )
    client.post(
        f"/api/assembly-checklists/sections/{other['section_id']}/items", json={"content": "C1"}
    )
    snapshot = client.get("/api/assembly-checklists").json()

    different_checklist = client.put(
        f"/api/assembly-checklists/items/{item['item_id']}/move",
        json={"target_section_id": other["section_id"], "target_index": 0},
    )
    assert different_checklist.status_code == 422
    assert client.get("/api/assembly-checklists").json() == snapshot

    out_of_range = client.put(
        f"/api/assembly-checklists/items/{item['item_id']}/move",
        json={"target_section_id": target["section_id"], "target_index": 2},
    )
    assert out_of_range.status_code == 422
    assert client.get("/api/assembly-checklists").json() == snapshot

    missing_target = client.put(
        f"/api/assembly-checklists/items/{item['item_id']}/move",
        json={"target_section_id": str(uuid.uuid4()), "target_index": 0},
    )
    assert missing_target.status_code == 404
    assert client.get("/api/assembly-checklists").json() == snapshot
