"""주간보고 /weekly-report 엔드포인트 테스트 — production_matrix 집계 검증.

매칭 규칙(2026-05-20~): `Item.model_symbol` 단일 글자만 매트릭스에 노출.
다중 글자(예: "346" 공용 부품)/None 은 비노출. 모델 라벨/순서는 `ProductSymbol` DB 동적.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from itertools import count

import pytest
from app.models import (
    DepartmentEnum,
    Inventory,
    InventoryLocation,
    InventoryOperation,
    InventoryOperationKindEnum,
    InventoryOperationRoleEnum,
    InventoryOperationStatusEnum,
    Item,
    LocationStatusEnum,
    ProductSymbol,
    SystemSetting,
    TransactionLog,
    TransactionTypeEnum,
    WeeklyInventorySnapshot,
    WeeklyInventorySnapshotItem,
)


WEEK_START = "2026-05-04"  # 월요일
WEEK_END = "2026-05-10"    # 일요일
_WEEK_MID = datetime(2026, 5, 6, 12, 0, 0)
_WEEK_BEFORE = datetime(2026, 4, 27, 12, 0, 0)
_ITEM_SERIALS = count(1)


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
                    serial_no: int | None = None,
                    qty: Decimal = Decimal("0")) -> Item:
    item = Item(
        item_name=name,
        process_type_code=process_code,
        unit="EA",
        model_symbol=model_symbol or "9",
        serial_no=serial_no if serial_no is not None else next(_ITEM_SERIALS),
    )
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


def _add_snapshot(
    db_session,
    *,
    week_end: date,
    item_quantities: list[tuple[Item, Decimal]],
    verified: bool = False,
) -> WeeklyInventorySnapshot:
    snapshot = WeeklyInventorySnapshot(
        week_end=week_end,
        as_of_utc=datetime.combine(week_end, datetime.max.time()),
        captured_at=datetime.combine(week_end, datetime.max.time()),
        capture_source="scheduled",
        basis_version=2 if verified else 1,
        item_count=len(item_quantities),
        total_quantity=sum((quantity for _, quantity in item_quantities), Decimal("0")),
        normal_total_quantity=(
            sum((quantity for _, quantity in item_quantities), Decimal("0"))
            if verified
            else None
        ),
        defective_total_quantity=Decimal("0") if verified else None,
    )
    snapshot.items = [
        WeeklyInventorySnapshotItem(
            item_id=item.item_id,
            mes_code=item.mes_code,
            item_name=item.item_name,
            process_type_code=item.process_type_code,
            quantity=quantity,
            normal_quantity=quantity if verified else None,
            defective_quantity=Decimal("0") if verified else None,
        )
        for item, quantity in item_quantities
    ]
    db_session.add(snapshot)
    db_session.flush()
    return snapshot


def _activate_verified_weekly_report(db_session, starts_at: str = "2026-05-04T00:00:00+09:00") -> None:
    db_session.add_all([
        SystemSetting(
            setting_key="inventory_operation_cutover_at",
            setting_value="2026-01-01T00:00:00",
        ),
        SystemSetting(
            setting_key="weekly_report_v2_starts_at",
            setting_value=starts_at,
        ),
    ])
    db_session.flush()


def _add_operation_log(
    db_session,
    *,
    item: Item,
    tx_type: TransactionTypeEnum,
    role: InventoryOperationRoleEnum,
    quantity_change: int,
    effects: list[dict],
    action: str,
    display_label: str,
    at: datetime = _WEEK_MID,
) -> TransactionLog:
    operation = InventoryOperation(
        kind=InventoryOperationKindEnum.BUSINESS,
        domain="weekly-test",
        action=action,
        status=InventoryOperationStatusEnum.COMMITTED,
        display_label=display_label,
        actor_name="관리자",
        effective_at=at,
        contract_version=1,
    )
    db_session.add(operation)
    db_session.flush()
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=tx_type,
        quantity_change=quantity_change,
        quantity_before=0,
        quantity_after=0,
        operation_id=operation.operation_id,
        operation_role=role,
        inventory_effect=effects,
        created_at=at,
    )
    db_session.add(log)
    db_session.flush()
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


# ── 공정별 재고 증가·감소 분리 집계 ──────────────────────────────────────

def test_group_inventory_changes_keep_positive_and_negative_sides(client, db_session):
    """같은 거래 유형의 양수·음수도 먼저 상쇄하지 않고 공정별로 분리 집계한다."""
    item = _make_prod_item(db_session, name="AF 재고증감 분리", process_code="AF",
                           model_symbol="7", qty=_dec(11))
    _add_log(db_session, item.item_id, tx_type=TransactionTypeEnum.PRODUCE,
             qty=_dec(40), at=_WEEK_MID)
    _add_log(db_session, item.item_id, tx_type=TransactionTypeEnum.ADJUST,
             qty=_dec(5), at=_WEEK_MID)
    _add_log(db_session, item.item_id, tx_type=TransactionTypeEnum.SHIP,
             qty=_dec(-30), at=_WEEK_MID)
    _add_log(db_session, item.item_id, tx_type=TransactionTypeEnum.ADJUST,
             qty=_dec(-3), at=_WEEK_MID)
    _add_log(db_session, item.item_id, tx_type=TransactionTypeEnum.DEFECT_SCRAP,
             qty=_dec(-1), at=_WEEK_MID)
    _add_log(db_session, item.item_id, tx_type=TransactionTypeEnum.RECEIVE,
             qty=_dec(99), at=_WEEK_BEFORE)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")

    assert resp.status_code == 200
    group = {g["process_code"]: g for g in resp.json()["groups"]}["AF"]
    assert _dec(group["increase_qty"]) == _dec(45)
    assert _dec(group["decrease_qty"]) == _dec(34)
    assert _dec(group["delta"]) == _dec(11)
    assert _dec(group["increase_qty"]) - _dec(group["decrease_qty"]) == _dec(group["delta"])


def test_empty_groups_include_zero_inventory_change_sides(client, db_session):
    """품목이 없는 주간보고도 모든 공정에 증가·감소 0을 명시한다."""
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")

    assert resp.status_code == 200
    assert len(resp.json()["groups"]) == 6
    assert all(group["increase_qty"] == 0 for group in resp.json()["groups"])
    assert all(group["decrease_qty"] == 0 for group in resp.json()["groups"])


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


def test_adjust_out_counted_in_out_qty(client, db_session):
    """낱개 출고(adjust_out)는 ADJUST+qty음수 → 출하 집계(out_qty)에 반영돼야 한다.
    adjust_in(ADJUST+qty양수)은 out_qty에 포함되지 않아야 한다.
    NOTE: weekly_report 는 (item_id, tx_type) GROUP BY 집계 — 두 케이스를 별도 품목으로 테스트."""
    item_out = _make_prod_item(db_session, name="VF 낱개출고", process_code="VF",
                               model_symbol="6", serial_no=9901, qty=_dec(50))
    _add_log(db_session, item_out.item_id, tx_type=TransactionTypeEnum.ADJUST, qty=_dec(-3), at=_WEEK_MID)

    item_in = _make_prod_item(db_session, name="VF 수량보정입고", process_code="VF",
                              model_symbol="6", serial_no=9902, qty=_dec(50))
    _add_log(db_session, item_in.item_id, tx_type=TransactionTypeEnum.ADJUST, qty=_dec(2), at=_WEEK_MID)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")
    assert resp.status_code == 200
    groups = {g["process_code"]: g for g in resp.json()["groups"]}
    items_by_id = {i["item_id"]: i for i in groups["VF"]["items"]}

    row_out = items_by_id[str(item_out.item_id)]
    row_in = items_by_id[str(item_in.item_id)]
    assert _dec(row_out["out_qty"]) == _dec(3)   # adjust_out(-3) → 출하 3
    assert _dec(row_in["out_qty"]) == _dec(0)    # adjust_in(+2) → 출하 0 (입고이므로 미집계)


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


# ── 신규 주말 스냅샷 경계 ────────────────────────────────────────────────

def test_legacy_week_keeps_existing_cancelled_transaction_result(client, db_session):
    """스냅샷 도입 전 주차는 취소 생산까지 포함하던 기존 -1 산출값을 보존한다."""
    item = _make_prod_item(
        db_session,
        name="CSGR + CSCB 레거시",
        process_code="VF",
        model_symbol="8",
        qty=_dec(8),
    )
    _add_log(
        db_session,
        item.item_id,
        tx_type=TransactionTypeEnum.PRODUCE,
        qty=_dec(8),
        at=_WEEK_MID,
    )
    cancelled = _add_log(
        db_session,
        item.item_id,
        tx_type=TransactionTypeEnum.PRODUCE,
        qty=_dec(1),
        at=_WEEK_MID,
    )
    cancelled.cancelled = True
    cancelled.cancelled_at = datetime(2026, 5, 6, 13, 0)
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")

    assert resp.status_code == 200
    row = {
        item_row["item_id"]: item_row
        for group in resp.json()["groups"]
        for item_row in group["items"]
    }[str(item.item_id)]
    assert _dec(row["current_qty"]) == _dec(8)
    assert _dec(row["prev_qty"]) == _dec(-1)
    assert _dec(row["produce_qty"]) == _dec(9)
    assert _dec(row["delta"]) == _dec(9)


def test_closed_snapshot_week_uses_boundaries_and_excludes_cancelled_flow(client, db_session):
    """연속 스냅샷 주차는 경계 수량 차이를 쓰고 기준 전에 취소된 생산은 제외한다."""
    item = _make_prod_item(
        db_session,
        name="CSGR + CSCB 신규",
        process_code="VF",
        model_symbol="8",
        qty=_dec(8),
    )
    _add_log(
        db_session,
        item.item_id,
        tx_type=TransactionTypeEnum.PRODUCE,
        qty=_dec(8),
        at=_WEEK_MID,
    )
    cancelled = _add_log(
        db_session,
        item.item_id,
        tx_type=TransactionTypeEnum.PRODUCE,
        qty=_dec(1),
        at=_WEEK_MID,
    )
    cancelled.cancelled = True
    cancelled.cancelled_at = datetime(2026, 5, 6, 13, 0)
    _add_snapshot(db_session, week_end=date(2026, 5, 3), item_quantities=[(item, _dec(0))])
    _add_snapshot(db_session, week_end=date(2026, 5, 10), item_quantities=[(item, _dec(8))])
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")

    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {
        "week_start",
        "week_end",
        "groups",
        "summary",
        "warnings",
        "production_matrix",
        "basis_version",
        "report_status",
        "transition_notice",
        "validation",
    }
    row = {
        item_row["item_id"]: item_row
        for group in body["groups"]
        for item_row in group["items"]
    }[str(item.item_id)]
    assert _dec(row["prev_qty"]) == _dec(0)
    assert _dec(row["current_qty"]) == _dec(8)
    assert _dec(row["delta"]) == _dec(8)
    assert _dec(row["produce_qty"]) == _dec(8)
    assert _dec(body["summary"]["total_current_qty"]) == _dec(8)


def test_current_snapshot_week_uses_live_dashboard_stock_math(
    client,
    db_session,
    monkeypatch,
):
    """진행 중 주차 현재 재고는 Inventory.quantity가 아니라 대시보드 위치 합계와 같다."""
    from app.routers.inventory import weekly_report

    item = _make_prod_item(
        db_session,
        name="현재 VF 완료품",
        process_code="VF",
        model_symbol="6",
        qty=_dec(99),
    )
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    inventory.warehouse_qty = _dec(3)
    db_session.add_all([
        InventoryLocation(
            item_id=item.item_id,
            department=DepartmentEnum.VACUUM,
            status=LocationStatusEnum.PRODUCTION,
            quantity=_dec(4),
        ),
        InventoryLocation(
            item_id=item.item_id,
            department=DepartmentEnum.VACUUM,
            status=LocationStatusEnum.DEFECTIVE,
            quantity=_dec(2),
        ),
    ])
    _add_snapshot(db_session, week_end=date(2026, 5, 3), item_quantities=[(item, _dec(5))])
    db_session.commit()
    monkeypatch.setattr(weekly_report, "_today_kst", lambda: date(2026, 5, 6), raising=False)

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")

    assert resp.status_code == 200
    row = {
        item_row["item_id"]: item_row
        for group in resp.json()["groups"]
        for item_row in group["items"]
    }[str(item.item_id)]
    assert _dec(row["prev_qty"]) == _dec(5)
    assert _dec(row["current_qty"]) == _dec(9)
    assert _dec(row["delta"]) == _dec(4)
    assert _dec(resp.json()["summary"]["total_current_qty"]) == _dec(9)


def test_snapshot_era_missing_closed_boundary_returns_503(client, db_session, monkeypatch):
    """정확 적용이 시작된 뒤 종료 주차 스냅샷이 빠지면 레거시 값으로 대체하지 않는다."""
    from app.routers.inventory import weekly_report

    item = _make_prod_item(
        db_session,
        name="누락 경계 VF",
        process_code="VF",
        model_symbol="6",
        qty=_dec(4),
    )
    _add_snapshot(db_session, week_end=date(2026, 5, 3), item_quantities=[(item, _dec(2))])
    _add_snapshot(db_session, week_end=date(2026, 5, 10), item_quantities=[(item, _dec(4))])
    db_session.commit()
    monkeypatch.setattr(weekly_report, "_today_kst", lambda: date(2026, 5, 18), raising=False)

    resp = client.get(
        "/api/inventory/weekly-report?week_start=2026-05-11&week_end=2026-05-17"
    )

    assert resp.status_code == 503


def test_snapshot_week_keeps_transaction_cancelled_after_cutoff(client, db_session):
    """일요일 확정 뒤 취소된 거래는 해당 주말 시점에는 유효했던 것으로 집계한다."""
    item = _make_prod_item(
        db_session,
        name="마감 후 취소 VF",
        process_code="VF",
        model_symbol="6",
        qty=_dec(1),
    )
    log = _add_log(
        db_session,
        item.item_id,
        tx_type=TransactionTypeEnum.PRODUCE,
        qty=_dec(1),
        at=_WEEK_MID,
    )
    log.cancelled = True
    log.cancelled_at = datetime(2026, 5, 10, 15, 0)  # 2026-05-11 00:00 KST
    _add_snapshot(db_session, week_end=date(2026, 5, 3), item_quantities=[(item, _dec(0))])
    _add_snapshot(db_session, week_end=date(2026, 5, 10), item_quantities=[(item, _dec(1))])
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")

    assert resp.status_code == 200
    row = {
        item_row["item_id"]: item_row
        for group in resp.json()["groups"]
        for item_row in group["items"]
    }[str(item.item_id)]
    assert _dec(row["produce_qty"]) == _dec(1)


def test_snapshot_week_keeps_cancelled_transaction_without_cancel_time(client, db_session):
    """취소 시각이 없으면 기준 이전 취소로 단정하지 않고 해당 주 거래에 포함한다."""
    item = _make_prod_item(
        db_session,
        name="취소 시각 미상 VF",
        process_code="VF",
        model_symbol="6",
        qty=_dec(1),
    )
    log = _add_log(
        db_session,
        item.item_id,
        tx_type=TransactionTypeEnum.PRODUCE,
        qty=_dec(1),
        at=_WEEK_MID,
    )
    log.cancelled = True
    log.cancelled_at = None
    _add_snapshot(db_session, week_end=date(2026, 5, 3), item_quantities=[(item, _dec(0))])
    _add_snapshot(db_session, week_end=date(2026, 5, 10), item_quantities=[(item, _dec(1))])
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")

    assert resp.status_code == 200
    row = {
        item_row["item_id"]: item_row
        for group in resp.json()["groups"]
        for item_row in group["items"]
    }[str(item.item_id)]
    assert _dec(row["produce_qty"]) == _dec(1)


def test_snapshot_week_uses_kst_half_open_transaction_boundary(client, db_session):
    """월요일 00:00 KST는 포함하고 다음 월요일 00:00 KST는 제외한다."""
    item = _make_prod_item(
        db_session,
        name="KST 경계 VF",
        process_code="VF",
        model_symbol="6",
        qty=_dec(1),
    )
    _add_log(
        db_session,
        item.item_id,
        tx_type=TransactionTypeEnum.PRODUCE,
        qty=_dec(1),
        at=datetime(2026, 5, 3, 15, 0),  # 2026-05-04 00:00 KST
    )
    _add_log(
        db_session,
        item.item_id,
        tx_type=TransactionTypeEnum.PRODUCE,
        qty=_dec(7),
        at=datetime(2026, 5, 10, 15, 0),  # 2026-05-11 00:00 KST
    )
    _add_snapshot(db_session, week_end=date(2026, 5, 3), item_quantities=[(item, _dec(0))])
    _add_snapshot(db_session, week_end=date(2026, 5, 10), item_quantities=[(item, _dec(1))])
    db_session.commit()

    resp = client.get(f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}")

    assert resp.status_code == 200
    row = {
        item_row["item_id"]: item_row
        for group in resp.json()["groups"]
        for item_row in group["items"]
    }[str(item.item_id)]
    assert _dec(row["produce_qty"]) == _dec(1)


def test_verified_week_excludes_same_week_original_and_cancellation_pair(client, db_session):
    item = _make_prod_item(
        db_session,
        name="같은 주 출고 취소 VF",
        process_code="VF",
        model_symbol="8",
        qty=_dec(10),
    )
    _activate_verified_weekly_report(db_session)
    original = InventoryOperation(
        kind=InventoryOperationKindEnum.BUSINESS,
        domain="department_inventory",
        action="out",
        status=InventoryOperationStatusEnum.COMMITTED,
        display_label="부서 입출고",
        actor_name="관리자",
        effective_at=_WEEK_MID,
        contract_version=1,
    )
    db_session.add(original)
    db_session.flush()
    original_log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.SHIP,
        quantity_change=-7,
        quantity_before=10,
        quantity_after=3,
        operation_id=original.operation_id,
        operation_role=InventoryOperationRoleEnum.PRIMARY,
        inventory_effect=[{"scope": "warehouse", "delta": -7}],
        created_at=_WEEK_MID,
    )
    db_session.add(original_log)
    db_session.flush()
    cancellation = InventoryOperation(
        kind=InventoryOperationKindEnum.CANCELLATION,
        domain=original.domain,
        action=original.action,
        status=InventoryOperationStatusEnum.COMMITTED,
        display_label="부서 입출고 취소",
        actor_name="관리자",
        effective_at=datetime(2026, 5, 6, 13, 0, 0),
        contract_version=1,
        reverses_operation_id=original.operation_id,
    )
    db_session.add(cancellation)
    db_session.flush()
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.SHIP,
            quantity_change=7,
            quantity_before=3,
            quantity_after=10,
            operation_id=cancellation.operation_id,
            operation_role=InventoryOperationRoleEnum.PRIMARY,
            reverses_log_id=original_log.log_id,
            inventory_effect=[{"scope": "warehouse", "delta": 7}],
            created_at=datetime(2026, 5, 6, 13, 0, 0),
        )
    )
    _add_snapshot(
        db_session,
        week_end=date(2026, 5, 3),
        item_quantities=[(item, _dec(10))],
        verified=True,
    )
    _add_snapshot(
        db_session,
        week_end=date(2026, 5, 10),
        item_quantities=[(item, _dec(10))],
        verified=True,
    )
    db_session.commit()

    response = client.get(
        f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}"
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["basis_version"] == 2
    assert body["report_status"] == "verified"
    assert body["validation"]["status"] == "verified"
    row = {
        item_row["item_id"]: item_row
        for group in body["groups"]
        for item_row in group["items"]
    }[str(item.item_id)]
    assert row["produce_qty"] == 0
    assert row["receive_qty"] == 0
    assert row["out_qty"] == 0
    assert row["defect_qty"] == 0
    assert row["current_qty"] == 10
    assert row["delta"] == 0


def test_verified_week_matches_rework_quarantine_restore_examples(client, db_session):
    rebuilt = _make_prod_item(db_session, name="정상 재작업 VF", process_code="VF", qty=_dec(1))
    recovered = _make_prod_item(db_session, name="정상 회수 VF", process_code="VF", qty=_dec(1))
    defective_child = _make_prod_item(db_session, name="불량 회수 VF", process_code="VF", qty=_dec(0))
    old_defect = _make_prod_item(db_session, name="전주 불량 VF", process_code="VF", qty=_dec(0))
    restored = _make_prod_item(db_session, name="정상 복귀 VF", process_code="VF", qty=_dec(1))
    _activate_verified_weekly_report(db_session)

    _add_operation_log(
        db_session,
        item=rebuilt,
        tx_type=TransactionTypeEnum.DISASSEMBLE,
        role=InventoryOperationRoleEnum.REWORK_PARENT_NORMAL,
        quantity_change=-1,
        effects=[{"scope": "location", "department": "진공", "status": "PRODUCTION", "delta": -1}],
        action="rework_normal",
        display_label="재작업",
    )
    _add_operation_log(
        db_session,
        item=rebuilt,
        tx_type=TransactionTypeEnum.PRODUCE,
        role=InventoryOperationRoleEnum.PRODUCT_OUTPUT,
        quantity_change=1,
        effects=[{"scope": "location", "department": "진공", "status": "PRODUCTION", "delta": 1}],
        action="produce",
        display_label="생산",
        at=datetime(2026, 5, 6, 13, 0),
    )
    _add_operation_log(
        db_session,
        item=recovered,
        tx_type=TransactionTypeEnum.RECEIVE,
        role=InventoryOperationRoleEnum.REWORK_CHILD_NORMAL,
        quantity_change=1,
        effects=[{"scope": "location", "department": "진공", "status": "PRODUCTION", "delta": 1}],
        action="rework_defective",
        display_label="재작업 정상 회수",
    )
    _add_operation_log(
        db_session,
        item=defective_child,
        tx_type=TransactionTypeEnum.MARK_DEFECTIVE,
        role=InventoryOperationRoleEnum.REWORK_CHILD_DEFECTIVE,
        quantity_change=1,
        effects=[{"scope": "location", "department": "진공", "status": "DEFECTIVE", "delta": 1}],
        action="rework_defective",
        display_label="재작업 불량 회수",
    )
    _add_operation_log(
        db_session,
        item=old_defect,
        tx_type=TransactionTypeEnum.DEFECT_SCRAP,
        role=InventoryOperationRoleEnum.PRIMARY,
        quantity_change=-1,
        effects=[{"scope": "location", "department": "진공", "status": "DEFECTIVE", "delta": -1}],
        action="defect_scrap",
        display_label="불량 폐기",
    )
    _add_operation_log(
        db_session,
        item=restored,
        tx_type=TransactionTypeEnum.UNMARK_DEFECTIVE,
        role=InventoryOperationRoleEnum.PRIMARY,
        quantity_change=0,
        effects=[
            {"scope": "location", "department": "진공", "status": "DEFECTIVE", "delta": -1},
            {"scope": "location", "department": "진공", "status": "PRODUCTION", "delta": 1},
        ],
        action="restore",
        display_label="정상 복귀",
    )
    previous = [
        (rebuilt, _dec(1)),
        (recovered, _dec(0)),
        (defective_child, _dec(0)),
        (old_defect, _dec(0)),
        (restored, _dec(0)),
    ]
    current = [
        (rebuilt, _dec(1)),
        (recovered, _dec(1)),
        (defective_child, _dec(0)),
        (old_defect, _dec(0)),
        (restored, _dec(1)),
    ]
    _add_snapshot(db_session, week_end=date(2026, 5, 3), item_quantities=previous, verified=True)
    _add_snapshot(db_session, week_end=date(2026, 5, 10), item_quantities=current, verified=True)
    db_session.commit()

    response = client.get(
        f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}"
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["report_status"] == "verified"
    rows = {
        item_row["item_id"]: item_row
        for group in body["groups"]
        for item_row in group["items"]
    }
    assert (rows[str(rebuilt.item_id)]["produce_qty"], rows[str(rebuilt.item_id)]["defect_qty"], rows[str(rebuilt.item_id)]["delta"]) == (1, 1, 0)
    assert (rows[str(recovered.item_id)]["receive_qty"], rows[str(recovered.item_id)]["delta"]) == (1, 1)
    assert (rows[str(defective_child.item_id)]["receive_qty"], rows[str(defective_child.item_id)]["defect_qty"], rows[str(defective_child.item_id)]["delta"]) == (1, 1, 0)
    assert rows[str(old_defect.item_id)]["defect_qty"] == 0
    assert (rows[str(restored.item_id)]["receive_qty"], rows[str(restored.item_id)]["delta"]) == (1, 1)
    for row in rows.values():
        assert row["delta"] == row["current_qty"] - row["prev_qty"]
        assert row["delta"] == row["produce_qty"] + row["receive_qty"] - row["out_qty"] - row["defect_qty"]
        assert min(row["prev_qty"], row["produce_qty"], row["receive_qty"], row["out_qty"], row["defect_qty"], row["current_qty"]) >= 0


def test_verified_week_hides_table_when_inventory_equation_fails(client, db_session):
    item = _make_prod_item(
        db_session,
        name="미분류 VF",
        process_code="VF",
        model_symbol="8",
        qty=_dec(9),
    )
    _activate_verified_weekly_report(db_session)
    _add_snapshot(
        db_session,
        week_end=date(2026, 5, 3),
        item_quantities=[(item, _dec(10))],
        verified=True,
    )
    _add_snapshot(
        db_session,
        week_end=date(2026, 5, 10),
        item_quantities=[(item, _dec(9))],
        verified=True,
    )
    db_session.commit()

    response = client.get(
        f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}"
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["report_status"] == "failed"
    assert body["groups"] == []
    assert body["validation"]["status"] == "failed"
    assert body["validation"]["failures"][0]["item_id"] == str(item.item_id)
    assert "집계 검산 실패" in body["validation"]["message"]


def test_transition_week_keeps_legacy_report_and_shows_fixed_notice(
    client,
    db_session,
    monkeypatch,
):
    from app.routers.inventory import weekly_report

    _activate_verified_weekly_report(db_session, "2026-05-11T00:00:00+09:00")
    monkeypatch.setattr(weekly_report, "_today_kst", lambda: date(2026, 5, 6), raising=False)
    db_session.commit()

    response = client.get(
        f"/api/inventory/weekly-report?week_start={WEEK_START}&week_end={WEEK_END}"
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["report_status"] == "transition"
    assert body["transition_notice"] == (
        "주간보고 계산 기준을 개선 중입니다. 이번 주 수치는 실제 재고와 다를 수 있으며, "
        "다음 주부터 새 기준으로 정확한 정보가 표시됩니다."
    )
