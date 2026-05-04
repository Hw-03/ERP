"""주간보고: GET /weekly-report — ?F 계열 품목의 주차별 재고 변화 집계."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Inventory, Item, TransactionLog, TransactionTypeEnum
from app.schemas import (
    WeeklyGroupReport,
    WeeklyItemReport,
    WeeklyReportResponse,
    WeeklyReportSummary,
    WeeklyWarning,
)

from ._shared import PROCESS_TYPE_LABELS

router = APIRouter()

_F_CODES = ["TF", "HF", "VF", "NF", "AF", "PF"]

_DEPT_NAMES: dict[str, str] = {
    "TF": "튜브",
    "HF": "고압",
    "VF": "진공",
    "NF": "튜닝",
    "AF": "조립",
    "PF": "출하",
}

# 생산/입고 집계 타입
_IN_TYPES = {
    TransactionTypeEnum.RECEIVE,
    TransactionTypeEnum.PRODUCE,
    TransactionTypeEnum.RETURN,
}

# 출고/소비 집계 타입
_OUT_TYPES = {
    TransactionTypeEnum.SHIP,
    TransactionTypeEnum.BACKFLUSH,
    TransactionTypeEnum.SCRAP,
    TransactionTypeEnum.LOSS,
}


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
        .order_by(Item.erp_code)
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
                    in_qty=Decimal("0"),
                    out_qty=Decimal("0"),
                    current_qty=Decimal("0"),
                    delta=Decimal("0"),
                    items=[],
                )
                for code in _F_CODES
            ],
            summary=WeeklyReportSummary(
                total_current_qty=Decimal("0"),
                total_in_qty=Decimal("0"),
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

    in_map: dict[str, Decimal] = {}
    out_map: dict[str, Decimal] = {}
    for item_id, tx_type, qty_sum in tx_rows:
        iid = str(item_id)
        val = Decimal(str(qty_sum))
        if tx_type in _IN_TYPES:
            in_map[iid] = in_map.get(iid, Decimal("0")) + val
        elif tx_type in _OUT_TYPES:
            out_map[iid] = out_map.get(iid, Decimal("0")) + abs(val)

    group_items: dict[str, list[WeeklyItemReport]] = {code: [] for code in _F_CODES}

    for item, inv in rows:
        code = item.process_type_code or "??"
        if code not in group_items:
            continue
        current_qty = Decimal(str(inv.quantity if inv else 0))
        in_qty = in_map.get(str(item.item_id), Decimal("0"))
        out_qty = out_map.get(str(item.item_id), Decimal("0"))
        net = in_qty - out_qty
        prev_qty = current_qty - net
        delta = current_qty - prev_qty

        group_items[code].append(
            WeeklyItemReport(
                item_id=str(item.item_id),
                erp_code=item.erp_code,
                item_name=item.item_name,
                prev_qty=prev_qty,
                in_qty=in_qty,
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
        g_in = sum((i.in_qty for i in items), Decimal("0"))
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
                in_qty=g_in,
                out_qty=g_out,
                current_qty=g_cur,
                delta=g_delta,
                items=items,
            )
        )

    total_current = sum((g.current_qty for g in groups), Decimal("0"))
    total_in = sum((g.in_qty for g in groups), Decimal("0"))
    total_out = sum((g.out_qty for g in groups), Decimal("0"))
    summary = WeeklyReportSummary(
        total_current_qty=total_current,
        total_in_qty=total_in,
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
    )
