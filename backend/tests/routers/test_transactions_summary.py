"""GET /api/inventory/transactions/summary — 입출고 내역 KPI 집계 endpoint 테스트.

list_transactions 와 동일한 필터를 받지만 row 가 아니라 카운트 4개만 반환한다.
화면에 로드된 100건이 아니라 조건 전체 기준 KPI 를 위해 추가됨.
"""

from __future__ import annotations

from decimal import Decimal

from app.models import TransactionLog, TransactionTypeEnum


def _seed_log(db_session, item, tx_type: TransactionTypeEnum, qty: Decimal, notes: str = "") -> None:
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=tx_type,
            quantity_change=qty,
            quantity_before=Decimal("0"),
            quantity_after=qty,
            notes=notes,
        )
    )


def test_summary_empty_db(client):
    """빈 조건 — 모든 카운트 0."""
    res = client.get("/api/inventory/transactions/summary")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body == {"total": 0, "warehouse_count": 0, "dept_count": 0, "adjust_count": 0}


def test_summary_categorizes_by_transaction_type(client, db_session, make_item):
    """RECEIVE/SHIP/TRANSFER_TO_PROD/PRODUCE/BACKFLUSH/ADJUST 시드 → 카테고리별 카운트."""
    item = make_item(name="요약테스트품", warehouse_qty=Decimal("0"))
    _seed_log(db_session, item, TransactionTypeEnum.RECEIVE, Decimal("10"))
    _seed_log(db_session, item, TransactionTypeEnum.RECEIVE, Decimal("20"))
    _seed_log(db_session, item, TransactionTypeEnum.RECEIVE, Decimal("30"))
    _seed_log(db_session, item, TransactionTypeEnum.SHIP, Decimal("-5"))
    _seed_log(db_session, item, TransactionTypeEnum.SHIP, Decimal("-10"))
    _seed_log(db_session, item, TransactionTypeEnum.TRANSFER_TO_PROD, Decimal("0"))
    _seed_log(db_session, item, TransactionTypeEnum.PRODUCE, Decimal("5"))
    _seed_log(db_session, item, TransactionTypeEnum.BACKFLUSH, Decimal("-5"))
    _seed_log(db_session, item, TransactionTypeEnum.ADJUST, Decimal("3"))
    db_session.commit()

    res = client.get("/api/inventory/transactions/summary")
    assert res.status_code == 200, res.text
    body = res.json()
    # warehouse_involved: RECEIVE(3) + SHIP(2) + TRANSFER_TO_PROD(1) = 6
    # dept_internal: PRODUCE(1) + BACKFLUSH(1) = 2
    # adjust: 1
    # total: 9
    assert body == {"total": 9, "warehouse_count": 6, "dept_count": 2, "adjust_count": 1}


def test_summary_search_filter_applies(client, db_session, make_item):
    """search 파라미터가 list_transactions 와 동일하게 적용 — 매칭 row 만 카운트."""
    item_a = make_item(name="알파품목", warehouse_qty=Decimal("0"))
    item_b = make_item(name="베타품목", warehouse_qty=Decimal("0"))
    _seed_log(db_session, item_a, TransactionTypeEnum.RECEIVE, Decimal("1"))
    _seed_log(db_session, item_a, TransactionTypeEnum.SHIP, Decimal("-1"))
    _seed_log(db_session, item_b, TransactionTypeEnum.RECEIVE, Decimal("1"))
    db_session.commit()

    res = client.get("/api/inventory/transactions/summary", params={"search": "알파"})
    assert res.status_code == 200, res.text
    body = res.json()
    # 알파품목 매칭만 → RECEIVE 1 + SHIP 1 = 2
    assert body["total"] == 2
    assert body["warehouse_count"] == 2
    assert body["adjust_count"] == 0


def test_summary_transaction_types_filter(client, db_session, make_item):
    """transaction_types 쉼표 필터 — 지정된 타입만 카운트."""
    item = make_item(name="타입필터품", warehouse_qty=Decimal("0"))
    _seed_log(db_session, item, TransactionTypeEnum.RECEIVE, Decimal("1"))
    _seed_log(db_session, item, TransactionTypeEnum.SHIP, Decimal("-1"))
    _seed_log(db_session, item, TransactionTypeEnum.ADJUST, Decimal("1"))
    db_session.commit()

    res = client.get(
        "/api/inventory/transactions/summary",
        params={"transaction_types": "RECEIVE,ADJUST"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 2
    assert body["warehouse_count"] == 1  # RECEIVE
    assert body["adjust_count"] == 1
    assert body["dept_count"] == 0
