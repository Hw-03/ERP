"""주간보고: GET /weekly-report — ?F 계열 품목의 주차별 재고 변화 집계.

⛔ 동결(완성) — 2026-05-29 / 2026-06-16 '생산' 정의 변경
- 명시적 수정 요청이 있을 때만 손댈 것. 주변 리팩터·전역 변경에서는 우회.
- '생산'(produce_qty)=PRODUCE 전용 — 입출고 내역 '생산'과 동일 기준. 입고(receive_qty)
  =RECEIVE 로 분리 표시. 전주재고/증감은 기간 내 '전체 거래' 합(net_all)으로 역산 —
  폐기·분해·조정까지 반영해 정확. 생산 매트릭스(PRODUCTION_TX_TYPES)도 PRODUCE 전용.
- 신규 TransactionTypeEnum 멤버 추가 시 PRODUCTION_TX_TYPES 또는
  NON_PRODUCTION_TX_TYPES 둘 중 하나에 명시 분류 필수
  (test_all_transaction_types_classified 가 누락 검출).
- 프론트 동결 짝: frontend/app/mes/_components/_weekly_sections/
  + frontend/app/mes/_components/DesktopWeeklyReportView.tsx
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Inventory, Item, ProductSymbol, TransactionLog, TransactionTypeEnum
from app.schemas import (
    WeeklyGroupReport,
    WeeklyItemReport,
    WeeklyProductionModelRow,
    WeeklyReportResponse,
    WeeklyReportSummary,
    WeeklyWarning,
)

from ._shared import PROCESS_TYPE_LABELS

router = APIRouter()

_F_CODES = ["TF", "HF", "VF", "NF", "AF", "PF"]

_PROD_CODES = ["TF", "HF", "VF", "NF", "AF", "PF"]

_DEPT_NAMES: dict[str, str] = {
    "TF": "튜브",
    "HF": "고압",
    "VF": "진공",
    "NF": "튜닝",
    "AF": "조립",
    "PF": "출하",
}

# 출고/소비 표시 타입 ('출고' 칸). 재작업(DISASSEMBLE)·폐기(DEFECT_SCRAP)는 의도적 제외
# — 출고 의미를 흐리지 않기 위함(허동현 보류 건). 단 전주재고/증감은 net_all(전체 거래)로
# 별도 역산하므로 폐기·분해도 재고 변화에는 정확히 반영된다.
_OUT_TYPES = {
    TransactionTypeEnum.SHIP,
    TransactionTypeEnum.BACKFLUSH,
}

# 생산 현황 매트릭스(production_matrix) 셀에 합산하는 "생산" 거래 타입 = PRODUCE 전용.
# 입출고 내역 화면의 '생산'(PRODUCE)과 동일 기준으로 통일(2026-06-16).
# ※ 신규 TransactionTypeEnum 멤버 추가 시 본 set 또는 NON_PRODUCTION_TX_TYPES
#   둘 중 하나에 명시 분류 필수 — test_all_transaction_types_classified 가 누락 검출.
PRODUCTION_TX_TYPES: frozenset[TransactionTypeEnum] = frozenset({
    TransactionTypeEnum.PRODUCE,
})

# 매트릭스에서 명시적으로 제외하는 거래 타입 (PRODUCE 외 전부).
NON_PRODUCTION_TX_TYPES: frozenset[TransactionTypeEnum] = frozenset({
    TransactionTypeEnum.RECEIVE,
    TransactionTypeEnum.SHIP,
    TransactionTypeEnum.TRANSFER_TO_WH,
    TransactionTypeEnum.TRANSFER_TO_PROD,
    TransactionTypeEnum.TRANSFER_DEPT,
    TransactionTypeEnum.ADJUST,
    TransactionTypeEnum.BACKFLUSH,
    TransactionTypeEnum.DISASSEMBLE,
    TransactionTypeEnum.MARK_DEFECTIVE,
    TransactionTypeEnum.UNMARK_DEFECTIVE,
    TransactionTypeEnum.DEFECT_SCRAP,
    TransactionTypeEnum.SUPPLIER_RETURN,
    TransactionTypeEnum.INTERNAL_USE,
})


def _load_model_symbols(db: Session) -> tuple[dict[str, str], list[str]]:
    """ProductSymbol 테이블에서 단일-글자 symbol → model_name 매핑과
    slot 순 model_name 목록을 반환. 새 모델 추가는 이 테이블에 row 추가만.

    Returns:
        symbol_map: {"3": "DX3000", "8": "SOLO", ...}
        ordered_models: ["DX3000", "ADX4000W", ...] (slot 순)
    """
    rows = (
        db.query(ProductSymbol)
        .filter(
            ProductSymbol.symbol.isnot(None),
            func.length(ProductSymbol.symbol) == 1,
            ProductSymbol.model_name.isnot(None),
        )
        .order_by(ProductSymbol.slot)
        .all()
    )
    symbol_map = {r.symbol: r.model_name for r in rows}
    ordered_models = [r.model_name for r in rows]
    return symbol_map, ordered_models


def _resolve_model(model_symbol: str | None, symbol_map: dict[str, str]) -> str | None:
    """단일-글자 model_symbol → 모델명. 다중 글자(공용 부품)/None → None(매트릭스 제외)."""
    if not model_symbol or len(model_symbol) != 1:
        return None
    return symbol_map.get(model_symbol)


def _current_week_bounds() -> tuple[date, date]:
    today = date.today()
    mon = today - timedelta(days=today.weekday())
    sun = mon + timedelta(days=6)
    return mon, sun


@router.get("/weekly-report", response_model=WeeklyReportResponse)
def get_weekly_report(
    week_start: Optional[date] = Query(None),
    week_end: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    if week_start is None or week_end is None:
        week_start, week_end = _current_week_bounds()

    dt_start = datetime.combine(week_start, time.min)
    dt_end = datetime.combine(week_end, time.max)

    rows = (
        db.query(Item, Inventory)
        .outerjoin(Inventory, Item.item_id == Inventory.item_id)
        .filter(Item.process_type_code.in_(_F_CODES))
        .order_by(Item.mes_code)
        .all()
    )

    if not rows:
        return WeeklyReportResponse(
            week_start=week_start.isoformat(),
            week_end=week_end.isoformat(),
            groups=[
                WeeklyGroupReport(
                    process_code=code,
                    dept_name=_DEPT_NAMES[code],
                    label=PROCESS_TYPE_LABELS.get(code, code),
                    item_count=0,
                    prev_qty=Decimal("0"),
                    produce_qty=Decimal("0"),
                    receive_qty=Decimal("0"),
                    out_qty=Decimal("0"),
                    current_qty=Decimal("0"),
                    delta=Decimal("0"),
                    items=[],
                )
                for code in _F_CODES
            ],
            summary=WeeklyReportSummary(
                total_current_qty=Decimal("0"),
                total_produce_qty=Decimal("0"),
                total_receive_qty=Decimal("0"),
                total_out_qty=Decimal("0"),
                groups_increasing=0,
                groups_decreasing=0,
                groups_unchanged=0,
            ),
            warnings=[],
        )

    item_ids = [item.item_id for item, _ in rows]

    tx_rows = (
        db.query(
            TransactionLog.item_id,
            TransactionLog.transaction_type,
            func.coalesce(func.sum(TransactionLog.quantity_change), 0).label("qty_sum"),
        )
        .filter(
            TransactionLog.item_id.in_(item_ids),
            TransactionLog.created_at >= dt_start,
            TransactionLog.created_at <= dt_end,
        )
        .group_by(TransactionLog.item_id, TransactionLog.transaction_type)
        .all()
    )

    produce_map: dict[str, Decimal] = {}   # PRODUCE 만 — '생산' 칸
    receive_map: dict[str, Decimal] = {}   # RECEIVE — '입고' 칸 (생산과 분리)
    out_map: dict[str, Decimal] = {}       # SHIP+BACKFLUSH — '출고' 칸
    net_map: dict[str, Decimal] = {}       # 전체 거래 합 — 전주재고/증감 역산용(폐기·분해 포함)
    for item_id, tx_type, qty_sum in tx_rows:
        iid = str(item_id)
        val = Decimal(str(qty_sum))
        net_map[iid] = net_map.get(iid, Decimal("0")) + val
        if tx_type == TransactionTypeEnum.PRODUCE:
            produce_map[iid] = produce_map.get(iid, Decimal("0")) + val
        elif tx_type == TransactionTypeEnum.RECEIVE:
            receive_map[iid] = receive_map.get(iid, Decimal("0")) + val
        elif tx_type in _OUT_TYPES or (tx_type == TransactionTypeEnum.ADJUST and val < 0):
            out_map[iid] = out_map.get(iid, Decimal("0")) + abs(val)

    group_items: dict[str, list[WeeklyItemReport]] = {code: [] for code in _F_CODES}

    for item, inv in rows:
        code = item.process_type_code or "??"
        if code not in group_items:
            continue
        iid = str(item.item_id)
        current_qty = Decimal(str(inv.quantity if inv else 0))
        produce_qty = produce_map.get(iid, Decimal("0"))
        receive_qty = receive_map.get(iid, Decimal("0"))
        out_qty = out_map.get(iid, Decimal("0"))
        net_all = net_map.get(iid, Decimal("0"))  # 전체 거래 합 — 폐기·분해·조정 포함
        prev_qty = current_qty - net_all
        delta = net_all  # = current_qty - prev_qty

        group_items[code].append(
            WeeklyItemReport(
                item_id=iid,
                mes_code=item.mes_code,
                item_name=item.item_name,
                prev_qty=prev_qty,
                produce_qty=produce_qty,
                receive_qty=receive_qty,
                out_qty=out_qty,
                current_qty=current_qty,
                delta=delta,
            )
        )

    groups: list[WeeklyGroupReport] = []
    for code in _F_CODES:
        items = group_items.get(code, [])
        label = PROCESS_TYPE_LABELS.get(code, code)
        dept = _DEPT_NAMES.get(code, code)
        g_prev = sum((i.prev_qty for i in items), Decimal("0"))
        g_produce = sum((i.produce_qty for i in items), Decimal("0"))
        g_receive = sum((i.receive_qty for i in items), Decimal("0"))
        g_out = sum((i.out_qty for i in items), Decimal("0"))
        g_cur = sum((i.current_qty for i in items), Decimal("0"))
        g_delta = g_cur - g_prev
        groups.append(
            WeeklyGroupReport(
                process_code=code,
                dept_name=dept,
                label=label,
                item_count=len(items),
                prev_qty=g_prev,
                produce_qty=g_produce,
                receive_qty=g_receive,
                out_qty=g_out,
                current_qty=g_cur,
                delta=g_delta,
                items=items,
            )
        )

    # ── 생산 매트릭스 집계 ────────────────────────────────────────
    prod_items = (
        db.query(Item, func.coalesce(func.sum(TransactionLog.quantity_change), 0))
        .join(TransactionLog, Item.item_id == TransactionLog.item_id)
        .filter(
            Item.process_type_code.in_(_PROD_CODES),
            TransactionLog.transaction_type.in_(PRODUCTION_TX_TYPES),
            TransactionLog.created_at >= dt_start,
            TransactionLog.created_at <= dt_end,
        )
        .group_by(Item.item_id)
        .all()
    )

    symbol_map, ordered_models = _load_model_symbols(db)

    matrix: dict[str, dict[str, Decimal]] = {}
    for item, qty_sum in prod_items:
        model_key = _resolve_model(item.model_symbol, symbol_map)
        if model_key is None:
            continue
        proc = item.process_type_code or ""
        if proc not in _PROD_CODES:
            continue
        val = abs(Decimal(str(qty_sum)))
        if model_key not in matrix:
            matrix[model_key] = {}
        matrix[model_key][proc] = matrix[model_key].get(proc, Decimal("0")) + val

    ordered_keys = ordered_models

    production_matrix: list[WeeklyProductionModelRow] = []
    for key in ordered_keys:
        row_data = matrix.get(key, {})
        tf = row_data.get("TF", Decimal("0"))
        hf = row_data.get("HF", Decimal("0"))
        vf = row_data.get("VF", Decimal("0"))
        nf = row_data.get("NF", Decimal("0"))
        af = row_data.get("AF", Decimal("0"))
        pf = row_data.get("PF", Decimal("0"))
        production_matrix.append(
            WeeklyProductionModelRow(
                model_key=key,
                model_label=key,
                tf_qty=tf,
                hf_qty=hf,
                vf_qty=vf,
                nf_qty=nf,
                af_qty=af,
                pf_qty=pf,
                total_qty=tf + hf + vf + nf + af + pf,
            )
        )

    total_current = sum((g.current_qty for g in groups), Decimal("0"))
    total_produce = sum((g.produce_qty for g in groups), Decimal("0"))
    total_receive = sum((g.receive_qty for g in groups), Decimal("0"))
    total_out = sum((g.out_qty for g in groups), Decimal("0"))
    summary = WeeklyReportSummary(
        total_current_qty=total_current,
        total_produce_qty=total_produce,
        total_receive_qty=total_receive,
        total_out_qty=total_out,
        groups_increasing=sum(1 for g in groups if g.delta > 0),
        groups_decreasing=sum(1 for g in groups if g.delta < 0),
        groups_unchanged=sum(1 for g in groups if g.delta == 0),
    )

    warnings: list[WeeklyWarning] = []
    for g in sorted(groups, key=lambda x: x.delta):
        if g.delta < 0:
            warnings.append(
                WeeklyWarning(
                    level="danger",
                    title=f"{g.dept_name} {g.process_code} 재고 감소",
                    message=f"{g.dept_name} {g.process_code} 재고가 전주 대비 {abs(g.delta):.0f} 감소했습니다.",
                )
            )

    if groups:
        max_out = max(groups, key=lambda x: x.out_qty)
        if max_out.out_qty > 0:
            warnings.append(
                WeeklyWarning(
                    level="warn",
                    title=f"{max_out.dept_name} {max_out.process_code} 출고 집중",
                    message=f"출고/소비가 {max_out.dept_name} {max_out.process_code}에 집중되었습니다.",
                )
            )
        max_delta = max(groups, key=lambda x: x.delta)
        if max_delta.delta > 0:
            warnings.append(
                WeeklyWarning(
                    level="good",
                    title=f"{max_delta.dept_name} {max_delta.process_code} 재고 증가",
                    message=f"{max_delta.dept_name} {max_delta.process_code} 재고가 {max_delta.delta:.0f} 증가했습니다.",
                )
            )

    return WeeklyReportResponse(
        week_start=week_start.isoformat(),
        week_end=week_end.isoformat(),
        groups=groups,
        summary=summary,
        warnings=warnings,
        production_matrix=production_matrix,
    )
