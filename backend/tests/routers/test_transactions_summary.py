"""GET /api/inventory/transactions/summary — 입출고 내역 KPI 집계 endpoint 테스트.

list_transactions 와 동일한 필터를 받지만 row 가 아니라 카운트 4개만 반환한다.
화면에 로드된 100건이 아니라 조건 전체 기준 KPI 를 위해 추가됨.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from app.models import (
    Employee,
    IoBatch,
    ItemModel,
    ProductSymbol,
    TransactionLog,
    TransactionTypeEnum,
)


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


def _seed_batch_log(
    db_session,
    item,
    tx_type: TransactionTypeEnum,
    qty: Decimal,
    *,
    to_department: str | None = None,
    from_department: str | None = None,
) -> None:
    """IoBatch 가 붙은 dept-bucket 거래. 부서 라벨은 COALESCE(to, from)."""
    suffix = uuid.uuid4().hex[:8]
    emp = Employee(
        employee_code=f"E{suffix}",
        name="테스트작업자",
        role="작업자",
        department=to_department or from_department or "조립",
    )
    db_session.add(emp)
    db_session.flush()
    batch = IoBatch(
        work_type="process",
        sub_type="produce",
        requester_employee_id=emp.employee_id,
        requester_name=emp.name,
        requester_department=emp.department,
        to_department=to_department,
        from_department=from_department,
    )
    db_session.add(batch)
    db_session.flush()
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=tx_type,
            quantity_change=qty,
            quantity_before=Decimal("0"),
            quantity_after=qty,
            operation_batch_id=batch.batch_id,
        )
    )


def test_summary_empty_db(client):
    """빈 조건 — 모든 카운트 0."""
    res = client.get("/api/inventory/transactions/summary")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body == {
        "total": 0,
        "warehouse_count": 0,
        "dept_count": 0,
        "adjust_count": 0,
        "department_counts": {},
    }


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
    # PRODUCE/BACKFLUSH 는 dept-bucket 이지만 배치 없음 → '미상' 2건
    assert body == {
        "total": 9,
        "warehouse_count": 6,
        "dept_count": 2,
        "adjust_count": 1,
        "department_counts": {"미상": 2},
    }


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


def test_summary_department_counts(client, db_session, make_item):
    """dept-bucket 거래 부서별 카운트. 같은 배치의 PRODUCE(to)·BACKFLUSH(from)가
    같은 부서로 집계되고, 배치 없는 dept-bucket 은 '미상'."""
    item = make_item(name="부서집계품", warehouse_qty=Decimal("0"))
    # 조립: PRODUCE(to=조립) + BACKFLUSH(from=조립) = 2
    _seed_batch_log(db_session, item, TransactionTypeEnum.PRODUCE, Decimal("5"), to_department="조립")
    _seed_batch_log(db_session, item, TransactionTypeEnum.BACKFLUSH, Decimal("-5"), from_department="조립")
    # 고압: PRODUCE 1
    _seed_batch_log(db_session, item, TransactionTypeEnum.PRODUCE, Decimal("3"), to_department="고압")
    # 배치 없는 dept-bucket → '미상'
    _seed_log(db_session, item, TransactionTypeEnum.DISASSEMBLE, Decimal("1"))
    # warehouse-bucket 은 department_counts 에 안 잡힘
    _seed_log(db_session, item, TransactionTypeEnum.RECEIVE, Decimal("10"))
    db_session.commit()

    res = client.get("/api/inventory/transactions/summary")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["dept_count"] == 4  # PRODUCE x2 + BACKFLUSH + DISASSEMBLE
    assert body["department_counts"] == {"조립": 2, "고압": 1, "미상": 1}


def test_summary_department_filter(client, db_session, make_item):
    """?department=조립 → 그 부서 dept-bucket 거래만 카운트."""
    item = make_item(name="부서필터품", warehouse_qty=Decimal("0"))
    _seed_batch_log(db_session, item, TransactionTypeEnum.PRODUCE, Decimal("5"), to_department="조립")
    _seed_batch_log(db_session, item, TransactionTypeEnum.PRODUCE, Decimal("3"), to_department="고압")
    _seed_log(db_session, item, TransactionTypeEnum.RECEIVE, Decimal("10"))
    db_session.commit()

    res = client.get(
        "/api/inventory/transactions/summary", params={"department": "조립"}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 1
    assert body["dept_count"] == 1
    assert body["department_counts"] == {"조립": 1}


def test_list_department_filter(client, db_session, make_item):
    """GET /transactions ?department=조립 → 조립 dept-bucket 거래만 반환."""
    item = make_item(name="목록부서필터품", warehouse_qty=Decimal("0"))
    _seed_batch_log(db_session, item, TransactionTypeEnum.PRODUCE, Decimal("5"), to_department="조립")
    _seed_batch_log(db_session, item, TransactionTypeEnum.PRODUCE, Decimal("3"), to_department="고압")
    _seed_log(db_session, item, TransactionTypeEnum.RECEIVE, Decimal("10"))
    db_session.commit()

    res = client.get("/api/inventory/transactions", params={"department": "조립"})
    assert res.status_code == 200, res.text
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["transaction_type"] == "PRODUCE"


def test_summary_process_step_filter(client, db_session, make_item):
    """process_step = process_type_code 마지막 글자(R/A/F) IN 필터."""
    raw = make_item(name="원자재품", process_type_code="TR", warehouse_qty=Decimal("0"))
    mid = make_item(name="중간품", process_type_code="TA", warehouse_qty=Decimal("0"))
    fin = make_item(name="완료품", process_type_code="TF", warehouse_qty=Decimal("0"))
    _seed_log(db_session, raw, TransactionTypeEnum.RECEIVE, Decimal("1"))
    _seed_log(db_session, mid, TransactionTypeEnum.RECEIVE, Decimal("1"))
    _seed_log(db_session, fin, TransactionTypeEnum.RECEIVE, Decimal("1"))
    db_session.commit()

    res = client.get(
        "/api/inventory/transactions/summary", params={"process_step": "R"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["total"] == 1  # 원자재(R)만

    res = client.get(
        "/api/inventory/transactions/summary", params={"process_step": "R,F"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["total"] == 2  # R + F


def test_summary_model_filter(client, db_session, make_item):
    """model = item_models ↔ product_symbols.model_name IN 필터."""
    sym = ProductSymbol(slot=1, symbol="A", model_name="DX3000")
    db_session.add(sym)
    a = make_item(name="DX3000부품", warehouse_qty=Decimal("0"))
    b = make_item(name="무관품", warehouse_qty=Decimal("0"))
    db_session.flush()
    db_session.add(ItemModel(item_id=a.item_id, slot=1))
    # 같은 품목이 모델 여러 개여도 거래 카운트는 1건이어야(중복 회피)
    sym2 = ProductSymbol(slot=2, symbol="B", model_name="DX1000")
    db_session.add(sym2)
    db_session.flush()
    db_session.add(ItemModel(item_id=a.item_id, slot=2))
    _seed_log(db_session, a, TransactionTypeEnum.RECEIVE, Decimal("1"))
    _seed_log(db_session, b, TransactionTypeEnum.RECEIVE, Decimal("1"))
    db_session.commit()

    res = client.get(
        "/api/inventory/transactions/summary", params={"model": "DX3000"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["total"] == 1  # a 의 RECEIVE 1건만 (모델 2개여도 1)

    res = client.get(
        "/api/inventory/transactions", params={"model": "DX3000"}
    )
    assert res.status_code == 200, res.text
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["item_name"] == "DX3000부품"
