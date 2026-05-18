"""routers/alerts.py 통합 테스트.

POST /api/alerts/scan               — 안전재고 미달 스캔
GET  /api/alerts                    — 알림 목록 조회
POST /api/alerts/{id}/acknowledge   — 알림 확인 처리
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from app.models import AlertKindEnum, Inventory, Item, StockAlert


# ──────────────────────────────────────────────────────────────────────────────
# helpers
# ──────────────────────────────────────────────────────────────────────────────


def _make_item_with_min_stock(db_session, *, name: str, min_stock: Decimal,
                               warehouse_qty: Decimal, process_type_code: str = "TR") -> Item:
    """min_stock 이 설정된 품목 + 인벤토리 생성 헬퍼."""
    item = Item(item_name=name, process_type_code=process_type_code, unit="EA",
                min_stock=min_stock)
    db_session.add(item)
    db_session.flush()
    inv = Inventory(
        item_id=item.item_id,
        quantity=warehouse_qty,
        warehouse_qty=warehouse_qty,
        pending_quantity=Decimal("0"),
    )
    db_session.add(inv)
    db_session.flush()
    return item


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/alerts/scan
# ──────────────────────────────────────────────────────────────────────────────


def test_scan_creates_safety_alert_when_below_min(client, db_session):
    """available < min_stock 품목 → SAFETY 알림 신규 생성."""
    _make_item_with_min_stock(db_session, name="부족품", min_stock=Decimal("10"),
                               warehouse_qty=Decimal("3"))
    db_session.commit()

    resp = client.post("/api/alerts/scan")
    assert resp.status_code == 200
    alerts = resp.json()
    assert len(alerts) == 1
    assert alerts[0]["kind"] == "SAFETY"
    assert Decimal(alerts[0]["threshold"]) == Decimal("10")


def test_scan_no_alert_when_above_min(client, db_session):
    """available >= min_stock 품목 → 알림 미생성."""
    _make_item_with_min_stock(db_session, name="충분품", min_stock=Decimal("5"),
                               warehouse_qty=Decimal("20"))
    db_session.commit()

    resp = client.post("/api/alerts/scan")
    assert resp.status_code == 200
    assert resp.json() == []


def test_scan_no_duplicate_unacked_alert(client, db_session):
    """미확인 SAFETY 알림 이미 있으면 중복 생성 안 함."""
    item = _make_item_with_min_stock(db_session, name="중복방지품",
                                     min_stock=Decimal("10"), warehouse_qty=Decimal("2"))
    # 기존 미확인 알림 직접 삽입
    existing = StockAlert(
        item_id=item.item_id,
        kind=AlertKindEnum.SAFETY,
        threshold=Decimal("10"),
        observed_value=Decimal("2"),
        message="기존 알림",
    )
    db_session.add(existing)
    db_session.commit()

    resp = client.post("/api/alerts/scan")
    assert resp.status_code == 200
    # 새로 생성된 알림 없음
    assert resp.json() == []


def test_scan_creates_alert_when_no_inventory(client, db_session):
    """인벤토리 레코드 없는 품목 (available=0) + min_stock > 0 → 알림 생성."""
    item = Item(item_name="재고없음품", process_type_code="TR", unit="EA",
                min_stock=Decimal("5"))
    db_session.add(item)
    db_session.commit()

    resp = client.post("/api/alerts/scan")
    assert resp.status_code == 200
    alerts = resp.json()
    assert any(a["item_id"] == str(item.item_id) for a in alerts)


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/alerts
# ──────────────────────────────────────────────────────────────────────────────


def test_list_alerts_returns_unacked_by_default(client, db_session, make_item):
    """미확인 알림만 기본 반환."""
    item = make_item(name="알림조회품")
    alert = StockAlert(
        item_id=item.item_id,
        kind=AlertKindEnum.SAFETY,
        threshold=Decimal("5"),
        observed_value=Decimal("1"),
    )
    db_session.add(alert)
    db_session.commit()

    resp = client.get("/api/alerts")
    assert resp.status_code == 200
    rows = resp.json()
    assert any(r["alert_id"] == str(alert.alert_id) for r in rows)


def test_list_alerts_filter_by_kind(client, db_session, make_item):
    """kind 필터 적용."""
    item = make_item(name="종류필터품")
    alert = StockAlert(
        item_id=item.item_id,
        kind=AlertKindEnum.COUNT_VARIANCE,
        observed_value=Decimal("3"),
    )
    db_session.add(alert)
    db_session.commit()

    resp = client.get("/api/alerts", params={"kind": "COUNT_VARIANCE"})
    assert resp.status_code == 200
    rows = resp.json()
    assert all(r["kind"] == "COUNT_VARIANCE" for r in rows)


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/alerts/{id}/acknowledge
# ──────────────────────────────────────────────────────────────────────────────


def test_acknowledge_alert_success(client, db_session, make_item):
    """알림 확인 처리 → acknowledged_at 설정."""
    item = make_item(name="확인처리품")
    alert = StockAlert(
        item_id=item.item_id,
        kind=AlertKindEnum.SAFETY,
        threshold=Decimal("10"),
        observed_value=Decimal("2"),
    )
    db_session.add(alert)
    db_session.commit()

    resp = client.post(
        f"/api/alerts/{alert.alert_id}/acknowledge",
        json={"acknowledged_by": "담당자"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["acknowledged_by"] == "담당자"
    assert data["acknowledged_at"] is not None


def test_acknowledge_alert_not_found_404(client):
    """존재하지 않는 알림 → 404."""
    resp = client.post(
        f"/api/alerts/{uuid.uuid4()}/acknowledge",
        json={"acknowledged_by": "담당자"},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "NOT_FOUND"


def test_acknowledge_alert_already_acked_400(client, db_session, make_item):
    """이미 확인된 알림 재확인 시도 → 400."""
    from datetime import datetime
    item = make_item(name="이미확인품")
    alert = StockAlert(
        item_id=item.item_id,
        kind=AlertKindEnum.SAFETY,
        observed_value=Decimal("0"),
        acknowledged_at=datetime.utcnow(),
        acknowledged_by="기존담당자",
    )
    db_session.add(alert)
    db_session.commit()

    resp = client.post(
        f"/api/alerts/{alert.alert_id}/acknowledge",
        json={"acknowledged_by": "다른담당자"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "BAD_REQUEST"
