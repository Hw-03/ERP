"""PATCH /api/items/reorder 통합 테스트.

모델 reorder 와 동일 패턴 — admin PIN 검증 + sort_order 일괄 갱신.
"""

from __future__ import annotations


def test_reorder_items_updates_sort_order(client, make_item, db_session):
    """올바른 PIN + 2개 품목 → sort_order 일괄 갱신 + 200."""
    i1 = make_item(name="첫번째")
    i2 = make_item(name="두번째")
    db_session.commit()

    resp = client.patch(
        "/api/items/reorder",
        json={
            "items": [
                {"item_id": str(i1.item_id), "display_order": 5},
                {"item_id": str(i2.item_id), "display_order": 2},
            ],
            "pin": "0000",
        },
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json() == {"ok": True}

    db_session.refresh(i1)
    db_session.refresh(i2)
    assert i1.sort_order == 5
    assert i2.sort_order == 2


def test_reorder_items_wrong_pin_403(client, make_item, db_session):
    """잘못된 PIN → 403."""
    i1 = make_item(name="A")
    db_session.commit()

    resp = client.patch(
        "/api/items/reorder",
        json={
            "items": [{"item_id": str(i1.item_id), "display_order": 1}],
            "pin": "9999",
        },
    )
    assert resp.status_code == 403


def test_reorder_items_missing_pin_400(client, make_item, db_session):
    """PIN 누락 → 400."""
    i1 = make_item(name="A")
    db_session.commit()

    resp = client.patch(
        "/api/items/reorder",
        json={"items": [{"item_id": str(i1.item_id), "display_order": 1}]},
    )
    # pydantic validation 거치면 422 — pin 필드 누락이므로
    assert resp.status_code in (400, 422)
