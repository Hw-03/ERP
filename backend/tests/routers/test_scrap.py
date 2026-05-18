"""routers/scrap.py 통합 테스트.

POST /api/scrap  — 폐기 기록 + 재고 차감
GET  /api/scrap  — 목록 조회
"""

from __future__ import annotations

from decimal import Decimal

from app.models import Inventory


# ──────────────────────────────────────────────────────────────────────────────
# happy-path
# ──────────────────────────────────────────────────────────────────────────────


def test_create_scrap_deducts_warehouse(client, db_session, make_item):
    """유효한 폐기 요청 → 201 + 창고 재고 차감."""
    item = make_item(name="폐기품A", warehouse_qty=Decimal("20"))
    db_session.commit()

    resp = client.post(
        "/api/scrap",
        json={
            "item_id": str(item.item_id),
            "quantity": "5",
            "reason": "불량 발생",
            "operator": "작업자1",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["item_id"] == str(item.item_id)
    assert Decimal(data["quantity"]) == Decimal("5")
    assert data["reason"] == "불량 발생"
    assert data["operator"] == "작업자1"

    # 창고 재고 15로 감소
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    db_session.refresh(inv)
    assert inv.warehouse_qty == Decimal("15")


def test_create_scrap_with_process_stage(client, db_session, make_item):
    """process_stage 포함 폐기 기록."""
    item = make_item(name="폐기품B", warehouse_qty=Decimal("10"))
    db_session.commit()

    resp = client.post(
        "/api/scrap",
        json={
            "item_id": str(item.item_id),
            "quantity": "2",
            "reason": "가공 불량",
            "process_stage": "TR",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["process_stage"] == "TR"


def test_list_scrap_returns_records(client, db_session, make_item):
    """GET /api/scrap 목록 조회."""
    item = make_item(name="목록품", warehouse_qty=Decimal("30"))
    db_session.commit()

    client.post(
        "/api/scrap",
        json={"item_id": str(item.item_id), "quantity": "3", "reason": "검사 불량"},
    )

    resp = client.get("/api/scrap")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) >= 1
    assert any(r["item_id"] == str(item.item_id) for r in rows)


# ──────────────────────────────────────────────────────────────────────────────
# failure-path
# ──────────────────────────────────────────────────────────────────────────────


def test_create_scrap_unknown_item_404(client):
    """존재하지 않는 품목 → 404."""
    import uuid
    resp = client.post(
        "/api/scrap",
        json={
            "item_id": str(uuid.uuid4()),
            "quantity": "1",
            "reason": "테스트",
        },
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "NOT_FOUND"


def test_create_scrap_exceeds_available_stock_422(client, db_session, make_item):
    """가용 재고 초과 폐기 요청 → 422 STOCK_SHORTAGE."""
    item = make_item(name="부족품", warehouse_qty=Decimal("3"))
    db_session.commit()

    resp = client.post(
        "/api/scrap",
        json={
            "item_id": str(item.item_id),
            "quantity": "10",
            "reason": "대량 폐기 시도",
        },
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "STOCK_SHORTAGE"


def test_create_scrap_zero_quantity_422(client, db_session, make_item):
    """수량 0 → 422 (Pydantic gt=0 검증)."""
    item = make_item(name="영수량품", warehouse_qty=Decimal("5"))
    db_session.commit()

    resp = client.post(
        "/api/scrap",
        json={
            "item_id": str(item.item_id),
            "quantity": "0",
            "reason": "테스트",
        },
    )
    assert resp.status_code == 422


def test_create_scrap_pending_reduces_available(client, db_session, make_item):
    """pending_quantity 있는 경우 가용 재고에서 제외하고 검증."""
    # warehouse=10, pending=8 → available=2 이므로 3 폐기 불가
    item = make_item(name="예약품", warehouse_qty=Decimal("10"), pending=Decimal("8"))
    db_session.commit()

    resp = client.post(
        "/api/scrap",
        json={
            "item_id": str(item.item_id),
            "quantity": "3",
            "reason": "가용 부족",
        },
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "STOCK_SHORTAGE"
