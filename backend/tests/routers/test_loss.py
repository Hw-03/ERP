"""routers/loss.py 통합 테스트.

POST /api/loss           — 분실 기록 (deduct=false)
POST /api/loss?deduct=true — 분실 기록 + 재고 차감
GET  /api/loss           — 목록 조회
"""

from __future__ import annotations

from decimal import Decimal

from app.models import Inventory


# ──────────────────────────────────────────────────────────────────────────────
# happy-path
# ──────────────────────────────────────────────────────────────────────────────


def test_create_loss_no_deduct(client, db_session, make_item):
    """deduct=false (기본값) → 201, 재고 변동 없음."""
    item = make_item(name="분실품A", warehouse_qty=Decimal("15"))
    db_session.commit()

    resp = client.post(
        "/api/loss",
        json={
            "item_id": str(item.item_id),
            "quantity": "3",
            "reason": "분실 신고",
            "operator": "작업자2",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["item_id"] == str(item.item_id)
    assert Decimal(data["quantity"]) == Decimal("3")
    assert data["reason"] == "분실 신고"
    assert data["operator"] == "작업자2"

    # 재고 변동 없음
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    db_session.refresh(inv)
    assert inv.warehouse_qty == Decimal("15")


def test_create_loss_with_deduct(client, db_session, make_item):
    """deduct=true → 201, 창고 재고 차감."""
    item = make_item(name="분실품B", warehouse_qty=Decimal("20"))
    db_session.commit()

    resp = client.post(
        "/api/loss?deduct=true",
        json={
            "item_id": str(item.item_id),
            "quantity": "4",
            "reason": "보유 중 분실",
        },
    )
    assert resp.status_code == 201
    assert Decimal(resp.json()["quantity"]) == Decimal("4")

    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    db_session.refresh(inv)
    assert inv.warehouse_qty == Decimal("16")


def test_list_loss_returns_records(client, db_session, make_item):
    """GET /api/loss 목록 조회."""
    item = make_item(name="목록분실품", warehouse_qty=Decimal("10"))
    db_session.commit()

    client.post(
        "/api/loss",
        json={"item_id": str(item.item_id), "quantity": "1", "reason": "분실"},
    )

    resp = client.get("/api/loss")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) >= 1
    assert any(r["item_id"] == str(item.item_id) for r in rows)


# ──────────────────────────────────────────────────────────────────────────────
# failure-path
# ──────────────────────────────────────────────────────────────────────────────


def test_create_loss_unknown_item_404(client):
    """존재하지 않는 품목 → 404."""
    import uuid
    resp = client.post(
        "/api/loss",
        json={
            "item_id": str(uuid.uuid4()),
            "quantity": "1",
            "reason": "테스트",
        },
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "NOT_FOUND"


def test_create_loss_deduct_exceeds_stock_422(client, db_session, make_item):
    """deduct=true, 가용 재고 초과 → 422 STOCK_SHORTAGE."""
    item = make_item(name="부족분실품", warehouse_qty=Decimal("2"))
    db_session.commit()

    resp = client.post(
        "/api/loss?deduct=true",
        json={
            "item_id": str(item.item_id),
            "quantity": "5",
            "reason": "초과 차감 시도",
        },
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "STOCK_SHORTAGE"


def test_create_loss_zero_quantity_422(client, db_session, make_item):
    """수량 0 → 422 (Pydantic gt=0 검증)."""
    item = make_item(name="영수량분실품", warehouse_qty=Decimal("5"))
    db_session.commit()

    resp = client.post(
        "/api/loss",
        json={
            "item_id": str(item.item_id),
            "quantity": "0",
            "reason": "테스트",
        },
    )
    assert resp.status_code == 422


def test_create_loss_no_deduct_ignores_stock_shortage(client, db_session, make_item):
    """deduct=false 일 때는 재고 부족과 무관하게 기록만 남긴다."""
    # 재고 1개인데 100개 분실 기록 — deduct=false 이므로 허용
    item = make_item(name="재고무관분실품", warehouse_qty=Decimal("1"))
    db_session.commit()

    resp = client.post(
        "/api/loss",
        json={
            "item_id": str(item.item_id),
            "quantity": "100",
            "reason": "외부 분실",
        },
    )
    assert resp.status_code == 201

    # 재고 그대로
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    db_session.refresh(inv)
    assert inv.warehouse_qty == Decimal("1")
