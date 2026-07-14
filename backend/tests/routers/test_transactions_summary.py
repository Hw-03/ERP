"""GET /api/inventory/transactions/summary — 입출고 내역 KPI 집계 endpoint 테스트.

list_transactions 와 동일한 필터를 받지만 row 가 아니라 카운트 4개만 반환한다.
화면에 로드된 100건이 아니라 조건 전체 기준 KPI 를 위해 추가됨.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from app.models import (
    Employee,
    IoBatch,
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
    sub_type: str = "produce",
    transfer_qty: Decimal | None = None,
    batch_created_at: datetime | None = None,
    submitted_at: datetime | None = None,
    log_created_at: datetime | None = None,
    shipping_phase: str | None = None,
) -> None:
    """IoBatch 가 붙은 거래. 부서 라벨은 COALESCE(to, from).

    sub_type: IoBatch.sub_type (기본 'produce'). 기존 호출부 기본값 유지.
    transfer_qty: TransactionLog.transfer_qty (기본 None).
    """
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
        sub_type=sub_type,
        requester_employee_id=emp.employee_id,
        requester_name=emp.name,
        requester_department=emp.department,
        to_department=to_department,
        from_department=from_department,
        created_at=batch_created_at,
        submitted_at=submitted_at,
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
            transfer_qty=transfer_qty,
            created_at=log_created_at,
            shipping_phase=shipping_phase,
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


def test_internal_use_is_warehouse_kpi_with_destination_department(
    client, db_session, make_item
):
    item = make_item(name="내부 사용 집계품", warehouse_qty=Decimal("0"))
    _seed_batch_log(
        db_session,
        item,
        TransactionTypeEnum.INTERNAL_USE,
        Decimal("-2"),
        to_department="연구",
        sub_type="internal_use_out",
    )
    db_session.commit()

    summary = client.get(
        "/api/inventory/transactions/summary",
        params={"operation_keys": "internal_use"},
    )
    assert summary.status_code == 200, summary.text
    assert summary.json()["warehouse_count"] == 1
    assert summary.json()["department_counts"] == {"연구": 1}


def test_reference_summaries_use_all_matching_logs_and_exclude_operation_batches(
    client, db_session, make_item
):
    """Reference summaries are complete, phase-scoped, and independent of list pages."""
    first = make_item(name="reference-summary-first", warehouse_qty=Decimal("0"))
    second = make_item(name="reference-summary-second", warehouse_qty=Decimal("0"))
    second.unit = "BOX"

    db_session.add_all(
        [
            TransactionLog(
                item_id=first.item_id,
                transaction_type=TransactionTypeEnum.SHIP,
                quantity_change=Decimal("-4"),
                quantity_before=Decimal("4"),
                quantity_after=Decimal("0"),
                reference_no="REF-ALL",
                shipping_phase="PREPARE",
            ),
            TransactionLog(
                item_id=first.item_id,
                transaction_type=TransactionTypeEnum.SHIP,
                quantity_change=Decimal("-99"),
                quantity_before=Decimal("99"),
                quantity_after=Decimal("0"),
                transfer_qty=Decimal("3"),
                reference_no="REF-ALL",
                shipping_phase="PREPARE",
            ),
            TransactionLog(
                item_id=second.item_id,
                transaction_type=TransactionTypeEnum.SHIP,
                quantity_change=Decimal("5"),
                quantity_before=Decimal("0"),
                quantity_after=Decimal("5"),
                reference_no="REF-ALL",
                shipping_phase="PREPARE",
            ),
            TransactionLog(
                item_id=first.item_id,
                transaction_type=TransactionTypeEnum.SHIP,
                quantity_change=Decimal("-7"),
                quantity_before=Decimal("7"),
                quantity_after=Decimal("0"),
                reference_no="REF-ALL",
                shipping_phase="PICKUP",
            ),
        ]
    )
    employee = Employee(
        employee_code="REFERENCE-SUMMARY",
        name="Reference Summary",
        role="operator",
        department="assembly",
    )
    db_session.add(employee)
    db_session.flush()
    batch = IoBatch(
        work_type="process",
        sub_type="produce",
        requester_employee_id=employee.employee_id,
        requester_name=employee.name,
        requester_department=employee.department,
    )
    db_session.add(batch)
    db_session.flush()
    db_session.add(
        TransactionLog(
            item_id=first.item_id,
            transaction_type=TransactionTypeEnum.SHIP,
            quantity_change=Decimal("-50"),
            quantity_before=Decimal("50"),
            quantity_after=Decimal("0"),
            operation_batch_id=batch.batch_id,
            reference_no="REF-ALL",
            shipping_phase="PREPARE",
        )
    )
    db_session.commit()

    response = client.get(
        "/api/inventory/transactions/reference-summaries",
        params={"transaction_types": "SHIP"},
    )

    assert response.status_code == 200, response.text
    assert response.json() == [
        {
            "reference_no": "REF-ALL",
            "shipping_phase": "PICKUP",
            "log_count": 1,
            "item_count": 1,
            "total_quantity": 7,
            "unit": "EA",
        },
        {
            "reference_no": "REF-ALL",
            "shipping_phase": "PREPARE",
            "log_count": 3,
            "item_count": 2,
            "total_quantity": 12,
            "unit": None,
        },
    ]


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
    # RECEIVE(3)+SHIP(2)+TRANSFER_TO_PROD(1) 는 창고계열 → '창고' 6건
    # ADJUST(1) → '미상' (dept/warehouse 아님)
    assert body == {
        "total": 9,
        "warehouse_count": 6,
        "dept_count": 2,
        "adjust_count": 1,
        "department_counts": {"창고": 6, "미상": 3},
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
    # warehouse-bucket → '창고' 로 department_counts 에 집계됨
    _seed_log(db_session, item, TransactionTypeEnum.RECEIVE, Decimal("10"))
    db_session.commit()

    res = client.get("/api/inventory/transactions/summary")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["dept_count"] == 4  # PRODUCE x2 + BACKFLUSH + DISASSEMBLE
    assert body["department_counts"] == {"조립": 2, "고압": 1, "미상": 1, "창고": 1}


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



def test_transactions_date_filter_uses_display_request_date(client, db_session, make_item):
    """Date filters follow the request date shown in the history table."""
    item = make_item(name="request-date-filter-item", warehouse_qty=Decimal("0"))
    _seed_batch_log(
        db_session,
        item,
        TransactionTypeEnum.SHIP,
        Decimal("-1"),
        submitted_at=datetime(2026, 7, 1, 8, 14),
        log_created_at=datetime(2026, 6, 30, 23, 14),
    )
    db_session.commit()

    res = client.get("/api/inventory/transactions", params={"date_from": "2026-07-01"})
    assert res.status_code == 200, res.text
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["requested_at"].startswith("2026-07-01T08:14")

    res = client.get("/api/inventory/transactions/summary", params={"date_from": "2026-07-01"})
    assert res.status_code == 200, res.text
    assert res.json()["total"] == 1

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
    """model = product_symbols.model_name IN 필터 — Item.mes_code prefix 기반.

    회사 규약: mes_code 의 첫 '-' 앞 글자열 각 글자 = ProductSymbol.symbol.
    DX3000(symbol='A') 매칭은 "A-…" 또는 prefix 중 어느 자리든 'A' 포함이면 OK.
    같은 품목이 prefix 안에 여러 symbol("AB-…") 가져도 거래 카운트는 1건이어야 함.
    """
    db_session.add(ProductSymbol(slot=1, symbol="A", model_name="DX3000"))
    db_session.add(ProductSymbol(slot=2, symbol="B", model_name="DX1000"))
    a = make_item(
        name="DX3000부품",
        warehouse_qty=Decimal("0"),
        model_symbol="AB", process_type_code="AR", serial_no=9001,  # 생성열 → "AB-AR-9001" (DX3000+DX1000 공용)
    )
    b = make_item(
        name="무관품",
        warehouse_qty=Decimal("0"),
        model_symbol="C", process_type_code="AR", serial_no=9002,  # 생성열 → "C-AR-9002" (매칭 안 됨)
    )
    db_session.flush()
    _seed_log(db_session, a, TransactionTypeEnum.RECEIVE, Decimal("1"))
    _seed_log(db_session, b, TransactionTypeEnum.RECEIVE, Decimal("1"))
    db_session.commit()

    res = client.get(
        "/api/inventory/transactions/summary", params={"model": "DX3000"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["total"] == 1  # a 의 RECEIVE 1건만 (공용 prefix 라도 1)

    res = client.get(
        "/api/inventory/transactions", params={"model": "DX3000"}
    )
    assert res.status_code == 200, res.text
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["item_name"] == "DX3000부품"


# ──────────────────────────────────────────────────────────────────
# A1b / A1c 새 테스트: 창고 relabel · 다중 부서 필터
# ──────────────────────────────────────────────────────────────────


def test_summary_warehouse_relabel(client, db_session, make_item):
    """창고계열(RECEIVE) 배치 없는 row → department_counts 에 '창고' 키로 집계."""
    item = make_item(name="창고라벨품", warehouse_qty=Decimal("0"))
    _seed_log(db_session, item, TransactionTypeEnum.RECEIVE, Decimal("5"))
    db_session.commit()

    res = client.get("/api/inventory/transactions/summary")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "창고" in body["department_counts"]
    assert body["department_counts"]["창고"] == 1
    assert "미상" not in body["department_counts"]


def test_summary_multi_department_filter(client, db_session, make_item):
    """department='조립,고압' → 두 부서 모두 집계, 다른 부서 제외."""
    item = make_item(name="다중부서품", warehouse_qty=Decimal("0"))
    _seed_batch_log(db_session, item, TransactionTypeEnum.PRODUCE, Decimal("3"), to_department="조립")
    _seed_batch_log(db_session, item, TransactionTypeEnum.PRODUCE, Decimal("2"), to_department="고압")
    _seed_batch_log(db_session, item, TransactionTypeEnum.PRODUCE, Decimal("1"), to_department="도장")
    db_session.commit()

    # summary 다중
    res = client.get("/api/inventory/transactions/summary", params={"department": "조립,고압"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 2
    assert set(body["department_counts"].keys()) == {"조립", "고압"}

    # list 다중
    res = client.get("/api/inventory/transactions", params={"department": "조립,고압"})
    assert res.status_code == 200, res.text
    rows = res.json()
    assert len(rows) == 2


# ──────────────────────────────────────────────────────────────────
# A2 새 테스트: operation-aware 필터 parity
# ──────────────────────────────────────────────────────────────────


def test_operation_filter_rework_parity(client, db_session, make_item):
    """sub_type='disassemble' 배치의 BACKFLUSH tx → transaction_types=DISASSEMBLE 에 포함."""
    item = make_item(name="재작업품", warehouse_qty=Decimal("0"))
    # 재작업 묶음: sub_type=disassemble, 내부 tx=BACKFLUSH
    _seed_batch_log(
        db_session, item, TransactionTypeEnum.BACKFLUSH, Decimal("-3"),
        sub_type="disassemble",
    )
    db_session.commit()

    # list: DISASSEMBLE 필터 → 위 row 포함
    res = client.get("/api/inventory/transactions", params={"transaction_types": "DISASSEMBLE"})
    assert res.status_code == 200, res.text
    rows = res.json()
    assert len(rows) == 1

    # summary: DISASSEMBLE 필터 → total 1
    res = client.get("/api/inventory/transactions/summary", params={"transaction_types": "DISASSEMBLE"})
    assert res.status_code == 200, res.text
    assert res.json()["total"] == 1


def test_operation_filter_backflush_excludes_produce_child(client, db_session, make_item):
    """produce 묶음 내 BACKFLUSH tx → BACKFLUSH 필터에서 제외, PRODUCE 필터에는 포함."""
    item = make_item(name="생산배치품", warehouse_qty=Decimal("0"))
    # 생산 묶음: sub_type=produce, 내부에 BACKFLUSH tx
    _seed_batch_log(
        db_session, item, TransactionTypeEnum.BACKFLUSH, Decimal("-2"),
        sub_type="produce",
    )
    db_session.commit()

    # BACKFLUSH 필터 → 제외(sub_type=produce 로 '생산 등록' 구분, BACKFLUSH 라벨 아님)
    res = client.get("/api/inventory/transactions", params={"transaction_types": "BACKFLUSH"})
    assert res.status_code == 200, res.text
    assert len(res.json()) == 0

    # PRODUCE 필터 → 포함(sub_type=produce → '생산 등록' = PRODUCE 라벨)
    res = client.get("/api/inventory/transactions", params={"transaction_types": "PRODUCE"})
    assert res.status_code == 200, res.text
    assert len(res.json()) == 1


def test_operation_filter_plain_receive(client, db_session, make_item):
    """배치 없는 RECEIVE → transaction_types=RECEIVE 에 포함."""
    item = make_item(name="단건입고품", warehouse_qty=Decimal("0"))
    _seed_log(db_session, item, TransactionTypeEnum.RECEIVE, Decimal("10"))
    db_session.commit()

    res = client.get("/api/inventory/transactions", params={"transaction_types": "RECEIVE"})
    assert res.status_code == 200, res.text
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["transaction_type"] == "RECEIVE"

    res = client.get("/api/inventory/transactions/summary", params={"transaction_types": "RECEIVE"})
    assert res.status_code == 200, res.text
    assert res.json()["total"] == 1


def test_operation_keys_filter_shipping_phases(client, db_session, make_item):
    """operation_keys 는 화면 거래 종류 기준으로 shipping_phase 를 직접 필터한다."""
    item = make_item(name="출하단계필터품", warehouse_qty=Decimal("0"))
    _seed_batch_log(
        db_session,
        item,
        TransactionTypeEnum.BACKFLUSH,
        Decimal("-1"),
        sub_type="produce",
        shipping_phase="COMPONENT_CHANGE",
    )
    _seed_batch_log(
        db_session,
        item,
        TransactionTypeEnum.PRODUCE,
        Decimal("1"),
        sub_type="produce",
        shipping_phase="PREPARE",
    )
    _seed_batch_log(
        db_session,
        item,
        TransactionTypeEnum.SHIP,
        Decimal("-1"),
        sub_type="produce",
        shipping_phase="PICKUP",
    )
    _seed_log(db_session, item, TransactionTypeEnum.RECEIVE, Decimal("1"))
    db_session.commit()

    res = client.get("/api/inventory/transactions", params={"operation_keys": "item_conversion"})
    assert res.status_code == 200, res.text
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["shipping_phase"] == "COMPONENT_CHANGE"

    res = client.get("/api/inventory/transactions/summary", params={"operation_keys": "shipping_prepare"})
    assert res.status_code == 200, res.text
    assert res.json()["total"] == 1

    res = client.get("/api/inventory/transactions", params={"operation_keys": "shipping"})
    assert res.status_code == 200, res.text
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["shipping_phase"] == "PICKUP"


# ──────────────────────────────────────────────────────────────────
# A4 새 테스트: transfer_qty 응답 노출
# ──────────────────────────────────────────────────────────────────


def test_transfer_qty_in_response(client, db_session, make_item):
    """이동(move 방향)·불량(defective 방향) 시드 → list 응답에 transfer_qty 값 존재."""
    item = make_item(name="이동불량품", warehouse_qty=Decimal("0"))
    # move 방향 이동: transfer_qty 직접 설정
    _seed_batch_log(
        db_session, item, TransactionTypeEnum.TRANSFER_TO_PROD, Decimal("0"),
        sub_type="warehouse_to_dept", transfer_qty=Decimal("7"),
    )
    # defective 방향 불량: transfer_qty 직접 설정
    _seed_batch_log(
        db_session, item, TransactionTypeEnum.MARK_DEFECTIVE, Decimal("0"),
        sub_type="defect_quarantine", transfer_qty=Decimal("3"),
    )
    # 일반 입고: transfer_qty=None 이어야 함
    _seed_log(db_session, item, TransactionTypeEnum.RECEIVE, Decimal("5"))
    db_session.commit()

    res = client.get("/api/inventory/transactions")
    assert res.status_code == 200, res.text
    rows = res.json()
    assert len(rows) == 3

    by_type = {r["transaction_type"]: r for r in rows}
    # 이동: transfer_qty=7 (Decimal 직렬화 — 값이 있으면 됨)
    assert by_type["TRANSFER_TO_PROD"]["transfer_qty"] is not None
    assert float(by_type["TRANSFER_TO_PROD"]["transfer_qty"]) == 7.0
    # 불량: transfer_qty=3
    assert by_type["MARK_DEFECTIVE"]["transfer_qty"] is not None
    assert float(by_type["MARK_DEFECTIVE"]["transfer_qty"]) == 3.0
    # 입고: transfer_qty=null
    assert by_type["RECEIVE"]["transfer_qty"] is None
