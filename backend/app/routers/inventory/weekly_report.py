"""주간보고: GET /weekly-report — ?F 계열 품목의 주차별 재고 변화 집계.

⛔ 동결(완성) — 2026-05-29 / 2026-06-16 '생산' 정의 변경
- 2026-08-24 사용자 승인 예외: 과거 주차는 기존 산식을 보존하고, 연속 주말
  스냅샷이 확보된 신규 주차만 일요일 KST 확정 재고를 사용한다. 신규 구간의
  거래 집계는 기준 시각 전에 취소된 로그를 제외한다.
- 명시적 수정 요청이 있을 때만 손댈 것. 주변 리팩터·전역 변경에서는 우회.
- '생산'(produce_qty)=PRODUCE 전용 — 입출고 내역 '생산'과 동일 기준. 입고(receive_qty)
  =RECEIVE 로 분리 표시. 과거 주차의 전주재고/증감은 기간 내 '전체 거래' 합(net_all)으로
  기존과 동일하게 역산한다. 생산 매트릭스(PRODUCTION_TX_TYPES)도 PRODUCE 전용.
- 신규 TransactionTypeEnum 멤버 추가 시 PRODUCTION_TX_TYPES 또는
  NON_PRODUCTION_TX_TYPES 둘 중 하나에 명시 분류 필수
  (test_all_transaction_types_classified 가 누락 검출).
- 프론트 동결 짝: frontend/app/mes/_components/_weekly_sections/
  + frontend/app/mes/_components/DesktopWeeklyReportView.tsx
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Inventory,
    Item,
    ProductSymbol,
    TransactionLog,
    TransactionTypeEnum,
    WeeklyInventorySnapshot,
)
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    WeeklyGroupReport,
    WeeklyItemReport,
    WeeklyProductionModelRow,
    WeeklyReportResponse,
    WeeklyReportSummary,
    WeeklyWarning,
)
from app.services.weekly_inventory_snapshot import (
    load_dashboard_finished_stock,
    sunday_cutoff_utc,
)
from app.services import weekly_report_contract

from ._shared import PROCESS_TYPE_LABELS

router = APIRouter()

_KST = ZoneInfo("Asia/Seoul")

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


@dataclass(frozen=True)
class _SnapshotReportItem:
    item_id: object
    mes_code: str | None
    item_name: str
    process_type_code: str
    prev_qty: Decimal
    current_qty: Decimal


@dataclass(frozen=True)
class _SnapshotReportContext:
    items: list[_SnapshotReportItem]
    tx_start_utc: datetime
    tx_end_utc_exclusive: datetime
    transaction_as_of_utc: datetime


@dataclass(frozen=True)
class _InventoryPointItem:
    item_id: object
    mes_code: str | None
    item_name: str
    process_type_code: str
    quantity: Decimal


def _today_kst() -> date:
    return datetime.now(_KST).date()


def _kst_date_start_utc(value: date) -> datetime:
    return datetime.combine(value, time.min, tzinfo=_KST).astimezone(UTC).replace(tzinfo=None)


def _snapshot_items_by_id(
    snapshot: WeeklyInventorySnapshot,
) -> dict[object, _InventoryPointItem]:
    return {
        line.item_id: _InventoryPointItem(
            item_id=line.item_id,
            mes_code=line.mes_code,
            item_name=line.item_name,
            process_type_code=line.process_type_code,
            quantity=Decimal(str(line.quantity)),
        )
        for line in snapshot.items
    }


def _live_items_by_id(db: Session) -> dict[object, _InventoryPointItem]:
    return {
        row.item.item_id: _InventoryPointItem(
            item_id=row.item.item_id,
            mes_code=row.item.mes_code,
            item_name=row.item.item_name,
            process_type_code=row.item.process_type_code,
            quantity=row.quantity,
        )
        for row in load_dashboard_finished_stock(db)
    }


def _merge_inventory_points(
    previous_by_id: dict[object, _InventoryPointItem],
    current_by_id: dict[object, _InventoryPointItem],
) -> list[_SnapshotReportItem]:
    items: list[_SnapshotReportItem] = []
    for item_id in set(previous_by_id) | set(current_by_id):
        current = current_by_id.get(item_id)
        previous = previous_by_id.get(item_id)
        metadata = current if current is not None else previous
        if metadata is None:
            continue
        items.append(
            _SnapshotReportItem(
                item_id=item_id,
                mes_code=metadata.mes_code,
                item_name=metadata.item_name,
                process_type_code=metadata.process_type_code,
                prev_qty=previous.quantity if previous is not None else Decimal("0"),
                current_qty=current.quantity if current is not None else Decimal("0"),
            )
        )
    items.sort(key=lambda row: (row.mes_code or "", str(row.item_id)))
    return items


def _load_snapshot_report_context(
    db: Session,
    *,
    week_start: date,
    week_end: date,
) -> _SnapshotReportContext | None:
    """과거 레거시 주차와 정확 적용 주차의 경계를 데이터로 판정한다."""

    if week_start.weekday() != 0 or week_end != week_start + timedelta(days=6):
        return None

    first_snapshot = (
        db.query(WeeklyInventorySnapshot)
        .order_by(WeeklyInventorySnapshot.week_end.asc())
        .first()
    )
    if first_snapshot is None:
        return None

    today = _today_kst()
    previous_week_end = week_start - timedelta(days=1)
    is_current_week = week_start <= today <= week_end
    is_closed_week = week_end < today

    if is_current_week:
        previous_snapshot = (
            db.query(WeeklyInventorySnapshot)
            .filter(WeeklyInventorySnapshot.week_end == previous_week_end)
            .one_or_none()
        )
        if previous_snapshot is None:
            if previous_week_end > first_snapshot.week_end:
                raise http_error(
                    503,
                    ErrorCode.DB_UNAVAILABLE,
                    "주간 재고 확정 데이터가 누락되었습니다.",
                )
            return None

        items = _merge_inventory_points(
            _snapshot_items_by_id(previous_snapshot),
            _live_items_by_id(db),
        )
        now_utc = datetime.now(UTC).replace(tzinfo=None)
        return _SnapshotReportContext(
            items=items,
            tx_start_utc=_kst_date_start_utc(week_start),
            tx_end_utc_exclusive=_kst_date_start_utc(week_end + timedelta(days=1)),
            transaction_as_of_utc=now_utc,
        )

    if not is_closed_week or week_end < first_snapshot.week_end + timedelta(days=7):
        return None

    previous_snapshot = (
        db.query(WeeklyInventorySnapshot)
        .filter(WeeklyInventorySnapshot.week_end == previous_week_end)
        .one_or_none()
    )
    current_snapshot = (
        db.query(WeeklyInventorySnapshot)
        .filter(WeeklyInventorySnapshot.week_end == week_end)
        .one_or_none()
    )
    if previous_snapshot is None or current_snapshot is None:
        raise http_error(
            503,
            ErrorCode.DB_UNAVAILABLE,
            "주간 재고 확정 데이터가 누락되었습니다.",
        )

    items = _merge_inventory_points(
        _snapshot_items_by_id(previous_snapshot),
        _snapshot_items_by_id(current_snapshot),
    )
    return _SnapshotReportContext(
        items=items,
        tx_start_utc=_kst_date_start_utc(week_start),
        tx_end_utc_exclusive=_kst_date_start_utc(week_end + timedelta(days=1)),
        transaction_as_of_utc=sunday_cutoff_utc(week_end),
    )


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

    contract_state = weekly_report_contract.weekly_contract_state(
        db,
        week_start=week_start,
        week_end=week_end,
        today=_today_kst(),
    )
    if contract_state.report_status == "verified":
        return weekly_report_contract.build_verified_weekly_report(
            db,
            week_start=week_start,
            week_end=week_end,
            today=_today_kst(),
        )

    snapshot_context = _load_snapshot_report_context(
        db,
        week_start=week_start,
        week_end=week_end,
    )
    if snapshot_context is None:
        dt_start = datetime.combine(week_start, time.min)
        dt_end = datetime.combine(week_end, time.max)
        rows: list[object] = (
            db.query(Item, Inventory)
            .outerjoin(Inventory, Item.item_id == Inventory.item_id)
            .filter(Item.process_type_code.in_(_F_CODES))
            .order_by(Item.mes_code)
            .all()
        )
    else:
        dt_start = snapshot_context.tx_start_utc
        dt_end = snapshot_context.tx_end_utc_exclusive
        rows = list(snapshot_context.items)

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
                    increase_qty=Decimal("0"),
                    decrease_qty=Decimal("0"),
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
            report_status=contract_state.report_status,
            transition_notice=contract_state.transition_notice,
        )

    item_ids = (
        [item.item_id for item, _ in rows]
        if snapshot_context is None
        else [row.item_id for row in snapshot_context.items]
    )

    tx_filters = [
        TransactionLog.item_id.in_(item_ids),
        TransactionLog.created_at >= dt_start,
    ]
    if snapshot_context is None:
        tx_filters.append(TransactionLog.created_at <= dt_end)
    else:
        tx_filters.extend([
            TransactionLog.created_at < dt_end,
            or_(
                TransactionLog.cancelled.is_(False),
                TransactionLog.cancelled_at.is_(None),
                TransactionLog.cancelled_at > snapshot_context.transaction_as_of_utc,
            ),
        ])

    tx_rows = (
        db.query(
            TransactionLog.item_id,
            TransactionLog.transaction_type,
            func.coalesce(func.sum(TransactionLog.quantity_change), 0).label("qty_sum"),
            func.coalesce(
                func.sum(
                    case(
                        (TransactionLog.quantity_change > 0, TransactionLog.quantity_change),
                        else_=0,
                    )
                ),
                0,
            ).label("increase_sum"),
            func.coalesce(
                func.sum(
                    case(
                        (TransactionLog.quantity_change < 0, -TransactionLog.quantity_change),
                        else_=0,
                    )
                ),
                0,
            ).label("decrease_sum"),
        )
        .filter(*tx_filters)
        .group_by(TransactionLog.item_id, TransactionLog.transaction_type)
        .all()
    )

    produce_map: dict[str, Decimal] = {}   # PRODUCE 만 — '생산' 칸
    receive_map: dict[str, Decimal] = {}   # RECEIVE — '입고' 칸 (생산과 분리)
    out_map: dict[str, Decimal] = {}       # SHIP+BACKFLUSH — '출고' 칸
    net_map: dict[str, Decimal] = {}       # 전체 거래 합 — 전주재고/증감 역산용(폐기·분해 포함)
    increase_map: dict[str, Decimal] = {}  # 양수 거래 합 — 상쇄 전 증가량
    decrease_map: dict[str, Decimal] = {}  # 음수 거래 절댓값 합 — 상쇄 전 감소량
    for item_id, tx_type, qty_sum, increase_sum, decrease_sum in tx_rows:
        iid = str(item_id)
        val = Decimal(str(qty_sum))
        net_map[iid] = net_map.get(iid, Decimal("0")) + val
        increase_map[iid] = increase_map.get(iid, Decimal("0")) + Decimal(str(increase_sum))
        decrease_map[iid] = decrease_map.get(iid, Decimal("0")) + Decimal(str(decrease_sum))
        if tx_type == TransactionTypeEnum.PRODUCE:
            produce_map[iid] = produce_map.get(iid, Decimal("0")) + val
        elif tx_type == TransactionTypeEnum.RECEIVE:
            receive_map[iid] = receive_map.get(iid, Decimal("0")) + val
        elif tx_type in _OUT_TYPES or (tx_type == TransactionTypeEnum.ADJUST and val < 0):
            out_map[iid] = out_map.get(iid, Decimal("0")) + abs(val)

    group_items: dict[str, list[WeeklyItemReport]] = {code: [] for code in _F_CODES}

    for row in rows:
        if snapshot_context is None:
            item, inv = row
            item_id = item.item_id
            mes_code = item.mes_code
            item_name = item.item_name
            code = item.process_type_code or "??"
            current_qty = Decimal(str(inv.quantity if inv else 0))
            snapshot_prev_qty: Decimal | None = None
        else:
            item_id = row.item_id
            mes_code = row.mes_code
            item_name = row.item_name
            code = row.process_type_code or "??"
            current_qty = row.current_qty
            snapshot_prev_qty = row.prev_qty
        if code not in group_items:
            continue
        iid = str(item_id)
        produce_qty = produce_map.get(iid, Decimal("0"))
        receive_qty = receive_map.get(iid, Decimal("0"))
        out_qty = out_map.get(iid, Decimal("0"))
        net_all = net_map.get(iid, Decimal("0"))  # 전체 거래 합 — 폐기·분해·조정 포함
        prev_qty = current_qty - net_all if snapshot_prev_qty is None else snapshot_prev_qty
        delta = current_qty - prev_qty

        group_items[code].append(
            WeeklyItemReport(
                item_id=iid,
                mes_code=mes_code,
                item_name=item_name,
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
        g_increase = sum((increase_map.get(i.item_id, Decimal("0")) for i in items), Decimal("0"))
        g_decrease = sum((decrease_map.get(i.item_id, Decimal("0")) for i in items), Decimal("0"))
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
                increase_qty=g_increase,
                decrease_qty=g_decrease,
                produce_qty=g_produce,
                receive_qty=g_receive,
                out_qty=g_out,
                current_qty=g_cur,
                delta=g_delta,
                items=items,
            )
        )

    # ── 생산 매트릭스 집계 ────────────────────────────────────────
    production_filters = [
        Item.process_type_code.in_(_PROD_CODES),
        TransactionLog.transaction_type.in_(PRODUCTION_TX_TYPES),
        TransactionLog.created_at >= dt_start,
    ]
    if snapshot_context is None:
        production_filters.append(TransactionLog.created_at <= dt_end)
    else:
        production_filters.extend([
            TransactionLog.item_id.in_(item_ids),
            TransactionLog.created_at < dt_end,
            or_(
                TransactionLog.cancelled.is_(False),
                TransactionLog.cancelled_at.is_(None),
                TransactionLog.cancelled_at > snapshot_context.transaction_as_of_utc,
            ),
        ])

    prod_items = (
        db.query(Item, func.coalesce(func.sum(TransactionLog.quantity_change), 0))
        .join(TransactionLog, Item.item_id == TransactionLog.item_id)
        .filter(*production_filters)
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
        report_status=contract_state.report_status,
        transition_notice=contract_state.transition_notice,
    )
