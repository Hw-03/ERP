"""주간보고 /weekly-report 엔드포인트 테스트 — production_matrix 집계 검증."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from app.models import Inventory, Item, TransactionLog, TransactionTypeEnum


WEEK_START = "2026-05-04"  # 월요일
WEEK_END = "2026-05-10"    # 일요일
_WEEK_MID = datetime(2026, 5, 6, 12, 0, 0)
_WEEK_BEFORE = datetime(2026, 4, 27, 12, 0, 0)


def _dec(v) -> Decimal:
    return Decimal(str(v))


def _make_prod_item(db_session, *, name: str, process_code: str,
                    qty: Decimal = Decimal("0")) -> Item:
    item = Item(item_name=name, process_type_code=process_code, unit="EA")
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
    """HF·VF·NF·AF PRODUCE 로그가 production_matrix 모델별 수량으로 집계된다."""
    dx = _make_prod_item(db_session, name="DX3000 HF 조립완료", process_code="HF", qty=_dec(5))
    adx = _make_prod_item(db_session, name="ADX6000S VF 조립완료", process_code="VF", qty=_dec(3))
    _add_log(db_session, dx.item_id, tx_type=TransactionTypeEnum.PRODUCE, qty=_dec(5), at=_WEEK_MID)
    _add_log(db_session, adx.item_id, tx_type=TransactionTypeEnum.PRODUCE, qty=_dec(3), at=_WEEK_MID)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    matrix = {r["model_key"]: r for r in resp.json()["production_matrix"]}

    assert _dec(matrix["DX3000"]["hf_qty"]) == _dec(5)
    assert _dec(matrix["DX3000"]["tf_qty"]) == _dec(0)
    assert _dec(matrix["DX3000"]["pf_qty"]) == _dec(0)
    assert _dec(matrix["DX3000"]["total_qty"]) == _dec(5)
    assert _dec(matrix["ADX6000S"]["vf_qty"]) == _dec(3)
    assert _dec(matrix["ADX6000S"]["total_qty"]) == _dec(3)


def test_production_matrix_includes_tf_pf(client, db_session):
    """TF·PF PRODUCE 로그도 production_matrix에 합산되고 total_qty는 6개 합계다."""
    tf_item = _make_prod_item(db_session, name="DX3000 TF 튜브완료", process_code="TF", qty=_dec(7))
    pf_item = _make_prod_item(db_session, name="DX3000 PF 출하완료", process_code="PF", qty=_dec(2))
    hf_item = _make_prod_item(db_session, name="DX3000 HF 조립완료", process_code="HF", qty=_dec(4))
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
    assert _dec(row["total_qty"]) == _dec(13)  # 7 + 4 + 0 + 0 + 0 + 2


def test_production_matrix_always_has_fixed_models(client, db_session):
    """생산 데이터가 없어도 고정 5개 모델 행이 항상 포함된다."""
    # HF 품목은 있지만 PRODUCE 로그 없음
    _make_prod_item(db_session, name="DX3000 HF 부품", process_code="HF")
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    keys = [r["model_key"] for r in resp.json()["production_matrix"]]
    for model in ["DX3000", "ADX4000W", "ADX6000S", "ADX6000", "COCOON"]:
        assert model in keys


# ── 주차 경계 ────────────────────────────────────────────────────────────

def test_production_matrix_excludes_out_of_week(client, db_session):
    """주차 밖 PRODUCE 로그는 production_matrix에 포함되지 않는다."""
    item = _make_prod_item(db_session, name="ADX4000W NF 완료품", process_code="NF", qty=_dec(10))
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
    TransactionTypeEnum.RECEIVE,
    TransactionTypeEnum.RETURN,
    TransactionTypeEnum.ADJUST,
])
def test_production_matrix_excludes_non_produce(client, db_session, tx_type):
    """RECEIVE·RETURN·ADJUST는 production_matrix에 집계되지 않는다."""
    item = _make_prod_item(db_session, name="COCOON AF 부품", process_code="AF", qty=_dec(7))
    _add_log(db_session, item.item_id, tx_type=tx_type, qty=_dec(7), at=_WEEK_MID)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    matrix = {r["model_key"]: r for r in resp.json()["production_matrix"]}
    assert _dec(matrix["COCOON"]["af_qty"]) == _dec(0)
    assert _dec(matrix["COCOON"]["total_qty"]) == _dec(0)


# ── 모델 분리 ────────────────────────────────────────────────────────────

def test_production_matrix_adx6000s_vs_adx6000_split(client, db_session):
    """ADX6000S와 ADX6000은 품명 기준으로 다른 행에 분리된다."""
    s_item = _make_prod_item(db_session, name="ADX6000S AF 완료품", process_code="AF", qty=_dec(2))
    plain_item = _make_prod_item(db_session, name="ADX6000 AF 완료품", process_code="AF", qty=_dec(4))
    _add_log(db_session, s_item.item_id, tx_type=TransactionTypeEnum.PRODUCE, qty=_dec(2), at=_WEEK_MID)
    _add_log(db_session, plain_item.item_id, tx_type=TransactionTypeEnum.PRODUCE, qty=_dec(4), at=_WEEK_MID)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    matrix = {r["model_key"]: r for r in resp.json()["production_matrix"]}
    assert _dec(matrix["ADX6000S"]["af_qty"]) == _dec(2)
    assert _dec(matrix["ADX6000"]["af_qty"]) == _dec(4)


# ── 기타/공용 행 ─────────────────────────────────────────────────────────

def test_production_matrix_unknown_model_becomes_other(client, db_session):
    """품명으로 모델을 판정할 수 없으면 '기타/공용' 행에 들어간다."""
    item = _make_prod_item(db_session, name="미분류품목XYZ", process_code="NF", qty=_dec(1))
    _add_log(db_session, item.item_id, tx_type=TransactionTypeEnum.PRODUCE, qty=_dec(1), at=_WEEK_MID)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    keys = [r["model_key"] for r in resp.json()["production_matrix"]]
    assert "기타/공용" in keys
    matrix = {r["model_key"]: r for r in resp.json()["production_matrix"]}
    assert _dec(matrix["기타/공용"]["nf_qty"]) == _dec(1)


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
