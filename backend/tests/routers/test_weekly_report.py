"""주간보고 /weekly-report 엔드포인트 테스트 — production_matrix 집계 검증.

매칭 규칙(2026-05-20~): `Item.model_symbol` 단일 글자만 매트릭스에 노출.
다중 글자(예: "346" 공용 부품)/None 은 비노출. 모델 라벨/순서는 `ProductSymbol` DB 동적.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

import pytest
from app.models import Inventory, Item, ProductSymbol, TransactionLog, TransactionTypeEnum


WEEK_START = "2026-05-04"  # 월요일
WEEK_END = "2026-05-10"    # 일요일
_WEEK_MID = datetime(2026, 5, 6, 12, 0, 0)
_WEEK_BEFORE = datetime(2026, 4, 27, 12, 0, 0)


def _dec(v) -> Decimal:
    return Decimal(str(v))


@pytest.fixture(autouse=True)
def _seed_product_symbols(db_session):
    """매 테스트에 5개 정규 모델 symbol seed (slot 순서가 매트릭스 행 순서)."""
    seeds = [
        (1, "3", "DX3000"),
        (2, "4", "ADX4000W"),
        (3, "6", "ADX6000"),
        (4, "7", "COCOON"),
        (5, "8", "SOLO"),
    ]
    for slot, symbol, name in seeds:
        db_session.add(ProductSymbol(slot=slot, symbol=symbol, model_name=name))
    db_session.flush()


def _make_prod_item(db_session, *, name: str, process_code: str,
                    model_symbol: str | None = None,
                    qty: Decimal = Decimal("0")) -> Item:
    item = Item(item_name=name, process_type_code=process_code, unit="EA",
                model_symbol=model_symbol)
    db_session.add(item)
    db_session.flush()
    db_session.add(Inventory(
        item_id=item.item_id,
        quantity=qty,
        warehouse_qty=qty,
        pending_quantity=Decimal("0"),
    ))
    db_session.flush()
    return item


def _add_log(db_session, item_id, *, tx_type: TransactionTypeEnum,
             qty: Decimal, at: datetime) -> TransactionLog:
    log = TransactionLog(
        item_id=item_id,
        transaction_type=tx_type,
        quantity_change=qty,
        quantity_before=Decimal("0"),
        quantity_after=qty,
    )
    log.created_at = at
    db_session.add(log)
    return log


# ── 기본 집계 ────────────────────────────────────────────────────────────

def test_production_matrix_basic(client, db_session):
    """HF·VF PRODUCE 로그가 production_matrix 모델별 수량으로 집계된다."""
    dx = _make_prod_item(db_session, name="DX3000 HF 조립완료", process_code="HF",
                         model_symbol="3", qty=_dec(5))
    adx = _make_prod_item(db_session, name="ADX6000 VF 조립완료", process_code="VF",
                          model_symbol="6", qty=_dec(3))
    _add_log(db_session, dx.item_id, tx_type=TransactionTypeEnum.PRODUCE, qty=_dec(5), at=_WEEK_MID)
    _add_log(db_session, adx.item_id, tx_type=TransactionTypeEnum.PRODUCE, qty=_dec(3), at=_WEEK_MID)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    matrix = {r["model_key"]: r for r in resp.json()["production_matrix"]}

    assert _dec(matrix["DX3000"]["hf_qty"]) == _dec(5)
    assert _dec(matrix["DX3000"]["tf_qty"]) == _dec(0)
    assert _dec(matrix["DX3000"]["total_qty"]) == _dec(5)
    assert _dec(matrix["ADX6000"]["vf_qty"]) == _dec(3)
    assert _dec(matrix["ADX6000"]["total_qty"]) == _dec(3)


def test_production_matrix_includes_tf_pf(client, db_session):
    """TF·PF PRODUCE 로그도 production_matrix에 합산되고 total_qty는 6개 합계다."""
    tf_item = _make_prod_item(db_session, name="DX3000 TF 튜브완료", process_code="TF",
                              model_symbol="3", qty=_dec(7))
    pf_item = _make_prod_item(db_session, name="DX3000 PF 출하완료", process_code="PF",
                              model_symbol="3", qty=_dec(2))
    hf_item = _make_prod_item(db_session, name="DX3000 HF 조립완료", process_code="HF",
                              model_symbol="3", qty=_dec(4))
    _add_log(db_session, tf_item.item_id, tx_type=TransactionTypeEnum.PRODUCE, qty=_dec(7), at=_WEEK_MID)
    _add_log(db_session, pf_item.item_id, tx_type=TransactionTypeEnum.PRODUCE, qty=_dec(2), at=_WEEK_MID)
    _add_log(db_session, hf_item.item_id, tx_type=TransactionTypeEnum.PRODUCE, qty=_dec(4), at=_WEEK_MID)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    row = {r["model_key"]: r for r in resp.json()["production_matrix"]}["DX3000"]

    assert _dec(row["tf_qty"]) == _dec(7)
    assert _dec(row["hf_qty"]) == _dec(4)
    assert _dec(row["pf_qty"]) == _dec(2)
    assert _dec(row["total_qty"]) == _dec(13)


def test_production_matrix_always_has_seeded_models(client, db_session):
    """생산 데이터가 없어도 ProductSymbol seed 5개 행이 slot 순으로 항상 포함된다."""
    _make_prod_item(db_session, name="DX3000 HF 부품", process_code="HF", model_symbol="3")
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    keys = [r["model_key"] for r in resp.json()["production_matrix"]]
    assert keys == ["DX3000", "ADX4000W", "ADX6000", "COCOON", "SOLO"]


# ── 주차 경계 ────────────────────────────────────────────────────────────

def test_production_matrix_excludes_out_of_week(client, db_session):
    """주차 밖 PRODUCE 로그는 production_matrix에 포함되지 않는다."""
    item = _make_prod_item(db_session, name="ADX4000W NF 완료품", process_code="NF",
                           model_symbol="4", qty=_dec(10))
    _add_log(db_session, item.item_id, tx_type=TransactionTypeEnum.PRODUCE,
             qty=_dec(10), at=_WEEK_BEFORE)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    matrix = {r["model_key"]: r for r in resp.json()["production_matrix"]}
    assert _dec(matrix["ADX4000W"]["nf_qty"]) == _dec(0)
    assert _dec(matrix["ADX4000W"]["total_qty"]) == _dec(0)


# ── 거래 타입 필터 ───────────────────────────────────────────────────────

@pytest.mark.parametrize("tx_type", [
    TransactionTypeEnum.ADJUST,
    TransactionTypeEnum.MARK_DEFECTIVE,
    TransactionTypeEnum.DISASSEMBLE,
])
def test_production_matrix_excludes_non_produce(client, db_session, tx_type):
    """수량조정·불량처리·분해는 production_matrix 에 집계되지 않는다 (생산 활동 아님)."""
    item = _make_prod_item(db_session, name="COCOON AF 부품", process_code="AF",
                           model_symbol="7", qty=_dec(7))
    _add_log(db_session, item.item_id, tx_type=tx_type, qty=_dec(7), at=_WEEK_MID)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    matrix = {r["model_key"]: r for r in resp.json()["production_matrix"]}
    assert _dec(matrix["COCOON"]["af_qty"]) == _dec(0)
    assert _dec(matrix["COCOON"]["total_qty"]) == _dec(0)


# ── 생산 매트릭스는 PRODUCE 전용 (2026-06-16~) ────────────────────────────
# 입출고 내역 화면의 '생산'(PRODUCE)과 동일 기준으로 통일. 입고·이동·출하는 제외.

@pytest.mark.parametrize(
    "tx_type,raw_qty",
    [
        (TransactionTypeEnum.RECEIVE, Decimal("40")),        # 입고는 '생산' 아님
        (TransactionTypeEnum.TRANSFER_TO_WH, Decimal("3")),
        (TransactionTypeEnum.TRANSFER_DEPT, Decimal("-4")),
        (TransactionTypeEnum.SHIP, Decimal("-5")),
    ],
)
def test_production_matrix_excludes_non_produce_flows(client, db_session, tx_type, raw_qty):
    """RECEIVE·TRANSFER_TO_WH·TRANSFER_DEPT·SHIP 는 매트릭스('생산')에 집계되지 않는다.
    매트릭스 '생산'은 PRODUCE 전용(2026-06-16~)."""
    item = _make_prod_item(db_session, name="DX3000 HF 완료품", process_code="HF",
                           model_symbol="3", qty=_dec(0))
    _add_log(db_session, item.item_id, tx_type=tx_type, qty=raw_qty, at=_WEEK_MID)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    row = {r["model_key"]: r for r in resp.json()["production_matrix"]}["DX3000"]
    assert _dec(row["hf_qty"]) == _dec(0)
    assert _dec(row["total_qty"]) == _dec(0)


# ── 매칭 불가 → 매트릭스 비노출 ──────────────────────────────────────────

def test_production_matrix_excludes_unmapped_symbol(client, db_session):
    """model_symbol이 없거나 매핑 외 글자면 매트릭스에 노출되지 않는다."""
    no_sym = _make_prod_item(db_session, name="기호없음 부품", process_code="NF", qty=_dec(1))
    unknown = _make_prod_item(db_session, name="미매핑 부품 9", process_code="NF",
                              model_symbol="9", qty=_dec(2))
    _add_log(db_session, no_sym.item_id, tx_type=TransactionTypeEnum.PRODUCE, qty=_dec(1), at=_WEEK_MID)
    _add_log(db_session, unknown.item_id, tx_type=TransactionTypeEnum.PRODUCE, qty=_dec(2), at=_WEEK_MID)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    keys = [r["model_key"] for r in resp.json()["production_matrix"]]
    assert "기타/공용" not in keys  # legacy 행 제거 확인
    # 5개 시드 외 어떤 라벨도 추가되지 않음
    assert set(keys) == {"DX3000", "ADX4000W", "ADX6000", "COCOON", "SOLO"}


def test_production_matrix_excludes_multi_symbol(client, db_session):
    """공용 부품(model_symbol 다중 글자)은 매트릭스에 노출되지 않는다."""
    shared = _make_prod_item(db_session, name="3·4·6 공용 부품", process_code="HF",
                             model_symbol="346", qty=_dec(5))
    _add_log(db_session, shared.item_id, tx_type=TransactionTypeEnum.PRODUCE, qty=_dec(5), at=_WEEK_MID)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    matrix = {r["model_key"]: r for r in resp.json()["production_matrix"]}
    # 어떤 모델 행에도 5가 합산되어선 안 됨
    for key in ["DX3000", "ADX4000W", "ADX6000", "COCOON", "SOLO"]:
        assert _dec(matrix[key]["hf_qty"]) == _dec(0)
        assert _dec(matrix[key]["total_qty"]) == _dec(0)


# ── 확장성 — 새 모델 추가 시 자동 반영 ───────────────────────────────────

def test_production_matrix_new_model_via_db(client, db_session):
    """ProductSymbol에 row 추가하면 매트릭스에 새 모델 행이 자동 노출된다 (코드 수정 0)."""
    db_session.add(ProductSymbol(slot=6, symbol="5", model_name="NEXTGEN"))
    db_session.flush()
    item = _make_prod_item(db_session, name="NEXTGEN AF", process_code="AF",
                           model_symbol="5", qty=_dec(9))
    _add_log(db_session, item.item_id, tx_type=TransactionTypeEnum.PRODUCE, qty=_dec(9), at=_WEEK_MID)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    keys = [r["model_key"] for r in resp.json()["production_matrix"]]
    assert keys == ["DX3000", "ADX4000W", "ADX6000", "COCOON", "SOLO", "NEXTGEN"]
    matrix = {r["model_key"]: r for r in resp.json()["production_matrix"]}
    assert _dec(matrix["NEXTGEN"]["af_qty"]) == _dec(9)


# ── 기존 groups 구조 유지 ────────────────────────────────────────────────

def test_existing_groups_structure_unchanged(client, db_session):
    """production_matrix 추가 후에도 groups·summary·warnings 구조가 유지된다."""
    _make_prod_item(db_session, name="TF 품목", process_code="TF", qty=_dec(10))
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    body = resp.json()
    assert "groups" in body
    assert "summary" in body
    assert "warnings" in body
    assert "production_matrix" in body
    assert isinstance(body["groups"], list)
    assert isinstance(body["production_matrix"], list)


# ── 품목 상세: 생산(PRODUCE) vs 입고(RECEIVE) 분리 + 전주재고 정확화 (2026-06-16~) ──

def test_item_produce_and_receive_separated(client, db_session):
    """품목 상세에서 생산(produce_qty=PRODUCE)과 입고(receive_qty=RECEIVE)가 분리 집계된다.
    입출고 내역 화면의 '생산'(PRODUCE만)과 동일 기준."""
    item = _make_prod_item(db_session, name="VF 분리검증", process_code="VF",
                           model_symbol="6", qty=_dec(50))
    _add_log(db_session, item.item_id, tx_type=TransactionTypeEnum.PRODUCE, qty=_dec(1), at=_WEEK_MID)
    _add_log(db_session, item.item_id, tx_type=TransactionTypeEnum.RECEIVE, qty=_dec(13), at=_WEEK_MID)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    groups = {g["process_code"]: g for g in resp.json()["groups"]}
    row = {i["item_id"]: i for i in groups["VF"]["items"]}[str(item.item_id)]
    assert _dec(row["produce_qty"]) == _dec(1)    # 생산 = PRODUCE 만
    assert _dec(row["receive_qty"]) == _dec(13)   # 입고 = RECEIVE (생산과 분리)


def test_prev_qty_reflects_all_transactions(client, db_session):
    """전주재고/증감은 기간 내 '전체 거래'(폐기·분해 포함)로 역산된다.
    7-VF-0007 실데이터 시나리오: 현재 193, RECEIVE+13·BACKFLUSH-20·DEFECT_SCRAP-27 → 전주 227."""
    item = _make_prod_item(db_session, name="VF 전주검증", process_code="VF",
                           model_symbol="6", qty=_dec(193))
    _add_log(db_session, item.item_id, tx_type=TransactionTypeEnum.RECEIVE, qty=_dec(13), at=_WEEK_MID)
    _add_log(db_session, item.item_id, tx_type=TransactionTypeEnum.BACKFLUSH, qty=_dec(-20), at=_WEEK_MID)
    _add_log(db_session, item.item_id, tx_type=TransactionTypeEnum.DEFECT_SCRAP, qty=_dec(-27), at=_WEEK_MID)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    groups = {g["process_code"]: g for g in resp.json()["groups"]}
    row = {i["item_id"]: i for i in groups["VF"]["items"]}[str(item.item_id)]
    assert _dec(row["current_qty"]) == _dec(193)
    assert _dec(row["prev_qty"]) == _dec(227)     # 193 - (13-20-27) = 193 + 34
    assert _dec(row["delta"]) == _dec(-34)         # 전체 net (폐기 27 반영)
    assert _dec(row["produce_qty"]) == _dec(0)     # PRODUCE 없음 → 생산 0 (입출고 내역과 일치)
    assert _dec(row["receive_qty"]) == _dec(13)
    assert _dec(row["out_qty"]) == _dec(20)        # SHIP+BACKFLUSH 만 (DEFECT_SCRAP 은 출고 칸 제외)


# ── 회귀 방어 — 신규 enum 추가 시 분류 누락 검출 ─────────────────────────

def test_all_transaction_types_classified():
    """모든 TransactionTypeEnum 멤버는 weekly_report.py 의 두 분류 set 중
    하나에 명시적으로 분류돼야 한다. 누락 시 매트릭스에 자동 반영 안 되므로
    본 테스트가 실패한다 — 신규 enum 추가 시 분류 결정 강제.
    """
    from app.routers.inventory.weekly_report import (
        PRODUCTION_TX_TYPES,
        NON_PRODUCTION_TX_TYPES,
    )

    all_members = set(TransactionTypeEnum)
    classified = PRODUCTION_TX_TYPES | NON_PRODUCTION_TX_TYPES
    unclassified = all_members - classified
    overlap = PRODUCTION_TX_TYPES & NON_PRODUCTION_TX_TYPES

    assert not unclassified, (
        f"신규 거래 타입 {sorted(t.value for t in unclassified)} 가 "
        f"weekly_report.py 의 PRODUCTION_TX_TYPES / NON_PRODUCTION_TX_TYPES "
        f"어느 쪽에도 분류돼 있지 않습니다. 매트릭스 포함 여부를 결정해서 "
        f"한 쪽에 추가하세요."
    )
    assert not overlap, (
        f"중복 분류: {sorted(t.value for t in overlap)} — 한 쪽에서만 정의해야 합니다."
    )
