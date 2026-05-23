"""GET /api/inventory/transactions/monthly-counts 단위 테스트."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

import pytest


def _make_log(db_session, item, tx_type: str, created_at: datetime):
    """TransactionLog 픽스처 헬퍼."""
    from app.models import TransactionLog, TransactionTypeEnum

    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum(tx_type),
        quantity_change=Decimal("1"),
        created_at=created_at,
    )
    db_session.add(log)
    db_session.flush()
    return log


def utc(year: int, month: int, day: int = 1) -> datetime:
    return datetime(year, month, day, 12, 0, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# 정상 응답
# ---------------------------------------------------------------------------

def test_monthly_counts_normal(client, make_item, db_session):
    """정상: 거래가 있는 달은 count > 0, 없는 달은 0 반환."""
    item = make_item()
    _make_log(db_session, item, "RECEIVE", utc(2026, 3))
    _make_log(db_session, item, "SHIP", utc(2026, 3))
    _make_log(db_session, item, "RECEIVE", utc(2026, 7))
    db_session.commit()

    resp = client.get("/api/inventory/transactions/monthly-counts?year=2026")
    assert resp.status_code == 200
    data = resp.json()

    assert data["2026-03"] == 2
    assert data["2026-07"] == 1
    assert data["2026-01"] == 0
    assert data["2026-12"] == 0
    # 12개월 모두 존재해야 함
    assert len(data) == 12


def test_monthly_counts_empty_year(client, make_item, db_session):
    """빈 year: 거래가 없으면 12개월 모두 0."""
    make_item()
    db_session.commit()

    resp = client.get("/api/inventory/transactions/monthly-counts?year=2025")
    assert resp.status_code == 200
    data = resp.json()
    assert all(v == 0 for v in data.values())
    assert len(data) == 12


def test_monthly_counts_invalid_year(client):
    """잘못된 year (범위 초과) → 422."""
    resp = client.get("/api/inventory/transactions/monthly-counts?year=1999")
    assert resp.status_code == 422

    resp2 = client.get("/api/inventory/transactions/monthly-counts?year=2200")
    assert resp2.status_code == 422


def test_monthly_counts_archived_excluded(client, make_item, db_session):
    """archived_at 이 있는 레코드는 카운트에서 제외."""
    from datetime import datetime, timezone
    from app.models import TransactionLog, TransactionTypeEnum

    item = make_item()
    # archived 거래
    archived_log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("1"),
        created_at=utc(2026, 5),
        archived_at=datetime(2026, 5, 10, tzinfo=timezone.utc),
    )
    # 정상 거래
    normal_log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("1"),
        created_at=utc(2026, 5),
    )
    db_session.add_all([archived_log, normal_log])
    db_session.commit()

    resp = client.get("/api/inventory/transactions/monthly-counts?year=2026")
    assert resp.status_code == 200
    assert resp.json()["2026-05"] == 1  # archived 제외
